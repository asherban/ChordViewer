# M8: Public deployment on Hostinger VPS

Updated: 2026-11-01. M8 deploys ChordViewer to a public Hostinger VPS and proves that web and Android work independently of the development computer. Server installation, hardening, HTTPS, release packaging, backups and operating procedures are part of this milestone. The first release is live; the [dated verification](../deployment/first-deploy-2026-10-24.md) records the evidence, and the [operations runbook](../deployment/runbook.md) records the installed layout and remaining acceptance gates.

Hostinger VPS `187.124.165.121` and canonical domain `chordviewer.app` are selected. The owner confirmed secure account/recovery access, administration from this workstation, Synology backups over Tailscale as the next setup step, and `andrei.sherban@gmail.com` for alerts. Off-site backup and isolated recovery are verified; provider billing/region details and alert delivery remain to be recorded/configured. The active roadmap ends at M8. Subscriptions, payments, unrestricted public signup and app-store publication remain deferred. Anyone can reach the HTTPS login page, while the operator provisions approved accounts. No client VPN is required.

The [deployment decision](../ADRs/0015-public-hostinger-deployment.md) records the scope. Local validation and environment separation remain prerequisites, and Android retains its [reviewed release-origin requirement](../ADRs/0011-development-and-release-endpoints.md).

## Deployment layout

Retain the inspected Debian 13 server with Docker Engine and Compose, as recorded in [ADR 0016](../ADRs/0016-first-public-release-boundaries.md). Caddy serves the built web application, manages public TLS certificates and proxies `/api/` to the API. Both clients use `https://chordviewer.app`; `www` redirects there and `api` remains an API alias. The API and PostgreSQL are reachable only on container networks; the database network excludes the gateway.

```mermaid
flowchart TB
    W[Browser] -->|Public HTTPS| G
    A[Native Android] -->|Public HTTPS| G
    O[Operator] -->|SSH key, allowed source IP| H
    subgraph VPS[Hostinger VPS]
        H[Debian host]
        G[Caddy: web and HTTPS gateway] --> API[API]
        API --> DB[(PostgreSQL)]
    end
    DB -->|Scheduled encrypted backup| B[Storage outside the VPS and Hostinger account]
```

MIDI stays on the browser or tablet. YouTube loads on the client. A fresh deployment starts with an empty library; existing saved scores can be moved deliberately through JSON export/import. Development sessions, credentials and unsaved recovery copies stay tied to their original environment.

## 1. Confirm the server and access details

Before provisioning, record the Hostinger account owner, VPS identity, region, IP addresses, CPU architecture, tier, memory, storage, bandwidth and renewal cost. Use a dedicated server or inspect existing workloads before choosing a deployment directory or ports. Do not reinstall an occupied VPS to satisfy this plan.

Start sizing around one vCPU and 4 GB RAM, with enough disk for the OS, two releases, database growth and temporary backups. This is a planning baseline, not a measured capacity guarantee. Build images and APKs on the workstation. Compare the complete recurring cost, including domain and backup storage, with the roughly USD 10 monthly hosting target before purchasing or upgrading anything.

Confirm ownership of the application domain, DNS access, administrator source IPs, independent backup storage, an alert destination and an operator responsible for patching and recovery. Enable MFA for Hostinger, DNS and backup accounts; store recovery codes and SSH key recovery material privately outside the VPS.

The existing VPS runs Debian 13. Hostinger's dashboard provides firewall, backup and emergency recovery controls; the owner confirmed a recovery route before SSH changes. [VPS dashboard](https://www.hostinger.com/support/5726606-how-to-use-the-vps-dashboard-in-hostinger/).

## 2. Install and harden the host

Perform these steps in order and record the effective configuration in the deployment runbook.

| Step | Required work |
| --- | --- |
| Bootstrap | Retain the inspected Debian 13 installation. Apply security updates, keep a stable hostname and UTC server clock, enable time synchronization, and reboot if required. Record the OS and kernel versions. |
| Administrator | Create a named, non-root operator with sudo access and an Ed25519 SSH public key. Keep the private key passphrase-protected on the operator's device. Verify the server host-key fingerprint using the provider recovery route. |
| SSH hardening | First prove key login and sudo in a second session while retaining the initial session. Then disable remote root login, password authentication and keyboard-interactive authentication; restrict SSH to the operator account. Check effective settings, including image/cloud-init overrides, validate configuration before reload, and prove a fresh connection still works. |
| Recovery | Record and verify Hostinger's emergency recovery procedure. Restrict SSH source addresses only after confirming an administrator route. If the operator's address changes, update the provider allowlist before reconnecting; do not temporarily open SSH to everyone. |
| Updates | Enable automatic Debian security updates and failure reporting. Schedule reboots in an operator-controlled maintenance window. Review Docker packages, container images and application dependencies separately; OS updates do not update application images. |
| Minimal host | Remove unnecessary listeners and disable unused services. Administer through SSH without a public database or container-management panel. Bound system logs and monitor free space. |
| Container runtime | Install Docker Engine and the Compose plugin from Docker's official apt repository. Enable startup on boot and record versions. Limit Docker administration to trusted operators: daemon access is effectively root access. Never expose the Docker API or mount its socket in application containers. |
| Deployment storage | Create `/srv/chordviewer` for versioned releases and restricted configuration. Keep secrets outside Git and images, readable only by the required operator/service identities. Generate independent database and authentication secrets for this deployment. |

Validate the effective SSH configuration against Debian's [sshd_config reference](https://manpages.debian.org/trixie/openssh-server/sshd_config.5.en.html). Docker uses its [official Debian repository](https://docs.docker.com/engine/install/debian/). The runbook records the installed maintenance services and effective settings.

## 3. Configure network access and HTTPS

Configure the host firewall with explicit inbound rules for both IP families. Activate Hostinger's managed firewall as an additional layer when provider access is available; its configuration remains unverified. Allow established return traffic and necessary network-control traffic, including ICMPv6, so filtering does not break IPv6 or path MTU discovery.

| Service | Allowed access |
| --- | --- |
| TCP 443 | Public access to the Caddy HTTPS gateway. |
| TCP 80 | Public access for certificate validation and redirection to HTTPS. Application credentials are sent only over HTTPS. |
| TCP 22 | SSH access only from the confirmed operator source addresses. |
| API, PostgreSQL and administration ports | No public access. Do not publish API port 3000, database port 5432, Caddy administration or Docker API ports. |
| Other inbound traffic | Deny it unless a documented operational requirement needs a narrow exception. |

Permit outbound DNS, time synchronization, package/image retrieval, certificate issuance, backup transfer and monitoring delivery as required. Record any outbound restrictions and verify they do not prevent updates or renewal. Publish only gateway ports from Compose. Keep Docker's firewall integration enabled and inspect forwarding rules for the installed backend; UFW alone does not protect Docker-published ports. Test from an unrelated external network against IPv4 and IPv6, including after a reboot. [Hostinger firewall](https://www.hostinger.com/support/8172641-how-to-use-a-managed-vps-firewall-at-hostinger/), [Docker firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Point the domain's A record at the VPS. Add an AAAA record only after IPv6 routing and filtering pass; an unpublished IPv6 address must still be protected. Configure Caddy for the exact hostname, persist its certificate state and verify automatic issuance and renewal. Reject unexpected hostnames, serve no application on a raw-IP fallback, and redirect HTTP to the canonical HTTPS origin. Check certificate validity and the full chain from both clients. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Apply security headers deliberately: prevent MIME sniffing and framing of the app, use a restrictive referrer policy, and define a content-security policy that permits the required YouTube player. Introduce HSTS after the HTTPS checks pass; do not preload or include unrelated subdomains. Verify that these settings preserve tutorial playback and browser MIDI.

## 4. Prepare the application release

The release now has a distinct HTTPS configuration, Secure cookies, closed enrollment, a packaged web gateway and a reviewed Android origin. The development profile remains separate. The following requirements define the release boundary and continuing operational obligations.

| Area | Required change |
| --- | --- |
| Deployment configuration | Add an explicit deployed HTTPS profile with one canonical origin and an exact trusted-origin list. Reject mixed development/release settings, wildcard origins and missing secrets. Preserve the local development profile. |
| Authentication | Use Secure, HttpOnly, SameSite browser cookies. Preserve origin checks for cookie writes, signed native sessions, expiry/revocation and account isolation. Confirm HTTPS base URLs and refuse redirects to other origins. |
| Enrollment and recovery | Disable public signup in the deployed API and hide it in both deployed clients. Provide an operator-only account provisioning and password-reset procedure with identity verification and secure credential handoff; revoke sessions on reset. An email allowlist without proof of ownership is insufficient. Self-service email verification/recovery remains deferred. |
| Proxy and abuse controls | Strip caller-supplied forwarding and internal client-IP headers at the gateway. Trust only the verified gateway path in the API, then derive rate-limit identity from that path. Test spoofing, multiple clients and shared-IP use; never enable blanket proxy trust. Keep login throttling, request size/time limits, per-account quotas and explicit deployment-wide account/storage bounds. |
| Web gateway | Produce a versioned Caddy/web image with built assets, SPA navigation and third-party notices. Preserve API status codes, multiple Set-Cookie headers, native session headers and retry headers. Do not cache authenticated API responses. Keep detailed health diagnostics private. |
| Compose release | Add a separate release bundle with pinned, architecture-compatible image identities, health checks, restart policies, bounded CPU/memory/logs and persistent database/certificate volumes. Retain non-root processes where supported, read-only application filesystems, dropped capabilities and no-new-privileges. Give only the gateway the privileges needed to bind its ports. |
| Database and secrets | Keep application credentials separate from bootstrap/migration administration. Run migrations deliberately before a compatible application starts, and keep administrative credentials out of the long-running API. Document secret rotation and session consequences. |
| Android | Configure the reviewed domain and produce a signed, non-debuggable APK. Verify cleartext and development endpoint rejection. Preserve the signing key privately off-server, increment version codes and test installation over an earlier release signed with that key. Distribute the APK over HTTPS to approved users; app-store publication is deferred. |
| Operations | Add a Linux deployment/update/backup/restore runbook and scripts with runtime diagnostics. Document release IDs, checksums, configuration names and rollback steps without embedding secrets. |

Build and validate the release locally before transferring an image archive and checksums over SSH. Rehearse the HTTPS gateway and real cookie/bearer authentication with isolated data. Scan release dependencies and images, resolve exploitable high-severity findings, and review authentication, network exposure and secret handling before enabling real accounts.

## 5. Backups, monitoring and maintenance

Use the dedicated backup-server Tailscale identity in [ADR 0019](../ADRs/0019-isolate-vps-backup-access-with-tailscale.md). The VPS is connected as `chordviewer-backup` with only the administrator-controlled backup tag. The NAS receiver and the separately approved single-service grant in [ADR 0023](../ADRs/0023-limit-vps-access-to-nas-backup-https.md) passed acceptance on 2026-10-31. The VPS can reach only the NAS's exact Tailscale addresses on TCP 8443; trusted HTTPS over both IP families and 33 representative denied TCP connections were verified. Personal devices retain their user identities and existing access. Production credentials, independent recovery-key handoff, encrypted transfer and an isolated application restore have now passed under [ADR 0024](../ADRs/0024-encrypt-production-backups-with-independent-recovery.md). The nightly midnight-UTC backup and daily NAS maintenance are enabled and verified; the owner explicitly deferred alerts. See the [dated production verification](../deployment/production-backup-2026-11-01.md). The [runbook](../deployment/runbook.md) records verification and remaining steps.

The dedicated NAS storage in [ADR 0020](../ADRs/0020-protect-nas-backup-storage.md) is configured: a 100 GB Btrfs folder with checksums, daily snapshots at 04:00 NAS local time, retention of the latest 30 snapshots and seven-day immutable protection. An initial empty-folder snapshot was verified as protected. The restricted `cv-backup` identity in [ADR 0021](../ADRs/0021-restrict-nas-backup-service-identity.md) is created and deactivated, with `users`-only membership, write access to the backup share, and explicit denials for all other existing shares and NAS applications. Its numeric identity and access were verified in the non-root receiver, including encrypted workstation backup and restore. Production backup encryption, transfer and isolated recovery have passed; immutable snapshot coverage of the production repository and restored baseline is verified.

### NAS receiver implementation

The owner authorized completing NAS setup without separate approval pauses for routine NAS steps. Installation and acceptance are complete: runtime isolation, package-user socket access, receiver restart, trusted HTTPS, authentication/namespace rejection, append-only enforcement, encrypted backup and checksum-matching restore passed on 2026-10-31. The owner separately approved the VPS network-access step, which is also verified. DSM password prompts still require the owner to authenticate directly for future root-task edits. Production credentials and manual encrypted transfer are verified; nightly backup and daily 06:00 NAS maintenance are enabled; startup recovery is enabled and its manual check passed.

The approved diagnostics on 2026-10-31 confirmed UID/GID `1028:100`, Docker Engine `24.0.2`, Compose `v2.20.1-6047-g6817716`, Tailscale `1.104.2`, no existing containers, empty Serve configuration and no TCP 8443 listener. The focused follow-up read complete firewall tables successfully and confirmed AppArmor, memory/swap limits and CPU affinity support. CPU CFS quotas and the pids controller are unavailable; seccomp remains unconfirmed. Temporary task output capture was restored to disabled. The [runbook](../deployment/runbook.md) records the results and their limits.

Use the receiver in [ADR 0022](../ADRs/0022-use-an-offline-nas-backup-receiver.md), rebuilt from released rest-server v0.14.0 source with Go 1.27.3, updated crypto dependencies and digest-pinned Alpine 3.24.3. The published image has unresolved high/critical findings; the replacement base and both rebuilt executables passed dated high/critical scans. Run as `1028:100`, with a read-only root filesystem, all capabilities dropped, no-new-privileges and enforced AppArmor. Use 512 MiB RAM with no additional swap, CPU 0 affinity, a dedicated-UID process limit of 128 and three 10 MiB log files. Validate effective settings; do not claim unsupported cgroup pids, CPU quotas or seccomp enforcement. [Build and configuration](../../infra/nas-backup/README.md).

Enable append-only mode, private repositories and normal upload-integrity verification. A separate receiver credential named `chordviewer` authenticates to the `/chordviewer/` repository namespace. Store its bcrypt password verifier in an administrator-controlled file mounted read-only; neither its plaintext password nor the restic encryption password belongs in Compose, logs or source control. Private-repository mode also allows subrepositories under that namespace, so the existing 100 GB share quota remains the aggregate bound on live data; use a 90,000,000,000-byte server limit per repository. Existing NAS snapshots provide separate recovery protection. [Rest Server documentation](https://github.com/restic/rest-server).

Set `network_mode: none` and expose the receiver only through a Unix socket in a dedicated directory within the existing 100 GB backup-share quota. The container cannot initiate network connections to the NAS, LAN, tailnet or Internet. Mount only the dedicated repository and socket directory writable, and the password verifier read-only. Synology's Tailscale package account gets non-inheriting traversal on the share and permission to connect to the socket, with no listing, repository, credential or Docker-storage access. This requires no NAS firewall changes or Docker port publishing. [Unix listener implementation](https://github.com/restic/rest-server/blob/v0.14.0/cmd/rest-server/listener_unix.go), [Synology package identity](https://github.com/tailscale/tailscale/blob/v1.104.2/release/dist/synology/files/privilege-dsm7).

The private endpoint is `https://sherbannas.asymptote-harmonic.ts.net:8443/chordviewer/`. The existing NAS Tailscale daemon terminates TLS and proxies HTTP over the Unix socket, without Funnel exposure. Runtime verification confirmed this works with Tailscale 1.104.2 under Synology's package identity. The saved grant permits only `tag:chordviewer-backup` to `100.68.140.104` and `fd7a:115c:a1e0::c838:8c68` on TCP 8443. The VPS resolves the endpoint through two managed `/etc/hosts` entries; Tailscale DNS acceptance remains disabled and its existing resolver is preserved. Existing owner-device access remains unchanged. [Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve), [versioned Unix-target implementation](https://github.com/tailscale/tailscale/blob/v1.104.2/cmd/tailscale/cli/serve_v2.go).

The following acceptance work is complete as of 2026-10-31:

| Area | Verified result |
| --- | --- |
| Installation | Metadata diagnostics, pinned bundle checks, private credential generation and encrypted recovery export completed. The one-time DSM task remains disabled. |
| Receiver isolation | The dedicated UID can write the intended repository and socket mounts. Read-only configuration, resource limits, denied outbound networking and restricted package-user socket access passed before and after a receiver restart. |
| Backup behavior | A disposable encrypted workstation backup passed full data checks and checksum-matching restore. Invalid authentication and other namespaces were rejected, object overwrite/deletion were denied, and normal lock cleanup succeeded. |
| VPS transport | The approved TCP 8443 grant and hostname entries passed verified TLS over IPv4/IPv6, 33 denied TCP probes and saved policy assertions. Firewall, SSH, DNS settings and application container identities/start times remained unchanged; public application and administrator access passed. |

A NAS reboot requires its own agreed maintenance window. Receiver restart is verified; production credentials and an isolated application restore have passed, and the first nightly scheduled backup passed on 2026-11-01.

Append-only access still permits reads and new uploads, including filling the allowed space; lock cleanup is intentionally permitted. A compromised VPS holding the encryption key can read earlier backups. Keep deletion/retention authority and an independent recovery copy of the encryption key outside the VPS. The nightly timer is enabled; the first scheduled transfer passed at 02:03 Israel time on 2026-11-01, and NAS-only retention is installed and scheduled with verified safeguards. Delivered alerts are explicitly deferred, and full clean-host recovery remains a broader M8 gate.

### Backup schedule and recovery acceptance

Schedule a consistent PostgreSQL dump nightly and before each update. Encrypt completed bundles and transfer them to storage outside the VPS and Hostinger account, retaining every backup for at least 35 days and preserving the verified recovery baseline. NAS-only cleanup uses independent first-seen history and fails closed without recent verified backup and immutable snapshot protection. Separate deletion/retention authority from the VPS backup writer where the destination supports it. Alert on failed transfers and backups older than 26 hours. Keep decryption keys recoverable outside both the VPS and the backup writer's credentials.

A backup bundle includes the database dump, checksums, schema version, exact image identities or archives, and Compose/bootstrap configuration. Escrow required secrets and Android signing material separately. Copying a live database directory is not the backup procedure. Unsaved device-local drafts are not included. Hostinger snapshots are an additional pre-update aid; verify the purchased retention and restore behavior, and do not use a whole-server restore for a routine rehearsal because it overwrites the active server. [Hostinger backups](https://support.hostinger.com/en/articles/1583232-how-to-back-up-or-restore-a-vps).

Restore a bundle retrieved from the independent destination into a fresh isolated project and volume. Verify identities, scores, revisions, Library metadata and Trash, and sign in from both clients through an isolated HTTPS endpoint. Also prove that the runbook can rebuild the service on a clean host without files from the original VPS. Proposed recovery targets are no more than 24 hours of saved-data loss and restoration within four hours; measure both in the rehearsal and revise the targets if necessary.

Before an update, verify the backup and retain the previous release. Roll back images only when the database schema is compatible; otherwise restore the matching backup into a fresh volume and switch deliberately, accounting for subsequent writes. Never delete the active volume as part of an update. Verify restart policies and schedules after a server reboot.

Set up external HTTPS availability monitoring and alerts for certificate expiry, failed backups, low disk space, memory pressure, repeated container restarts and abnormal authentication failures. Keep logs bounded and redact passwords, tokens, cookies and score contents. Test an alert end to end. Record the operator's patch/reboot cadence and incident procedure: isolate access, preserve evidence, rotate compromised credentials, revoke sessions and restore a known-good release.

## Implementation order and completion evidence

| Stage | Completion evidence |
| --- | --- |
| 1. Preflight | Record the VPS, domain, approved cost, administrator/recovery access, backup destination and alert owner. |
| 2. Local release rehearsal | Pass production-configuration, enrollment, HTTPS cookie/bearer, proxy-spoofing, origin rejection, quota and account-isolation checks through the packaged gateway. |
| 3. Server installation | Record Debian/Docker versions, effective SSH settings, firewall rules, running services and external IPv4/IPv6 scans. Verify only the intended ports are reachable and repeat after reboot. |
| 4. Public deployment | Install the release with fresh secrets and data. Confirm browser and signed Android sign-in, create/save/reopen, Library, Practice, tutorial and MIDI from home and a separate remote network, with the PC backend stopped and no VPN. |
| 5. Failure and update checks | Verify network loss, local recovery, cross-device conflicts, session expiry/revocation, container replacement and server reboot. Confirm saved data and metadata survive; rehearse a compatible rollback. |
| 6. Recovery and handover | Restore an independent backup, demonstrate clean-host recovery, measure recovery time and resource use, and observe at least 24 hours of normal operation including a successful scheduled backup and delivered test alert. Publish the runbook and dated M8 verification record. |

M8 is complete only when the deployed service passes these gates. Include product tests for changed authentication, enrollment and proxy behavior, plus real browser/native acceptance. Development-only helpers retain runtime diagnostics without dedicated automated test suites. First deployment does not close the NAS backup, alert delivery, hardware/network acceptance or observation gates; use the dated verification record rather than treating this checklist as completed evidence.
