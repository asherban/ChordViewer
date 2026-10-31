# Repository instructions

## Visual evidence

- Whenever making a visual change to any frontend, use the project [frontend visual evidence skill](.agents/skills/frontend-visual-evidence/SKILL.md). Provide actual images or video in the final response proving the implemented change, including any requested layout comparisons.

## Architecture decisions

- Whenever an architecture decision is made, add a short ADR in `docs/ADRs` as part of the same work. Record the decision and its reason; keep implementation plans in the existing architecture documents.
- Use the project [ADR skill](.agents/skills/architecture-decisions/SKILL.md) for naming, format, cross-links and maintenance. Read the [ADR index](docs/ADRs/README.md) and relevant records before changing architecture.
- ADRs are immutable after their first commit, including their title, date and links. Record corrections, reversals and replacements in a new ADR that links to the earlier record. Maintain current status and reverse links in the editable index; never rewrite committed ADRs.

## Testing scope

- Development-only scripts, tools and features do not require automated tests. Do not add, maintain or run tests specifically for them unless the user explicitly requests such tests.
- This includes workstation setup and launcher scripts, process-management helpers, local MIDI bridge tooling and Android debug-only relay/protocol features.
- Keep tests for product behavior, including score rendering, MIDI processing, authoring, authentication and persistence. A product test remains in scope when it runs locally, uses an emulator or uses a development adapter to supply input.
- Keep setup diagnostics and runtime validation in the development tools themselves; those are not test suites. Remove obsolete test commands and references when removing development-only tests.
