import { expect, type Page, test } from "@playwright/test";

// Paths are relative to baseURL (…/after-hours/), so they exercise the Pages base path.
type Role = "Operations Manager" | "Administrator" | "Read-Only Analyst";

async function signOn(page: Page, role: Role) {
  await page.goto("login/");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}

const mapTag = (page: Page, name: string) =>
  page.getByRole("application").getByRole("button", { name: new RegExp(`^${name},`) });

test("the demo is labelled as running in the browser, on sign-in and in the app", async ({ page }) => {
  await page.goto("");
  await expect(page).toHaveURL(/\/after-hours\/login\/$/);
  await expect(page.getByRole("complementary", { name: "About this demo" })).toContainText(
    "The API and the park simulation run inside your browser",
  );
  await expect(page.getByRole("button", { name: "Sign on with email and password" })).toHaveCount(0);

  await signOn(page, "Read-Only Analyst");
  await expect(page.getByRole("complementary", { name: "About this demo" })).toBeVisible();
  await expect(page.getByText("Simulated · fictional park")).toBeVisible();
});

test("an operator stops a ride and the map and activity feed react", async ({ page }) => {
  await signOn(page, "Operations Manager");
  await mapTag(page, "Orbit 9").click();
  const panel = page.getByRole("complementary", { name: "Orbit 9 details" });
  await panel.getByRole("button", { name: "Down" }).click();
  await panel.getByLabel("Reason for Down").fill("Demo: wheel assembly inspection");
  await panel.getByRole("button", { name: "Set down" }).click();

  await expect(mapTag(page, "Orbit 9")).toHaveAccessibleName(/^Orbit 9, Down/);
  await expect(page.getByRole("list", { name: "Live activity" })).toContainText("Orbit 9 · Down");
});

test("a SEV1 work order stops the ride; resolving it brings the ride back", async ({ page }) => {
  await signOn(page, "Operations Manager");
  await page.getByRole("link", { name: "Maintenance" }).first().click();
  await page.getByRole("button", { name: "New work order" }).click();

  const dialog = page.getByRole("dialog", { name: "Create maintenance ticket" });
  await dialog.getByLabel("Attraction").selectOption("glacier-run");
  await dialog.getByText(/^Critical/).click();
  await dialog.getByLabel("Summary").fill("Demo: restraint check failed");
  await dialog.getByRole("button", { name: "Create & stop ride" }).click();

  const detail = page.getByRole("article");
  await expect(detail).toContainText("Demo: restraint check failed");
  await detail.getByLabel("Technician").selectOption({ index: 1 });
  await detail.getByRole("button", { name: "Assign" }).click();
  await expect(detail.getByText("Assigned", { exact: true }).first()).toBeVisible();
  await detail.getByRole("button", { name: "Start work" }).click();
  await detail.getByLabel("Resolution notes").fill("Demo: replaced sensor");
  await detail.getByRole("button", { name: "Mark resolved" }).click();
  await expect(detail.getByText("Resolved", { exact: true }).first()).toBeVisible();

  // Client-side navigation keeps the in-browser park (a reload would start a new one).
  await page
    .getByRole("link", { name: /Glacier Run/ })
    .first()
    .click();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("region", { name: "Status history" })).toContainText(
    "(SEV1): Demo: restraint check failed",
  );
  await expect(page.locator("header").getByText("Operating", { exact: true })).toBeVisible();
});

test("an administrator can pause the simulation and the park clock stops", async ({ page }) => {
  await signOn(page, "Administrator");
  await page.getByRole("button", { name: /^Demo mode/ }).click();
  await page
    .getByRole("dialog", { name: "Simulation controls" })
    .getByRole("button", { name: "Pause" })
    .click();

  const demo = page.getByRole("button", { name: /^Demo mode/ });
  await expect(demo).toHaveAccessibleName(/simulation paused/);
  const frozen = await demo.getAttribute("aria-label");
  await page.waitForTimeout(5_000); // the in-browser park ticks every 2 s when running
  await expect(demo).toHaveAttribute("aria-label", frozen ?? "");
});

test("a read-only analyst can't change a ride", async ({ page }) => {
  await signOn(page, "Read-Only Analyst");
  await mapTag(page, "Orbit 9").click();
  const panel = page.getByRole("complementary", { name: "Orbit 9 details" });
  await expect(panel.getByText("Your role can view status but not change it.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Down" })).toHaveCount(0);
});

test("the park clock advances on its own", async ({ page }) => {
  await signOn(page, "Read-Only Analyst");
  const demo = page.getByRole("button", { name: /^Demo mode/ });
  const before = await demo.getAttribute("aria-label");
  await expect(demo).not.toHaveAttribute("aria-label", before ?? "", { timeout: 8_000 });
});
