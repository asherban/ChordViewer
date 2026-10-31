---
name: frontend-visual-evidence
description: Capture and present visual proof whenever making a visible change to any ChordViewer frontend, including Android and web UI. Use for layout, styling, content presentation, and visible interaction changes.
---

# Frontend visual evidence

Every visual change to a frontend must be accompanied by images or video proving the implemented result. Apply this to small visual fixes as well as larger UI changes.

- Run the affected frontend from the final implementation and capture its actual rendered UI. Use screenshots for static appearance and video or a sequence of screenshots when the change involves interaction.
- Frame the evidence so the changed area and relevant surrounding layout are clearly visible. Show the states needed to prove the requested behavior, including where a control moved from and where it is now accessible.
- When the request includes parity across build variants, devices, viewport sizes or UI states, capture the relevant comparisons under matching conditions. For debug/release layout parity, use the same device, orientation, display settings and account state; check actual bounds as well as the images.
- Inspect the captures yourself and correct visible defects before reporting completion. A successful build, automated test or UI hierarchy dump supports validation but does not replace visual evidence. Mockups and generated images do not prove an implemented UI change.
- Keep captures in an ignored workspace output directory such as `.local/visual-evidence/`, or in the tool's artifact output location. Avoid exposing credentials or unrelated personal content.
- Include the evidence in the final response as rendered images or video with brief captions explaining what each proves. Use absolute paths for local media. If the interface cannot render a video, provide representative frames and a usable video link.
- If real capture is blocked, state the exact limitation and what remains visually unverified. Never claim the visual requirement passed without the requested evidence.
