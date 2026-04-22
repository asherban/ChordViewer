---
name: architecture-docs
description: Creates or updates high-level architecture documentation in docs/development. Summarizes code structure and design decisions without replicating code. Run at the end of a coding session to keep docs current.
---

# Architecture Documentation Skill

Creates or updates `docs/development/architecture.md` with a high-level summary of codebase architecture, component structure, and design decisions. References code by path/line; never copies code verbatim.

## Workflow

Make a todo list and work through each step sequentially.

### Step 1: Determine Mode

```bash
ls docs/development/ 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

Also capture the hash of the last commit that touched the docs (needed for diff in update mode):

```bash
git log -1 --format="%H %ci" -- docs/development/ 2>/dev/null || echo "none"
```

---

### Step 2A: MISSING — Full Codebase Exploration

Read these files in order to build a complete picture:

1. `package.json` — dependencies, scripts, project metadata
2. `vite.config.ts` (or equivalent build config)
3. `tsconfig.app.json` / `tsconfig.json`
4. `index.html` — HTML shell, entry point hints
5. `src/main.tsx` — bootstrap and providers
6. `src/App.tsx` — top-level routing/layout
7. Every file in `src/components/`
8. Every file in `src/lib/`
9. Any test files (`.test.ts`) — they reveal intent and contract
10. CI/deployment config (`.github/workflows/`)

Do NOT read `node_modules`, lock files, or generated dist output.

---

### Step 2B: EXISTS — Diff-Based Update

Retrieve only what changed since docs were last written:

```bash
# Get the commit hash when docs were last updated
LAST_DOCS_HASH=$(git log -1 --format=%H -- docs/development/)

# See what changed in src/ since then
git diff ${LAST_DOCS_HASH}..HEAD -- src/

# Also list which files changed (for quick orientation)
git diff --name-only ${LAST_DOCS_HASH}..HEAD -- src/
```

Then read `docs/development/architecture.md` to understand the current state before editing.

Also check conversation context: any design decisions, trade-offs, or architectural choices discussed during this session should be captured under **Key Design Decisions**.

Only explore individual source files when the diff references them and you need more context.

---

### Step 3: Write or Update Documentation

**File:** `docs/development/architecture.md`

Use this structure (omit sections that don't apply):

```
# [Project Name] Architecture

_Last updated: YYYY-MM-DD_

## Overview
What the app does and its primary value in 2–3 sentences.

## Tech Stack
- Framework / runtime
- Build tooling
- Key libraries (only ones that shape architecture, not utilities)

## Application Structure
High-level shape of src/ — a brief annotated outline, not a full file tree.

## Core Concepts
Named domain concepts the codebase is built around (e.g. "chord detection pipeline",
"MIDI device abstraction"). One paragraph each, max.

## Component Architecture
Each UI component: one line stating its role + file reference.

## Library Modules
Each lib module: one line stating its responsibility + file reference.

## Data Flow
How data moves end-to-end. Prose or a simple ASCII diagram (3–6 steps).

## Key Design Decisions
Non-obvious choices: why X over Y, known trade-offs, deliberate constraints.
Add a dated bullet for decisions made in the current session.

## Configuration
Only notable non-default settings in tsconfig, vite, eslint, CI.
```

**Writing rules (strictly enforced):**
- Reference code as `src/lib/chordDetect.ts:42` — never paste code blocks
- Each section: 3–5 bullets or 2–3 sentences; no walls of text
- Skip anything that is self-evident from reading the file names
- When updating: preserve accurate existing content; only revise what changed

---

### Step 4: Create and Write the File

```bash
mkdir -p docs/development
```

Write `docs/development/architecture.md` using the Write tool.

---

### Step 5: Commit, Push, and Deploy

```bash
git add docs/development/
git commit -m "docs: update architecture documentation"
git push -u origin $(git branch --show-current)
```

Then deploy per project instructions:

```bash
npm run deploy
```

---

## Wrap Up

One sentence: state whether docs were created or updated, and highlight the most significant section that changed.
