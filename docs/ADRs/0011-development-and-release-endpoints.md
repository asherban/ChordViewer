# ADR 0011: Select development endpoints at build time and guard releases

Decided: 2026-10-04. Recorded retrospectively: 2026-10-15.

**Decision:** Bake the selected development server address into the debug APK. Allow explicit LAN access as well as the existing loopback/ADB route; changing the server requires a matching build. Release builds use only a separately reviewed HTTPS origin, reject development overrides and redirects, and prohibit HTTP. Block production APK and bundle packaging while that origin is unconfigured. Verify the effective release configuration in CI.

**Reason:** LAN access removes the backend's dependence on USB forwarding during testing. Build-time selection stays simple, while independent release checks prevent credentials or music from reaching an accidental development address.

**Related:** [0003: environment separation](0003-local-first-development-and-portable-deployment.md); [0008: origin-bound sessions](0008-persistent-android-sessions.md); [0009: independent MIDI transport](0009-native-usb-midi.md).

**Source:** [Plan dev host IP connection](codex://threads/01a10853-d035-70a3-8b6e-83e002974dea), including the explicit choice to block packaging until a production URL is selected; [LAN and release guide](../development/lan-development.md).
