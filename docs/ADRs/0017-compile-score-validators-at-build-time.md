# ADR 0017: Compile score validators at build time

Decided: 2026-10-24. Recorded: 2026-10-24.

**Decision:** Generate Ajv standalone validators for all three score schemas during the contracts build. Web and API import the same static validation functions. Keep the existing strict, non-coercing options and semantic validation unchanged.

**Reason:** The first public browser check exposed Ajv's runtime `Function` constructor, which the release's `script-src 'self'` policy correctly blocked. Build-time compilation permits normal score validation without allowing `unsafe-eval`. Generated helpers are converted to static ESM imports and regenerated from the reviewed schemas, rather than maintained by hand.

**Related:** [0016: First public release boundaries](0016-first-public-release-boundaries.md) and [0004: Versioned score contract](0004-versioned-score-contract.md).

**Source:** Public deployment browser verification on 2026-10-24; [Ajv standalone validation guidance](https://ajv.js.org/standalone.html).
