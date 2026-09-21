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
  const saved = { id: score.id, score, revision: 1, tutorialUrl: null, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/me") ? { user: { id: "visual-user", email: "visual@example.test", name: "Layout review" } }
      : path.endsWith("/sheets") ? { sheets: [{ ...saved, title: score.title }] } : saved;
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: `${mode === "Create" ? "Open" : "Practice"} ${score.title}`, exact: true }).click();
}
async function capture(page: Page, name: string) {
  if (process.env.CHORDVIEWER_CAPTURE_EVIDENCE === "1") await page.screenshot({ path: `docs/architecture/evidence/score-web-${name}.png` });
}

test("practice uses readable chord systems and connected melody without losing notes on resize", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStudy(page, study);
  await expect(page.getByTestId("notation")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".notation .vf-stavenote")).toHaveCount(48);
  const firstRowNumbers = await page.locator(".notation svg text").evaluateAll(nodes => ["1", "2", "3", "4"].map(number => nodes.find(node => node.textContent === number)!.getBoundingClientRect().top));
  expect(new Set(firstRowNumbers).size).toBe(1);
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
