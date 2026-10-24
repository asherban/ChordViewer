# ChordViewer first-release operations

The canonical application is `https://chordviewer.app`. The Hostinger server is `187.124.165.121` (`srv1490417`), Debian 13, amd64, 2 CPUs, about 8 GB RAM and 100 GB disk. The web gateway is public on TCP 80/443; API and PostgreSQL are private container services. Cloudflare is DNS-only. Do not enable its proxy without revisiting verified client-IP handling.

## Access and recovery

Connect with `ssh asherban@187.124.165.121` from the approved administrator IPv4 address. The administrator account and primary group were renamed from `andre` to `asherban` at the owner's request; the home is `/home/asherban`. UID/GID 1000, the SSH key and the sudo password were preserved. SSH requires this workstation's existing key; root login, password login and keyboard-interactive login are disabled. `sudo` requires the separate operator password. Private workstation files are in `.local/deployment`, excluded from Git and restricted by Windows ACLs. Copy passwords, the Android signing key and recovery material to the owner's password manager/secure backup.

The host firewall allows SSH from `46.116.98.192/32` only. When this ISP address changes, use the confirmed Hostinger recovery console to edit `/etc/chordviewer-firewall.conf` and run `systemctl restart chordviewer-firewall`. Keep a working session during changes and prove a new key login plus sudo before disconnecting. The provider-managed firewall is an additional pending control; do not claim it is configured from the host rules alone.

`/usr/local/sbin/chordviewer-firewall` handles both IP families and Docker's `DOCKER-USER` forwarding chain. Its systemd unit runs at boot and with Docker. No AAAA record is published. Unattended Debian updates are enabled, automatic reboots are operator-controlled, and journald/container logs are bounded.

## Layout and routine checks

Release files live under `/srv/chordviewer/releases/<release-id>`; `/srv/chordviewer/current` selects the active bundle. Root-only configuration is `/srv/chordviewer/config/release.env`. The environment records immutable image IDs, independent database/authentication/gateway secrets, and the canonical hostname. Never paste `docker compose config`, environment values, passwords, tokens or cookies into shared logs.

Installed wrapper commands:

```sh
sudo chordviewer ps
sudo chordviewer logs --tail 50 api gateway
sudo chordviewer exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(async r=>{console.log(r.status);process.exit(r.ok?0:1)})"
sudo systemctl status chordviewer-firewall unattended-upgrades
df -h /srv/chordviewer
```

Public `/health` is deliberately unavailable. A public availability check should verify the login page and an unauthenticated `/api/v1/me` response of 401, without using an administrator session.

## Accounts

Verify an approved person's identity through an established private channel. Prepare a mode-0600 JSON file with `action`, `email`, `password` and, for creation, `name`. Passwords must be 12–128 characters. Run `sudo -v` interactively first, then:

```sh
sudo chordviewer run --rm -T operator < private-account.json
```

`action` is `create` or `reset`. The deployment admits at most 100 accounts; each account is limited to 100 sheets including Trash. Reset revokes all browser/native sessions. Hand off credentials privately and remove the temporary JSON when no longer needed. No self-service email recovery, verification or public signup is enabled. The operator's email address is not proof of ownership for other users.

## Build and publish an update

Use Node 24/npm 11 for repository checks and Docker's amd64 target for all three images. Build `infra/backend/Dockerfile`, `infra/release/Dockerfile.gateway` and `infra/release/Dockerfile.database` with a new release tag. Review dependency and image scans. Caddy 2.11.7 is compiled with patched Go 1.27.3 and `x/net` 0.60.0 because its published base image predates those fixes. Debian/Alpine package updates are applied during the relevant image builds; the finished image IDs are the release authority.

Create an isolated `chordviewer-release-test` project using the release Compose file with independent secrets, `TLS_MODE=internal`, `HTTP_BIND=127.0.0.1`, ports 8080/8443, and a private downloads directory. Start the database, run `migrate`, then start API/gateway. Copy `/data/caddy/pki/authorities/local/root.crt` from its gateway to `.local/deployment/rehearsal-root.crt` and run:

```sh
node --test tests/api/release.test.mjs
```

This suite uses strict TLS verification, disposable accounts, cookie/bearer flows, account isolation, metadata/Trash, session reset, header spoofing and container replacement. It is intentionally fixed to the isolated local project. Never repoint it at production.

Save the three images with `docker image save -o release-images.tar ...`, generate SHA-256 checksums, and transfer the bundle over the verified SSH connection. On the server, verify checksums, `sudo docker image load -i release-images.tar`, and confirm each immutable ID exists. Preserve the previous release and environment file before changing the active bundle.

Before every update run `sudo chordviewer-backup`. Set the tested image IDs in the protected environment, select the new release directory, run `sudo chordviewer run --rm -T migrate`, then `sudo chordviewer up -d --wait`. Verify public TLS, sign-in and save/reopen. A failed migration blocks application startup; it never resets stored data. The API uses the restricted runtime role; migrations and operator actions use the separate owner role.

For a compatible rollback, restore the previous bundle and its image IDs, then run `up -d --wait`. Do not roll back across incompatible schema changes; restore the matching dump into a fresh isolated volume and switch deliberately. Never run `down -v` against the production project.

## Android

The reviewed origin is `apps/android/production-api-origin.txt`. Release packaging requires `CHORDVIEWER_KEYSTORE`, `CHORDVIEWER_STORE_PASSWORD` and `CHORDVIEWER_KEY_PASSWORD`, with alias `chordviewer`. Use JDK 21 and SDK 35. Run `:app:assembleRelease`, verify the APK with `apksigner verify --verbose --print-certs`, record its SHA-256, and copy it into `/srv/chordviewer/downloads`. Preserve the signing key off-server and increment `versionCode` for each update. Future updates must use the same key.

An authenticated browser can download the APK under `/downloads/`; anonymous requests are rejected. The first release has no earlier signed production APK against which to prove an upgrade. App-store publication remains deferred.

## Backups, alerts and remaining M8 gates

`sudo chordviewer-backup` creates a consistent custom-format PostgreSQL dump with the matching configuration and checksums under root-only `/srv/chordviewer/backups/<UTC timestamp>`. This local bundle contains secrets. Transfer and encrypt it privately before putting it on independent storage. It is a recovery copy, not a completed off-site backup strategy.

The next agreed step is Synology NAS access over Tailscale, encrypted scheduled transfer, retention and a restore rehearsal. Email alerts should reach `andrei.sherban@gmail.com`, but an alert address alone does not configure delivery. External monitoring, delivered test alerts, backup-age checks, independent restore/clean-host recovery, real-device MIDI/tutorial acceptance, a separate remote network and 24-hour observation remain M8 completion gates. See the [dated verification record](first-deploy-2026-10-24.md) for what has actually passed.

For a suspected compromise, use the provider console to isolate access, preserve logs and images, revoke sessions, rotate affected credentials, and rebuild from a verified release/backup. Rotating the auth secret invalidates existing sessions. Rotate database role passwords and environment entries together, then recreate containers; changing an initialization variable alone does not change an existing PostgreSQL role password.
