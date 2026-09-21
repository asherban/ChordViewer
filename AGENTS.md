# Repository instructions

## Testing scope

- Development-only scripts, tools and features do not require automated tests. Do not add, maintain or run tests specifically for them unless the user explicitly requests such tests.
- This includes workstation setup and launcher scripts, process-management helpers, local MIDI bridge tooling and Android debug-only relay/protocol features.
- Keep tests for product behavior, including score rendering, MIDI processing, authoring, authentication and persistence. A product test remains in scope when it runs locally, uses an emulator or uses a development adapter to supply input.
- Keep setup diagnostics and runtime validation in the development tools themselves; those are not test suites. Remove obsolete test commands and references when removing development-only tests.
