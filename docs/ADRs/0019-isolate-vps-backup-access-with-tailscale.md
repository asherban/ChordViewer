# ADR 0019: Isolate VPS backup access with a dedicated Tailscale identity

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Use an administrator-controlled `tag:chordviewer-backup` identity for the Hostinger VPS. Replace the tailnet's unrestricted network grant and wildcard identity-provider grant with grants between the owner's user-authenticated devices. The NAS and personal devices retain their existing user identities; the VPS must not inherit the owner's personal-device permissions.

The owner saved this isolation policy after removing the stale VPS registration. The backup tag initially has no network grants. Enrolling the VPS and permitting a single NAS backup-service destination require later, separately approved steps. Saved policy tests protect personal NAS access and assert representative TCP, UDP and ICMP denials for the backup identity. They supplement, rather than replace, connectivity checks after enrollment.

**Reason:** A compromised public VPS must not gain general access to the NAS, personal devices or identity-provider service. An explicit server identity and deny-by-default policy establish this boundary before the VPS joins the tailnet.

**Consequence:** Private network access is reserved for backup infrastructure; the public application and existing administrator SSH route remain separate. This policy preparation does not complete encrypted transfer, retention, alerts or restoration acceptance.

**Extends:** [0016: First public release boundaries](0016-first-public-release-boundaries.md), specifically the deferred NAS backup setup.

**Source:** The owner's 2026-10-31 request for least-privilege NAS backups and approval of each setup step, followed by their removal of the stale device and saving of the reviewed policy; [operations runbook](../deployment/runbook.md).
