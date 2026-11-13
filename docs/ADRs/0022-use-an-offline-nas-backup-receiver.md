# ADR 0022: Use an offline NAS backup receiver

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Run the append-only restic REST receiver as UID/GID `1028:100` with Docker networking disabled. Expose only its Unix socket through the NAS's existing Tailscale HTTPS Serve service on port 8443. Keep the repository and a separate socket directory within the existing quota-controlled backup share; mount the authentication verifier read-only. Give the unprivileged Tailscale package account traversal and socket-connection permissions only, without repository, credential or Docker-storage access. Drop all capabilities, require AppArmor and no-new-privileges, and make the root filesystem read-only.

**Reason:** This eliminates receiver access to the home network, NAS administration and Internet without changing the NAS firewall. Synology runs Tailscale as a restricted package user that cannot traverse Docker's private volume storage; a dedicated socket directory makes the proxy work without elevating that account or exposing Docker storage. The installed NAS kernel supports memory limits and CPU affinity, but lacks CPU CFS quotas and the pids controller. Use 512 MiB RAM without additional swap, one CPU, and a dedicated-UID process limit of 128; the latter is not a per-container pids limit. Seccomp support was not established and is not claimed.

Rebuild rest-server's released v0.14.0 source with Go 1.27.3 and updated `golang.org/x/crypto` dependencies, using a digest-pinned Alpine 3.24.3 base. The published release image has high/critical package findings; the replacement base and rebuilt Go binaries passed a dated high/critical scan. Keep build inputs and deployment scripts reproducible, and review updates rather than automatically following image tags.

**Consequence:** The owner authorized completing NAS setup. A dedicated REST password is generated privately on the NAS, with an encrypted recovery copy for the owner's workstation. The restic encryption key remains separate. Runtime isolation, TLS, append-only behavior and backup/restore checks must pass before declaring the receiver ready. VPS access still requires its separate single-port Tailscale grant; installation does not establish scheduled backups or delivered alerts.

**Extends:** [0021: Restrict the NAS backup service identity](0021-restrict-nas-backup-service-identity.md), [0019: Isolate VPS backup access](0019-isolate-vps-backup-access-with-tailscale.md).

**Source:** The owner's “Finish all tasks you need on the NAS” instruction; authenticated DSM capability reports on 2026-10-31; [receiver configuration](../../infra/nas-backup/README.md); [operations runbook](../deployment/runbook.md).
