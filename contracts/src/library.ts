import type { LeadSheet } from './score.js';

export interface AccountSummary { id: string; name: string; email: string }
export interface SheetSummary {
  id: string; title: string; tutorialUrl: string | null; revision: number; createdAt: string; updatedAt: string;
  favorite: boolean; draft: boolean; trashedAt: string | null; openedAt: string | null;
  keySignature: string; timeSignature: LeadSheet['timeSignature']; hasChords: boolean; hasMelody: boolean;
  previewChords: string[];
}
export interface SavedSheet {
  id: string; score: LeadSheet; tutorialUrl: string | null; revision: number; createdAt: string; updatedAt: string;
  favorite: boolean; draft: boolean; trashedAt: string | null; openedAt: string | null;
}
export interface SheetMetadataRequest {
  expectedRevision: number; title?: string; favorite?: boolean; draft?: boolean;
}
export interface NewSheetRequest {
  title: string; template: 'blank' | 'example'; tutorialUrl?: string | null;
  keySignature?: LeadSheet['keySignature']; timeSignature?: LeadSheet['timeSignature'];
}
export interface ImportSheetRequest { score: LeadSheet; title: string; tutorialUrl?: string | null }
export interface SaveSheetRequest { score: LeadSheet; tutorialUrl: string | null; expectedRevision: number }
