#!/bin/sh
# Called as root only after the approved install/repair bundle is verified.
# Grant the Tailscale package traversal to this share and connection to this
# socket, without share listing, repository access or Docker-storage access.
set -eu
share=/volume1/ChordViewerBackups
socket_dir=$share/receiver-socket
private=/volume1/@chordviewer-backup
acl=/usr/syno/bin/synoacltool
fail() { echo "FAILED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail 'Root is required.'
[ "$(id -u tailscale):$(id -g tailscale)" = 165290:165290 ] || fail 'Tailscale package identity changed.'
[ "$(id -u cv-backup):$(id -g cv-backup)" = 1028:100 ] || fail 'Receiver identity changed.'
[ -d "$share" ] && [ ! -L "$share" ] || fail 'Unexpected backup share.'
case "${1:-new}" in
  new) [ ! -e "$socket_dir" ] && [ ! -L "$socket_dir" ] || fail 'Socket directory exists; review before changing it.' ;;
  resume-empty)
    [ -d "$socket_dir" ] && [ ! -L "$socket_dir" ] || fail 'Expected the empty directory from the interrupted repair.'
    [ "$(stat -c '%u:%g:%a' "$socket_dir")" = '0:0:700' ] || fail 'Interrupted directory ownership or mode differs.'
    [ -z "$(find "$socket_dir" -mindepth 1 -maxdepth 1 -print)" ] || fail 'Interrupted directory is not empty.'
    ;;
  *) fail 'Unexpected preparation mode.' ;;
esac
command -v sudo >/dev/null || fail 'sudo is needed to verify package-user permissions.'
sudo -n -u tailscale /bin/sh -ec 'test ! -x /volume1/@docker' || fail 'Tailscale already has unexpected Docker-storage access.'
"$acl" -get "$share" > "$private/backup-share-acl-before-socket.txt"
if grep -F 'user:tailscale:' "$private/backup-share-acl-before-socket.txt" >/dev/null; then fail 'Existing Tailscale ACL needs review.'; fi
if [ "${1:-new}" = new ]; then mkdir -m 0700 "$socket_dir"; fi
# A restrictive mkdir can produce a plain POSIX directory on Synology; deleting
# nonexistent Synology ACL metadata fails. Set the intended ownership/mode
# directly, then require the effective package-user permissions below.
chown 1028:165290 "$socket_dir"
chmod 2710 "$socket_dir"
[ "$(stat -c '%u:%g:%a' "$socket_dir")" = '1028:165290:2710' ] || fail 'Unable to establish socket directory permissions.'
"$acl" -add "$share" 'user:tailscale:allow:--x----------:----'
"$acl" -get "$share" > "$private/backup-share-acl-after-socket.txt"
grep -F 'user:tailscale:allow:--x----------:----' "$private/backup-share-acl-after-socket.txt" >/dev/null || fail 'Unexpected traversal grant.'
sudo -n -u tailscale /bin/sh -ec '
  test -x /volume1/ChordViewerBackups
  test ! -r /volume1/ChordViewerBackups
  test ! -w /volume1/ChordViewerBackups
  test -x /volume1/ChordViewerBackups/receiver-socket
  test ! -r /volume1/ChordViewerBackups/receiver-socket
  test ! -w /volume1/ChordViewerBackups/receiver-socket
  test ! -x /volume1/ChordViewerBackups/repositories
  test ! -x /volume1/@docker
' || fail 'Socket-only filesystem permissions did not validate.'
echo 'Prepared socket directory within the backup-share quota; Tailscale has traversal only.'
