import { describe, it, expect } from "vitest";
import { detectChord } from "./chordDetect";

describe("detectChord", () => {
  it("returns empty result for no notes", () => {
    expect(detectChord(new Set())).toEqual({
      chord: null,
      candidates: [],
      noteNames: [],
    });
  });

  it("returns null chord for a single note", () => {
    const result = detectChord(new Set([60])); // C4
    expect(result.chord).toBeNull();
    expect(result.noteNames).toEqual(["C"]);
    expect(result.candidates).toEqual([]);
  });

  it("detects C major triad", () => {
    const result = detectChord(new Set([60, 64, 67])); // C4, E4, G4
    expect(result.chord).toBe("CM"); // Tonal.js uses 'CM' for major triads
    expect(result.noteNames).toContain("C");
    expect(result.noteNames).toContain("E");
    expect(result.noteNames).toContain("G");
  });

  it("detects C minor triad", () => {
    const result = detectChord(new Set([60, 63, 67])); // C4, Eb4, G4
    expect(result.chord).toBe("Cm");
  });

  it("detects Cmaj7 with all four notes", () => {
    const result = detectChord(new Set([60, 64, 67, 71])); // C4, E4, G4, B4
    expect(result.chord).toBe("Cmaj7");
  });

  it("detects Cmaj7 without fifth (manual detection path)", () => {
    const result = detectChord(new Set([60, 64, 71])); // C4, E4, B4 — no G
    expect(result.chord).toBe("Cmaj7");
  });

  it("detects Cm7 without fifth (manual detection path)", () => {
    const result = detectChord(new Set([60, 63, 70])); // C4, Eb4, Bb4 — no G
    expect(result.chord).toBe("Cm7");
  });

  it("deduplicates pitch classes across octaves", () => {
    const result = detectChord(new Set([60, 72])); // C4 and C5 — same pitch class
    expect(result.noteNames).toEqual(["C"]);
    expect(result.noteNames.filter((n) => n === "C")).toHaveLength(1);
  });

  it("sorts notes by MIDI number (lowest first)", () => {
    const result = detectChord(new Set([67, 60, 64])); // G, C, E — out of order
    expect(result.chord).toBe("CM"); // same chord regardless of insertion order
  });

  it("returns all candidates", () => {
    const result = detectChord(new Set([60, 64, 67]));
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
