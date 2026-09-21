# Shared musical fixtures

`score-validation-cases.json` is the language-neutral M2 score contract suite. Each case supplies a complete input object, its expected validity and, for invalid inputs, one required TypeScript issue code. Android checks the same validity without depending on TypeScript exception messages. The canonical visual proof is [lead-sheet-v1.json](../../../contracts/fixtures/lead-sheet-v1.json).

`chord-recognition-cases.json` preserves the original recognition identities: pitch classes, lowest played MIDI note and musical quality, independent of a particular library. M4 checks these expectations against the shared vocabulary in both languages. Major and minor remain distinct; slash bass and enharmonic spellings have explicit rules.

`chord-authoring-cases.json` specifies exact ordered recognition alternatives and raw gesture completion, including sustain, overlap, fast press/release, channels, arming with keys held, disconnect/reset and panic controllers. TypeScript and Kotlin execute the same cases. The shared [chord vocabulary](../../../contracts/fixtures/chord-vocabulary-v1.json) is bundled by both clients. See the [authoring contract](../../../docs/architecture/chord-authoring.md) for duration, position and correction semantics. Driver-level fixtures live separately under `scripts/midi/fixtures`.
