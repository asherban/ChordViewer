#!/bin/sh
# Install as /usr/local/sbin/chordviewer-firewall; root-owned mode 0755.
set -eu
. /etc/chordviewer-firewall.conf
case "$ADMIN_IPV4" in *[!0-9./]*|'') echo 'Invalid administrator IPv4 CIDR' >&2; exit 1;; esac
case "$PUBLIC_INTERFACE" in *[!a-zA-Z0-9_-]*|'') echo 'Invalid public interface' >&2; exit 1;; esac
for tool in iptables ip6tables; do
  "$tool" -w -N CV-INPUT 2>/dev/null || true
  "$tool" -w -F CV-INPUT
  "$tool" -w -A CV-INPUT -i lo -j ACCEPT
  "$tool" -w -A CV-INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  if [ "$tool" = iptables ]; then
    "$tool" -w -A CV-INPUT -p icmp -j ACCEPT
    "$tool" -w -A CV-INPUT -p tcp -s "$ADMIN_IPV4" --dport 22 -j ACCEPT
  else
    "$tool" -w -A CV-INPUT -p ipv6-icmp -j ACCEPT
  fi
  "$tool" -w -A CV-INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
  "$tool" -w -A CV-INPUT -j DROP
  "$tool" -w -C INPUT -j CV-INPUT 2>/dev/null || "$tool" -w -I INPUT 1 -j CV-INPUT

  # Docker's published ports traverse FORWARD after DNAT. Match original ports.
  "$tool" -w -N DOCKER-USER 2>/dev/null || true
  "$tool" -w -C FORWARD -j DOCKER-USER 2>/dev/null || "$tool" -w -I FORWARD 1 -j DOCKER-USER
  "$tool" -w -N CV-DOCKER 2>/dev/null || true
  "$tool" -w -F CV-DOCKER
  "$tool" -w -A CV-DOCKER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  "$tool" -w -A CV-DOCKER -i "$PUBLIC_INTERFACE" -p tcp -m conntrack --ctorigdstport 80 -j RETURN
  "$tool" -w -A CV-DOCKER -i "$PUBLIC_INTERFACE" -p tcp -m conntrack --ctorigdstport 443 -j RETURN
  "$tool" -w -A CV-DOCKER -i "$PUBLIC_INTERFACE" -j DROP
  "$tool" -w -A CV-DOCKER -j RETURN
  "$tool" -w -C DOCKER-USER -j CV-DOCKER 2>/dev/null || "$tool" -w -I DOCKER-USER 1 -j CV-DOCKER
done
