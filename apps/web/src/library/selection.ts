import type { SavedSheet } from "@chordviewer/contracts";

/** The update hint belongs to the local workspace, never the API transport. */
export type SelectedSheet = SavedSheet & { metadataOnly?: boolean };
