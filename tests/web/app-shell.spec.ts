import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("app fills desktop, tablet and narrow windows without moving its header off screen", async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 360, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Explore the score preview" }).click();
    await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
    const dimensions = await page.evaluate(() => {
      const root = document.scrollingElement!;
      const shell = document.querySelector(".app-shell")!.getBoundingClientRect();
      return { pageWidth: root.scrollWidth, pageHeight: root.scrollHeight, width: innerWidth, height: innerHeight, shellHeight: shell.height };
    });
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.height + 1);
    expect(Math.abs(dimensions.shellHeight - dimensions.height)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Chords only", exact: true }).click();
    await expect(page.getByLabel("Chord-only score")).toBeVisible();
    await page.locator(".workspace-container").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Library", exact: true })).toBeInViewport();
  }
});

test("full-screen toggle uses the real browser API and tracks external exit", async ({ page }) => {
  await page.goto("/");
  const enter = page.getByRole("button", { name: "Enter full screen", exact: true });
  await expect(enter).toBeEnabled();
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await enter.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole("button", { name: "Exit full screen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await enter.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  // An external exit fires the same fullscreenchange event as the browser's Escape action.
  await page.evaluate(() => document.exitFullscreen());
  await expect(enter).toBeVisible();
  await expect(enter).toHaveAttribute("aria-pressed", "false");
});

test("unavailable full screen leaves mobile navigation usable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => Object.defineProperty(document, "fullscreenEnabled", { value: false }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Enter full screen", exact: true })).toBeDisabled();
  await expect(page.getByText("Full screen is unavailable in this browser or page.")).toBeVisible();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My library", exact: true })).toBeVisible();
});

test("mode navigation keeps unsaved details and the new-sheet dialog supports keyboard cancellation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Tablet layout check");
  await page.getByLabel("Email", { exact: true }).fill("layout-" + randomUUID() + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Layout-test-" + randomUUID());
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your first sheet starts here" })).toBeVisible();
  const newSheet = page.getByRole("button", { name: "New sheet", exact: true });
  await newSheet.click();
  await expect(page.getByRole("dialog", { name: "New sheet", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(newSheet).toBeFocused();
  await newSheet.click();
  const form = page.getByRole("form", { name: "New sheet", exact: true });
  await form.getByLabel("Sheet title").fill("An open idea");
  await form.getByLabel("A copy of the original example").check();
  await form.getByRole("button", { name: "Create and save sheet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await page.getByLabel("Sheet title", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save details", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByText("Unsaved changes in your open sheet")).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByLabel("Sheet title", { exact: true })).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keep this draft", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
