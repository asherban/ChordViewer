import { describe, expect, it } from "vitest";
import { chordSegments, positionChordSegments, scoreSystems, type Measure } from "./layout";

describe("readable score systems", () => {
  it("reflows four, two and one bars without reducing their readable width", () => {
    for (const [width, columns] of [[900, 4], [450, 2], [280, 1]]) {
      const rows = scoreSystems(Array(8).fill(180), width, 64);
      expect(rows[0].columns).toBe(columns);
      expect(rows.flatMap(row => Array.from({ length: row.count }, (_, index) => row.start + index))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(rows.every(row => row.barWidth >= 180 && row.width <= width)).toBe(true);
    }
  });
  it("isolates a dense bar without stretching normal systems or enlarging the last partial row", () => {
    const rows = scoreSystems([180, 180, 180, 180, 1200, 180, 180, 180, 180, 180], 800);
    expect(rows.map(row => row.count)).toEqual([4, 1, 4, 1]);
    expect(rows.map(row => row.width)).toEqual([800, 1200, 800, 800]);
    expect(rows.at(-1)?.barWidth).toBe(200);
  });
  it("preserves empty intervals and centers a full-bar symbol in its real span", () => {
    const measure: Measure = { id: "bar", melody: [], chords: [{ id: "c", symbol: "C", offsetTicks: 0, durationTicks: 1920 }] };
    const [slot] = positionChordSegments(chordSegments(measure, () => 32), 200);
    expect(slot.left + slot.width / 2).toBe(100);
    measure.chords[0].offsetTicks = 480; measure.chords[0].durationTicks = 480;
    const slots = positionChordSegments(chordSegments(measure, () => 32), 200);
    expect(slots.map(item => [item.start, item.end, item.chord?.id])).toEqual([[0, 480, undefined], [480, 960, "c"], [960, 1920, undefined]]);
    expect(slots[2].left + slots[2].width).toBeCloseTo(188);
  });
  it("reserves readable space for a one-tick long symbol without dividing by duration", () => {
    const measure: Measure = { id: "bar", melody: [], chords: [{ id: "tiny", symbol: "A long manual chord name", offsetTicks: 1919, durationTicks: 1 }] };
    const segments = chordSegments(measure, () => 500);
    const minimum = segments.reduce((sum, slot) => sum + slot.minimum, 24);
    expect(minimum).toBeLessThan(600);
    const slots = positionChordSegments(segments, minimum);
    expect(slots[1].width).toBeGreaterThan(500);
    expect(slots[1].left + slots[1].width).toBeLessThanOrEqual(minimum);
  });
});
