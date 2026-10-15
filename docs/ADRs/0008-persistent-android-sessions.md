# ADR 0008: Persist Android sessions securely across restarts

Decided: 2026-10-02. Recorded retrospectively: 2026-10-15.

**Decision:** Keep Android signed in across process restarts and application updates until explicit sign-out, revocation or session expiry. Encrypt the bearer credential and account metadata with Android Keystore in private no-backup storage, bound to the API origin. Clear invalid credentials after an authentication rejection; retain them through connectivity failures. Do not store passwords.

**Reason:** Requiring login on every launch interrupts tablet use. Persisting a protected session meets the requested workflow without treating a temporary network failure as logout or sending a credential to a different server.

**Related:** [0002: backend authentication](0002-native-clients-and-rest-backend.md); [0011: API origins](0011-development-and-release-endpoints.md).

**Source:** Persistent-login request in [Redesign Android library view](codex://threads/01a0fcaa-6be4-71b2-b831-9f976c378067); [authentication contract](../architecture/backend-contract.md). This replaces the earlier Android memory-only session behavior.
