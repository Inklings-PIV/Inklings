import { expect, test } from "@playwright/test";

test("landing page renders and links to each main surface", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Inklings", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Inklings/);
  for (const href of ["/inkwell", "/blots", "/game", "/quill"]) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
  // The landing page should fit desktop and mobile viewports without horizontal overflow.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("public legal pages are reachable without a database", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Impressum", exact: true }).click();
  await expect(page).toHaveURL("/impressum");
  await expect(page.getByRole("heading", { name: "Impressum", exact: true })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Datenschutz", exact: true }).click();
  await expect(page).toHaveURL("/datenschutz");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Datenschutz");
});

test("theme controls and the replayed guide work after hydration", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Exercise the guide's replay event without navigating into database-backed tabs.
  await page.evaluate(() => window.dispatchEvent(new Event("inklings:start-tour")));
  const guide = page.getByRole("dialog", { name: /Oh! Hello there/ });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Skip tour" }).click();
  await expect(guide).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("inklings-tour-v2")))
    .not.toBeNull();
  expect(errors).toEqual([]);
});
