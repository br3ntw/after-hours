// Regenerates docs/screenshots from the running dev stack: node e2e/screenshots.mjs
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

// fileURLToPath, not URL.pathname: the repo path contains spaces.
const out = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));
const browser = await chromium.launch();

async function shoot(viewport, path, file, prep) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000/login");
  await page.getByRole("button", { name: /^Operations Manager/ }).click();
  await page.getByRole("heading", { level: 1, name: /^Good / }).waitFor();
  if (path !== "/") await page.goto(`http://localhost:3000${path}`);
  if (prep) await prep(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + file });
  await page.close();
}

const desk = { width: 1440, height: 900 };
await shoot(desk, "/", "command-center.png");
await shoot(desk, "/map", "park-map.png");
await shoot(desk, "/attractions", "attractions.png");
await shoot(desk, "/attractions/borealis-drift", "attraction-detail.png");
await shoot(desk, "/maintenance", "maintenance.png");
await shoot(desk, "/analytics", "analytics.png");
await shoot(desk, "/attractions/orbit-9", "ticket-modal.png", (p) =>
  p.getByRole("button", { name: "New work order" }).click(),
);
await shoot({ width: 390, height: 844 }, "/", "command-center-mobile.png");
await browser.close();
