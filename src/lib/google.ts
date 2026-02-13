import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { google, type calendar_v3 } from 'googleapis';
import { clearGoogleIntegration, getUserGoogleIntegration, updateUser } from '../db/users';
import { env } from '../env';
import type { RecurrenceRule, TaskDTO } from './types';

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

type OAuthStatePayload = {
  userId: number;
  issuedAt: number;
  nonce: string;
};

export class GoogleCalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleCalendarConfigError';
  }
}

export class GoogleCalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleCalendarAuthError';
  }
}

type AuthorizedGoogleContext = {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  timezone: string;
};

export function isGoogleCalendarConfigured(): boolean {
  return env.isGoogleCalendarConfigured;
}

function ensureGoogleCalendarConfigured(): void {
  if (!isGoogleCalendarConfigured()) {
    throw new GoogleCalendarConfigError('Google Calendar is not configured');
  }
}

function getOAuthScopes(): string[] {
  return env.GOOGLE_OAUTH_SCOPES
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function createOAuthClient() {
  ensureGoogleCalendarConfigured();

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

function signStatePayload(encodedPayload: string): string {
  return createHmac('sha256', env.GOOGLE_OAUTH_STATE_SECRET)
    .update(encodedPayload)
    .digest('base64url');
}

function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function buildOAuthState(userId: number): string {
  const payload: OAuthStatePayload = {
    userId,
    issuedAt: Date.now(),
    nonce: randomBytes(8).toString('hex'),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signStatePayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function parseOAuthState(state: string): OAuthStatePayload {
  const [encodedPayload, providedSignature] = state.split('.');
  if (!encodedPayload || !providedSignature) {
    throw new GoogleCalendarAuthError('Invalid OAuth state format');
  }

  const expectedSignature = signStatePayload(encodedPayload);
  if (!secureEquals(providedSignature, expectedSignature)) {
    throw new GoogleCalendarAuthError('Invalid OAuth state signature');
  }

  let payload: OAuthStatePayload;
  try {
    const decoded = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    payload = JSON.parse(decoded) as OAuthStatePayload;
  } catch {
    throw new GoogleCalendarAuthError('Invalid OAuth state payload');
  }

  if (!payload.userId || !payload.issuedAt || !payload.nonce) {
    throw new GoogleCalendarAuthError('OAuth state payload is missing required fields');
  }

  if (Date.now() - payload.issuedAt > OAUTH_STATE_TTL_MS) {
    throw new GoogleCalendarAuthError('OAuth state has expired');
  }

  return payload;
}

function shouldRefreshAccessToken(tokenExpiry: number | null): boolean {
  if (!tokenExpiry) {
    return true;
  }

  return tokenExpiry <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

function isHttpStatusError(error: unknown, status: number): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeStatus = (error as { status?: unknown }).status;
  if (typeof maybeStatus === 'number' && maybeStatus === status) {
    return true;
  }

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  return typeof responseStatus === 'number' && responseStatus === status;
}

function isInvalidGrantError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && message.includes('invalid_grant')) {
    return true;
  }

  const description = (error as { response?: { data?: { error_description?: unknown; error?: unknown } } }).response?.data;
  if (!description) {
    return false;
  }

  return description.error === 'invalid_grant' || description.error_description === 'invalid_grant';
}

function recurrenceToGoogleRule(rule: RecurrenceRule | null): string[] | undefined {
  switch (rule) {
    case 'daily':
      return ['RRULE:FREQ=DAILY'];
    case 'weekly':
      return ['RRULE:FREQ=WEEKLY'];
    case 'weekdays':
      return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'];
    default:
      return undefined;
  }
}

function buildEventFromTask(task: TaskDTO, timezone: string): calendar_v3.Schema$Event | null {
  if (!task.deadline) {
    return null;
  }

  const recurrence = recurrenceToGoogleRule(task.recurrenceRule);

  return {
    summary: task.content,
    description: task.description ?? undefined,
    start: {
      dateTime: new Date(task.deadline).toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: new Date(task.deadline + DEFAULT_EVENT_DURATION_MS).toISOString(),
      timeZone: timezone,
    },
    recurrence,
    reminders: {
      useDefault: true,
    },
    extendedProperties: {
      private: {
        lazyflowTaskId: task.id,
      },
    },
  };
}

async function getAuthorizedGoogleContext(userId: number): Promise<AuthorizedGoogleContext | null> {
  ensureGoogleCalendarConfigured();

  const integration = getUserGoogleIntegration(userId);
  if (!integration || !integration.googleRefreshToken) {
    return null;
  }

  const oauthClient = createOAuthClient();
  oauthClient.setCredentials({
    access_token: integration.googleAccessToken || undefined,
    refresh_token: integration.googleRefreshToken,
    expiry_date: integration.googleTokenExpiry || undefined,
  });

  if (shouldRefreshAccessToken(integration.googleTokenExpiry)) {
    await oauthClient.getAccessToken();

    const refreshedAccessToken = oauthClient.credentials.access_token || null;
    const refreshedExpiry = oauthClient.credentials.expiry_date || null;
    const refreshedRefreshToken = oauthClient.credentials.refresh_token || integration.googleRefreshToken;

    if (
      refreshedAccessToken !== integration.googleAccessToken ||
      refreshedExpiry !== integration.googleTokenExpiry ||
      refreshedRefreshToken !== integration.googleRefreshToken
    ) {
      updateUser(userId, {
        googleAccessToken: refreshedAccessToken,
        googleRefreshToken: refreshedRefreshToken,
        googleTokenExpiry: refreshedExpiry,
      });
    }
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauthClient }),
    calendarId: integration.googleCalendarId || 'primary',
    timezone: integration.timezone,
  };
}

export function buildGoogleConnectUrl(userId: number): string {
  const state = buildOAuthState(userId);
  const oauthClient = createOAuthClient();

  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    response_type: 'code',
    scope: getOAuthScopes(),
    state,
  });
}

export async function completeGoogleConnection(code: string, state: string): Promise<{ userId: number; calendarId: string }> {
  ensureGoogleCalendarConfigured();

  const parsedState = parseOAuthState(state);
  const userId = parsedState.userId;
  const integration = getUserGoogleIntegration(userId);

  if (!integration) {
    throw new GoogleCalendarAuthError('User not found for OAuth state');
  }

  const oauthClient = createOAuthClient();
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  const calendarId = 'primary';

  const refreshToken = tokens.refresh_token || integration.googleRefreshToken;
  if (!refreshToken) {
    throw new GoogleCalendarAuthError('Google refresh token was not issued');
  }

  updateUser(userId, {
    googleAccessToken: tokens.access_token || integration.googleAccessToken || null,
    googleRefreshToken: refreshToken,
    googleTokenExpiry: tokens.expiry_date || integration.googleTokenExpiry || null,
    googleCalendarId: calendarId,
  });

  return { userId, calendarId };
}

export async function disconnectGoogleCalendar(userId: number): Promise<void> {
  const integration = getUserGoogleIntegration(userId);

  if (!integration) {
    return;
  }

  if (isGoogleCalendarConfigured()) {
    const oauthClient = createOAuthClient();

    try {
      if (integration.googleRefreshToken) {
        await oauthClient.revokeToken(integration.googleRefreshToken);
      } else if (integration.googleAccessToken) {
        await oauthClient.revokeToken(integration.googleAccessToken);
      }
    } catch (error) {
      console.warn('[Google] Failed to revoke token:', error);
    }
  }

  clearGoogleIntegration(userId);
}

export async function upsertTaskInGoogleCalendar(userId: number, task: TaskDTO): Promise<string | null> {
  const context = await getAuthorizedGoogleContext(userId);
  if (!context) {
    return null;
  }

  const event = buildEventFromTask(task, context.timezone);
  if (!event) {
    return null;
  }

  try {
    if (task.googleEventId) {
      try {
        const patched = await context.calendar.events.patch({
          calendarId: context.calendarId,
          eventId: task.googleEventId,
          requestBody: event,
          sendUpdates: 'none',
        });

        return patched.data.id || task.googleEventId;
      } catch (error) {
        if (!isHttpStatusError(error, 404)) {
          throw error;
        }
      }
    }

    const created = await context.calendar.events.insert({
      calendarId: context.calendarId,
      requestBody: event,
      sendUpdates: 'none',
    });

    return created.data.id || null;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      clearGoogleIntegration(userId);
    }

    throw error;
  }
}

export async function deleteTaskFromGoogleCalendar(userId: number, googleEventId: string | null): Promise<void> {
  if (!googleEventId) {
    return;
  }

  const context = await getAuthorizedGoogleContext(userId);
  if (!context) {
    return;
  }

  try {
    await context.calendar.events.delete({
      calendarId: context.calendarId,
      eventId: googleEventId,
      sendUpdates: 'none',
    });
  } catch (error) {
    if (isHttpStatusError(error, 404)) {
      return;
    }

    if (isInvalidGrantError(error)) {
      clearGoogleIntegration(userId);
    }

    throw error;
  }
}
