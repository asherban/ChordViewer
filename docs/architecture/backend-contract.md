# Local accounts and sheet persistence

The web client and native Android app share an account-scoped library on this workstation. The [OpenAPI document](../../contracts/openapi.yaml) and [score contract](score-contract.md) define the wire format; the [README](../../README.md) contains developer commands. This document describes the current implementation through M7, including Library metadata, recoverable Trash and local draft recovery.

## Stored sheets

A new account has no sheets. Creating a sheet explicitly selects either four empty measures or a copy of the original notation example. The backend assigns its UUID and authenticated owner. Clients cannot select an owner or overwrite the ID. Metadata lists omit the full score; opening a sheet returns its validated score, optional canonical tutorial URL, revision and timestamps.

Saving sends the complete score, tutorial URL and `expectedRevision`. PostgreSQL compares that revision atomically, increments it on success and returns the authoritative record. A stale write returns `409 revision_conflict`; an unknown or other user's sheet returns the same `404`. Clients preserve unsuccessful edits and offer an explicit reload or Save as new for conflicts. Writes are explicit and are not automatically retried when the network outcome is unknown. M7 adds bounded account-scoped local recovery copies; these retain the original revision and do not automatically merge or overwrite server music. Cold-start authentication still needs the backend.

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Checks API availability and the migrated sheet table. |
| `GET /api/v1/score-example` | Anonymous, immutable original notation proof. |
| `POST /api/auth/sign-up/email` | Creates and signs into a local email/password account. |
| `POST /api/auth/sign-in/email` | Starts a session for an existing account. |
| `POST /api/auth/sign-out` | Revokes the current session. |
| `GET /api/v1/me` | Returns the authenticated account's ID, name and email. |
| `GET /api/v1/sheets` | Lists at most 100 owned sheet summaries, including Trash, with metadata and at most four first-bar chord labels. |
| `POST /api/v1/sheets` | Creates a blank sheet or explicit example copy. |
| `POST /api/v1/sheets/import` | Validates score JSON and creates a new owned sheet with a fresh UUID; source identity never overwrites an existing sheet. |
| `GET /api/v1/sheets/{id}` | Reads an active owned sheet without changing Recent order. |
| `PUT /api/v1/sheets/{id}` | Validates and saves an owned sheet against its revision. |
| `POST /api/v1/sheets/{id}/open` | Records an intentional open for Recent sorting without changing the score revision. |
| `PATCH /api/v1/sheets/{id}/metadata` | Renames, favorites or designates a Draft using an atomic revision check. |
| `POST /api/v1/sheets/{id}/duplicate` | Copies an active owned sheet using a fresh ID, current revision and the shared account quota. |
| `POST /api/v1/sheets/{id}/trash` | Moves an owned sheet into recoverable Trash using its current revision. |
| `POST /api/v1/sheets/{id}/restore` | Restores an owned sheet from Trash using its current revision. |

There is no permanent-delete endpoint. Trash retains its quota slot and blocks score editing until restored. Unknown authentication endpoints are unavailable. Tutorial links are restricted to supported HTTPS YouTube watch/youtu.be forms with an eleven-character video ID. The backend normalizes the URL without fetching it. Clients load the embedded player only after a deliberate Play action.

M5 blank creation optionally accepts a standard major/minor key and supported meter, defaulting to C/4/4 in score v2. Example copies retain the original v1 fixture. Import receives canonical v1/v2 score JSON after local preview, plus title and optional tutorial URL. The backend does not parse MusicXML or fetch source URLs. Creation and import share the same per-owner transaction lock and 100-sheet quota. No database migration is needed for v2 because scores are validated JSON documents in the existing storage column.

## Authentication and client lifetime

Better Auth 1.7.5 handles email/password hashing and PostgreSQL-backed sessions. Passwords have 12–128 characters. Sessions expire after 24 hours, renew after one hour of activity, and are checked against the database rather than an independent cookie cache. Sign-out and expiry therefore take effect on the next request. Email verification and password recovery are not configured in this private milestone.

Web requests pass through Vite's same-origin proxy. Sessions use HttpOnly, SameSite=Lax cookies; successful browser authentication never exposes a bearer header or raw token in JSON. Cookie writes require a trusted Origin. Untrusted origins and cross-site Fetch Metadata are rejected. The local HTTP cookie intentionally lacks Secure because both services are restricted to loopback; public HTTPS will require a separate reviewed configuration.

Android sends an explicitly signed opaque bearer credential returned in `set-auth-token` to native authentication requests. It holds that credential only in a ViewModel: rotation preserves it, process death clears it. Tokens/passwords are excluded from saved instance state, preferences, files and logs. Redirects are rejected, responses and request sizes are bounded, and network I/O has timeouts. The debug app permits HTTP only at `127.0.0.1` via `adb reverse`. The release API is unconfigured and its network policy requires HTTPS; the debug MIDI relay is excluded from release.

Both clients prevent late responses from an old account/session from restoring cleared data. Failed saves preserve edits. A failed sign-out revocation is reported; local account data is cleared immediately. Saved music and live MIDI state are separate, so holding notes while saving metadata cannot change or reset the score.

## Limits and isolation

- Each SQL sheet query includes the authenticated owner, and query values are parameterized. Creation locks the owner's row while enforcing the 100-sheet limit so simultaneous requests cannot exceed it.
- Titles are nonblank and limited to 200 Unicode code points; tutorial inputs to 500 characters; sheet requests to 1 MiB. Scores pass structural and musical validation before storage. NUL and unpaired UTF-16 surrogates are rejected before persistence because PostgreSQL cannot preserve them in JSONB. Extra write fields are rejected.
- Authentication throttling uses PostgreSQL: 20 sign-in or signup attempts per minute per endpoint/IP, with a general authentication limit of 100 per minute. Client forwarding headers cannot choose the rate-limit identity. Local test suites can share one source IP and must run sequentially, with throttling checks last.
- The container API runs as an unprivileged user with a read-only root filesystem and dropped capabilities. PostgreSQL is unpublished on the host; its application role owns only its database and cannot create databases/roles or act as a superuser.
- Development and test use separate Compose projects, volumes, networks and generated secrets. API ports bind only to host loopback. Test clients use port 3001; the development library uses port 3000.
- Configuration requires an explicit local-development flag and loopback authentication origins. Public deployment, email recovery and paid access are not configured. Local backup and restoration are described below.

Registration is intentionally open to local callers. Authentication throttling limits attempts, but the 100-sheet cap applies separately to each account: it is not a total storage or account-admission limit. A public deployment needs an explicit enrollment policy and aggregate resource limits, as well as HTTPS, reviewed proxy/client-IP handling and operational monitoring. Do not expose the current workstation configuration by changing its host port binding alone.

## Verification boundaries

The default unit suite includes in-process HTTP tests of origin/Fetch Metadata enforcement, cookie/native write rules, request limits, forwarding-header sanitization, the authentication endpoint allowlist, token redaction, cookie renewal forwarding and sanitized failures. These tests use the real Fastify hooks and replace the authentication provider. They do not establish password, signature or database correctness.

The isolated API integration suite covers real authentication, owner isolation, concurrent revisions, shared create/import/duplicate quotas, metadata/Trash transitions and persistence-safe Unicode. Container lifecycle and session renewal/expiry are covered separately by `npm run test:persistence`. Run the integration authentication-throttling check after other clients finish, since local callers share one rate-limit identity.

## Migrations and lifecycle

The API applies checked-in SQL migrations before serving. A transaction and PostgreSQL advisory lock serialize migration runners. A history table records each migration checksum; changed or unknown applied migrations fail safely instead of resetting data. Schema updates need new explicit migrations. The initial authentication tables were compared with Better Auth's own migration planner against the running database; it reported no outstanding tables, columns, indexes or schema problems.

Compose keeps PostgreSQL data in a named volume. Starting, stopping, rebuilding and recreating containers retain accounts, sessions and sheets when the matching private environment file is preserved. Windows-only `npm run test:persistence` verifies both restart and actual container replacement, plus browser cookie renewal and expired/revoked sessions. It checks container labels, port bindings and the exact test volume before lifecycle actions. M7 adds [private local backup and fresh-target restoration](../development/local-backup-restore.md). Major-version upgrades, NAS hosting and public operation remain later milestones.

## References used for implementation

- [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password)
- [Session management](https://www.better-auth.com/docs/concepts/session-management)
- [Bearer plugin and signature enforcement](https://www.better-auth.com/docs/plugins/bearer)
- [Rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [Database and migrations](https://www.better-auth.com/docs/concepts/database)
- [Fastify integration](https://www.better-auth.com/docs/integrations/fastify)

These choices describe the pinned local implementation. Recheck authentication, hosting and library documentation before changing deployment boundaries or upgrading dependencies.
