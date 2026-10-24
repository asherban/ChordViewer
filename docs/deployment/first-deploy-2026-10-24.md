# First public deployment — 2026-10-24

The first release is live at [chordviewer.app](https://chordviewer.app) on Hostinger VPS `187.124.165.121`. Browser and signed Android access passed against the public HTTPS service with the local application stopped. This establishes a working first deployment; the operational and hardware gates below remain open for M8.

## Release identity

Active bundle: `/srv/chordviewer/releases/m8-20261024-2`, selected by `/srv/chordviewer/current`. The protected environment is `/srv/chordviewer/config/release.env`. The bundle's manifest and SHA-256 file inventory were verified on the VPS after transfer.

| Component | Immutable identity |
| --- | --- |
| API | `sha256:ec2580dc655f0493f6d994b4f140253bb53bd03a1618f8bec776f0a3db6850bd` |
| Gateway/web | `sha256:a965b2b45a7f48c46a0555be2e0da7cc74fcffc31f0d8b4e5e3e7fe96efd4cf8` |
| PostgreSQL | `sha256:29e96fba432acad0fd3b181d00b27efa43f33d8c1841260fba5868684af1e811` |
| Android APK 0.2.0, version code 2 | SHA-256 `54ec5c877c6047fb994e568a08de857acd255836b8c21d45d1116575d16bca10` |
| Android signing certificate | SHA-256 `bb8aa021f5789f8732d270154b4ce4a19bfb0dbde0461873c8e208e88cead209` |

The second bundle contains API/gateway images and retains the unchanged database image from `m8-20261024-1`. Preserve both archives for clean-host recovery. The first gateway build exposed a runtime Ajv compilation conflict with CSP; the final build uses shared static validators under [ADR 0017](../ADRs/0017-compile-score-validators-at-build-time.md). The earlier gateway is not an accepted working web release.

## Product checks

| Check | Evidence |
| --- | --- |
| Repository checks | `npm run check`: lint, 505 product unit tests and contracts/API/web builds passed. |
| Android build | 152 unit tests passed; signed release APK built and verified; release checks reject development origins, debugging and cleartext traffic. |
| Packaged HTTPS rehearsal | All three `tests/api/release.test.mjs` tests passed: authentication/persistence/security flow, 100-account admission bound and browser startup under CSP. |
| Authentication boundaries | Real Secure/HttpOnly/SameSite cookie and signed bearer sessions passed; raw tokens, wrong origins, signup, gateway bypass and spoofed IP rate-limit evasion were rejected. Password reset revoked browser/native sessions. |
| Persistence/isolation | Save/reopen, another account's denial, revision conflict, favorites/Draft/Trash/restore and container replacement passed in the disposable release project. |
| Public Chrome | Sign-in, example creation, title/tutorial save, Library reopen, Practice notation, reload and sign-out passed with zero page errors. |
| Public Android | Signed APK installed in the tablet emulator; sign-in, restored session after process restart, shared Library, native Practice notation and native title save passed. A fresh browser session reopened Android's saved revision 3. |
| APK distribution | Anonymous download returned 401. Authenticated download returned the exact signed APK checksum above. |
| VPS reboot | Boot identity changed; API/database/gateway automatically became healthy. IPv4/IPv6 host filtering and Docker forwarding rules returned. The pre-reboot signed session reopened the saved score afterward. |

Chrome and Android used public DNS and platform certificate trust, without certificate exceptions. The local release rehearsal separately trusted its isolated Caddy CA. The rehearsal containers were stopped before public acceptance. The temporary production verification account and its sheets were removed after acceptance; the owner's account starts with an empty library.

The browser loaded the configured YouTube iframe and Android loaded the embedded player controls. Actual audio/video playback and physical MIDI were not acceptance-tested in this deployment. The emulator and browser used this workstation's network; this is not separate-network or physical-tablet evidence.

## Host and HTTPS checks

The existing Debian 13.7 host was patched and rebooted to kernel `6.12.113+deb13-amd64`. Named administrator `andre` uses the workstation's existing key and password-protected sudo. Fresh key login and sudo succeeded before disabling root, password and keyboard-interactive SSH. Root SSH was rejected afterward. The owner explicitly approved these changes and confirmed recovery access.

After deployment, the owner requested renaming the administrator to `asherban`. The account, primary group, home directory (`/home/asherban`), SSH allowlist and subordinate-ID allocations were updated, preserving UID/GID 1000, the authorized key and sudo password. Fresh SSH and password-protected sudo succeeded, the old `andre` login was rejected, and application checks passed after the brief API restart required to release the shared numeric UID. Automatic rollback protection was cancelled after independent access verification. The [runbook](runbook.md) uses the current name.

The host permits SSH only from administrator IPv4 `46.116.98.192/32`; public application ingress is TCP 80/443. API/database ports are unpublished. Both host IP families and Docker forwarding have explicit filtering. From the administrator workstation, 22/80/443 were reachable, while 3000/5432/2019/2375/8080/8443 timed out. This is a targeted IPv4 probe, not a complete independent port scan. No AAAA record is published.

Root, `www` and `api` A records point directly to the VPS. `www` redirects to the root origin with the path preserved. The API alias responds only to API paths. HTTP redirects to HTTPS. Let's Encrypt certificate verification passed; the root certificate observed expires on 2027-01-22 at 16:25:35 UTC. Certificate state persists across gateway replacement and host reboot. Public health and unauthenticated downloads are unavailable; public signup returns 403.

API and gateway run as non-root with read-only filesystems and dropped capabilities. PostgreSQL's running process uses UID/GID 999. Runtime SQL privileges cannot create accounts or change credential rows. Docker access is absent from application containers. Automatic Debian security updates and bounded host/container logging are enabled; reboots remain operator-controlled.

After functional testing, memory use was approximately 54 MiB API, 22 MiB gateway and 39 MiB PostgreSQL, within configured limits. The 99 GiB filesystem had about 3.9 GiB used and 91 GiB available. These idle/test measurements are not a load or capacity guarantee. See the [security review](security-review-2026-10-24.md) for dependency fixes and remaining upstream image findings.

## Handover and remaining gates

The owner account is `andrei.sherban@gmail.com`. Its generated password, separate sudo password, Android signing key and release secrets are in the workstation's ignored `.local/deployment` directory with restricted Windows ACLs. No password, private key, token or server environment file is committed. Preserve this recovery material privately off the workstation. [Operations and account administration](runbook.md) describe the installed commands.

Manual consistent PostgreSQL recovery copies were taken before updates and the final reboot, including `/srv/chordviewer/backups/20261024T174420Z`. The root-only bundle includes the dump, matching configuration and checksums. The final clean-account copy is `/srv/chordviewer/backups/20261024T174759Z`; the owner's credentials were verified and its empty library confirmed before this copy. These copies remain on the VPS and do not establish independent recovery.

M8 still requires:

- Synology connectivity through Tailscale, encrypted scheduled backup transfer, retention, backup-age monitoring and independent restore/clean-host recovery.
- External monitoring and a delivered failure/test alert to `andrei.sherban@gmail.com`.
- Hostinger managed-firewall verification and independent IPv4/IPv6 exposure testing.
- Physical tablet/piano MIDI, actual tutorial playback and a separate client network. There is no earlier production APK with the same key for an upgrade rehearsal.
- At least 24 hours of observation with a successful scheduled backup and delivered alert; provider region, billing and recovery details recorded by the owner.

These remaining gates are tracked in the [M8 plan](../architecture/m8-execution-plan.md). First deployment does not mark the full milestone complete.
