# Local backend containers

M3 runs the API and PostgreSQL on the development computer. The browser and Android emulator share that backend; NAS and public deployment remain later milestones. The root [README](../../README.md) is the entry point for the complete developer workflow.

## Start and stop

Use Docker Desktop with its Linux container engine running. From the repository root in Windows PowerShell:

```powershell
# Opens a child shell with a process-only script policy; close it when finished.
powershell -NoProfile -ExecutionPolicy Bypass

# Generates private settings once, builds the API image, and waits for both services.
.\scripts\development\Start-LocalBackend.ps1

# Check readiness; /health also checks the database connection.
Invoke-RestMethod http://127.0.0.1:3000/health

# Stops and removes this project's containers/network while retaining its database.
.\scripts\development\Stop-LocalBackend.ps1
```

Run `Start-LocalBackend.ps1` again after backend or dependency changes. It builds the current source, starts containers, applies the application's explicit database migrations, and waits for a healthy API. Existing database data and generated credentials are retained. Running it again without changes is safe.

The web development server runs on the host and proxies requests to port 3000. Open its canonical URL, `http://127.0.0.1:5173`; authentication allows that browser origin. The Android debug app reaches host port 3000 through `adb reverse tcp:3000 tcp:3000`. The backend is reachable only through the host's loopback interface, and PostgreSQL has no published host port.

## Independent test backend

```powershell
.\scripts\development\Start-LocalBackend.ps1 -Environment test
Invoke-RestMethod http://127.0.0.1:3001/health

# Stop the test project independently; its test data remains available on the next start.
.\scripts\development\Stop-LocalBackend.ps1 -Environment test
```

| Setting | Development | Test |
| --- | --- | --- |
| Compose project | `chordviewer-development` | `chordviewer-test` |
| API host address | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Database volume | `chordviewer-development_database` | `chordviewer-test_database` |
| Private configuration | `.local/backend/development.env` | `.local/backend/test.env` |

Both projects can run at once. They have separate networks, databases, passwords and authentication secrets. Integration tests should use the test API, never the developer's personal library. Both projects build the same local image tag, but a build does not restart containers in the other project; each project adopts an updated image when its start helper runs.

Use `npm run test:persistence` on Windows with the test project running and other test clients closed. It verifies the project's labels, loopback binding and exact volume before restarting and recreating its containers, then checks stored data and session lifetime. It retains test data. Run `npm run test:api` last because its authentication-throttling check intentionally reaches the shared local sign-in limit. See the README for the complete check sequence.

## Credentials and data

The start helper calls `Initialize-LocalBackend.ps1`. You may run that initializer separately to prepare settings without starting containers. It generates three independent 256-bit secrets per environment: the PostgreSQL bootstrap administrator password, the application database password, and the authentication signing secret. Generated values are URL-safe hexadecimal and are never printed. Windows file permissions permit only the current user and SYSTEM. The files are ignored by version control and excluded from the Docker build context.

Do not replace or delete an environment file while retaining its database volume. PostgreSQL's initial user/password setup runs only for a new volume; recreating settings would give the application a different password from the one stored in the existing database. A changed authentication secret also invalidates existing sessions. Keep the matching private settings when preserving local data.

The scripts always pass an explicit environment file and project name. They do not read the repository's pre-existing private `.env` files. They temporarily remove conflicting environment variables with the `CHORDVIEWER_` names they use, then restore the caller's values. This prevents an unrelated shell setting from quietly selecting different credentials or a different host port.

The stop helper never removes volumes. No destructive reset command is included in the normal workflow. Database backup/restore procedures and upgrades across PostgreSQL major versions are part of later operational validation.

## Container boundaries

- Official images are pinned by version and digest: Node `24.21.0-bookworm-slim` and PostgreSQL `18.6-bookworm`. Image versions/digests were checked against Docker Hub on 2026-09-20.
- PostgreSQL 18 stores its data beneath `/var/lib/postgresql`, backed by a Compose named volume. The API connects as `chordviewer`, a database owner without superuser, role-creation, database-creation or replication privileges. Its migration permissions cover its own database.
- The API image contains compiled API/contracts and production dependencies. It runs as the image's unprivileged `node` user, with a read-only root filesystem, dropped Linux capabilities, a small temporary filesystem and no privilege escalation.
- Each running service has a 512 MiB memory limit and a one-CPU limit. Both environments together allow up to 2 GiB for service memory, plus Docker Desktop/WSL and build overhead. The first image build can need more memory than the running services. Avoid running Gradle builds and the emulator concurrently on a memory-constrained machine.
- Container logs rotate at two files of 5 MiB each. Normal helper output contains build/start status and local URLs, not generated credential values. Docker administrators can inspect container environment variables; these local development settings are not a production secret manager.
- This configuration deliberately enables HTTP only for the local development flow. It is not the public deployment configuration. Public HTTPS, mail-based account recovery/verification, operational backups and commercial access controls are later work.

## Troubleshooting

If Docker is not running, start Docker Desktop and wait for its Linux engine, then rerun the start helper. If port 3000 or 3001 is occupied, stop the process or matching development server you started on that port. The helpers do not terminate unrelated applications or containers.

If a build fails, correct the reported source or dependency problem and rerun the start helper. A failed build does not erase the database. If a container fails its health check, review only the relevant project's status/logs. Avoid posting full `docker compose config` output or `docker inspect` output: these can reveal environment secrets. Quiet configuration validation is available through the helper functions without expanding secrets to the console:

```powershell
. .\scripts\development\LocalBackend.Common.ps1
$backend = Get-LocalBackendSettings -Environment development
Invoke-LocalBackendCompose -Settings $backend -Arguments @('config', '--quiet')
Invoke-LocalBackendCompose -Settings $backend -Arguments @('ps')
Invoke-LocalBackendCompose -Settings $backend -Arguments @('logs', '--tail', '60', 'api')
```

Configuration references: [Docker Compose service settings](https://docs.docker.com/reference/compose-file/services/), [PostgreSQL container guide and version-18 volume layout](https://docs.docker.com/guides/postgresql/), [Compose environment-variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/).
