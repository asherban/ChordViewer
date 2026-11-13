#!/bin/sh
# Read-only runtime validation; emits no credential values or hashes.
set -eu
container=chordviewer-backup-receiver
ts=/var/packages/Tailscale/target/bin/tailscale
fail() { echo "FAILED: $*" >&2; exit 1; }
inspect() { docker inspect --format "$1" "$container"; }
[ "$(inspect '{{.Config.User}} {{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Privileged}}')" = '1028:100 none true false' ] || fail 'Identity or isolation differs.'
[ "$(inspect '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpusetCpus}}')" = '536870912 536870912 0' ] || fail 'Memory or CPU binding differs.'
[ "$(inspect '{{.AppArmorProfile}}')" = docker-default ] || fail 'AppArmor profile is not active.'
[ "$(inspect '{{json .HostConfig.CapDrop}}')" = '["ALL"]' ] || fail 'Capabilities not dropped.'
case "$(inspect '{{json .HostConfig.SecurityOpt}}')" in *no-new-privileges:true*) ;; *) fail 'Privilege escalation not blocked.';; esac
[ "$(inspect '{{len .HostConfig.PortBindings}} {{len .HostConfig.Devices}} {{len .Mounts}}')" = '0 0 3' ] || fail 'Unexpected port, device or mount.'
[ "$(inspect '{{.HostConfig.RestartPolicy.Name}}')" = unless-stopped ] || fail 'Restart policy differs.'
mounts=$(inspect '{{range .Mounts}}{{.Destination}} {{.RW}} {{.Source}}{{println}}{{end}}')
printf '%s\n' "$mounts" | grep -Fx '/data true /volume1/ChordViewerBackups/repositories' >/dev/null || fail 'Unexpected repository mount.'
printf '%s\n' "$mounts" | grep -Fx '/run/secrets/receiver.htpasswd false /volume1/@chordviewer-backup/receiver.htpasswd' >/dev/null || fail 'Unexpected authentication mount.'
socket_dir=/volume1/ChordViewerBackups/receiver-socket
printf '%s\n' "$mounts" | grep -Fx "/run/receiver true $socket_dir" >/dev/null || fail 'Unexpected socket mount.'
[ "$(id -u tailscale):$(id -g tailscale)" = 165290:165290 ] || fail 'Tailscale identity changed.'
[ "$(stat -c '%u:%g:%a' "$socket_dir")" = '1028:165290:2710' ] || fail 'Socket directory permissions differ.'
attempt=0
while [ "$attempt" -lt 30 ]; do
  if [ -S "$socket_dir/receiver.sock" ]; then
    code=$(curl --silent --show-error --max-time 3 --unix-socket "$socket_dir/receiver.sock" -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || true)
    [ "$code" != 401 ] || break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$attempt" -lt 30 ] || fail 'Socket did not return required HTTP 401.'
[ "$(stat -c '%u:%g:%a' "$socket_dir/receiver.sock")" = '1028:165290:770' ] || fail 'Socket ownership or mode differs.'
package_code=$(sudo -n -u tailscale curl --silent --show-error --max-time 5 --unix-socket "$socket_dir/receiver.sock" -o /dev/null -w '%{http_code}' http://localhost/)
[ "$package_code" = 401 ] || fail 'Tailscale identity cannot reach the socket.'
sudo -n -u tailscale /bin/sh -ec '
  test -x /volume1/ChordViewerBackups
  test ! -r /volume1/ChordViewerBackups
  test ! -w /volume1/ChordViewerBackups
  test ! -r /volume1/ChordViewerBackups/receiver-socket
  test ! -w /volume1/ChordViewerBackups/receiver-socket
  test ! -x /volume1/ChordViewerBackups/repositories
  test ! -r /volume1/@chordviewer-backup/receiver.htpasswd
  test ! -x /volume1/@docker
' || fail 'Tailscale filesystem access exceeds the socket-only grant.'
docker exec "$container" /bin/sh -ec '
  require() { label=$1; shift; "$@" || { echo "FAILED runtime check: $label" >&2; exit 1; }; }
  require identity test "$(id -u):$(id -g)" = 1028:100
  require repository-writable test -w /data
  require authentication-readable test -r /run/secrets/receiver.htpasswd
  require authentication-readonly test ! -w /run/secrets/receiver.htpasswd
  require root-readonly test ! -w /
  require executable-readonly test ! -w /usr/local/bin/rest-server
  require no-docker-socket test ! -e /var/run/docker.sock
  # Synology creates an unconfigured, DOWN sit0 tunnel even with network none.
  for interface in /sys/class/net/*; do
    case "${interface##*/}" in
      lo) ;;
      sit0) require inactive-default-tunnel test "$(cat "$interface/operstate")" = down ;;
      *) echo "FAILED runtime check: unexpected network interface" >&2; exit 1 ;;
    esac
  done
  require no-ipv4-routes test -z "$(ip route show)"
  require no-ipv6-routes test -z "$(ip -6 route show)"
  if nc -z -w 2 192.168.1.202 5001; then echo "FAILED runtime check: NAS administration reachable" >&2; exit 1; fi
  require nproc-limit test "$(ulimit -u)" = 128
  require nofile-limit test "$(ulimit -n)" = 1024
  require no-effective-capabilities grep -Eq "^CapEff:[[:space:]]+0+$" /proc/1/status
  # Linux 4.4 implements PR_GET_NO_NEW_PRIVS but lacks /proc status NoNewPrivs.
  # This kernel lacks the ambient-capability query. Require the independently
  # returned no_new_privs value even when that later, unrelated query fails.
  privileges=$(/bin/busybox setpriv --dump 2>/dev/null || true)
  printf "%s\n" "$privileges"
  printf "%s\n" "$privileges" | grep -Fx "no_new_privs: 1" >/dev/null || { echo "FAILED runtime check: no-new-privileges" >&2; exit 1; }
  require memory-cgroup test "$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)" = 536870912
  require cpu-affinity grep -Eq "^Cpus_allowed_list:[[:space:]]+0$" /proc/1/status
'
echo 'Verified: non-root, network none, read-only root/auth, three allowed mounts, AppArmor, no capabilities, no-new-privileges, memory/CPU/ulimit bounds, HTTP 401.'
if [ "${1:-local}" = served ]; then
  status=$("$ts" serve status --json)
  printf '%s\n' "$status" | grep -F "unix:$socket_dir/receiver.sock" >/dev/null || fail 'Serve target differs.'
  printf '%s\n' "$status" | grep '"8443"' >/dev/null || fail 'Serve port differs.'
  printf '%s\n' "$status" | grep '"AllowFunnel"' >/dev/null && fail 'Unexpected Funnel configuration.'
  "$ts" serve status
fi
