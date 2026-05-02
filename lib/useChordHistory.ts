import { useEffect, useRef, useState } from 'react';

export interface ChordHistoryEntry {
  chord: string;
  id: number;
  at: number;
}

interface Options {
  maxHistory?: number;
  stabilityMs?: number;
  gapToleranceMs?: number;
}

export function useChordHistory(
  currentChord: string | null,
  { maxHistory = 4, stabilityMs = 600, gapToleranceMs = 250 }: Options = {}
): ChordHistoryEntry[] {
  const [history, setHistory] = useState<ChordHistoryEntry[]>([]);

  const pendingRef = useRef<{ chord: string; since: number } | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const gapTimerRef = useRef<number | null>(null);
  const nextIdRef = useRef<number>(0);

  useEffect(() => {
    if (gapTimerRef.current !== null) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }

    if (currentChord === null) {
      gapTimerRef.current = window.setTimeout(() => {
        pendingRef.current = null;
        if (commitTimerRef.current !== null) {
          window.clearTimeout(commitTimerRef.current);
          commitTimerRef.current = null;
        }
      }, gapToleranceMs);
      return;
    }

    const pending = pendingRef.current;
    if (pending && pending.chord === currentChord) return;

    pendingRef.current = { chord: currentChord, since: Date.now() };
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = window.setTimeout(() => {
      const p = pendingRef.current;
      if (!p || p.chord !== currentChord) return;
      setHistory((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].chord === currentChord) {
          return prev;
        }
        const entry: ChordHistoryEntry = {
          chord: currentChord,
          id: nextIdRef.current++,
          at: Date.now(),
        };
        const next = [...prev, entry];
        return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
      });
      commitTimerRef.current = null;
    }, stabilityMs);
  }, [currentChord, stabilityMs, gapToleranceMs, maxHistory]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
      if (gapTimerRef.current !== null) window.clearTimeout(gapTimerRef.current);
    };
  }, []);

  return history;
}
