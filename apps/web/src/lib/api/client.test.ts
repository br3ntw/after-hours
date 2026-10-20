import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tokenBody = (token: string) => ({
  access_token: token,
  token_type: "bearer",
  expires_in: 900,
  user: { id: "u1", email: "a@x.test", full_name: "A", role: "admin", permissions: [] },
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function harness(handler: Handler) {
  const fetchImpl = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  const onSessionExpired = vi.fn();
  const client = createApiClient({ fetchImpl, onSessionExpired, raceRetryMs: 1 });
  const calls = (suffix: string) => fetchImpl.mock.calls.filter(([u]) => u.endsWith(suffix)).length;
  return { client, fetchImpl, onSessionExpired, calls };
}

describe("createApiClient", () => {
  it("attaches the bearer token after login", async () => {
    const { client, fetchImpl } = harness((url) =>
      url.endsWith("/auth/login") ? json(200, tokenBody("t1")) : json(200, []),
    );
    await client.login("a@x.test", "pw");
    await client.get("/api/v1/attractions");
    const headers = new Headers(fetchImpl.mock.calls.at(-1)?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer t1");
  });

  it("refreshes once on 401 and retries the request", async () => {
    let refreshed = false;
    const { client, calls } = harness((url) => {
      if (url.endsWith("/auth/refresh")) {
        refreshed = true;
        return json(200, tokenBody("fresh"));
      }
      return refreshed ? json(200, ["ok"]) : json(401, { error: { code: "unauthenticated", message: "x" } });
    });
    await expect(client.get("/api/v1/attractions")).resolves.toEqual(["ok"]);
    expect(calls("/auth/refresh")).toBe(1);
  });

  it("shares a single refresh between concurrent 401s", async () => {
    let refreshed = false;
    const { client, calls } = harness(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 5));
        refreshed = true;
        return json(200, tokenBody("fresh"));
      }
      return refreshed ? json(200, {}) : json(401, { error: { code: "unauthenticated", message: "x" } });
    });
    await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);
    expect(calls("/auth/refresh")).toBe(1);
  });

  it("deduplicates concurrent explicit refresh calls (StrictMode double-mount)", async () => {
    const { client, calls } = harness(() => json(200, tokenBody("t")));
    await Promise.all([client.refresh(), client.refresh()]);
    expect(calls("/auth/refresh")).toBe(1);
  });

  it("retries a refresh that lost a race with another tab", async () => {
    let n = 0;
    const { client, calls } = harness(() =>
      ++n === 1
        ? json(401, { error: { code: "refresh_superseded", message: "retry" } })
        : json(200, tokenBody("t2")),
    );
    await expect(client.refresh()).resolves.toMatchObject({ access_token: "t2" });
    expect(calls("/auth/refresh")).toBe(2);
  });

  it("reports session expiry when refresh fails", async () => {
    const { client, onSessionExpired } = harness(() =>
      json(401, { error: { code: "unauthenticated", message: "nope" } }),
    );
    const listener = vi.fn();
    client.onSessionExpired(listener);
    await expect(client.get("/api/v1/attractions")).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("maps the backend error envelope onto ApiError", async () => {
    const { client } = harness(() =>
      json(404, { error: { code: "not_found", message: "Attraction 'x' not found" } }),
    );
    const err = await client.get("/api/v1/attractions/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "not_found", message: "Attraction 'x' not found" });
  });

  it("tolerates non-JSON error bodies", async () => {
    const { client } = harness(
      () => new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }),
    );
    await expect(client.get("/x")).rejects.toMatchObject({ status: 502, code: "http_error" });
  });
});
