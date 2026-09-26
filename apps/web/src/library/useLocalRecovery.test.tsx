// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ScoreDraft } from "../editor/ScoreDraft";
import { recoveryStore } from "./recovery";
import { useLocalRecovery } from "./useLocalRecovery";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("acknowledges a completed recovery write through StrictMode effect replay", async () => {
  const score = parseScore(example);
  const base = { id: score.id, score, tutorialUrl: null, revision: 1, createdAt: "2026-09-20T12:00:00Z",
    updatedAt: "2026-09-20T12:00:00Z", favorite: false, draft: false, trashedAt: null, openedAt: null };
  const model = new ScoreDraft(score, base);
  model.details("Recovered unsaved title", "");
  const put = vi.spyOn(recoveryStore, "put").mockResolvedValue();
  function Status() { const recovery = useLocalRecovery(model, "account-a"); return <p>{recovery.status}</p>; }
  render(<StrictMode><Status /></StrictMode>);
  expect(await screen.findByText("Local recovery copy updated. Save to update your Library.")).toBeTruthy();
  expect(put).toHaveBeenCalledTimes(1);
});
