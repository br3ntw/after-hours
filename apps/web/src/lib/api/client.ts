import type { TokenResponse } from "./types";

/** Mirrors the backend's error envelope: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Called once the session cannot be recovered (refresh failed). */
  onSessionExpired?: () => void;
  /** Delay before retrying a refresh that lost a race with another tab. */
  raceRetryMs?: number;
}

const AUTH_PREFIX = "/api/v1/auth/";

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (body.error?.code) {
      return new ApiError(
        res.status,
        body.error.code,
        body.error.message ?? res.statusText,
        body.error.details,
      );
    }
  } catch {
    // Non-JSON error body (e.g. a proxy's HTML page); fall through.
  }
  return new ApiError(res.status, "http_error", res.statusText || `HTTP ${res.status}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch wrapper that owns the in-memory access token.
 *
 * - The access token never touches localStorage (XSS can't exfiltrate a persisted copy).
 * - On a 401 it refreshes once and retries the request.
 * - Refresh is single-flight: concurrent 401s, and React StrictMode's double-mounted effects,
 *   share one refresh call. Without this, parallel refreshes would trip the server's
 *   refresh-token reuse detection and sign the user out.
 */
export function createApiClient(opts: ApiClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? "";
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const raceRetryMs = opts.raceRetryMs ?? 300;

  let accessToken: string | null = null;
  const expiredListeners = new Set<() => void>();
  const sessionExpired = () => {
    opts.onSessionExpired?.();
    expiredListeners.forEach((cb) => cb());
  };
  let inflightRefresh: Promise<TokenResponse | null> | null = null;

  async function postAuth(path: string, body?: unknown): Promise<Response> {
    return fetchImpl(`${baseUrl}${AUTH_PREFIX}${path}`, {
      method: "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function doRefresh(): Promise<TokenResponse | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await postAuth("refresh");
      if (res.ok) {
        const data = (await res.json()) as TokenResponse;
        accessToken = data.access_token;
        return data;
      }
      const err = await toApiError(res);
      // Another tab rotated the cookie a moment ago; the browser now holds the new one.
      if (err.code === "refresh_superseded" && attempt === 0) {
        await sleep(raceRetryMs);
        continue;
      }
      break;
    }
    accessToken = null;
    return null;
  }

  function refresh(): Promise<TokenResponse | null> {
    inflightRefresh ??= doRefresh().finally(() => {
      inflightRefresh = null;
    });
    return inflightRefresh;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const send = () => {
      const headers = new Headers(init.headers);
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      if (init.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetchImpl(`${baseUrl}${path}`, { ...init, headers, credentials: "include" });
    };

    let res = await send();
    if (res.status === 401 && !path.startsWith(AUTH_PREFIX)) {
      if (await refresh()) {
        res = await send();
      } else {
        sessionExpired();
      }
    }
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    request,
    get: <T>(path: string) => request<T>(path),
    refresh,
    async login(email: string, password: string): Promise<TokenResponse> {
      const res = await postAuth("login", { email, password });
      if (!res.ok) throw await toApiError(res);
      const data = (await res.json()) as TokenResponse;
      accessToken = data.access_token;
      return data;
    },
    /** Portfolio demo: sign in as the seeded user of a role (only when the API enables it). */
    async demoLogin(role: string): Promise<TokenResponse> {
      const res = await postAuth("demo-login", { role });
      if (!res.ok) throw await toApiError(res);
      const data = (await res.json()) as TokenResponse;
      accessToken = data.access_token;
      return data;
    },
    async demoEnabled(): Promise<boolean> {
      try {
        const res = await fetchImpl(`${baseUrl}${AUTH_PREFIX}demo-config`, { credentials: "include" });
        return res.ok && ((await res.json()) as { demo_login: boolean }).demo_login;
      } catch {
        return false;
      }
    },
    async logout(): Promise<void> {
      accessToken = null;
      await postAuth("logout").catch(() => undefined);
    },
    hasToken: () => accessToken !== null,
    /** Subscribe to unrecoverable session loss; returns an unsubscribe function. */
    onSessionExpired(cb: () => void): () => void {
      expiredListeners.add(cb);
      return () => expiredListeners.delete(cb);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient();
