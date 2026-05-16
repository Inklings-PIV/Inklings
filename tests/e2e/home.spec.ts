import { expect, test } from "@playwright/test";

test("root redirects to inkwell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/inkwell$/);
});
