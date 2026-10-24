# First-release security review — 2026-10-24

The first release uses Caddy as its only public application listener. The API and PostgreSQL have no published ports. The gateway and API run as non-root with read-only filesystems, no capabilities and no-new-privileges. PostgreSQL switches to its `postgres` identity; neither the API nor gateway has its administrative password. Docker's socket is absent from all application containers.

## Fixes and validation

- Updated Fastify to 5.12.7, Vite to 8.3.5, Vitest/coverage to 4.1.12 and concurrently to 9.2.5, plus compatible transitive fixes. The full npm audit reports zero vulnerabilities after a clean installation.
- Updated the Node image to 24.22.1 and removed the unused npm CLI from the final API image. Trivy reports zero high/critical Node package findings in that final image.
- Rebuilt Caddy 2.11.7 with Go 1.27.3 and `golang.org/x/net` 0.60.0, and applied the Alpine Brotli fix. Trivy reports zero high/critical findings in the finished gateway image. The ordinary upstream Caddy tag was still vulnerable at scan time.
- Applied available Debian package updates to the PostgreSQL image, including OpenSSL, PCRE2 and Perl patches. Image IDs and archive checksums identify the tested output; mutable tags are not the deployment authority.
- Passed the HTTPS rehearsal: strict certificate trust, Secure/HttpOnly/SameSite cookies, signed bearer sessions, blocked signup, exact browser origin checks, gateway header verification, account isolation, size bounds, metadata/Trash, container replacement, password reset/session revocation and spoof-resistant login throttling. The operator's 100-account bound is tested separately.

The scanner was Trivy 0.76.1, downloaded from the official Aqua Security release with its published SHA-256 verified. Its database was fetched on the review date. Private full reports and the npm audit output are retained under `.local/deployment`. Docker Scout was unavailable without a Docker account login, so its unsuccessful invocation is not counted as a scan.

## Remaining image findings

The scanner still reports upstream Debian findings without a fixed package in the configured repositories: 57 package findings across 12 CVE IDs in the API image, and 74 across 24 IDs in PostgreSQL. These counts include the same CVE repeated across packages from one source. The PostgreSQL image also contains 26 Go standard-library findings in the `gosu` privilege-switching executable.

The deployment review found no exposed application path to these findings:

| Area | Deployment assessment |
| --- | --- |
| `gosu` Go networking, TLS, mail, XML and template code | The helper only switches identity and executes PostgreSQL at startup. It does not serve HTTP/TLS or process application input through those library features. |
| util-linux/mount/device and system libraries | No application feature invokes these tools or accepts mount/device paths. API/gateway capabilities are dropped, and database containers lack `CAP_SYS_ADMIN`. |
| Perl, terminal handling, gzip/LZH and ACL helpers | No application route executes shell tools, unpacks these formats or accepts terminal/filesystem instructions. |
| PostgreSQL's SQLite, XML, LDAP and OpenSSL dependencies | The service exposes fixed, parameterized authentication and JSON score operations, with no arbitrary SQL, SQLite, XML or LDAP feature. PostgreSQL is private and does not terminate public TLS. The critical SQLite/XML findings therefore have no identified application entry point. |
| CVE-2023-45853 (`zlib1g`, Debian `will_not_fix`) | The finding concerns the MiniZip ZIP-writing API. The deployed service has no ZIP-writing path through that API. |

This is a review of the current application paths and container boundaries, not a claim that the base images contain no vulnerabilities. Reassess on dependency/base updates, new parsers or features, and any change to container privileges. A compromised host or application process is outside these exposure assumptions. Do not suppress the findings globally.

## Operational limits

The owner approved named key-only SSH administration and confirmed recovery access. The host firewall is installed for IPv4 and IPv6, including Docker forwarding, and was verified after reboot. Hostinger's separate managed firewall is not verified. No AAAA record is published, and an independent IPv6 scan is still pending.

Off-site NAS backup transfer, automatic backup scheduling, external monitoring, delivered email alerts and full M8 recovery/observation acceptance remain pending. The first release provides a manual consistent local recovery copy; it must not be described as an independent backup. Physical MIDI, actual tutorial playback and a separate real-client network remain acceptance work.
