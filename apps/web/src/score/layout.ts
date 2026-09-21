import type { LeadSheet } from "@chordviewer/contracts";

export type Measure = LeadSheet["measures"][number];
export type ScoreSystem = { start: number; count: number; columns: number; barWidth: number; width: number };

/** Reflow systems instead of shrinking notation. Oversized bars retain horizontal scrolling. */
export function scoreSystems(minimums: number[], available: number, leading = 0): ScoreSystem[] {
  const systems: ScoreSystem[] = [];
  for (let start = 0; start < minimums.length;) {
    const columns = [4, 2, 1].find(count => Math.max(...minimums.slice(start, start + count)) * count + leading <= available) ?? 1;
    const count = Math.min(columns, minimums.length - start);
    const barWidth = Math.max((available - leading) / columns, ...minimums.slice(start, start + count));
    systems.push({ start, count, columns, barWidth, width: barWidth * columns + leading });
    start += count;
  }
  return systems;
}

/** Reserve readable label widths; remaining space follows musical time, including gaps. */
export function chordSegments(measure: Measure, textWidth: (text: string) => number, barTicks = 1920) {
  const boundaries = [...new Set([0, barTicks, ...measure.chords.flatMap(chord => [chord.offsetTicks, chord.offsetTicks + chord.durationTicks])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const chord = measure.chords.find(event => event.offsetTicks === start);
    return { start, end: boundaries[index + 1], chord, minimum: chord ? Math.ceil(textWidth(chord.symbol)) + 24 : 12 };
  });
}

export function positionChordSegments(segments: ReturnType<typeof chordSegments>, width: number) {
  const elastic = Math.max(0, width - 24 - segments.reduce((sum, segment) => sum + segment.minimum, 0));
  let left = 12;
  const barTicks = segments.at(-1)?.end ?? 1920;
  return segments.map(segment => {
    const span = segment.minimum + elastic * (segment.end - segment.start) / barTicks;
    const result = { ...segment, left, width: span };
    left += span;
    return result;
  });
}
