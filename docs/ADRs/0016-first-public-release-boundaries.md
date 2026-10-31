# ADR 0016: Use one HTTPS origin and operator-managed enrollment for the first release

Decided: 2026-10-24. Recorded: 2026-10-24.

**Decision:** Deploy the first release at `https://chordviewer.app` on the existing Hostinger Debian 13 VPS. Keep its supported operating system and Docker installation. Redirect `www` to the canonical origin; retain `api.chordviewer.app` as an API alias. Cloudflare records remain DNS-only so Caddy observes the connecting client address directly. Both shipped clients use the canonical origin.

The HTTPS profile closes public signup. A short-lived operator container creates accounts and resets passwords with session revocation, using a database identity absent from the running API. The gateway replaces forwarding headers and authenticates its private API requests. API and database ports are unpublished. Android downloads require an authenticated session, and signing material stays on the administrator's workstation.

**Reason:** This delivers the public web/native service requested by the owner while keeping enrollment, database administration and host access under operator control. Separate release configuration preserves local development behavior. Retaining the inspected Debian installation avoids an unnecessary server reinstall.

**Consequence:** The owner approved password-protected sudo for `andre`, reuse of this workstation's authorized SSH key, and disabling root/password SSH after verification. NAS backups over Tailscale are deferred by the owner until the next setup step. The alert address is `andrei.sherban@gmail.com`; delivery infrastructure still needs configuration. A first deployment does not complete M8's recovery, monitoring or device/network acceptance gates.

**Extends:** [0015: Public Hostinger deployment](0015-public-hostinger-deployment.md) and [0011: Separate development and release endpoints](0011-development-and-release-endpoints.md).

**Source:** Owner's requests in this installation chat on 2026-10-24, including the first-deploy instruction and explicit administrator-setup approval; [M8 plan](../architecture/m8-execution-plan.md) and [release runbook](../deployment/runbook.md).
