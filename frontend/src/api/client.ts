import { retrieveLaunchParams } from "@telegram-apps/sdk-react";

declare global {
  interface Window {
    LAZYFLOW_API_BASE_URL?: string;
  }
}

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  const override = window.LAZYFLOW_API_BASE_URL?.trim();
  if (override) {
    return override;
  }

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return "";
}

const API_BASE_URL = resolveApiBaseUrl();

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function getInitDataRaw(): string {
  try {
    return retrieveLaunchParams().initDataRaw ?? "";
  } catch {
    return "";
  }
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false) {
    const initDataRaw = getInitDataRaw();
    if (initDataRaw) {
      headers.set("X-Telegram-Init-Data", initDataRaw);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lazyflow:session-expired"));
    }
    throw new ApiError(`API request failed with status ${response.status}`, response.status, payload);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options: Omit<RequestOptions, "method"> = {}) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, options: Omit<RequestOptions, "method"> = {}) =>
    request<T>(path, { ...options, method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(path, { ...options, method: "POST", body: formData }),
};
