import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";
import { parseScore, type SavedSheet } from "../../contracts/src/index";

const execute = promisify(execFile);
const realMidi = process.env.CHORDVIEWER_REAL_MIDI === "1" && process.platform === "win32";
test.use({ trace: "off", screenshot: "off", ...(realMidi ? { launchOptions: { channel: "chrome" } } : {}) });

async function signUp(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("M5 local acceptance");
  await page.getByLabel("Email", { exact: true }).fill(`melody-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(`M5-local-${randomUUID()}`);
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your first sheet starts here", exact: true })).toBeVisible();
}

async function createStudy(page: Page, title: string) {
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const form = page.getByRole("form", { name: "New sheet", exact: true });
  await form.getByLabel("Sheet title", { exact: true }).fill(title);
  await form.getByLabel("Key signature", { exact: true }).selectOption("G");
  await form.getByLabel("Beats per bar", { exact: true }).selectOption("3");
  await form.getByLabel("Beat unit", { exact: true }).selectOption("4");
  await form.getByRole("button", { name: "Create and save sheet", exact: true }).click();
  await expect(page.getByLabel("Editable chord score", { exact: true })).toBeVisible();
  // A separate chord pass already occupies both melody bars.
  for (const symbol of ["G", "D7"]) {
    await page.getByRole("button", { name: "Add chord by hand", exact: true }).click();
    await page.getByLabel("Chord symbol", { exact: true }).fill(symbol);
    await page.getByRole("button", { name: "Add chord", exact: true }).click();
  }
  await save(page);
  return savedSheet(page, title);
}

async function save(page: Page) {
  const button = page.getByRole("button", { name: "Save sheet", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toBeDisabled();
}

async function sheets(page: Page): Promise<{ id: string; title: string }[]> {
  const response = await page.request.get("/api/v1/sheets");
  expect(response.ok()).toBe(true);
  return (await response.json()).sheets;
}

async function savedSheet(page: Page, title: string): Promise<SavedSheet> {
  const summary = (await sheets(page)).find(sheet => sheet.title === title);
  expect(summary, `Expected the synthetic sheet ${title}`).toBeTruthy();
  const response = await page.request.get(`/api/v1/sheets/${summary!.id}`);
  expect(response.ok()).toBe(true);
  const saved = await response.json() as SavedSheet;
  parseScore(saved.score);
  return saved;
}

async function addManualNote(page: Page, step: string, alter = "0", duration = "4:0") {
  await page.getByRole("button", { name: "Add note by hand", exact: true }).click();
  const form = page.getByRole("form", { name: "Add melody", exact: true });
  await form.getByLabel("Note pitch", { exact: true }).selectOption(step);
  await form.getByLabel("Note accidental", { exact: true }).selectOption(alter);
  await form.getByLabel("Note duration", { exact: true }).selectOption(duration);
  await form.getByRole("button", { name: "Add melody event", exact: true }).click();
}

async function reopen(page: Page, title: string) {
  await page.reload();
  await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
}

test("manual melody passes preserve harmony, exact rests, ties and history through save/reopen", async ({ page }) => {
  test.setTimeout(90_000);
  const title = "Manual G-major melody study";
  await signUp(page);
  const initial = await createStudy(page, title);
  await page.getByRole("button", { name: "Melody entry", exact: true }).click();
  await expect(page.getByLabel("Insertion bar", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Insertion beat", { exact: true })).toHaveValue("0");
  await addManualNote(page, "C");
  await addManualNote(page, "F", "1");
  await addManualNote(page, "F", "1");
  await page.getByRole("button", { name: "Insert rest", exact: true }).click();
  await expect(page.locator(".editable-melody")).toHaveCount(4);
  await expect(page.locator(".editable-melody").nth(3)).toHaveAccessibleName(/^Rest, quarter, bar 2, beat 1$/);

  await page.locator(".editable-melody").nth(1).click();
  await page.getByRole("checkbox", { name: /^Tie to next note/ }).check();
  await page.getByRole("button", { name: "Apply melody changes", exact: true }).click();
  await expect(page.locator(".editable-melody").nth(1)).toHaveAccessibleName(/tied/);
  await page.locator(".editable-melody").nth(2).click();
  await page.getByRole("button", { name: "Delete note → rest", exact: true }).click();
  await expect(page.locator(".editable-melody").nth(2)).toHaveAccessibleName(/^Rest, quarter/);
  await expect(page.locator(".editable-melody").nth(1)).not.toHaveAccessibleName(/tied/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-melody").nth(1)).toHaveAccessibleName(/tied/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".editable-melody").nth(2)).toHaveAccessibleName(/^Rest, quarter/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await page.locator(".editable-melody").first().click();
  await page.getByLabel("Note pitch", { exact: true }).selectOption("D");
  await page.getByLabel("Note accidental", { exact: true }).selectOption("-1");
  await page.getByLabel("Note duration", { exact: true }).selectOption("8:1");
  await page.getByRole("button", { name: "Apply melody changes", exact: true }).click();
  await expect(page.locator(".editable-melody").first()).toHaveAccessibleName(/^D♭4, dotted eighth/);
  await save(page);
  const stored = await savedSheet(page, title);
  expect(stored.score.schemaVersion).toBe(2);
  expect(stored.score.keySignature).toBe("G");
  expect(stored.score.timeSignature).toEqual({ numerator: 3, denominator: 4 });
  expect(stored.score.measures.map(bar => bar.chords)).toEqual(initial.score.measures.map(bar => bar.chords));
  expect(stored.score.measures[0].melody).toMatchObject([
    { kind: "note", offsetTicks: 0, pitch: { step: "D", alter: -1, octave: 4 }, duration: { denominator: 8, dots: 1 } },
    { kind: "note", offsetTicks: 480, pitch: { step: "F", alter: 1, octave: 4 }, duration: { denominator: 4, dots: 0 }, tieToNext: true },
    { kind: "note", offsetTicks: 960, pitch: { step: "F", alter: 1, octave: 4 }, duration: { denominator: 4, dots: 0 } },
  ]);
  expect(stored.score.measures[1].melody).toMatchObject([{ kind: "rest", offsetTicks: 0, duration: { denominator: 4, dots: 0 } }]);
  await reopen(page, title);
  await expect(page.locator(".editable-melody")).toHaveCount(4);
  expect((await savedSheet(page, title)).score).toEqual(stored.score);
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  const details = page.getByRole("form", { name: "Sheet details", exact: true });
  await details.getByLabel("Key signature", { exact: true }).selectOption("Bb");
  await details.getByLabel("Beats per bar", { exact: true }).selectOption("1");
  await details.getByRole("button", { name: "Apply key and meter", exact: true }).click();
  await expect(details.getByRole("alert")).toContainText("cross the new barline");
  await details.getByLabel("Beats per bar", { exact: true }).selectOption("6");
  await details.getByLabel("Beat unit", { exact: true }).selectOption("8");
  await details.getByRole("button", { name: "Apply key and meter", exact: true }).click();
  await expect(details.getByRole("alert")).toHaveCount(0);
  await details.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save sheet", exact: true })).toBeDisabled();
  const changed = await savedSheet(page, title);
  expect(changed.score.keySignature).toBe("Bb");
  expect(changed.score.timeSignature).toEqual({ numerator: 6, denominator: 8 });
  expect(changed.score.measures).toEqual(stored.score.measures);
  await page.getByRole("button", { name: "Sheet details", exact: true }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".editable-melody")).toHaveCount(0);
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(4);
});

test("MusicXML previews before saving, exports exact JSON, reimports with a fresh ID and rejects unsafe files", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page);
  await page.getByRole("button", { name: "Import score", exact: true }).click();
  let form = page.getByRole("form", { name: "Import score", exact: true });
  await form.getByLabel("Score file", { exact: true }).setInputFiles(resolve("tests/fixtures/music/import/lead-sheet.musicxml"));
  await expect(form.getByLabel("Imported score preview", { exact: true })).toBeVisible();
  await expect(form.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(form.locator(".import-warnings")).toContainText("Lyrics, visual layout, dynamics and performance metadata are not imported");
  expect(await sheets(page)).toHaveLength(0);
  await form.getByLabel("Imported sheet title", { exact: true }).fill("Imported melody study");
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "docs/architecture/evidence/m5-web-import.png" });
  }
  await form.getByRole("button", { name: "Save as new sheet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Imported melody study", exact: true })).toBeVisible();
  const original = await savedSheet(page, "Imported melody study");
  expect(original.id).not.toBe("import-score");
  expect(original.score.id).toBe(original.id);
  expect(original.score.keySignature).toBe("D");
  expect(original.score.timeSignature).toEqual({ numerator: 6, denominator: 8 });
  expect(original.score.measures.map(bar => bar.melody.length)).toEqual([4, 1]);
  expect(original.score.measures[0].chords).toMatchObject([
    { symbol: "D", offsetTicks: 0, durationTicks: 720 }, { symbol: "A7/C#", offsetTicks: 720, durationTicks: 720 },
  ]);
  expect(original.score.measures[0].melody[0]).toHaveProperty("tieToNext", true);
  expect(original.score.measures[0].melody[3]).toHaveProperty("tieToNext", true);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export score JSON", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`ChordViewer-${original.id}.json`);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks);
  expect(parseScore(JSON.parse(exported.toString("utf8")))).toEqual(original.score);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Import score", exact: true }).click();
  form = page.getByRole("form", { name: "Import score", exact: true });
  await form.getByLabel("Score file", { exact: true }).setInputFiles({ name: "roundtrip.json", mimeType: "application/json", buffer: exported });
  await expect(form.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await form.getByLabel("Imported sheet title", { exact: true }).fill("JSON roundtrip copy");
  await form.getByRole("button", { name: "Save as new sheet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "JSON roundtrip copy", exact: true })).toBeVisible();
  const copy = await savedSheet(page, "JSON roundtrip copy");
  expect(copy.id).not.toBe(original.id);
  expect(copy.score).toEqual({ ...original.score, id: copy.id, title: "JSON roundtrip copy" });
  expect((await savedSheet(page, "Imported melody study")).score).toEqual(original.score);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Import score", exact: true }).click();
  form = page.getByRole("form", { name: "Import score", exact: true });
  await form.getByLabel("Score file", { exact: true }).setInputFiles({ name: "entity.musicxml", mimeType: "application/xml",
    buffer: Buffer.from('<!DOCTYPE score-partwise [<!ENTITY value "unsafe">]><score-partwise>&value;</score-partwise>') });
  await expect(form.getByRole("alert")).toContainText("DTD and entity declarations are not allowed");
  await expect(form.getByRole("button", { name: "Save as new sheet", exact: true })).toBeDisabled();
  await expect(form.getByLabel("Imported score preview", { exact: true })).toHaveCount(0);
  await form.getByLabel("Score file", { exact: true }).setInputFiles({ name: "unsupported.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...original.score, schemaVersion: 999 })) });
  await expect(form.getByRole("alert")).toContainText("not a supported ChordViewer score JSON");
  await expect(form.getByRole("button", { name: "Save as new sheet", exact: true })).toBeDisabled();
  expect(await sheets(page)).toHaveLength(2);
});

test.describe("physical LoopBe melody acceptance", () => {
  test.skip(!realMidi, "Explicit Windows/LoopBe acceptance; set CHORDVIEWER_REAL_MIDI=1.");
  test.use({ permissions: ["midi", "midi-sysex"] });

  test("six separately released MIDI notes fill two 3/4 bars and preserve the chord pass through corrections", async ({ page }) => {
    test.setTimeout(90_000);
    const title = "LoopBe G-major melody study";
    await signUp(page);
    const initial = await createStudy(page, title);
    await page.getByRole("button", { name: "Enable MIDI", exact: true }).click();
    await page.getByRole("combobox", { name: "MIDI input", exact: true }).selectOption({ label: "LoopBe Internal MIDI" });
    await page.getByRole("button", { name: "Melody entry", exact: true }).click();
    await expect(page.getByLabel("Insertion bar", { exact: true })).toHaveValue("0");
    await page.getByLabel("New note duration", { exact: true }).selectOption("4:0");
    await page.getByRole("button", { name: "Start MIDI entry", exact: true }).click();
    await execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/midi/Send-Fixture.ps1"), "-Fixture", "melody"],
      { windowsHide: true, timeout: 20_000 });
    await expect(page.locator(".editable-melody")).toHaveCount(6);
    await expect(page.getByLabel("Insertion bar", { exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Insertion beat", { exact: true })).toHaveValue("0");
    await page.getByRole("button", { name: "Pause entry", exact: true }).click();
    await save(page);
    const captured = await savedSheet(page, title);
    const pitches = captured.score.measures.flatMap(bar => bar.melody.map(event => event.kind === "note" ? event.pitch : null));
    expect(pitches).toEqual([
      { step: "C", alter: 0, octave: 4 }, { step: "D", alter: 0, octave: 4 }, { step: "F", alter: 1, octave: 4 },
      { step: "F", alter: 1, octave: 4 }, { step: "G", alter: 0, octave: 4 }, { step: "A", alter: 0, octave: 4 },
    ]);
    expect(captured.score.measures.map(bar => bar.melody.map(event => event.offsetTicks))).toEqual([[0, 480, 960], [0, 480, 960], [], []]);
    expect(captured.score.measures.flatMap(bar => bar.melody.map(event => event.duration))).toEqual(Array(6).fill({ denominator: 4, dots: 0 }));
    expect(captured.score.measures.map(bar => bar.chords)).toEqual(initial.score.measures.map(bar => bar.chords));

    await page.locator(".editable-melody").nth(2).click();
    await page.getByRole("checkbox", { name: /^Tie to next note/ }).check();
    await page.getByRole("button", { name: "Apply melody changes", exact: true }).click();
    await expect(page.locator(".editable-melody").nth(2)).toHaveAccessibleName(/tied/);
    await page.locator(".editable-melody").nth(1).click();
    await page.getByRole("button", { name: "Delete note → rest", exact: true }).click();
    await expect(page.locator(".editable-melody").nth(1)).toHaveAccessibleName(/^Rest, quarter/);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".editable-melody").nth(1)).toHaveAccessibleName(/^D4, quarter/);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.locator(".editable-melody").nth(5).click();
    await page.getByLabel("Note pitch", { exact: true }).selectOption("B");
    await page.getByLabel("Note accidental", { exact: true }).selectOption("-1");
    await page.getByLabel("Note duration", { exact: true }).selectOption("8:1");
    await page.getByRole("button", { name: "Apply melody changes", exact: true }).click();
    await expect(page.locator(".editable-melody").nth(5)).toHaveAccessibleName(/^B♭4, dotted eighth/);
    await save(page);
    const corrected = await savedSheet(page, title);
    expect(corrected.score.measures.flatMap(bar => bar.melody.map(event => event.id))).toEqual(captured.score.measures.flatMap(bar => bar.melody.map(event => event.id)));
    expect(corrected.score.measures[0].melody[1]).toMatchObject({ kind: "rest", offsetTicks: 480, duration: { denominator: 4, dots: 0 } });
    expect(corrected.score.measures[0].melody[2]).toHaveProperty("tieToNext", true);
    expect(corrected.score.measures[1].melody[2]).toMatchObject({ kind: "note", offsetTicks: 960, pitch: { step: "B", alter: -1, octave: 4 }, duration: { denominator: 8, dots: 1 } });
    expect(corrected.score.measures.map(bar => bar.chords)).toEqual(initial.score.measures.map(bar => bar.chords));
    await reopen(page, title);
    await expect(page.locator(".editable-melody")).toHaveCount(6);
    expect((await savedSheet(page, title)).score).toEqual(corrected.score);
    if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.screenshot({ path: "docs/architecture/evidence/m5-web-melody.png" });
    }
  });
});
