// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { useLibrary } from "./useLibrary";

const user = { id: "user-a", name: "Pianist", email: "pianist@example.test" };
const saved = {
  id: example.id,
  score: example,
  tutorialUrl: null,
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  favorite: false, draft: false, trashedAt: null, openedAt: null,
};
const sheet = { ...saved, title: example.title, keySignature: example.keySignature,
  timeSignature: example.timeSignature, hasChords: true, hasMelody: true,
  previewChords: example.measures[0].chords.slice(0, 4).map(chord => chord.symbol) };
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("ignores a private sheet response that arrives after sign-out", async () => {
  let resolveOpen!: (response: Response) => void;
  const pendingOpen = new Promise<Response>((resolve) => {
    resolveOpen = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((path: string) => {
      if (path === "/api/v1/me") return Promise.resolve(json({ user }));
      if (path === "/api/v1/sheets")
        return Promise.resolve(json({ sheets: [sheet] }));
      if (path === "/api/auth/sign-out")
        return Promise.resolve(json({ success: true }));
      return pendingOpen;
    }),
  );
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.checking).toBe(false));
  let open!: Promise<boolean>;
  act(() => {
    open = result.current.openSheet(saved.id);
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    resolveOpen(json(saved));
    await open;
  });
  expect(result.current.user).toBeNull();
  expect(result.current.sheets).toBeNull();
  expect(result.current.selected).toBeNull();
});

it("retains a loaded library when refresh fails instead of claiming it is empty", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ user }))
    .mockResolvedValueOnce(json({ sheets: [sheet] }))
    .mockResolvedValueOnce(json({}, 503));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.sheets).toHaveLength(1));
  await act(async () => {
    await result.current.loadLibrary();
  });
  expect(result.current.sheets?.[0].title).toBe(example.title);
  expect(result.current.error).toContain("backend is unavailable");
});

it("does not inject the previous account's delayed sheet into a new account", async () => {
  let resolveOpen!: (response: Response) => void;
  const pendingOpen = new Promise<Response>((resolve) => {
    resolveOpen = resolve;
  });
  let currentUser = user;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((path: string) => {
      if (path === "/api/v1/me")
        return Promise.resolve(json({ user: currentUser }));
      if (path === "/api/v1/sheets")
        return Promise.resolve(
          json({ sheets: currentUser.id === user.id ? [sheet] : [] }),
        );
      if (path === "/api/auth/sign-out")
        return Promise.resolve(json({ success: true }));
      if (path === "/api/auth/sign-in/email") {
        currentUser = {
          id: "user-b",
          name: "Second pianist",
          email: "second@example.test",
        };
        return Promise.resolve(json({ success: true }));
      }
      return pendingOpen;
    }),
  );
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.checking).toBe(false));
  let open!: Promise<boolean>;
  act(() => {
    open = result.current.openSheet(saved.id);
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    await result.current.authenticate("signin", {
      name: "",
      email: "second@example.test",
      password: "test-password",
    });
  });
  await act(async () => {
    resolveOpen(json(saved));
    await open;
  });
  expect(result.current.user?.id).toBe("user-b");
  expect(result.current.sheets).toEqual([]);
  expect(result.current.selected).toBeNull();
});

it("clears all private state immediately when sign-out cannot reach the server", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ user }))
    .mockResolvedValueOnce(json({ sheets: [sheet] }))
    .mockRejectedValueOnce(new TypeError("offline"));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.sheets).toHaveLength(1));
  await act(async () => {
    await result.current.signOut();
  });
  expect(result.current.user).toBeNull();
  expect(result.current.sheets).toBeNull();
  expect(result.current.signOutPending).toBe(true);
  expect(result.current.error).toContain(
    "server sign-out could not be confirmed",
  );
});

it("expires a session on a rejected save and ignores earlier library responses", async () => {
  let resolveList!: (response: Response) => void;
  const pendingList = new Promise<Response>((resolve) => {
    resolveList = resolve;
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ user }))
    .mockResolvedValueOnce(json({ sheets: [sheet] }))
    .mockResolvedValueOnce(json(saved))
    .mockReturnValueOnce(pendingList)
    .mockResolvedValueOnce(json({}, 401));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.checking).toBe(false));
  await act(async () => {
    await result.current.openSheet(saved.id);
  });
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadLibrary();
  });
  await act(async () => {
    await result.current.saveSheet("New name", null);
  });
  await act(async () => {
    resolveList(json({ sheets: [sheet] }));
    await loading;
  });
  expect(result.current.user).toBeNull();
  expect(result.current.sheets).toBeNull();
  expect(result.current.selected).toBeNull();
  expect(result.current.authBusy).toBe(false);
});

it("ignores late Refresh snapshots after metadata, duplicate and Trash mutations", async () => {
  const pending: Array<(response: Response) => void> = [];
  let listCalls = 0;
  const copy = { ...saved, id: "copy-1", score: { ...example, id: "copy-1", title: "First Sketch (copy)" } };
  vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/api/v1/me") return Promise.resolve(json({ user }));
    if (path === "/api/v1/sheets") {
      if (listCalls++ === 0) return Promise.resolve(json({ sheets: [sheet] }));
      return new Promise<Response>(resolve => pending.push(resolve));
    }
    if (path.endsWith("/metadata") && options?.method === "PATCH") return Promise.resolve(json({ ...saved, revision: 2, favorite: true }));
    if (path.endsWith("/duplicate")) return Promise.resolve(json(copy, 201));
    if (path.endsWith("/trash")) return Promise.resolve(json({ ...saved, revision: 3, favorite: true, trashedAt: "2026-01-02T00:00:00Z" }));
    throw new Error(`Unexpected request ${path}`);
  }));
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.sheets).toHaveLength(1));
  for (const mutate of [
    () => result.current.changeMetadata(saved.id, { favorite: true }),
    () => result.current.duplicateSheet(saved.id),
    () => result.current.transitionSheet(saved.id, "trash"),
  ]) {
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.loadLibrary(); });
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await act(async () => { expect(await mutate()).toBe(true); });
    await act(async () => { pending.shift()!(json({ sheets: [sheet] })); await refresh; });
  }
  expect(result.current.sheets).toHaveLength(2);
  expect(result.current.sheets?.find(value => value.id === saved.id)).toMatchObject({ favorite: true, trashedAt: "2026-01-02T00:00:00Z", revision: 3 });
});

it("keeps the selected baseline revision when Refresh sees a newer remote score", async () => {
  let metadataRevision: number | null = null;
  let listCalls = 0;
  vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/api/v1/me") return Promise.resolve(json({ user }));
    if (path === "/api/v1/sheets") return Promise.resolve(json({ sheets: [{ ...sheet, revision: listCalls++ === 0 ? 1 : 2 }] }));
    if (path.endsWith("/open")) return Promise.resolve(json(saved));
    if (path.endsWith("/metadata") && options?.method === "PATCH") {
      metadataRevision = JSON.parse(String(options.body)).expectedRevision;
      return Promise.resolve(json({ error: "revision_conflict" }, 409));
    }
    throw new Error(`Unexpected request ${path}`);
  }));
  const { result } = renderHook(useLibrary);
  await waitFor(() => expect(result.current.sheets).toHaveLength(1));
  await act(async () => { expect(await result.current.openSheet(saved.id)).toBe(true); });
  await act(async () => { await result.current.loadLibrary(); });
  expect(result.current.sheets?.[0].revision).toBe(2);
  expect(result.current.selected?.revision).toBe(1);
  await act(async () => { expect(await result.current.changeMetadata(saved.id, { favorite: true })).toBe(false); });
  expect(metadataRevision).toBe(1);
  expect(result.current.selected?.revision).toBe(1);
  expect(result.current.conflict).toBe(true);
});
