import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const execute = promisify(execFile);

test.use({ launchOptions: { channel: "chrome" }, permissions: ["midi", "midi-sysex"], trace: "off", screenshot: "off" });
test.skip(process.env.CHORDVIEWER_REAL_MIDI !== "1" || process.platform !== "win32", "Explicit Windows/LoopBe acceptance.");

test("a fresh physical C chord advances Practice once without changing the saved score", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Practice MIDI tester");
  await page.getByLabel("Email", { exact: true }).fill(`practice-midi-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("Local-piano-test-2026!");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const form = page.getByRole("form", { name: "New sheet" });
  await form.getByLabel("Sheet title").fill("LoopBe Practice study");
  await form.getByLabel("A copy of the original example").check();
  await form.getByRole("button", { name: "Create and save sheet" }).click();
  const id = (await (await page.request.get("/api/v1/sheets")).json()).sheets[0].id;
  const before = await (await page.request.get(`/api/v1/sheets/${id}`)).json();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Enable MIDI", exact: true }).click();
  await page.getByRole("combobox", { name: "MIDI input", exact: true }).selectOption({ label: "LoopBe Internal MIDI" });
  await page.getByRole("button", { name: "On match" }).click();
  await execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    resolve("scripts/midi/Send-Fixture.ps1"), "-Fixture", "authoring"], { windowsHide: true, timeout: 20_000 });
  await expect(page.locator(".practice-feedback strong")).toHaveText("G7");
  await expect(page.getByText("Bar 1 of 4")).toBeVisible();
  const after = await (await page.request.get(`/api/v1/sheets/${id}`)).json();
  expect(after.score).toEqual(before.score);
  expect(after.revision).toBe(before.revision);
});
