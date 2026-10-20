import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000";

export type Role = "Operations Manager" | "Administrator" | "Maintenance Technician" | "Read-Only Analyst";

/** Sign on through the real UI (the one-click role list). */
export async function signOn(page: Page, role: Role) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}

/** Admin token for test setup and cleanup through the API (never via the UI). */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/demo-login`, { data: { role: "admin" } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

export async function setStatus(request: APIRequestContext, slug: string, status: string) {
  const token = await adminToken(request);
  await request.post(`${API}/api/v1/attractions/${slug}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status, reason: "e2e cleanup" },
  });
}

/** The map tag for a ride: its accessible name starts with the ride's full name. */
export const mapTag = (page: Page, name: string) =>
  page.getByRole("application").getByRole("button", { name: new RegExp(`^${name},`) });
