import { test, expect } from "@playwright/test";

test("empty personal library and shared API score render without saving the sample", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toBeVisible();
  await expect(
    page.getByText("Local API connected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the score preview" }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(page.getByRole("img", { name: /First Sketch/ })).toBeVisible();
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(18);
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
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a failed API leaves an honest bundled preview and an empty library", async ({
  page,
}) => {
  await page.route("**/api/v1/score-example", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/");
  await expect(
    page.getByText("API unavailable · using bundled example", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the score preview" }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(
    page.getByText("The score preview could not be drawn.", { exact: false }),
  ).toHaveCount(0);
});

test("an unsupported contract response is rejected before display", async ({
  page,
}) => {
  await page.route("**/api/v1/score-example", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 999, title: "Unvalidated score" }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("API unavailable · using bundled example", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the score preview" }).click();
  await expect(
    page.getByRole("heading", { name: "First Sketch", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unvalidated score")).toHaveCount(0);
});
