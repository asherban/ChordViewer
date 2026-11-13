# ADR 0024: Encrypt production backups with independent recovery

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Back up consistent PostgreSQL dumps, deployment configuration and exact release images with restic through the append-only NAS receiver. A fixed root preparation job takes a database transaction snapshot; a separate non-login account encrypts and uploads the bundle without sudo or Docker access. Pin the repository identity and verify uploaded data. Run nightly at 00:00 UTC and before future deployments after an independent restore and recovery-key handoff pass.

Use separate operational, NAS-maintenance and offline-recovery passwords for the same encrypted repository. Store operational credentials privately on the VPS, maintenance credentials in administrator-controlled NAS storage, and the recovery kit in the owner's password manager with an offline copy. Passwords unlock the same data; deletion authority comes from repository filesystem access, which the VPS does not receive. NAS-only maintenance retains every backup for at least 35 days, checks trusted receipt history and backup/snapshot health, and stops on anomalies before removing older data.

**Reason:** The public VPS can make unattended backups while NAS administration controls retention. A recovery kit and a workstation restore prove that loss of the VPS need not make its backups unusable. Patched, pinned restic builds and constrained maintenance processes reduce exposure when reading repository data.

**Consequence:** The owner explicitly deferred email and missed-backup alerts to a later step. Local logs do not replace those alerts; monitored-operation and observation gates remain open. A compromised VPS can decrypt backups and upload misleading data, so independent receipt history, integrity checks and immutable NAS snapshots remain necessary. This approval does not authorize new public ports, wider Tailscale access or server reboots.

**Extends:** [0022: Use an offline NAS receiver](0022-use-an-offline-nas-backup-receiver.md), [0023: Limit VPS access to NAS backup HTTPS](0023-limit-vps-access-to-nas-backup-https.md).

**Source:** The owner's approval of the revised backup-and-restore scope on 2026-10-31; password-manager/offline recovery selection and explicit alert deferral; [execution plan](../architecture/m8-execution-plan.md).
