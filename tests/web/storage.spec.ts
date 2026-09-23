import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const password = "Local-piano-test-2026!";
function account() {
  return `piano-${randomUUID()}@example.test`;
}
async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Local Pianist");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toBeVisible();
}
async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to your library", exact: true })
    .click();
  await expect(
    page.getByText(`Personal library · ${email}`, { exact: true }),
  ).toBeVisible();
}
async function create(page: Page, title: string, example = false) {
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const form = page.getByRole("form", { name: "New sheet", exact: true });
  await form.getByLabel("Sheet title").fill(title);
  if (example) await form.getByLabel("A copy of the original example").check();
  await form.getByRole("button", { name: "Create and save sheet" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  if (example) await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  else await expect(page.getByLabel("Editable chord score")).toBeVisible();
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
}

test("accounts keep separate libraries and saved details reopen in another browser session", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const firstAccount = account();
  const otherAccount = account();
  await signUp(page, firstAccount);
  await create(page, "Morning practice");
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(0);
  await page
    .getByLabel("Sheet title", { exact: true })
    .fill("Morning <piano> practice");
  await page
    .getByLabel("YouTube tutorial link")
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Morning <piano> practice",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open on YouTube ↗" }),
  ).toHaveAttribute(
    "href",
    /https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await signUp(page, otherAccount);
  await expect(page.getByText("Morning <piano> practice")).toHaveCount(0);
  await create(page, "Another musician's sheet", true);
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(18);

  const otherDevice = await browser.newContext({ baseURL });
  try {
    const secondPage = await otherDevice.newPage();
    await signIn(secondPage, firstAccount);
    await secondPage
      .getByRole("button", {
        name: "Edit Morning <piano> practice",
        exact: true,
      })
      .click();
    await secondPage.getByRole("button", { name: "Sheet details", exact: true }).click();
    await expect(secondPage.getByLabel("YouTube tutorial link")).toHaveValue(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    await expect(secondPage.getByText("Another musician's sheet")).toHaveCount(
      0,
    );
    await secondPage.reload();
    await expect(
      secondPage.getByRole("button", {
        name: "Edit Morning <piano> practice",
        exact: true,
      }),
    ).toBeVisible();
    const cookies = await otherDevice.cookies();
    expect(
      cookies.some(
        (cookie) => cookie.name.includes("session") && cookie.httpOnly,
      ),
    ).toBe(true);
    expect(await secondPage.evaluate(() => localStorage.length)).toBe(0);
    await secondPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(
      secondPage.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  } finally {
    await otherDevice.close();
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});

test("a real revision conflict retains unsaved fields until the user reloads", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const email = account();
  await signUp(page, email);
  await create(page, "Shared across my devices", true);
  const secondDevice = await browser.newContext({ baseURL });
  try {
    const secondPage = await secondDevice.newPage();
    await signIn(secondPage, email);
    await secondPage
      .getByRole("button", {
        name: "Edit Shared across my devices",
        exact: true,
      })
      .click();
    await secondPage.getByRole("button", { name: "Sheet details", exact: true }).click();
    await expect(
      secondPage.getByLabel("Sheet title", { exact: true }),
    ).toHaveValue("Shared across my devices");
    await page
      .getByLabel("Sheet title", { exact: true })
      .fill("Saved on first device");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(
      page.getByRole("heading", { name: "Saved on first device", exact: true }),
    ).toBeVisible();
    await secondPage
      .getByLabel("Sheet title", { exact: true })
      .fill("My unsaved second-device name");
    await secondPage.getByRole("button", { name: "Save details" }).click();
    await expect(secondPage.getByRole("alert")).toContainText(
      "changed elsewhere",
    );
    await expect(
      secondPage.getByLabel("Sheet title", { exact: true }),
    ).toHaveValue("My unsaved second-device name");
    secondPage.once("dialog", (dialog) => dialog.accept());
    await secondPage
      .getByRole("button", { name: "Reload latest version" })
      .click();
    await expect(
      secondPage.getByLabel("Sheet title", { exact: true }),
    ).toHaveValue("Saved on first device");
    await expect(secondPage.locator(".notation .vf-stavenote")).toHaveCount(18);
    await secondPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
  } finally {
    await secondDevice.close();
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});

test("a failed save preserves the draft and a failed refresh preserves the loaded library", async ({
  page,
}) => {
  await signUp(page, account());
  await create(page, "Connection recovery", true);
  await page.route("**/api/v1/sheets/*", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, body: "{}" })
      : route.continue(),
  );
  await page
    .getByLabel("Sheet title", { exact: true })
    .fill("Keep my unsaved change");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("alert")).toContainText("backend is unavailable");
  await expect(page.getByLabel("Sheet title", { exact: true })).toHaveValue(
    "Keep my unsaved change",
  );
  await page.unroute("**/api/v1/sheets/*");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep my unsaved change", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.route("**/api/v1/sheets", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page
    .getByRole("button", { name: "Refresh library", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("backend is unavailable");
  await expect(
    page.getByRole("button", {
      name: "Edit Keep my unsaved change",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first sheet starts here" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
