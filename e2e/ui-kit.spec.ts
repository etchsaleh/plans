import { expect, test } from "@playwright/test";

test.describe("iOS UI kit", () => {
  test("renders primitives and Spell components on an iPhone viewport", async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(page.getByRole("heading", { name: "UI kit" })).toBeVisible();

    const padel = page.getByRole("radio", { name: "Padel" });
    await padel.click();
    await expect(padel).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "More people" }).click();
    await expect(page.getByText("Party of 5")).toBeVisible();

    await expect(page.getByLabel("QR code for https://plan.example/p/demo")).toBeVisible();
  });

  test("opens and dismisses the bottom sheet", async ({ page }) => {
    await page.goto("/dev/ui");
    await page.getByRole("button", { name: "Open sheet" }).click();
    const sheet = page.getByRole("dialog", { name: "What should we call you?" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Continue" }).click();
    await expect(sheet).toBeHidden();
  });

  test("has no horizontal overflow at phone width", async ({ page }) => {
    await page.goto("/dev/ui");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
