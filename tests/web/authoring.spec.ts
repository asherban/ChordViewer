import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";

const execute = promisify(execFile);
test.skip(process.env.CHORDVIEWER_REAL_MIDI !== "1" || process.platform !== "win32", "Explicit Windows/LoopBe acceptance; set CHORDVIEWER_REAL_MIDI=1.");
test.use({ launchOptions: { channel: "chrome" }, permissions: ["midi", "midi-sysex"], trace: "off", screenshot: "off" });

async function play(fixture = "authoring") {
  await execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    resolve("scripts/midi/Send-Fixture.ps1"), "-Fixture", fixture], { windowsHide: true, timeout: 20_000 });
}
async function setup(page: Page) {
  const title = "MIDI chord study";
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("M4 local acceptance");
  await page.getByLabel("Email", { exact: true }).fill(randomUUID() + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M4-local-" + randomUUID());
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  await page.getByLabel("Sheet title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create and save sheet", exact: true }).click();
  await expect(page.getByLabel("Editable chord score")).toBeVisible();
  await connect(page);
  await page.getByLabel("New chord duration", { exact: true }).selectOption("480");
  return title;
}
async function connect(page: Page) {
  await page.getByRole("button", { name: "Enable MIDI", exact: true }).click();
  await page.getByRole("combobox", { name: "MIDI input", exact: true }).selectOption({ label: "LoopBe Internal MIDI" });
  await expect(page.getByRole("button", { name: "Start MIDI entry", exact: true })).toBeEnabled();
}
async function savedScore(page: Page, title: string) {
  const library = await (await page.request.get("/api/v1/sheets")).json();
  const summary = library.sheets.find((sheet: { title: string }) => sheet.title === title);
  expect(summary).toBeTruthy();
  return (await (await page.request.get(`/api/v1/sheets/${summary.id}`)).json()).score;
}

test("real MIDI creates a sheet, corrects it, and persists the full score", async ({ page }) => {
  test.setTimeout(90_000);
  const title = await setup(page);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  await play();
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".editable-chord").first()).toBeInViewport();
    await page.screenshot({ path: "docs/architecture/evidence/m4-web-entry.png" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator(".editable-chord").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/architecture/evidence/m4-web-narrow.png" });
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  await page.getByRole("button", { name: "Pause entry", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(4);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  await page.locator(".editable-chord").first().click();
  await page.getByLabel("Chord symbol", { exact: true }).fill("Cmaj7");
  await page.getByRole("combobox", { name: "Chord duration", exact: true }).selectOption("240");
  await page.getByRole("button", { name: "Apply chord changes", exact: true }).click();
  await page.getByRole("button", { name: "Replace from MIDI", exact: true }).click();
  await play("authoring-replacement");
  await expect(page.locator(".editable-chord").first()).toContainText("Dm");
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  await page.locator(".editable-chord").nth(1).click();
  await page.getByRole("button", { name: "Delete chord", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await page.getByLabel("YouTube tutorial link").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save sheet", exact: true })).toBeDisabled();
  const score = await savedScore(page, title);
  expect(score.measures.flatMap((bar: { chords: unknown[] }) => bar.chords)).toMatchObject([
    { symbol: "Dm", offsetTicks: 0, durationTicks: 240 }, { symbol: "F", offsetTicks: 480, durationTicks: 480 },
    { symbol: "Am", offsetTicks: 960, durationTicks: 480 }, { symbol: "Am", offsetTicks: 1440, durationTicks: 480 },
    { symbol: "G", offsetTicks: 0, durationTicks: 480 },
  ]);
  await page.reload();
  await page.getByRole("button", { name: "Edit " + title, exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  expect(await savedScore(page, title)).toEqual(score);
});

test("real entry remains paused across modes, dialog edits and a disconnected gesture", async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await play();
  await expect(page.locator(".editable-chord")).toHaveCount(0);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  const held = play("authoring-held");
  try {
    await expect(page.getByTestId("held-notes")).toContainText("C4");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
  } finally { await held; }
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(0);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await play();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(0);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await play();
  await expect(page.locator(".editable-chord")).toHaveCount(0);
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  const disconnected = play("authoring-held");
  try {
    await expect(page.getByTestId("held-notes")).toContainText("C4");
    await page.getByRole("combobox", { name: "MIDI input", exact: true }).selectOption("");
  } finally { await disconnected; }
  await connect(page);
  await expect(page.locator(".editable-chord")).toHaveCount(0);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  await play();
  await expect(page.locator(".editable-chord")).toHaveCount(5);
});

test("a failed full-score save retains MIDI edits and a revision conflict does not overwrite the server", async ({ page }) => {
  test.setTimeout(90_000);
  const title = await setup(page);
  await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
  await play();
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  await page.route("**/api/v1/sheets/*", route => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, body: "{}" }) : route.continue());
  await page.getByRole("button", { name: "Save sheet", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("backend is unavailable");
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  await page.unroute("**/api/v1/sheets/*");
  const library = await (await page.request.get("/api/v1/sheets")).json();
  const stored = await (await page.request.get(`/api/v1/sheets/${library.sheets[0].id}`)).json();
  expect((await page.request.put(`/api/v1/sheets/${stored.id}`, { headers: { Origin: "http://127.0.0.1:5173" }, data: {
    score: stored.score, tutorialUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expectedRevision: stored.revision,
  } })).ok()).toBe(true);
  await page.getByRole("button", { name: "Save sheet", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed elsewhere");
  await expect(page.locator(".editable-chord")).toHaveCount(5);
  expect((await savedScore(page, title)).measures[0].chords).toEqual([]);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reload latest version", exact: true }).click();
  await expect(page.locator(".editable-chord")).toHaveCount(0);
});


