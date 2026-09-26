# Local backup and restore

M7 adds a private local recovery rehearsal for the existing Docker deployment. Run from the repository root in the development PowerShell described in [README](../../README.md). Docker Desktop must be running. No NAS or public host is configured here.

## Back up a running environment

```powershell
.\scripts\development\Backup-LocalBackend.ps1 -Environment development
# Or back up the isolated testing database:
.\scripts\development\Backup-LocalBackend.ps1 -Environment test
```

The script verifies both running containers' Compose project/service labels. It uses a consistent PostgreSQL custom-format database dump and archives the exact running API image by immutable image ID. A completed private directory under `.local/backups/<timestamp-id>` contains:

| File | Contents |
| --- | --- |
| `database.dump` | Accounts, password hashes, sessions, saved scores, Library metadata, Trash, revisions and migrations. |
| `api-image.tar` | The API release image that was running at backup time. |
| `manifest.json` | Format/date, source environment, pinned PostgreSQL reference, immutable API image ID, sizes and SHA-256 checksums. |

The manifest is written last, only after success. Windows ACLs restrict the backup directory/files to the current user and SYSTEM. Source temporary dumps use restrictive permissions and are removed in cleanup. A failed run can leave an incomplete directory; it is not a completed backup.

The archives contain private data. Keep them out of source control and untrusted file sharing. Copy completed directories to separate protected storage for disaster recovery; a copy on the same workstation does not protect against workstation loss. These scripts do not schedule backups, encrypt off-device copies or manage retention.

## Restore into a new isolated target

```powershell
.\scripts\development\Restore-LocalBackend.ps1 -BackupDirectory .local\backups\<timestamp-id>
# Optional alternative unused loopback port:
.\scripts\development\Restore-LocalBackend.ps1 -BackupDirectory .local\backups\<timestamp-id> -Port 3003
```

Replace the placeholder with the path printed by Backup. Default API port is **3002**; development/test ports 3000/3001 are reserved. The source environment may keep running. The target uses a newly generated `chordviewer-restore-<id>` project and new database volume; existing project volumes are rejected. Restore never uses `--clean`, drops an existing database or takes over the development/test projects.

Before creating containers, restore validates the private path, rejects junctions/symlinks, and verifies bounded archive sizes and both hashes. It loads the archived API image only when that image ID is absent locally, and starts the exact backed-up image with `--no-build`. A pinned PostgreSQL image may need to be downloaded on a fresh Docker installation. This rehearsal uses the repository's current Compose/bootstrap files; future incompatible infrastructure changes will need an explicit migration/restore procedure.

Fresh environment passwords and an authentication secret are generated under private `.local/backend/restore-<id>/`. PostgreSQL restores as the application's database role, without carrying source roles/ownership/ACLs. Account passwords still work, but existing signed session credentials must be replaced by signing in again.

**Only restore trusted backups created by this application.** Checksums detect accidental damage; they do not authenticate an archive or make an untrusted database dump/container image safe.

Verify the restored API and data, then stop the target using its printed ID:

```powershell
Invoke-RestMethod http://127.0.0.1:3002/health
.\scripts\development\Stop-RestoredBackend.ps1 -RestoreId <12-character-id>
```

Stop removes only that project's containers/network and preserves its restored volume and settings. An interrupted/failed restore prints the same cleanup command; it does not remove data volumes. A fresh rehearsal can always use another generated project. No in-place production restore, production release rollout or automatic backup rotation is included.

Database backup covers explicitly saved content. For unsaved music see [local draft recovery](../architecture/draft-recovery.md). PostgreSQL references: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).
