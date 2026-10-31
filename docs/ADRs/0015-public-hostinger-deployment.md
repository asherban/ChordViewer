# ADR 0015: Deploy M8 publicly on Hostinger VPS

Decided: 2026-10-23. Recorded: 2026-10-23.

**Decision:** Deploy M8 on a public Hostinger VPS with a canonical HTTPS domain shared by web and Android. Include server installation and hardening, release configuration, backups, restoration, updates and monitoring in M8. Remove M9 from the active roadmap for now; commercial access and billing remain deferred without a scheduled milestone. The server tier, region and domain require confirmation before deployment.

**Reason:** The user selected Hostinger VPS as the deployment target and requested the installation and security work within M8. Public exposure makes application authentication, restricted administration and operational recovery release requirements.

**Supersedes:** [0014: private VPN access for M8](0014-private-vpn-access-for-m8.md). Partially supersedes [0003: portable deployment](0003-local-first-development-and-portable-deployment.md): the NAS rehearsal and later public-hosting sequence change; local validation, portable containers and separate environments remain valid.

**Related:** [0011: reviewed release endpoints](0011-development-and-release-endpoints.md) remains applicable. The [M8 execution plan](../architecture/m8-execution-plan.md) defines the installation sequence, initial account-admission policy and acceptance gates; deployment is not yet implemented.

**Source:** The user's 2026-10-23 request in this project chat to change M8 to public Hostinger VPS deployment, define installation and security work, and remove M9 for now.
