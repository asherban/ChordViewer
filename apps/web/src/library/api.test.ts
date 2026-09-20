import { afterEach, expect, it, vi } from "vitest";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { ApiError, parseSavedSheet, request, safeTutorialUrl } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps the request deadline active when headers arrive but the body stalls", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((_path: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      });
    }),
  );
  const pending = expect(request("/api/v1/sheets")).rejects.toThrow(
    "unreadable response",
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
  expect(signal?.aborted).toBe(true);
});

it("rejects active links with an unsafe scheme, authority or disguised YouTube host", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://youtube.com.evil.test/watch?v=abc",
    "https://youtube.com@evil.test/",
    "http://youtube.com/watch?v=abc",
    "https://user@youtube.com/watch?v=abc",
    "https://www.youtube.com:8443/watch?v=abc",
  ]) {
    expect(() => safeTutorialUrl(value)).toThrow();
  }
  expect(safeTutorialUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});

it("rejects stored scores with invalid notation or a mismatched identity before rendering", () => {
  const saved = {
    id: example.id,
    score: example,
    tutorialUrl: null,
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  expect(parseSavedSheet(saved).score.title).toBe("First Sketch");
  expect(() => parseSavedSheet({ ...saved, id: "someone-else" })).toThrow();
  expect(() =>
    parseSavedSheet({ ...saved, score: { ...example, schemaVersion: 999 } }),
  ).toThrow();
});

it("uses same-origin cookies and no-store without a bearer token", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await request("/api/v1/sheets", "POST", { title: "A sheet" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/sheets",
    expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    }),
  );
});

it("distinguishes a sheet limit from a revision conflict", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "sheet_limit" }), { status: 409 }),
      ),
  );
  await expect(request("/api/v1/sheets", "POST", {})).rejects.toEqual(
    new ApiError(
      409,
      "Your library has reached the current limit of 100 sheets.",
      "sheet_limit",
    ),
  );
});
