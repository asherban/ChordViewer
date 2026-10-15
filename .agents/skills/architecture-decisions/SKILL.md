---
name: architecture-decisions
description: Record and maintain ChordViewer architecture decisions as short, linked ADRs in docs/ADRs. Use when choosing or changing application boundaries, data contracts, persistence, security, deployment or other architectural behavior, or when backfilling decisions from project history.
---

# Architecture decisions

Read `docs/ADRs/README.md` and relevant ADRs before changing architecture. Record an actual decision, not every implementation detail, mockup alternative or unaccepted suggestion. Keep detailed designs and execution plans in the existing architecture documentation.

## Write a record

- Use the next unused four-digit number and a descriptive filename: `NNNN-short-decision.md`. Never renumber or reuse an existing ID. Check current files before choosing the number when work is concurrent.
- Write one decision per record, normally a few short paragraphs. State what was chosen and why; include a material consequence only when it helps explain the choice.
- Use the actual decision date when known and today's recording date. For historical records, say they are retrospective and cite the chat or repository evidence. If the original date or rationale is unknown, say so instead of inventing it. Distinguish accepted decisions from proposals and implemented behavior from future work.
- Link related ADRs with relative Markdown links and a useful relationship label: `Related`, `Extends`, `Corrects` or `Supersedes`. For a partial replacement, identify exactly which part changes and what remains valid.
- Add the record to the index. Verify local links and that the index includes every numbered ADR.

Use this small shape; omit an empty relationship rather than inventing one:

```markdown
# ADR NNNN: Decision title

Decided: YYYY-MM-DD. Recorded: YYYY-MM-DD.

**Decision:** What we chose.

**Reason:** Why it fits the project.

**Related:** [Earlier decision](0001-short-decision.md).

**Source:** The relevant discussion or repository document.
```

## Maintain the history

An ADR is immutable after its first commit, including its wording, title, dates and links. Do not edit, rename, delete or amend an already committed ADR, even for a correction or status update. Check its history through the repository's GitButler workflow if its committed state is unclear. Uncommitted new records may be refined before their first commit; creating an ADR does not by itself require committing it.

When a decision changes or a record needs correction, create a new ADR with the reason and a link back to the affected record. Do not add a backlink to the old committed file. Instead, update the editable `docs/ADRs/README.md` index: link the new record from the old record's row and identify the old record in the new row. Keep superseded records listed so the decision chain remains discoverable.

The index, this skill and living design documents may be updated normally. Keep current designs aligned with accepted decisions without copying the entire ADR into them. Avoid asserting that a historical decision is current until later records and discussions have been checked.
