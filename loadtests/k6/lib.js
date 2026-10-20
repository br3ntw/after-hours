// Shared helpers. Target the API directly (not the Next proxy) to measure the backend.
import http from "k6/http";

export const API = __ENV.API || "http://localhost:8000";

/** One demo sign-on in setup(); the token is shared by all VUs (it lives 15 min). */
export function signOn(role = "analyst") {
  const res = http.post(`${API}/api/v1/auth/demo-login`, JSON.stringify({ role }), {
    headers: { "Content-Type": "application/json" },
  });
  if (res.status !== 200) throw new Error(`demo-login failed: ${res.status} ${res.body}`);
  return res.json("access_token");
}
