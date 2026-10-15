# ADR 0003: Validate locally before portable container deployment

Decided: 2026-09-20. Recorded retrospectively: 2026-10-15.

**Decision:** Develop and validate the complete workflow on the workstation through M7. Package backend services as versioned containers with separate development/test settings and persistent data. M8 is a private Synology NAS deployment rehearsal; public users belong on later cloud hosting. Keep the deployment compatible with a Linux container host.

**Reason:** Local development removes NAS availability as a prerequisite. Reusing release images reduces differences between environments, while separate data and configuration protect development and testing. The approximate USD 10 monthly hosting target guides a later provider choice; it does not select one.

**Related:** [0002: application boundaries](0002-native-clients-and-rest-backend.md); [0011: endpoint isolation](0011-development-and-release-endpoints.md); [0001: retain the roadmap](0001-retain-current-backend.md).

**Source:** [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74), private-NAS and local-first requests; [milestones](../architecture/milestones.md) and [container setup](../development/m3-containers.md).
