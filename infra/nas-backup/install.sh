#!/bin/sh
# One-time root installation. Run only after verifying the bundle manifest.
# No credentials are printed. On failure, stop only the receiver created here.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH
stage=/volume1/docker/chordviewer-backup-setup
private=/volume1/@chordviewer-backup
repository=/volume1/ChordViewerBackups/repositories
container=chordviewer-backup-receiver
image=chordviewer/rest-server:0.14.0-cv.20261031.2
ts=/var/packages/Tailscale/target/bin/tailscale
container_created=no
serve_attempted=no
success=no
fail() { echo "FAILED: $*" >&2; exit 1; }
cleanup() {
  code=$?
  if [ "$success" != yes ]; then
    if [ "$serve_attempted" = yes ]; then "$ts" serve --https=8443 off || true; fi
    if [ "$container_created" = yes ]; then docker stop "$container" || true; fi
    echo "Installation incomplete. Receiver stopped; files retained for diagnosis."
  fi
  exit "$code"
}
trap cleanup EXIT
[ "$(id -u)" = 0 ] || fail 'Root is required.'
[ "$#" = 1 ] || fail 'Expected the approved manifest SHA256.'
expected=$1
[ "${#expected}" = 64 ] || fail 'Invalid manifest digest.'
case "$expected" in *[!0-9a-f]*) fail 'Invalid manifest digest.';; esac
[ -d "$stage" ] && [ ! -L "$stage" ] || fail 'Invalid staging directory.'
cd "$stage"
[ "$(sha256sum SHA256SUMS | cut -d ' ' -f 1)" = "$expected" ] || fail 'Manifest differs from approved bundle.'
sha256sum -c SHA256SUMS
for f in install.sh verify.sh prepare-socket.sh compose.yaml Dockerfile .dockerignore entrypoint.sh rest-server cv-auth-init recovery-public.pem; do
  [ -f "$f" ] && [ ! -L "$f" ] || fail "Invalid bundle member: $f"
done
[ "$(id -u cv-backup)" = 1028 ] && [ "$(id -g cv-backup)" = 100 ] || fail 'Service identity changed.'
[ "$(id -G cv-backup)" = 100 ] || fail 'Service identity has extra groups.'
[ -d /volume1/ChordViewerBackups ] && [ ! -L /volume1/ChordViewerBackups ] || fail 'Backup share unavailable.'
[ ! -e "$private" ] && [ ! -L "$private" ] || fail 'Private setup directory already exists; manual review required.'
[ ! -e "$repository" ] && [ ! -L "$repository" ] || fail 'Repository directory already exists; manual review required.'
if docker inspect "$container" >/dev/null 2>&1; then fail 'Receiver container already exists.'; fi
if docker volume inspect chordviewer-backup-socket >/dev/null 2>&1; then fail 'Socket volume already exists.'; fi
[ "$(docker info --format '{{.MemoryLimit}} {{.SwapLimit}}')" = 'true true' ] || fail 'Required memory limits unavailable.'
[ "$(cat /sys/module/apparmor/parameters/enabled)" = Y ] || fail 'AppArmor unavailable.'
case "$(cat /sys/devices/system/cpu/online)" in 0|0-*) ;; *) fail 'CPU 0 is unavailable.';; esac
[ "$("$ts" serve status --json | tr -d '[:space:]')" = '{}' ] || fail 'Existing Serve configuration requires review.'
command -v curl >/dev/null || fail 'curl required for local socket validation.'
mkdir -m 0700 "$private"
for f in install.sh verify.sh prepare-socket.sh compose.yaml Dockerfile .dockerignore entrypoint.sh rest-server cv-auth-init recovery-public.pem SHA256SUMS; do
  cp "$f" "$private/$f"
done
cd "$private"
sha256sum -c SHA256SUMS
chmod 0500 install.sh verify.sh prepare-socket.sh rest-server cv-auth-init
chmod 0400 compose.yaml Dockerfile .dockerignore entrypoint.sh recovery-public.pem SHA256SUMS
docker compose -f compose.yaml config --quiet
docker build --network none --pull -f Dockerfile -t "$image" .
# Keep plaintext credentials outside all shares; export only RSA-OAEP ciphertext.
./cv-auth-init recovery-public.pem "$private" "$private/receiver-recovery.enc"
chown 1028:100 receiver.htpasswd
chmod 0400 receiver.htpasswd
mkdir -m 0700 "$repository"
chown 1028:100 "$repository"
./prepare-socket.sh
docker compose -f compose.yaml create
container_created=yes
docker compose -f compose.yaml start
./verify.sh local
socket_dir=/volume1/ChordViewerBackups/receiver-socket
serve_attempted=yes
"$ts" serve --bg --https=8443 "unix:$socket_dir/receiver.sock"
./verify.sh served
# Restart only this new receiver and verify the socket is recreated correctly.
docker restart "$container"
./verify.sh served
# The encrypted copy is safe to retrieve over the already authenticated SMB share.
[ ! -e "$stage/receiver-recovery.enc" ] && [ ! -L "$stage/receiver-recovery.enc" ] || fail 'Recovery export already exists.'
(set -C; cat "$private/receiver-recovery.enc" > "$stage/receiver-recovery.enc")
chmod 0644 "$stage/receiver-recovery.enc"
docker image inspect --format 'Installed image ID: {{.Id}}' "$image"
date -Iseconds > "$private/installed-at.txt"
success=yes
echo 'NAS RECEIVER INSTALLED. Workstation TLS, backup and restore acceptance still required.'
echo 'No Tailscale access grant or VPS backup schedule was changed.'
