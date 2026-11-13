# ADR 0020: Bound and protect the NAS backup repository

Decided: 2026-10-31. Recorded: 2026-10-31.

**Decision:** Store ChordViewer backups in a dedicated Btrfs shared folder on the home Synology NAS, with a 100 GB initial quota, data checksums and administrator-only access during preparation. Take one snapshot daily, retain the latest 30 snapshots and protect each snapshot against deletion for seven days. Require client-side backup encryption before transferring application data; the shared folder itself is not encrypted.

**Reason:** Dedicated permissions and a storage quota limit the backup service's access and live repository growth. Immutable snapshots preserve earlier repository states independently of the VPS writer. Snapshot space and free volume space must be monitored separately; the folder quota is not treated as a verified bound on total storage including snapshots.

**Consequence:** Protected snapshots and their containing storage cannot be deleted during the protection period. The service identity, receiver and single Tailscale destination grant require separate approval. Creating and protecting an empty folder does not establish a working backup or restore procedure.

**Extends:** [0019: Isolate VPS backup access](0019-isolate-vps-backup-access-with-tailscale.md).

**Source:** The owner's 2026-10-31 approval of the reviewed folder and snapshot settings; [operations runbook](../deployment/runbook.md); [Synology snapshot documentation](https://kb.synology.com/en-us/DSM/help/SnapshotReplication/snapshots).
