import { expect, test } from "@playwright/test";

import { adminToken, API, mapTag, setStatus, signOn } from "./helpers";

test.describe("operations console", () => {
  test.afterEach(async ({ request }) => {
    await setStatus(request, "orbit-9", "operating");
  });

  test("an operator stops a ride and every view reflects it", async ({ page }) => {
    await signOn(page, "Operations Manager");
    await expect(page.getByText("Simulated · fictional park")).toBeVisible();

    await mapTag(page, "Orbit 9").click();
    const panel = page.getByRole("complementary", { name: "Orbit 9 details" });
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Down" }).click();
    await panel.getByLabel("Reason for Down").fill("E2E: wheel assembly inspection");
    await panel.getByRole("button", { name: "Set down" }).click();

    // The map tag, the panel, and the activity feed all update from the same event.
    await expect(mapTag(page, "Orbit 9")).toHaveAccessibleName(/^Orbit 9, Down/);
    await expect(panel.getByText("Down", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Live activity" })).toContainText("Orbit 9 · Down");
    await expect(page.getByRole("list", { name: "Live activity" })).toContainText(
      "E2E: wheel assembly inspection",
    );
    await expect(page.getByText(/attractions? (is|are) down/)).toBeVisible();
  });

  test("a read-only analyst sees the park but cannot change it", async ({ page, request }) => {
    await signOn(page, "Read-Only Analyst");
    await mapTag(page, "Orbit 9").click();
    const panel = page.getByRole("complementary", { name: "Orbit 9 details" });
    await expect(panel.getByText("Your role can view status but not change it.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Down" })).toHaveCount(0);

    // The UI hides the control; the API is what actually enforces it.
    const login = await request.post(`${API}/api/v1/auth/demo-login`, { data: { role: "analyst" } });
    const token = (await login.json()).access_token as string;
    const res = await request.post(`${API}/api/v1/attractions/orbit-9/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "down" },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("maintenance", () => {
  test("a SEV1 work order stops the ride; resolving it brings the ride back", async ({ page, request }) => {
    await signOn(page, "Operations Manager");
    await page.getByRole("link", { name: "Maintenance" }).first().click();
    await page.getByRole("button", { name: "New work order" }).click();

    const dialog = page.getByRole("dialog", { name: "Create maintenance ticket" });
    await dialog.getByLabel("Attraction").selectOption("glacier-run");
    await dialog.getByText(/^Critical/).click();
    await expect(dialog.getByText(/takes the attraction down/)).toBeVisible();
    await dialog.getByLabel("Summary").fill("E2E: restraint check failed");
    await dialog.getByRole("button", { name: "Create & stop ride" }).click();

    const detail = page.getByRole("article");
    await expect(detail).toContainText("E2E: restraint check failed");

    // Assign, start and resolve through the UI.
    const techs = await (
      await request.get(`${API}/api/v1/technicians`, {
        headers: { Authorization: `Bearer ${await adminToken(request)}` },
      })
    ).json();
    await detail.getByLabel("Technician").selectOption({ label: techs[0].full_name });
    await detail.getByRole("button", { name: "Assign" }).click();
    await detail.getByRole("button", { name: "Start work" }).click();
    await detail.getByLabel("Resolution notes").fill("E2E: replaced sensor");
    await detail.getByRole("button", { name: "Mark resolved" }).click();
    await expect(detail.getByText("Resolved", { exact: true }).first()).toBeVisible();

    // The ride's own history shows the stop and the recovery.
    await page.goto("/attractions/glacier-run");
    await page.getByRole("tab", { name: "History" }).click();
    const history = page.getByRole("region", { name: "Status history" });
    await expect(history).toContainText("(SEV1): E2E: restraint check failed");
    await expect(page.getByRole("heading", { level: 1, name: "Glacier Run" })).toBeVisible();
    await expect(page.locator("header").getByText("Operating", { exact: true })).toBeVisible();
  });
});

test("a work order can be assigned as it is created", async ({ page, request }) => {
  await signOn(page, "Operations Manager");
  await page.goto("/attractions/orbit-9");
  await page.getByRole("button", { name: "New work order" }).click();

  const dialog = page.getByRole("dialog", { name: "Create maintenance ticket" });
  await dialog.getByText(/^Low/).click();
  await dialog.getByLabel("Summary").fill("E2E: lap bar padding worn");
  const techs = await (
    await request.get(`${API}/api/v1/technicians`, {
      headers: { Authorization: `Bearer ${await adminToken(request)}` },
    })
  ).json();
  // Click the visible chip (the radio inside it is visually hidden).
  await dialog.locator("label", { hasText: techs[0].full_name }).click();
  await dialog.getByRole("button", { name: "Create ticket" }).click();

  await expect(page.getByText(`E2E: lap bar padding worn · assigned to ${techs[0].full_name}`)).toBeVisible();
  await page.getByRole("tab", { name: /^Maintenance/ }).click();
  const order = page
    .getByRole("tabpanel")
    .getByRole("link", { name: /E2E: lap bar padding worn/ })
    .first();
  await expect(order).toContainText(techs[0].full_name);
  await expect(order).toContainText("Assigned");
});

test.describe("demo mode", () => {
  test.afterEach(async ({ request }) => {
    const token = await adminToken(request);
    await request.post(`${API}/api/v1/simulation/start`, { headers: { Authorization: `Bearer ${token}` } });
  });

  test("an administrator can pause the simulation and the park clock stops", async ({ page }) => {
    await signOn(page, "Administrator");
    await page.getByRole("button", { name: /^Demo mode/ }).click();
    const controls = page.getByRole("dialog", { name: "Simulation controls" });
    await controls.getByRole("button", { name: "Pause" }).click();

    const demo = page.getByRole("button", { name: /^Demo mode/ });
    await expect(demo).toHaveAccessibleName(/simulation paused/);
    const frozen = await demo.getAttribute("aria-label");
    await page.waitForTimeout(5_000); // the worker ticks every 2 s when running
    await expect(demo).toHaveAttribute("aria-label", frozen ?? "");
  });

  test("simulation controls are not offered to other roles", async ({ page }) => {
    await signOn(page, "Operations Manager");
    await page.getByRole("button", { name: /^Demo mode/ }).click();
    await expect(page.getByText("Only Administrators can control the simulation.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  });
});

test("the park map is operable from the keyboard", async ({ page }) => {
  await signOn(page, "Read-Only Analyst");
  const map = page.getByRole("application");
  await map.focus();
  const layer = map.locator(":scope > div").first();
  await page.keyboard.press("+");
  await expect(layer).toHaveAttribute("style", /scale\(1\.3\)/);
  await page.keyboard.press("0");
  await expect(layer).toHaveAttribute("style", /scale\(1\)/);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /\(simulated\)|Down|Closed/);
});
