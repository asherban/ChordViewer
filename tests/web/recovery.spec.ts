import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", viewport: { width: 1280, height: 800 } });
async function account(page: Page) {
  const email = `recovery-${randomUUID()}@example.test`, password = `M7-${randomUUID()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Recovery tester");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByRole("heading", { name: "Your first sheet starts here" })).toBeVisible();
  return { email, password };
}
async function create(page: Page) {
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const form = page.getByRole("form", { name: "New sheet" });
  await form.getByLabel("Sheet title").fill("Recovery source");
  await form.getByRole("button", { name: "Create and save sheet" }).click();
  await expect(page.getByLabel("Editable chord score", { exact: true })).toBeVisible();
  return (await (await page.request.get("/api/v1/sheets")).json()).sheets[0].id as string;
}
async function details(page: Page, title: string) {
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await page.getByLabel("Sheet title", { exact: true }).fill(title);
  await page.getByLabel("YouTube tutorial link").fill("https://youtu.be/M7lc1UVf-VE");
  await expect(page.getByText("Local recovery copy updated. Save to update your Library.", { exact: true })).toBeVisible();
}

test("music and details recover after an offline save and reload, then save explicitly", async ({ page }) => {
  test.setTimeout(90_000); page.on("dialog", dialog => void dialog.accept());
  await account(page); const id = await create(page);
  await page.getByRole("button", { name: "Add chord by hand", exact: true }).click();
  await page.getByLabel("Chord symbol", { exact: true }).fill("C");
  await page.getByRole("button", { name: "Add chord", exact: true }).click();
  await page.getByRole("button", { name: "Melody entry", exact: true }).click();
  await page.getByRole("button", { name: "Add note by hand", exact: true }).click();
  const melody = page.getByRole("form", { name: "Add melody", exact: true });
  await melody.getByLabel("Note pitch", { exact: true }).selectOption("D");
  await melody.getByRole("button", { name: "Add melody event", exact: true }).click();
  await details(page, "Recovered piano study");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByText("Read only", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.route(`**/api/v1/sheets/${id}`, route => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Save sheet", exact: true }).click();
  await expect(page.getByText("Cannot reach the backend.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save sheet", exact: true })).toBeEnabled();
  await page.unroute(`**/api/v1/sheets/${id}`);
  await page.reload();
  const copies = page.getByRole("region", { name: "Local recovery copies" });
  await expect(copies.getByText("Recovered piano study", { exact: true })).toBeVisible();
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") await page.screenshot({ path: "docs/architecture/evidence/m7-web-recovery.png", fullPage: true });
  await copies.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recovered piano study", exact: true })).toBeVisible();
  const untouched = await (await page.request.get(`/api/v1/sheets/${id}`)).json();
  expect(untouched.revision).toBe(1); expect(untouched.score.measures[0].chords).toHaveLength(0);
  await page.getByRole("button", { name: "Save sheet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save sheet", exact: true })).toBeDisabled();
  const saved = await (await page.request.get(`/api/v1/sheets/${id}`)).json();
  expect(saved.revision).toBe(2); expect(saved.score.title).toBe("Recovered piano study");
  expect(saved.score.measures[0].chords[0].symbol).toBe("C");
  expect(saved.score.measures[0].melody[0].pitch.step).toBe("D");
  expect(saved.tutorialUrl).toBe("https://www.youtube.com/watch?v=M7lc1UVf-VE");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(copies).toBeHidden();
});

test("two tabs preserve separate recovery copies and an old revision can save as new", async ({ page, context }) => {
  test.setTimeout(90_000); page.on("dialog", dialog => void dialog.accept());
  await account(page); const id = await create(page);
  const other = await context.newPage(); await other.goto("/");
  await other.getByRole("button", { name: "Edit Recovery source", exact: true }).click();
  await details(page, "My recovered version"); await details(other, "Other tab version");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const copies = page.getByRole("region", { name: "Local recovery copies" });
  // Focus refresh reads actual shared IndexedDB; neither tab writes the other's record.
  await page.bringToFront(); await page.reload();
  await expect(copies.getByRole("article")).toHaveCount(2);
  await other.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(other.getByRole("button", { name: "Save details", exact: true })).toBeDisabled();
  await page.reload();
  await expect(copies.getByRole("article")).toHaveCount(1);
  await copies.getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByRole("button", { name: "Save sheet", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save as new sheet", exact: true })).toBeEnabled();
  await expect(page.getByText("Local recovery copy updated. Save to update your Library.", { exact: true })).toBeVisible();
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") await page.screenshot({ path: "docs/architecture/evidence/m7-web-conflict.png", fullPage: true });
  await page.getByRole("button", { name: "Save as new sheet", exact: true }).click();
  await expect(page.getByText("Sheet created and saved.", { exact: true })).toBeVisible();
  const rows = (await (await page.request.get("/api/v1/sheets")).json()).sheets;
  expect(rows).toHaveLength(2);
  expect(rows.find((row: {id: string}) => row.id === id).title).toBe("Other tab version");
  const copied = rows.find((row: {id: string}) => row.id !== id);
  expect(copied.title).toBe("My recovered version");
  expect(copied.tutorialUrl).toBe("https://www.youtube.com/watch?v=M7lc1UVf-VE");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(copies).toBeHidden(); await other.close();
});

test("local recovery is hidden after sign-out and from another account", async ({ page }) => {
  test.setTimeout(90_000); page.on("dialog", dialog => void dialog.accept());
  await account(page); const id = await create(page); await details(page, "Private recovery title");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await account(page);
  await expect(page.getByText("Private recovery title", { exact: true })).toBeHidden();
  await expect(page.getByRole("region", { name: "Local recovery copies" })).toBeHidden();
  expect((await page.request.get(`/api/v1/sheets/${id}`)).status()).toBe(404);
});

test("restoring another copy of the same sheet preserves the unsaved draft being left", async ({ page }) => {
  page.on("dialog", dialog => void dialog.accept());
  await account(page); const id = await create(page);
  await details(page, "First recovery version"); await page.reload();
  const copies = page.getByRole("region", { name: "Local recovery copies" });
  await copies.getByRole("button", { name: "Restore draft" }).click();
  await details(page, "Second unsaved version");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(copies.getByRole("article")).toHaveCount(2);
  await copies.getByRole("article").filter({ hasText: "First recovery version" }).getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByRole("heading", { name: "First recovery version", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(copies.getByRole("article")).toHaveCount(3);
  await expect(copies.getByText("Second unsaved version", { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/v1/sheets/${id}`)).json()).revision).toBe(1);
});

test("full local storage reports failure without evicting drafts or blocking explicit Save", async ({ page, context }) => {
  page.on("dialog", dialog => void dialog.accept());
  await account(page); await create(page); await details(page, "Existing local copy");
  // Fill the actual bounded store from a validated UI-written record.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("chordviewer-recovery", 1);
    opening.onerror = () => reject(new Error("Open failed"));
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts");
      const read = store.getAll();
      read.onsuccess = () => { for (let i = read.result.length; i < 20; i++) store.put({ ...read.result[0], id: crypto.randomUUID() }); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(new Error("Fill failed")); };
    };
  }));
  const other = await context.newPage(); await other.goto("/");
  await other.getByRole("button", { name: "Edit Recovery source", exact: true }).click();
  await other.getByRole("button", { name: "Sheet details", exact: true }).click();
  await other.getByLabel("Sheet title", { exact: true }).fill("Saved despite local quota");
  await expect(other.getByText("Local recovery write failed.", { exact: false })).toBeVisible();
  await other.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(other.getByRole("button", { name: "Save details", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("region", { name: "Local recovery copies" }).getByRole("article")).toHaveCount(20);
  await other.close();
});
