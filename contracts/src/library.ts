import type { LeadSheet } from './index.js';

export interface AccountSummary { id: string; name: string; email: string }
export interface SheetSummary {
  id: string; title: string; tutorialUrl: string | null; revision: number; createdAt: string; updatedAt: string;
}
export interface SavedSheet {
  id: string; score: LeadSheet; tutorialUrl: string | null; revision: number; createdAt: string; updatedAt: string;
}
export interface NewSheetRequest {
  title: string; template: 'blank' | 'example'; tutorialUrl?: string | null;
  keySignature?: LeadSheet['keySignature']; timeSignature?: LeadSheet['timeSignature'];
}
export interface ImportSheetRequest { score: LeadSheet; title: string; tutorialUrl?: string | null }
export interface SaveSheetRequest { score: LeadSheet; tutorialUrl: string | null; expectedRevision: number }
