# ADR 0018: Switch Android debug builds between local and public backends

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Debug builds provide an in-app choice between the build-configured local origin and `https://chordviewer.app`. Persist only that choice; a fresh installation starts local. Keep the selector and preference reader in the debug source set. Release builds contain no selector and production packaging requires exactly `https://chordviewer.app`.

Switching signs out, waits for accepted recovery writes, removes the saved credential, attempts old-server session revocation and starts a fresh Activity task so the previous API client and account state cannot survive. Local credential deletion failure blocks switching; old-server unavailability does not. Ask before closing unsaved work and retain recovery drafts under their existing origin. Public accounts remain operator-managed.

**Reason:** The same debug APK can test local development and the deployed service without weakening release endpoint restrictions or sharing account state between servers. Changing the local LAN address still requires rebuilding its narrowly scoped cleartext policy.

**Partially supersedes:** [0011: Build-time development endpoints](0011-development-and-release-endpoints.md), replacing the requirement to rebuild when selecting local versus public service. Its build-time local address, release isolation and redirect restrictions remain.

**Related:** [0008: Origin-bound sessions](0008-persistent-android-sessions.md); [0016: First public release boundaries](0016-first-public-release-boundaries.md).

**Source:** Owner's request on 2026-10-31 to switch Android testing backends while keeping release fixed to chordviewer.app; [Android development guide](../../apps/android/README.md).
