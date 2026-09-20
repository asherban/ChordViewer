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
};
const sheet = { ...saved, title: example.title };
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
