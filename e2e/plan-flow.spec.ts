import { expect, test, type Browser, type Page } from "@playwright/test";

const tomorrow = () => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d); // YYYY-MM-DD
};

async function signInAsOrganizer(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill("organizer@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByTestId("link-sent")).toBeVisible();
  await page.goto("/dev/mailbox");
  await page.getByTestId("mail-body").first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();
}

async function friend(browser: Browser, url: string, name: string) {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();
  await page.goto(url);
  const sheet = page.getByRole("dialog", { name: "What should we call you?" });
  await expect(sheet).toBeVisible();
  await sheet.getByPlaceholder("Your name").fill(name);
  await sheet.getByRole("button", { name: "Continue" }).click();
  await expect(sheet).toBeHidden();
  return page;
}

test("organiser plans, friends join with just a name, organiser chooses and records the booking", async ({ page, browser }) => {
  await signInAsOrganizer(page);

  // What's the plan?
  await page.goto("/new");
  await page.getByRole("radio", { name: "Padel" }).click();
  await page.locator('input[name="date"]').fill(tomorrow());
  await page.locator('select[name="earliestStart"]').selectOption("18:00");
  await page.locator('select[name="latestStart"]').selectOption("19:00");
  await page.getByRole("button", { name: "Find what's free" }).click();

  // Waiting → options (mock verifier)
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  await expect(page.getByTestId("option").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("option").first()).toContainText("Verified");
  await expect(page.getByText("A check is a snapshot, not a hold.")).toBeVisible();
  const url = page.url();

  // Friends: no signup, just a name
  const sam = await friend(browser, url, "Sam");
  await sam.getByRole("button", { name: "I'm in" }).click();
  await expect(sam.getByText("You're in ✓")).toBeVisible();
  await sam.getByTestId("option").first().getByRole("button", { name: "Thumbs up" }).click();
  await expect(sam.getByTestId("option").first().getByRole("button", { name: "Thumbs up" })).toHaveAttribute("aria-pressed", "true");
  // Friends can't see sources or choose
  await expect(sam.getByText(/^Source:/)).toHaveCount(0);
  await expect(sam.getByRole("button", { name: "Choose this option" })).toHaveCount(0);

  const priya = await friend(browser, url, "Priya");
  await priya.getByRole("button", { name: "I'm in" }).click();
  await expect(priya.getByText("You're in ✓")).toBeVisible();

  // Organiser sees votes + who's in, and chooses (a preference, not a booking)
  await page.reload();
  await expect(page.getByText("Who's in · 2/4")).toBeVisible();
  await expect(page.getByTestId("option").first().getByRole("button", { name: "Thumbs up" })).toContainText("1");
  await page.getByTestId("option").first().getByRole("button", { name: "Choose this option" }).click();
  const panel = page.getByTestId("selected-panel");
  await expect(panel).toContainText("Nothing is booked yet");

  // Booked only with a provider reference
  await expect(page.getByRole("button", { name: "We're booked" })).toBeDisabled();
  await page.getByPlaceholder("e.g. PT-123456").fill("PT-445566");
  await page.getByRole("button", { name: "We're booked" }).click();
  await expect(panel).toContainText("Booked ✓ Reference PT-445566");

  // Friends see it's booked, but not the reference
  await sam.reload();
  await expect(sam.getByTestId("selected-panel")).toContainText("Reference on file with the organiser");
  await expect(sam.getByText("PT-445566")).toHaveCount(0);
});

test("strangers can't sign in as organiser", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill("random@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByTestId("link-sent")).toBeVisible(); // same response, no enumeration
  await page.goto("/new");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});
