#!/bin/sh
# Resume only the known interruption at ACL removal on the new empty directory.
# Preserve existing credentials, data, old config and the already-built image.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH
stage=/volume1/docker/chordviewer-backup-socket-resume
private=/volume1/@chordviewer-backup
share=/volume1/ChordViewerBackups
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
    entry=$("$acl" -get "$share" | sed -n 's/.*\[\([0-9][0-9]*\)\] user:tailscale:allow:--x----------:----.*/\1/p')
    case "$entry" in
      '') ;;
      *[!0-9]*) echo 'ACL rollback requires review: ambiguous entry.' ;;
      *) "$acl" -del "$share" "$entry" || true ;;
    esac
    echo 'Resume incomplete; receiver stopped and backup Serve listener disabled. Credentials/data retained.'
  fi
  exit "$code"
}
trap cleanup EXIT
[ "$(id -u)" = 0 ] || fail 'Root required.'
[ "$#" = 1 ] || fail 'Expected manifest digest.'
expected=$1
[ "${#expected}" = 64 ] || fail 'Invalid digest.'
case "$expected" in *[!0-9a-f]*) fail 'Invalid digest.';; esac
[ -d "$stage" ] && [ ! -L "$stage" ] || fail 'Invalid staging directory.'
cd "$stage"
[ "$(sha256sum SHA256SUMS | cut -d ' ' -f 1)" = "$expected" ] || fail 'Manifest differs.'
sha256sum -c SHA256SUMS
for file in resume-socket-access.sh prepare-socket.sh verify.sh compose.yaml Dockerfile .dockerignore entrypoint.sh; do
  [ -f "$file" ] && [ ! -L "$file" ] || fail "Invalid bundle member: $file"
done
[ "$(stat -c '%u:%g:%a' "$private")" = '0:0:700' ] && [ ! -L "$private" ] || fail 'Private config differs.'
[ -f "$private/client.json" ] && [ -f "$private/receiver.htpasswd" ] || fail 'Existing authentication unavailable.'
[ "$(docker inspect --format '{{.State.Running}} {{.Config.User}} {{.HostConfig.NetworkMode}}' "$container")" = 'false 1028:100 none' ] || fail 'Receiver state differs from the interrupted repair.'
cmp "$private/compose.yaml" "$private/compose.yaml.before-socket-fix" || fail 'Existing Compose configuration changed.'
[ "$("$ts" serve status --json | tr -d '[:space:]')" = '{}' ] || fail 'Unexpected Serve configuration; review before resuming.'
[ ! -e "$private/socket-resume-build" ] || fail 'Resume build directory already exists.'
mkdir -m 0700 "$private/socket-resume-build"
for file in resume-socket-access.sh prepare-socket.sh verify.sh compose.yaml Dockerfile .dockerignore entrypoint.sh SHA256SUMS; do
  cp "$file" "$private/socket-resume-build/$file"
done
cd "$private/socket-resume-build"
sha256sum -c SHA256SUMS
docker compose -f compose.yaml config --quiet
echo 'Verify the already-built image contains the approved wrapper and unchanged receiver binary.'
image_wrapper=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 1028:100 --entrypoint sha256sum "$image" /usr/local/bin/receiver-entrypoint | cut -d ' ' -f 1)
[ "$image_wrapper" = "$(sha256sum entrypoint.sh | cut -d ' ' -f 1)" ] || fail 'Image wrapper differs.'
image_binary=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 1028:100 --entrypoint sha256sum "$image" /usr/local/bin/rest-server | cut -d ' ' -f 1)
[ "$image_binary" = "$(sha256sum "$private/rest-server" | cut -d ' ' -f 1)" ] || fail 'Image binary differs.'
echo 'Prepare and verify socket-only filesystem access.'
changed=yes
/bin/sh ./prepare-socket.sh resume-empty
echo 'Activate the approved receiver mount and wrapper.'
for file in compose.yaml verify.sh prepare-socket.sh Dockerfile .dockerignore entrypoint.sh; do cp "$file" "$private/$file"; done
chmod 0500 "$private/verify.sh" "$private/prepare-socket.sh"
chmod 0400 "$private/compose.yaml" "$private/Dockerfile" "$private/.dockerignore" "$private/entrypoint.sh"
docker compose -f "$private/compose.yaml" up -d --no-build --force-recreate receiver
"$private/verify.sh" local
"$ts" serve --bg --https=8443 "unix:$share/receiver-socket/receiver.sock"
"$private/verify.sh" served
docker restart "$container"
"$private/verify.sh" served
docker image inspect --format 'Installed image ID: {{.Id}}' "$image"
date -Iseconds > "$private/socket-fix-completed-at.txt"
success=yes
echo 'SOCKET ACCESS FIXED. Package-user access and receiver restart verified; workstation HTTPS and restore checks remain.'
echo 'No credential regeneration, VPS access grant, repository deletion or Docker-storage permission change.'
