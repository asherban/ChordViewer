// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import example from "@chordviewer/contracts/fixtures/lead-sheet-v1.json";
import { parseScore, appendChord, chordSymbol, type ChordDefinition, type LeadSheet } from "@chordviewer/contracts";
import type { ScoreEditing } from "../score/ScorePreview";
import type { MidiInputEvent, MidiInputModel } from "../midi/useMidiInput";
import { SheetWorkspace } from "./SheetWorkspace";

vi.mock("../score/ScorePreview", () => ({ ScorePreview: ({score,editing,practice}:{score:LeadSheet;editing?:ScoreEditing;practice?:{chordId:string|null;selectChord:(id:string)=>void}}) => <div data-testid="score">{score.measures.flatMap(m=>m.chords).map(c=><button key={c.id} aria-pressed={c.id===practice?.chordId || c.logicalId===practice?.chordId} onClick={()=>practice ? practice.selectChord(c.id) : editing?.selectChord(c.id)}>Select fragment {c.id}</button>)}</div> }));

afterEach(cleanup);
it("selects a continuation and advances once per logical chord with structured live matching", () => {
  const listeners=new Set<(event:MidiInputEvent)=>void>();
  const midi={subscribe:(f:(event:MidiInputEvent)=>void)=>{listeners.add(f);f({type:"reset",held:[]});return()=>{listeners.delete(f);};},snapshot:{held:[],sounding:[],sustainChannels:[],messages:0},inputs:[],selected:"keyboard",status:"Connected",connect:async()=>{},choose:()=>{},disconnect:()=>{}} as unknown as MidiInputModel;
  const d:ChordDefinition={kind:"custom",root:{step:"C",alter:0},tones:[0,1,6]}; let id=0;
  let score=appendChord({...parseScore(example),measures:[{id:"bar",chords:[],melody:[]}]},chordSymbol(d),2400,()=>`event-${++id}`,d).score;
  score=appendChord(score,"G7",480,()=>`event-${++id}`).score;
  const saved={id:score.id,score,tutorialUrl:null,revision:1,createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",favorite:false,draft:false,trashedAt:null,openedAt:null};
  render(<SheetWorkspace score={score} saved={saved} accountId="test" mode="Practice" active blocked={false} midi={midi} busy={false} conflict={false} onDirty={()=>{}} onSave={async()=>{}} onReload={async()=>{}} onEdit={()=>{}} canCreate />);
  fireEvent.click(screen.getByRole("button",{name:`Select fragment ${score.measures[1].chords[1].id}`}));
  expect(screen.getByText("G7",{selector:".practice-feedback strong"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:`Select fragment ${score.measures[1].chords[0].id}`}));
  expect(screen.getByText("C{0,1,6}",{selector:".practice-feedback strong"})).toBeTruthy();
  expect(screen.getByRole("button",{name:`Select fragment ${score.measures[1].chords[0].id}`}).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button",{name:"On match"}));
  act(()=>{for(const n of [60,61,66]) for(const f of listeners) f({type:"data",data:[144,n,96]});for(const n of [60,61,66]) for(const f of listeners) f({type:"data",data:[128,n,0]});});
  expect(screen.getByText("G7",{selector:".practice-feedback strong"})).toBeTruthy();
});
it("rearms Practice from current held keys after a blocked dialog without consuming an old release", () => {
  const listeners = new Set<(event: MidiInputEvent) => void>();
  const held = new Set<number>();
  const subscribe = (listener: (event: MidiInputEvent) => void) => {
    listeners.add(listener);
    listener({ type: "reset", held: [...held] });
    return () => { listeners.delete(listener); };
  };
  const midi = { subscribe, snapshot: { held: [], sounding: [], sustainChannels: [], messages: 0 },
    inputs: [], selected: "keyboard", status: "Connected", connect: async () => {}, choose: () => {}, disconnect: () => {} } as unknown as MidiInputModel;
  const score = parseScore(example);
  const saved = { id: score.id, score, tutorialUrl: null, revision: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    favorite: false, draft: false, trashedAt: null, openedAt: null };
  const props = { score, saved, accountId: "test-account", mode: "Practice" as const, active: true, blocked: false, midi,
    busy: false, conflict: false, onDirty: () => {}, onSave: async () => {}, onReload: async () => {}, onEdit: () => {}, canCreate: true };
  const rendered = render(<SheetWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "On match" }));
  const send = (status: number, note: number) => {
    if (status === 0x90) held.add(note); else held.delete(note);
    for (const listener of listeners) listener({ type: "data", data: [status, note, 100] });
  };
  act(() => { send(0x90, 60); rendered.rerender(<SheetWorkspace {...props} blocked />); send(0x80, 60); });
  rendered.rerender(<SheetWorkspace {...props} />);
  act(() => { for (const note of [60, 64, 67]) send(0x90, note); for (const note of [60, 64, 67]) send(0x80, note); });
  expect(screen.getByText("G7", { selector: ".practice-feedback strong" })).toBeTruthy();
  act(() => { send(0x90, 55); rendered.rerender(<SheetWorkspace {...props} blocked />); });
  rendered.rerender(<SheetWorkspace {...props} />); // rearm sees G still physically held
  act(() => { send(0x80, 55); });
  expect(screen.getByText("G7", { selector: ".practice-feedback strong" })).toBeTruthy();
});
