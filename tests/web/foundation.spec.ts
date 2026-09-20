import { test, expect } from "@playwright/test";

test("signed-out score preview preserves melody, chord-only display and the MIDI panel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the score preview" }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(page.getByRole("img", { name: /First Sketch/ })).toBeVisible();
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(18);
  await expect(page.getByRole("button", { name: "Enable MIDI" })).toBeVisible();
  await page.getByRole("button", { name: "Chords only", exact: true }).click();
  await expect(page.getByLabel("Chord-only score")).toBeVisible();
  await expect(page.getByTestId("notation")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Chords + melody", exact: true })
    .click();
  await expect(page.getByTestId("notation")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "First Sketch", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("backend failure is visible and does not pretend a personal library is empty", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("backend is unavailable");
  await expect(
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Explore the score preview" }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(
    page.getByText("This original example is a preview.", { exact: false }),
  ).toBeVisible();
});
