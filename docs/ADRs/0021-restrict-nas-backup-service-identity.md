# ADR 0021: Restrict the NAS backup service identity

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Give the NAS backup receiver a dedicated local identity, `cv-backup`, belonging only to DSM's mandatory `users` group. Allow read/write access to `ChordViewerBackups`, explicitly deny access to every other existing shared folder, and deny every listed NAS application. Deactivate the account's login after creation. The owner enters and retains its initial password; it is not a VPS credential.

The future receiver will run without root privileges under this identity's numeric user ID, with the repository as its only writable host-data mount. Validate that repository access works while the DSM account remains deactivated before enabling transfers. Receiver authentication will be separate from DSM login.

**Reason:** The receiver needs repository filesystem access without NAS administration, personal-file access or interactive login. Explicit denials override inherited grants, including the default group's read-only access to the `docker` share.

**Consequence:** The account is created and deactivated, and its saved group, folder and application permissions were verified. Numeric identity discovery and container filesystem checks remain pending; the receiver, its credentials and the single Tailscale destination grant require separate approval. This account setup does not establish working backups.

**Extends:** [0020: Protect NAS backup storage](0020-protect-nas-backup-storage.md).

**Source:** The owner's 2026-10-31 approval of the restricted identity, followed by their password entry and final account submission; [operations runbook](../deployment/runbook.md).
