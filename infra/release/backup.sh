#!/bin/sh
# A consistent local recovery copy. Off-site encryption/transfer is a separate gate.
set -eu
if [ "$(id -u)" -ne 0 ]; then echo 'Run with sudo.' >&2; exit 1; fi
umask 077
destination=/srv/chordviewer/backups/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$destination"
/usr/local/sbin/chordviewer exec -T database pg_dump -U postgres -d chordviewer -Fc > "$destination/database.dump.partial"
test -s "$destination/database.dump.partial"
mv "$destination/database.dump.partial" "$destination/database.dump"
cp /srv/chordviewer/config/release.env "$destination/release.env"
cp /srv/chordviewer/current/compose.yaml /srv/chordviewer/current/initialize-database.sh /srv/chordviewer/current/tls-public.caddy "$destination/"
cd "$destination"
sha256sum database.dump release.env compose.yaml initialize-database.sh tls-public.caddy > SHA256SUMS
echo "Local recovery copy: $destination. Transfer it privately off-host; this is not an off-site backup."
