# ADR 0023: Limit VPS access to NAS backup HTTPS

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Give `tag:chordviewer-backup` network access only to the NAS's exact Tailscale addresses, `100.68.140.104` and `fd7a:115c:a1e0::c838:8c68`, on `tcp:8443`. Preserve the owner's existing grants and administrator-only ownership of the backup tag. Keep policy assertions for the allowed endpoint and representative denied administration, file-sharing, personal-device, UDP and ICMP access.

Resolve `sherbannas.asymptote-harmonic.ts.net` on the VPS through two managed `/etc/hosts` entries for those addresses. Keep Tailscale DNS acceptance disabled and preserve the host's resolver, firewall and SSH configuration. Use the hostname for certificate validation over either address family.

**Reason:** The receiver is ready, and a single protocol/port grant supplies its required transport without giving the public VPS general NAS or tailnet access. The hostname does not otherwise resolve on the VPS; a local mapping provides authenticated HTTPS without changing DNS for the public application.

**Consequence:** Both address families passed trusted TLS 1.3 and returned HTTP 401 without receiver credentials. All 33 representative forbidden TCP connection attempts timed out; the saved policy assertions cover additional protocol/destination restrictions. These checks establish transport and its boundary, not scheduled backups. Production credentials, encryption-key recovery, transfer, retention and alerts remain separate work. NAS re-enrollment or address changes require reviewing both the grant and hostname entries.

**Extends:** [0019: Isolate VPS backup access](0019-isolate-vps-backup-access-with-tailscale.md), [0022: Use an offline NAS backup receiver](0022-use-an-offline-nas-backup-receiver.md).

**Source:** The owner's approval of the complete network-access step on 2026-10-31; saved Tailscale policy and live verification recorded in the [operations runbook](../deployment/runbook.md).
