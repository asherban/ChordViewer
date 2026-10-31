# ADR 0014: Restrict M8 access to a private VPN

Decided: 2026-10-15. Recorded: 2026-10-15.

**Decision:** Make the M8 Synology deployment accessible from home and remotely through a private VPN. Use the existing Tailscale installation as the planned access network, retaining HTTPS and application authentication for web and Android. Keep the NAS application outside public access. The exact HTTPS endpoint and host configuration require preflight verification before deployment.

**Reason:** The user selected private VPN access and reported Tailscale already installed on the stock DS224+. This supports both locations while preserving M8's private deployment boundary and the existing Android release requirements.

**Related:** Extends [0003: portable deployment](0003-local-first-development-and-portable-deployment.md) and [0011: release endpoint isolation](0011-development-and-release-endpoints.md).

**Source:** The 2026-10-15 M8 planning discussion and the user's answers confirming the NAS and selecting home/remote private VPN access. Detailed setup and remaining host checks are in the [M8 execution plan](../architecture/m8-execution-plan.md). This records a planned deployment decision, not completed implementation.
