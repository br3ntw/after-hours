import { DemoError, getDemoServer } from "./server";

const PREFIX = "/api/v1";

/**
 * A `fetch` that answers /api/v1/* from the in-browser demo server instead of the network.
 * It returns real `Response` objects with the backend's status codes and error envelope,
 * so the API client (token refresh, error mapping) behaves exactly as against FastAPI.
 */
export async function demoFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, "http://demo.invalid");
  if (!url.pathname.startsWith(PREFIX)) return fetch(input, init);

  const headers = new Headers(init.headers);
  const auth = headers.get("Authorization");
  let body: unknown;
  if (typeof init.body === "string" && init.body) body = JSON.parse(init.body);

  await Promise.resolve(); // stay asynchronous, like a network round trip
  try {
    const res = getDemoServer().handle({
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname.slice(PREFIX.length),
      query: url.searchParams,
      body,
      token: auth?.startsWith("Bearer ") ? auth.slice(7) : null,
    });
    if (res.status === 204) return new Response(null, { status: 204 });
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    if (!(e instanceof DemoError)) throw e;
    const error = {
      code: e.code,
      message: e.message,
      ...(e.details === undefined ? {} : { details: e.details }),
    };
    return Response.json({ error }, { status: e.status });
  }
}
