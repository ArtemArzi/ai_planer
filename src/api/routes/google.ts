import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import {
  buildGoogleConnectUrl,
  completeGoogleConnection,
  disconnectGoogleCalendar,
  GoogleCalendarAuthError,
  GoogleCalendarConfigError,
  isGoogleCalendarConfigured,
} from '../../lib/google';
import { bot } from '../../bot';
import { env } from '../../env';

const googleRoutes = new Hono();

function buildMiniAppRedirect(status: 'connected' | 'error', reason?: string): string {
  const botUsername = bot.botInfo?.username;
  if (botUsername) {
    const startParam = reason ? `google_${status}_${reason}` : `google_${status}`;
    return `https://t.me/${botUsername}?startapp=${startParam}`;
  }

  // Fallback: bot not initialized yet
  const redirect = new URL(env.MINI_APP_URL);
  redirect.searchParams.set('googleCalendar', status);
  if (reason) {
    redirect.searchParams.set('reason', reason);
  }
  return redirect.toString();
}

googleRoutes.get('/auth/url', authMiddleware, async (c) => {
  if (!isGoogleCalendarConfigured()) {
    return c.json({ error: 'Google Calendar is not configured', code: 'GOOGLE_NOT_CONFIGURED' }, 503);
  }

  const userId = c.get('userId');
  const url = buildGoogleConnectUrl(userId);

  return c.json({ url });
});

googleRoutes.get('/callback', async (c) => {
  const error = c.req.query('error');
  if (error) {
    return c.redirect(buildMiniAppRedirect('error', error));
  }

  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect(buildMiniAppRedirect('error', 'missing_callback_params'));
  }

  try {
    await completeGoogleConnection(code, state);
    return c.redirect(buildMiniAppRedirect('connected'));
  } catch (err) {
    if (err instanceof GoogleCalendarConfigError) {
      return c.redirect(buildMiniAppRedirect('error', 'google_not_configured'));
    }

    if (err instanceof GoogleCalendarAuthError) {
      return c.redirect(buildMiniAppRedirect('error', 'oauth_state_invalid'));
    }

    console.error('[Google] OAuth callback failed:', err);
    return c.redirect(buildMiniAppRedirect('error', 'oauth_failed'));
  }
});

googleRoutes.post('/disconnect', authMiddleware, async (c) => {
  const userId = c.get('userId');

  try {
    await disconnectGoogleCalendar(userId);
  } catch (error) {
    console.error('[Google] Disconnect failed:', error);
    return c.json({ error: 'Failed to disconnect Google Calendar', code: 'GOOGLE_DISCONNECT_FAILED' }, 500);
  }

  return c.json({ success: true });
});

export default googleRoutes;
