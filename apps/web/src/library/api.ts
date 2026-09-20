import {
  parseScore,
  type AccountSummary as User,
  type SheetSummary,
  type SavedSheet,
} from "@chordviewer/contracts";
export type {
  AccountSummary as User,
  SheetSummary,
  SavedSheet,
  NewSheetRequest as NewSheet,
} from "@chordviewer/contracts";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const detail: unknown = await response.json().catch(() => null);
      const code =
        detail &&
        typeof detail === "object" &&
        "error" in detail &&
        typeof detail.error === "string"
          ? detail.error
          : undefined;
      const messages: Record<number, string> = {
        400: "Check the form details. Tutorial links must be valid YouTube video links.",
        401: "Your session has expired. Sign in again to continue.",
        403: "This request was not allowed. Reload the page and try again.",
        404: "This sheet is no longer available. Return to your library and refresh it.",
        409: "This sheet changed elsewhere. Reload the latest version before saving again.",
        413: "This sheet is too large to save.",
        422: "Check the form details and try again.",
        429: "Too many requests. Wait a moment, then try again.",
      };
      throw new ApiError(
        response.status,
        code === "sheet_limit"
          ? "Your library has reached the current limit of 100 sheets."
          : (messages[response.status] ??
              "The backend is unavailable. Check the local backend and try again."),
        code,
      );
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new ApiError(
        0,
        "The backend returned an unreadable response. Try again.",
      );
    }
  } catch (problem) {
    if (problem instanceof ApiError) throw problem;
    throw new ApiError(
      0,
      "Cannot reach the backend. Start the local backend and try again.",
    );
  } finally {
    // Keep the deadline active until the response body has also been consumed.
    clearTimeout(timeout);
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid backend response.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid backend response.");
  return value;
}

/** Never turn a stored URL into an active link without checking its origin and scheme. */
export function safeTutorialUrl(value: unknown): string | null {
  if (value === null) return null;
  const url = new URL(string(value));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
      url.hostname,
    )
  ) {
    throw new Error("Invalid tutorial link from backend.");
  }
  return url.href;
}

export function parseUser(value: unknown): User {
  const user = record(record(value).user);
  return {
    id: string(user.id),
    name: string(user.name),
    email: string(user.email),
  };
}

function metadata(value: Record<string, unknown>): Omit<SheetSummary, "title"> {
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1)
    throw new Error("Invalid sheet revision.");
  return {
    id: string(value.id),
    tutorialUrl: safeTutorialUrl(value.tutorialUrl),
    revision: value.revision as number,
    createdAt: string(value.createdAt),
    updatedAt: string(value.updatedAt),
  };
}

export function parseSavedSheet(value: unknown): SavedSheet {
  const data = record(value);
  const score = parseScore(data.score);
  const meta = metadata(data);
  if (meta.id !== score.id) throw new Error("Invalid sheet identity.");
  return { ...meta, score };
}

export function parseLibrary(value: unknown): SheetSummary[] {
  const data = record(value);
  if (!Array.isArray(data.sheets) || data.sheets.length > 100)
    throw new Error("Invalid library response.");
  return data.sheets.map((value) => {
    const sheet = record(value);
    return { ...metadata(sheet), title: string(sheet.title) };
  });
}

export function summary(sheet: SavedSheet): SheetSummary {
  return {
    id: sheet.id,
    title: sheet.score.title,
    tutorialUrl: sheet.tutorialUrl,
    revision: sheet.revision,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
  };
}
