import { useCallback, useEffect, useRef, useState } from "react";
import { parseScore, type LeadSheet } from "@chordviewer/contracts";
import {
  ApiError,
  parseLibrary,
  parseSavedSheet,
  parseUser,
  request,
  summary,
  type NewSheet,
  type SavedSheet,
  type SheetSummary,
  type User,
} from "./api";

export function useLibrary() {
  type LocalSavedSheet = SavedSheet & { metadataOnly?: boolean };
  const epoch = useRef(0);
  const opening = useRef(0);
  const listing = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  const [selected, setSelected] = useState<LocalSavedSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const invalidateSession = useCallback(() => {
    epoch.current++;
  }, []);

  function clearPrivateState() {
    setUser(null);
    setSheets(null);
    setSelected(null);
    setConflict(false);
    setBusy(false);
    setLoadingLibrary(false);
    setAuthBusy(false);
    setChecking(false);
    opening.current++;
    listing.current++;
  }
  function failure(problem: unknown, expectedEpoch: number) {
    if (epoch.current !== expectedEpoch) return;
    if (problem instanceof ApiError && problem.status === 401) {
      epoch.current++;
      clearPrivateState();
    }
    setError(
      problem instanceof ApiError
        ? problem.message
        : "The backend returned invalid data. Your changes have not been discarded. Try again.",
    );
  }
  async function loadLibrary(expectedEpoch = epoch.current) {
    const requestId = ++listing.current;
    setLoadingLibrary(true);
    try {
      const result = parseLibrary(await request("/api/v1/sheets"));
      if (epoch.current === expectedEpoch && listing.current === requestId) {
        setSheets(result);
        setError("");
      }
    } catch (problem) {
      if (listing.current === requestId) failure(problem, expectedEpoch);
    } finally {
      if (epoch.current === expectedEpoch && listing.current === requestId)
        setLoadingLibrary(false);
    }
  }

  useEffect(() => {
    const sessionEpoch = ++epoch.current;
    void request("/api/v1/me")
      .then(async (value) => {
        const currentUser = parseUser(value);
        if (epoch.current !== sessionEpoch) return;
        setUser(currentUser);
        // A session and its private data use one generation, including after a remount.
        const library = parseLibrary(await request("/api/v1/sheets"));
        if (epoch.current === sessionEpoch) setSheets(library);
      })
      .catch((problem) => {
        if (epoch.current !== sessionEpoch) return;
        if (problem instanceof ApiError && problem.status === 401) {
          setUser(null);
          setSheets(null);
        } else
          setError(
            problem instanceof ApiError
              ? problem.message
              : "The backend returned invalid data. Try again.",
          );
      })
      .finally(() => {
        if (epoch.current === sessionEpoch) setChecking(false);
      });
    return invalidateSession;
  }, [invalidateSession]);

  async function authenticate(
    kind: "signin" | "signup",
    fields: { name: string; email: string; password: string },
  ) {
    const sessionEpoch = ++epoch.current;
    clearPrivateState();
    setAuthBusy(true);
    setError("");
    setMessage("");
    try {
      await request(
        `/api/auth/${kind === "signup" ? "sign-up" : "sign-in"}/email`,
        "POST",
        kind === "signup"
          ? fields
          : { email: fields.email, password: fields.password },
      );
      const currentUser = parseUser(await request("/api/v1/me"));
      if (epoch.current !== sessionEpoch) return;
      setUser(currentUser);
      setChecking(false);
      await loadLibrary(sessionEpoch);
    } catch (problem) {
      if (epoch.current === sessionEpoch) {
        setError(
          problem instanceof ApiError &&
            [400, 401, 409, 422].includes(problem.status)
            ? kind === "signin"
              ? "Sign-in failed. Check your email and password."
              : "Could not create the account. Check your details or try signing in."
            : problem instanceof ApiError
              ? problem.message
              : "Could not read the account response. Try again.",
        );
      }
    } finally {
      if (epoch.current === sessionEpoch) setAuthBusy(false);
    }
  }

  async function signOut() {
    const sessionEpoch = ++epoch.current;
    clearPrivateState();
    setAuthBusy(true);
    setError("");
    setMessage("");
    setSignOutPending(true);
    try {
      await request("/api/auth/sign-out", "POST", {});
      if (epoch.current === sessionEpoch) {
        setSignOutPending(false);
        setMessage("Signed out.");
      }
    } catch {
      if (epoch.current === sessionEpoch)
        setError(
          "Your sheets are hidden on this page, but server sign-out could not be confirmed. Retry sign out when the backend is reachable before leaving a shared computer.",
        );
    } finally {
      if (epoch.current === sessionEpoch) setAuthBusy(false);
    }
  }

  async function openSheet(id: string): Promise<boolean> {
    const sessionEpoch = epoch.current;
    const requestId = ++opening.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = parseSavedSheet(await request(`/api/v1/sheets/${encodeURIComponent(id)}/open`, "POST", {}));
      if (epoch.current !== sessionEpoch || opening.current !== requestId)
        return false;
      setSelected(result);
      setSheets(previous => previous?.map(sheet => sheet.id === id ? { ...sheet, openedAt: result.openedAt } : sheet) ?? null);
      setConflict(false);
      return true;
    } catch (problem) {
      if (opening.current === requestId) failure(problem, sessionEpoch);
      return false;
    } finally {
      if (epoch.current === sessionEpoch && opening.current === requestId)
        setBusy(false);
    }
  }
  async function touchSheet(id: string): Promise<void> {
    const sessionEpoch = epoch.current;
    try {
      const result = parseSavedSheet(await request(`/api/v1/sheets/${encodeURIComponent(id)}/open`, "POST", {}));
      if (epoch.current !== sessionEpoch) return;
      setSheets(previous => previous?.map(sheet => sheet.id === id ? { ...sheet, openedAt: result.openedAt } : sheet) ?? null);
    } catch (problem) { failure(problem, sessionEpoch); }
  }
  async function changeMetadata(id: string, changes: { title?: string; favorite?: boolean; draft?: boolean }): Promise<boolean> {
    const target = sheets?.find(sheet => sheet.id === id);
    if (!target || busy) return false;
    const expectedRevision = selected?.id === id ? selected.revision : target.revision;
    const sessionEpoch = epoch.current;
    listing.current++; setLoadingLibrary(false);
    setBusy(true); setError(""); setMessage("");
    try {
      const result = parseSavedSheet(await request(`/api/v1/sheets/${encodeURIComponent(id)}/metadata`, "PATCH",
        { ...changes, expectedRevision }));
      if (epoch.current !== sessionEpoch) return false;
      setSheets(previous => previous?.map(sheet => sheet.id === id ? summary(result) : sheet) ?? null);
      // A metadata response must not overwrite the user's unsaved score or editor history.
      setSelected(previous => previous?.id === id ? { ...previous, revision: result.revision,
        favorite: result.favorite, draft: result.draft, trashedAt: result.trashedAt,
        score: { ...previous.score, title: result.score.title }, metadataOnly: changes.title === undefined } : previous);
      setMessage("Library details updated.");
      return true;
    } catch (problem) { if (epoch.current === sessionEpoch && selected?.id === id && problem instanceof ApiError && problem.code === "revision_conflict") setConflict(true);
      failure(problem, sessionEpoch); return false; }
    finally { if (epoch.current === sessionEpoch) setBusy(false); }
  }
  async function duplicateSheet(id: string): Promise<boolean> {
    const target = sheets?.find(sheet => sheet.id === id);
    if (!target || busy) return false;
    const expectedRevision = selected?.id === id ? selected.revision : target.revision;
    const sessionEpoch = epoch.current; listing.current++; setLoadingLibrary(false); setBusy(true); setError(""); setMessage("");
    try {
      const result = parseSavedSheet(await request(`/api/v1/sheets/${encodeURIComponent(id)}/duplicate`, "POST",
        { expectedRevision }));
      if (epoch.current !== sessionEpoch) return false;
      setSheets(previous => [summary(result), ...(previous ?? [])]); setMessage("Saved copy created."); return true;
    } catch (problem) { if (epoch.current === sessionEpoch && selected?.id === id && problem instanceof ApiError && problem.code === "revision_conflict") setConflict(true);
      failure(problem, sessionEpoch); return false; }
    finally { if (epoch.current === sessionEpoch) setBusy(false); }
  }
  async function transitionSheet(id: string, transition: "trash" | "restore"): Promise<boolean> {
    const target = sheets?.find(sheet => sheet.id === id);
    if (!target || busy) return false;
    const expectedRevision = selected?.id === id ? selected.revision : target.revision;
    const sessionEpoch = epoch.current; listing.current++; setLoadingLibrary(false); setBusy(true); setError(""); setMessage("");
    try {
      const result = parseSavedSheet(await request(`/api/v1/sheets/${encodeURIComponent(id)}/${transition}`, "POST",
        { expectedRevision }));
      if (epoch.current !== sessionEpoch) return false;
      setSheets(previous => previous?.map(sheet => sheet.id === id ? summary(result) : sheet) ?? null);
      if (transition === "trash") setSelected(previous => previous?.id === id ? null : previous);
      setMessage(transition === "trash" ? "Moved to Trash. You can restore it later." : "Sheet restored.");
      return true;
    } catch (problem) { if (epoch.current === sessionEpoch && selected?.id === id && problem instanceof ApiError && problem.code === "revision_conflict") setConflict(true);
      failure(problem, sessionEpoch); return false; }
    finally { if (epoch.current === sessionEpoch) setBusy(false); }
  }
  async function createSheet(fields: NewSheet): Promise<boolean> {
    return createRequest("/api/v1/sheets", fields);
  }
  async function importSheet(score: LeadSheet, title: string, tutorialUrl: string | null): Promise<boolean> {
    return createRequest("/api/v1/sheets/import", { score, title, tutorialUrl });
  }
  async function createRequest(path: string, fields: unknown): Promise<boolean> {
    if (busy || !user) return false;
    const sessionEpoch = epoch.current;
    listing.current++;
    setLoadingLibrary(false);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = parseSavedSheet(
        await request(path, "POST", fields),
      );
      if (epoch.current !== sessionEpoch) return false;
      setSelected(result);
      setSheets((previous) => [summary(result), ...(previous ?? [])]);
      setConflict(false);
      setMessage("Sheet created and saved.");
      return true;
    } catch (problem) {
      failure(problem, sessionEpoch);
      return false;
    } finally {
      if (epoch.current === sessionEpoch) setBusy(false);
    }
  }
  async function saveSheet(
    title: string,
    tutorialUrl: string | null,
    draft?: LeadSheet,
  ): Promise<boolean> {
    if (!selected) return false;
    const sessionEpoch = epoch.current;
    listing.current++;
    setLoadingLibrary(false);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const score = parseScore({ ...(draft ?? selected.score), title });
      if (score.id !== selected.id) throw new Error("The draft belongs to a different sheet.");
      const result = parseSavedSheet(
        await request(
          `/api/v1/sheets/${encodeURIComponent(selected.id)}`,
          "PUT",
          {
            score,
            tutorialUrl,
            expectedRevision: selected.revision,
          },
        ),
      );
      if (epoch.current !== sessionEpoch) return false;
      setSelected(result);
      setConflict(false);
      setSheets(
        (previous) =>
          previous?.map((sheet) =>
            sheet.id === result.id ? summary(result) : sheet,
          ) ?? null,
      );
      setMessage("Changes saved.");
      return true;
    } catch (problem) {
      if (
        epoch.current === sessionEpoch &&
        problem instanceof ApiError &&
        problem.status === 409
      )
        setConflict(true);
      failure(problem, sessionEpoch);
      return false;
    } finally {
      if (epoch.current === sessionEpoch) setBusy(false);
    }
  }

  return {
    user,
    checking,
    authBusy,
    signOutPending,
    sheets,
    selected,
    busy,
    loadingLibrary,
    message,
    error,
    conflict,
    authenticate,
    signOut,
    loadLibrary,
    openSheet,
    touchSheet,
    createSheet,
    importSheet,
    saveSheet,
    changeMetadata,
    duplicateSheet,
    transitionSheet,
  };
}
