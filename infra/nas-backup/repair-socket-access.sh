#!/bin/sh
# One-time migration from the inaccessible Docker-owned tmpfs socket.
# Reuses the existing image binary, authentication and repository data.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH
stage=/volume1/docker/chordviewer-backup-socket-fix
private=/volume1/@chordviewer-backup
share=/volume1/ChordViewerBackups
socket_dir=$share/receiver-socket
container=chordviewer-backup-receiver
ts=/var/packages/Tailscale/target/bin/tailscale
acl=/usr/syno/bin/synoacltool
image=chordviewer/rest-server:0.14.0-cv.20261031.2
changed=no
success=no
fail() { echo "FAILED: $*" >&2; exit 1; }
cleanup() {
  code=$?
  if [ "$success" != yes ] && [ "$changed" = yes ]; then
    "$ts" serve --https=8443 off || true
    docker stop "$container" || true
    # Remove only the exact traversal grant introduced by this migration.
    entry=$("$acl" -get "$share" | sed -n 's/.*\[\([0-9][0-9]*\)\] user:tailscale:allow:--x----------:----.*/\1/p')
    case "$entry" in
      '') ;;
      *[!0-9]*) echo 'ACL rollback requires review: ambiguous entry.' ;;
      *) "$acl" -del "$share" "$entry" || true ;;
    esac
    echo 'Repair incomplete; receiver stopped and its Serve listener disabled. Existing credentials and data retained.'
  fi
  exit "$code"
}
trap cleanup EXIT
[ "$(id -u)" = 0 ] || fail 'Root required.'
[ "$#" = 1 ] || fail 'Expected manifest digest.'
expected=$1
[ "${#expected}" = 64 ] || fail 'Invalid manifest digest.'
case "$expected" in *[!0-9a-f]*) fail 'Invalid digest.';; esac
[ -d "$stage" ] && [ ! -L "$stage" ] || fail 'Invalid staging directory.'
cd "$stage"
[ "$(sha256sum SHA256SUMS | cut -d ' ' -f 1)" = "$expected" ] || fail 'Manifest mismatch.'
sha256sum -c SHA256SUMS
for file in repair-socket-access.sh prepare-socket.sh verify.sh compose.yaml Dockerfile .dockerignore entrypoint.sh rest-server; do
  [ -f "$file" ] && [ ! -L "$file" ] || fail "Invalid bundle member: $file"
done
[ "$(stat -c '%u:%g:%a' "$private")" = '0:0:700' ] && [ ! -L "$private" ] || fail 'Private config permissions differ.'
[ "$(id -u tailscale):$(id -g tailscale)" = 165290:165290 ] || fail 'Package identity differs.'
[ -f "$private/client.json" ] && [ -f "$private/receiver.htpasswd" ] || fail 'Existing authentication unavailable.'
[ ! -e "$socket_dir" ] && [ ! -L "$socket_dir" ] || fail 'New socket path exists.'
[ ! -e "$private/socket-fix-build" ] || fail 'Repair build directory exists.'
cmp "$stage/rest-server" "$private/rest-server" || fail 'Receiver binary changed unexpectedly.'
old_socket=$(docker volume inspect --format '{{.Mountpoint}}' chordviewer-backup-socket)/receiver.sock
"$ts" serve status --json | grep -F "unix:$old_socket" >/dev/null || fail 'Unexpected existing Serve target.'
mkdir -m 0700 "$private/socket-fix-build"
for file in repair-socket-access.sh prepare-socket.sh verify.sh compose.yaml Dockerfile .dockerignore entrypoint.sh rest-server SHA256SUMS; do
  cp "$stage/$file" "$private/socket-fix-build/$file"
done
cd "$private/socket-fix-build"
sha256sum -c SHA256SUMS
docker compose -f compose.yaml config --quiet
docker build --network none --pull -t "$image" .
# Keep the previous configuration for recovery, without copying credentials.
for file in compose.yaml verify.sh Dockerfile entrypoint.sh; do cp "$private/$file" "$private/$file.before-socket-fix"; done
changed=yes
"$ts" serve --https=8443 off
docker stop "$container"
/bin/sh ./prepare-socket.sh
for file in compose.yaml verify.sh prepare-socket.sh Dockerfile .dockerignore entrypoint.sh; do cp "$file" "$private/$file"; done
chmod 0500 "$private/verify.sh" "$private/prepare-socket.sh"
chmod 0400 "$private/compose.yaml" "$private/Dockerfile" "$private/.dockerignore" "$private/entrypoint.sh"
docker compose -f "$private/compose.yaml" up -d --no-build --force-recreate receiver
"$private/verify.sh" local
"$ts" serve --bg --https=8443 "unix:$socket_dir/receiver.sock"
"$private/verify.sh" served
docker restart "$container"
"$private/verify.sh" served
docker image inspect --format 'Installed image ID: {{.Id}}' "$image"
date -Iseconds > "$private/socket-fix-completed-at.txt"
success=yes
echo 'SOCKET ACCESS FIXED. Package-user access and receiver restart verified; workstation HTTPS and restore checks remain.'
echo 'No credential regeneration, VPS access grant, repository deletion or Docker-storage permission change.'
