import { test, expect, type Page } from "@playwright/test";
import { parseScore, type LeadSheet } from "../../contracts/src/index";
import example from "../../contracts/fixtures/lead-sheet-v1.json" with { type: "json" };

const study = parseScore({ ...example, id: "score-layout-study", title: "Evening changes", measures: Array.from({ length: 12 }, (_, bar) => ({
  id: `bar-${bar}`, chords: [{ id: `chord-${bar}`, offsetTicks: 0, durationTicks: 1920, symbol: ["Dm7", "G7", "Cmaj7", "Am7"][bar % 4] }],
  melody: ["D", "F", "A", "G"].map((step, beat) => ({ id: `note-${bar}-${beat}`, kind: "note", offsetTicks: beat * 480,
    duration: { denominator: 4, dots: 0 }, pitch: { step, alter: 0, octave: 4 } })),
})) });

// Synthetic API responses isolate visual/layout checks from accounts and saved user data.
async function openStudy(page: Page, score: LeadSheet, mode = "Practice") {
  const saved = { id: score.id, score, revision: 1, tutorialUrl: null, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z",
    favorite: false, draft: false, trashedAt: null, openedAt: null };
  const summary = { ...saved, title: score.title, keySignature: score.keySignature, timeSignature: score.timeSignature,
    hasChords: score.measures.some(measure => measure.chords.length > 0), hasMelody: score.measures.some(measure => measure.melody.length > 0),
    previewChords: score.measures[0].chords.slice(0, 4).map(chord => chord.symbol) };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/me") ? { user: { id: "visual-user", email: "visual@example.test", name: "Layout review" } }
      : path.endsWith("/sheets") ? { sheets: [summary] } : saved;
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: `${mode === "Create" ? "Edit" : "Practice"} ${score.title}`, exact: true }).click();
}
async function capture(page: Page, name: string) {
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") await page.screenshot({ path: `docs/architecture/evidence/score-web-${name}.png` });
}

test("practice uses readable chord systems and connected melody without losing notes on resize", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStudy(page, study);
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(48);
  await expect.poll(async () => {
    const firstRowNumbers = await page.locator(".notation svg text").evaluateAll(nodes => ["1", "2", "3", "4"].map(number => nodes.find(node => node.textContent === number)?.getBoundingClientRect().top));
    return firstRowNumbers.every(top => top !== undefined) ? new Set(firstRowNumbers).size : 0;
  }).toBe(1);
  await capture(page, "melody");
  await page.getByRole("button", { name: "Chords only", exact: true }).click();
  await expect(page.locator(".score-chord")).toHaveCount(12);
  await expect(page.locator(".chord-system").first().locator(".chord-measure")).toHaveCount(4);
  expect(await page.locator(".score-chord").first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(40);
  await capture(page, "chords");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator(".chord-system").first().locator(".chord-measure")).toHaveCount(1);
  await capture(page, "narrow");
  await page.getByRole("button", { name: "Chords + melody", exact: true }).click();
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("selecting a late chord in a dense bar scrolls that actual chord into view", async ({ page }) => {
  const measure = structuredClone(example.measures[0]);
  measure.chords = ["Cmaj13(#11)", "G7b9#11", "F#m7b5", "B7alt"].map((symbol, index) => ({
    id: `dense-chord-${index}`, offsetTicks: index * 480, durationTicks: 480, symbol,
  }));
  measure.melody[4].tieToNext = false;
  const dense = parseScore({ ...example, id: "dense-practice-study", title: "Dense Practice", measures: [measure] });
  await page.setViewportSize({ width: 360, height: 800 });
  await openStudy(page, dense);
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  for (const display of ["melody", "chords"]) {
    if (display === "chords") await page.getByRole("button", { name: "Chords only", exact: true }).click();
    await page.locator(".practice-events button").last().click();
    const target = page.locator('[data-practice-chord-current="true"]');
    await expect(target).toHaveCount(1);
    const bounds = await target.boundingBox();
    const viewport = await page.locator(".score-scroll").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(viewport!.x - 1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
    await page.locator(".practice-events button").first().click();
  }
});

test("Create selects and changes the same chord from either score display", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStudy(page, study, "Create");
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".editable-chord")).toHaveCount(12);
  await page.locator(".editable-chord").first().click();
  await page.getByLabel("Chord symbol", { exact: true }).fill("Dm9");
  await page.getByRole("button", { name: "Apply chord changes", exact: true }).click();
  await expect(page.locator(".editable-chord").first()).toHaveAccessibleName(/^Dm9,/);
  await page.getByRole("button", { name: "Chords only", exact: true }).click();
  await expect(page.locator(".editable-chord").first()).toHaveText("Dm9");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editable-chord").first()).toHaveText("Dm7");
});

test("long offbeat symbols and existing accidentals, rests and ties survive reflow", async ({ page }) => {
  const dense = structuredClone(example);
  dense.measures[0].chords = [{ id: "late-symbol", offsetTicks: 1919, durationTicks: 1, symbol: "Cmaj13(#11)/G alternate voicing" }];
  await page.setViewportSize({ width: 360, height: 800 });
  await openStudy(page, parseScore(dense));
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(18);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const textBounds = await page.locator(".notation svg").evaluate(svg => {
    const text = [...svg.querySelectorAll("text")].find(node => node.textContent?.includes("alternate voicing"))!;
    return { right: text.getBoundingClientRect().right, edge: svg.getBoundingClientRect().right };
  });
  expect(textBounds.right).toBeLessThanOrEqual(textBounds.edge);
  await page.getByRole("button", { name: "Chords only", exact: true }).click();
  const symbol = page.locator(".score-chord").first();
  expect(await symbol.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.locator(".chord-system").first().evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(1400);
});

test("v2 key and meter retain accidentals while dense melody selection targets stay disjoint", async ({ page }) => {
  const score = parseScore({ ...example, schemaVersion: 2, id: "dense-meter-study", title: "Dense G-major study", keySignature: "G",
    timeSignature: { numerator: 12, denominator: 2 }, measures: [{ id: "dense-bar", chords: [],
      melody: Array.from({ length: 24 }, (_, index) => ({ id: `dense-note-${index}`, kind: "note", offsetTicks: index * 480,
        duration: { denominator: 4, dots: 0 }, pitch: { step: "F", alter: index === 1 || index === 2 ? 0 : 1, octave: 4 } })),
    }] });
  await page.setViewportSize({ width: 360, height: 800 });
  await openStudy(page, score, "Create");
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".editable-melody")).toHaveCount(24);
  await expect(page.locator(".notation svg")).toHaveAttribute("aria-label", /G major · 12\/2/);
  await expect(page.locator(".notation .vf-keysignature")).toHaveCount(1);
  await expect(page.locator(".notation .vf-timesignature")).toHaveCount(1);
  // Signature F-sharp needs no note accidental; a natural cancels it once, then a sharp restores it.
  const glyphs = await page.locator(".notation svg").textContent();
  expect((glyphs?.match(/\uE261/g) ?? []).length).toBe(1);
  expect((glyphs?.match(/\uE262/g) ?? []).length).toBe(2);
  async function disjointTargets() {
    const targets = await page.locator(".editable-melody").evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width };
    }));
    expect(targets.every(target => target.width > 0)).toBe(true);
    for (let index = 1; index < targets.length; index++) expect(targets[index].left).toBeGreaterThanOrEqual(targets[index - 1].right - 0.1);
  }
  await disjointTargets();
  for (const index of [0, 1, 3, 23]) {
    await page.locator(".editable-melody").nth(index).click();
    await expect(page.getByRole("slider", { name: "Selected note duration", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: index === 1 ? "Natural" : "Sharp", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".editable-melody").nth(index)).toHaveAttribute("aria-pressed", "true");
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  // The temporary next-entry space contains no rest glyphs.
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(24);
  await expect(page.locator(".editable-melody")).toHaveCount(24);
  await disjointTargets();
  await expect(page.getByRole("alert")).toHaveCount(0);
});


test("tied fragments share selection, duration, pitch edits and deletion", async ({ page }) => {
  const pitch = { step: "C", alter: 0, octave: 4 };
  const score = parseScore({ ...study, id: "tied-edit-study", title: "Tied editing", measures: [
    { id: "b1", chords: [], melody: [{ id: "head", kind: "note", pitch, offsetTicks: 1440, duration: { denominator: 4, dots: 0 }, tieToNext: true }] },
    { id: "b2", chords: [], melody: [{ id: "tail", kind: "note", pitch, offsetTicks: 0, duration: { denominator: 4, dots: 0 } },
      { id: "later", kind: "note", pitch: { ...pitch, step: "G" }, offsetTicks: 480, duration: { denominator: 4, dots: 0 } }] },
  ] });
  await openStudy(page, score, "Create");
  await page.getByRole("button", { name: "Melody entry", exact: true }).click();
  await page.locator('[data-note-id="tail"]').click();
  await expect(page.locator('.editable-melody.selected')).toHaveCount(2);
  const slider = page.getByRole("slider", { name: "Selected note duration", exact: true });
  await expect(slider).toHaveAttribute("aria-valuetext", "half");
  await page.getByRole("button", { name: "Flat", exact: true }).click();
  await expect(page.locator('.editable-melody.selected')).toHaveCount(2);
  await expect(page.locator('.editable-melody.selected').first()).toHaveAttribute("aria-label", /♭/);
  await expect(page.locator('.editable-melody.selected').last()).toHaveAttribute("aria-label", /♭/);
  await slider.press("ArrowLeft"); await slider.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuetext", "quarter");
  await expect(page.locator('.editable-melody')).toHaveCount(2);
  await expect(page.locator('[data-note-id="later"]')).toHaveAttribute("aria-label", /bar 2, beat 1/);
  await page.getByRole("button", { name: "Delete selected note", exact: true }).click();
  await expect(page.locator('.editable-melody')).toHaveCount(1);
  await expect(page.locator('[data-note-id="later"]')).toHaveAttribute("aria-label", /bar 1, beat 4/);
  await expect(page.locator('.sheet-footer')).toContainText('1 measure');
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('.editable-melody')).toHaveCount(2);
  await expect(page.locator('.sheet-footer')).toContainText('2 measures');
  await page.locator('[data-note-id="later"]').click();
  await page.getByRole("button", { name: "Replace selected note with rest", exact: true }).click();
  await expect(page.locator('.sheet-footer')).toContainText('1 measure');
  await expect(page.locator('[data-note-id="later"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next note entry line", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next note entry line", exact: true }).click({ position: { x: 20, y: 55 } });
  await expect(page.locator('.sheet-footer')).toContainText('2 measures');
  await expect(page.locator('.editable-melody')).toHaveCount(2);
});

test("dragging a chord onto a note uses the rendered beat after the stave signature", async ({ page }) => {
  const score = parseScore({ ...study, id: "chord-drop-study", title: "Chord drop timing",
    measures: study.measures.slice(0, 2).map((bar, index) => ({ ...bar, chords: index === 0 ? [] : bar.chords })) });
  await openStudy(page, score, "Create");
  const chord = page.locator('[data-chord-id="chord-1"]');
  await expect(chord).toBeEnabled();
  await chord.hover();
  const source = (await chord.boundingBox())!;
  const note = (await page.locator('.notation .vf-notehead').first().boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(note.x + note.width / 2, note.y + note.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(chord).toHaveAttribute('aria-label', 'G7, bar 1, beat 1, 4 beats');
});
