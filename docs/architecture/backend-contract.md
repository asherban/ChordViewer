# Local accounts and sheet persistence

M3 gives the web client and native Android app one account-scoped library on this workstation. The [OpenAPI document](../../contracts/openapi.yaml) and [score contract](score-contract.md) define the wire format; the [README](../../README.md) contains developer commands. Musical editing starts in M4, melody editing/import in M5, and complete Library/Practice behavior in M6.

## Stored sheets

A new account has no sheets. Creating a sheet explicitly selects either four empty measures or a copy of the original notation example. The backend assigns its UUID and authenticated owner. Clients cannot select an owner or overwrite the ID. Metadata lists omit the full score; opening a sheet returns its validated score, optional canonical tutorial URL, revision and timestamps.

Saving sends the complete score, tutorial URL and `expectedRevision`. PostgreSQL compares that revision atomically, increments it on success and returns the authoritative record. A stale write returns `409 revision_conflict`; an unknown or other user's sheet returns the same `404`. Clients preserve an unsuccessful metadata draft and offer a reload instead of silently overwriting another device. Writes are explicit and are not automatically retried when the network outcome is unknown. Durable offline drafts and merge tools are future work.

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Checks API availability and the migrated sheet table. |
| `GET /api/v1/score-example` | Anonymous, immutable original notation proof. |
| `POST /api/auth/sign-up/email` | Creates and signs into a local email/password account. |
| `POST /api/auth/sign-in/email` | Starts a session for an existing account. |
| `POST /api/auth/sign-out` | Revokes the current session. |
| `GET /api/v1/me` | Returns the authenticated account's ID, name and email. |
| `GET /api/v1/sheets` | Lists only the authenticated account's sheets. |
| `POST /api/v1/sheets` | Creates a blank sheet or explicit example copy. |
| `GET /api/v1/sheets/{id}` | Opens an owned sheet. |
| `PUT /api/v1/sheets/{id}` | Validates and saves an owned sheet against its revision. |

There is no delete endpoint yet; recoverable Trash belongs to the full Library milestone. Unknown authentication endpoints are unavailable. Tutorial links are restricted to supported HTTPS YouTube watch/youtu.be forms with an eleven-character video ID. The backend normalizes the URL without fetching it. Embedded playback is future client work.

## Authentication and client lifetime

Better Auth 1.7.5 handles email/password hashing and PostgreSQL-backed sessions. Passwords have 12–128 characters. Sessions expire after 24 hours, renew after one hour of activity, and are checked against the database rather than an independent cookie cache. Sign-out and expiry therefore take effect on the next request. Email verification and password recovery are not configured in this private milestone.

Web requests pass through Vite's same-origin proxy. Sessions use HttpOnly, SameSite=Lax cookies; successful browser authentication never exposes a bearer header or raw token in JSON. Cookie writes require a trusted Origin. Untrusted origins and cross-site Fetch Metadata are rejected. The local HTTP cookie intentionally lacks Secure because both services are restricted to loopback; public HTTPS will require a separate reviewed configuration.

Android sends an explicitly signed opaque bearer credential returned in `set-auth-token` to native authentication requests. It holds that credential only in a ViewModel: rotation preserves it, process death clears it. Tokens/passwords are excluded from saved instance state, preferences, files and logs. Redirects are rejected, responses and request sizes are bounded, and network I/O has timeouts. The debug app permits HTTP only at `127.0.0.1` via `adb reverse`. The release API is unconfigured and its network policy requires HTTPS; the debug MIDI relay is excluded from release.

Both clients prevent late responses from an old account/session from restoring cleared data. Failed saves preserve edits. A failed sign-out revocation is reported; local account data is cleared immediately. Saved music and live MIDI state are separate, so holding notes while saving metadata cannot change or reset the score.

## Limits and isolation

- Each SQL sheet query includes the authenticated owner, and query values are parameterized. Creation locks the owner's row while enforcing the 100-sheet limit so simultaneous requests cannot exceed it.
- Titles are nonblank and limited to 200 Unicode code points; tutorial inputs to 500 characters; sheet requests to 1 MiB. Scores pass structural and musical validation before storage. Extra write fields are rejected.
- Authentication throttling uses PostgreSQL: 20 sign-in or signup attempts per minute per endpoint/IP, with a general authentication limit of 100 per minute. Client forwarding headers cannot choose the rate-limit identity. Local test suites can share one source IP and must run sequentially, with throttling checks last.
- The container API runs as an unprivileged user with a read-only root filesystem and dropped capabilities. PostgreSQL is unpublished on the host; its application role owns only its database and cannot create databases/roles or act as a superuser.
- Development and test use separate Compose projects, volumes, networks and generated secrets. API ports bind only to host loopback. Test clients use port 3001; the development library uses port 3000.
- Configuration requires an explicit local-development flag and loopback authentication origins. There is no public deployment configuration, email recovery, paid access or operational backup claim in M3.

## Migrations and lifecycle

The API applies checked-in SQL migrations before serving. A transaction and PostgreSQL advisory lock serialize migration runners. A history table records each migration checksum; changed or unknown applied migrations fail safely instead of resetting data. Schema updates need new explicit migrations. The initial authentication tables were compared with Better Auth's own migration planner against the running database; it reported no outstanding tables, columns, indexes or schema problems.

Compose keeps PostgreSQL data in a named volume. Starting, stopping, rebuilding and recreating containers retain accounts, sessions and sheets when the matching private environment file is preserved. Windows-only `npm run test:persistence` verifies both restart and actual container replacement, plus browser cookie renewal and expired/revoked sessions. It checks container labels, port bindings and the exact test volume before lifecycle actions. Database backup restoration, major-version upgrades, NAS hosting and public operation remain later milestones.

## References used for implementation

- [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password)
- [Session management](https://www.better-auth.com/docs/concepts/session-management)
- [Bearer plugin and signature enforcement](https://www.better-auth.com/docs/plugins/bearer)
- [Rate limiting](https://www.better-auth.com/docs/concepts/rate-limit)
- [Database and migrations](https://www.better-auth.com/docs/concepts/database)
- [Fastify integration](https://www.better-auth.com/docs/integrations/fastify)

These choices describe the pinned local implementation. Recheck authentication, hosting and library documentation before changing deployment boundaries or upgrading dependencies.
