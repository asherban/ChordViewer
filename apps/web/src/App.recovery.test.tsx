// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseScore } from "@chordviewer/contracts";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { App } from "./App";
import { summary } from "./library/api";
import { RECOVERY_CHANGED, recoveryStore, type RecoveryDraft } from "./library/recovery";

vi.mock("./score/ScorePreview", () => ({ ScorePreview: () => <div /> }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps the displaced draft's recovery copy after renaming the open sheet from Library", async () => {
  const score = parseScore(example);
  const saved = { id: score.id, score, tutorialUrl: null, revision: 1, createdAt: "2026-09-20T12:00:00Z",
    updatedAt: "2026-09-20T12:00:00Z", favorite: false, draft: false, trashedAt: null, openedAt: null };
  const drafts = new Map<string, RecoveryDraft>();
  vi.spyOn(recoveryStore, "list").mockImplementation(async () => ({ drafts: [...drafts.values()], unreadableCount: 0 }));
  vi.spyOn(recoveryStore, "put").mockImplementation(async draft => {
    drafts.set(draft.id, draft);
    window.dispatchEvent(new Event(RECOVERY_CHANGED));
  });
  const remove = vi.spyOn(recoveryStore, "remove").mockImplementation(async draft => {
    drafts.delete(draft.id);
    window.dispatchEvent(new Event(RECOVERY_CHANGED));
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "prompt").mockReturnValue("Renamed in Library");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => {
    let body: unknown;
    if (path === "/api/v1/me") body = { user: { id: "account-a", name: "Pianist", email: "pianist@example.test" } };
    else if (path === "/api/v1/sheets") body = { sheets: [summary(saved)] };
    else if (path.endsWith("/open")) body = saved;
    else if (path.endsWith("/metadata")) body = { ...saved, revision: 2, score: { ...score, title: "Renamed in Library" } };
    else throw new Error(`Unexpected request ${path}`);
    return new Response(JSON.stringify(body));
  }));

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: `Edit ${score.title}` }));
  fireEvent.click(await screen.findByRole("button", { name: "Sheet details" }));
  fireEvent.change(screen.getByLabelText("Sheet title", { exact: true }), { target: { value: "Unsaved draft title" } });
  await screen.findByText("Local recovery copy updated. Save to update your Library.");
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  await screen.findByText("Library details updated.");

  await waitFor(() => expect([...drafts.values()].map(draft => draft.title)).toEqual(["Unsaved draft title"]));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(screen.getByRole("heading", { name: "Renamed in Library" })).toBeTruthy();
}, 10_000);
