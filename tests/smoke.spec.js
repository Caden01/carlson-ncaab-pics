import { expect, test } from "@playwright/test";

async function enableE2EBypass(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("__e2e_auth_bypass", "1");
  });
}

test.describe("unauthenticated smoke coverage", () => {
  test("login page renders the recap-style entry screen", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Carlson NCAAB Picks")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in with google/i })
    ).toBeVisible();
  });

  test("protected routes redirect to login", async ({ page }) => {
    const protectedPaths = ["/", "/leaderboard", "/recap", "/profile"];

    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("button", { name: /sign in with google/i })
      ).toBeVisible();
    }
  });

  test("mobile login layout keeps the primary action visible", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "This assertion is only meaningful in the mobile project.");

    await page.goto("/login");

    const signInButton = page.getByRole("button", {
      name: /sign in with google/i,
    });

    await expect(signInButton).toBeVisible();
    await expect(signInButton).toBeInViewport();
  });
});

test.describe("authenticated smoke coverage", () => {
  test("dashboard and profile render with the test bypass", async ({ page }) => {
    await enableE2EBypass(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Admin override")).toBeVisible();
    await expect(page.getByText("ACC Tournament")).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Your Profile" })).toBeVisible();
    await expect(page.getByText("E2E Tester")).toBeVisible();
  });

  test("leaderboard and recap render authenticated content", async ({ page }) => {
    await enableE2EBypass(page);

    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    const tournamentTab = page.locator(".leaderboard-tabs .tab-btn").nth(3);
    await expect(tournamentTab).toBeVisible();
    await tournamentTab.click();
    await expect(page.locator(".table-header-label")).toContainText(
      "Tournament Standings"
    );

    await page.goto("/recap");
    await expect(
      page.getByRole("heading", { name: "Season Recap" })
    ).toBeVisible();
    await page.locator(".recap-phase-toggle .recap-phase-btn").nth(1).click();
    await expect(
      page.getByRole("heading", { name: "Tournament Recap" })
    ).toBeVisible();
  });

  test("admin route is available when bypass runs as admin", async ({
    page,
  }) => {
    await enableE2EBypass(page);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();
    await expect(page.getByRole("button", { name: /import games/i })).toBeVisible();
  });

  test("mobile nav works with the authenticated bypass", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile nav validation only runs in the mobile project.");

    await enableE2EBypass(page);

    await page.goto("/");
    await page.locator(".mobile-menu-btn").click();
    await page.getByRole("link", { name: "Leaderboard" }).click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  });
});
