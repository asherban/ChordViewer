# Third-party notation components

The M2 web score renderer imports `vexflow/bravura` from **VexFlow 5.0.0**. Its entry point embeds Bravura, Academico Regular and Academico Bold as WOFF2 data URLs. VexFlow's MIT license covers its code; the font packages supply their own SIL Open Font License notices. The release must retain both kinds of notices.

## Notices included in the web distribution

The files in [`apps/web/public/licenses`](../../apps/web/public/licenses/README.txt) are static public assets. The web build copies them to `dist/licenses/`; preserve that directory when packaging or deploying the web application. The notice index is available at `/licenses/README.txt`.

| Component | Copyright notice retained | License file |
| --- | --- | --- |
| VexFlow 5.0.0 | VexFlow contributors, 2023–present; Mohit Muthanna Cheppudira, 2010–2022 | [VexFlow-MIT.txt](../../apps/web/public/licenses/VexFlow-MIT.txt), [VexFlow-AUTHORS.md](../../apps/web/public/licenses/VexFlow-AUTHORS.md) |
| Bravura embedded in VexFlow | Steinberg Media Technologies GmbH, 2019; reserved font name Bravura | [Bravura-VexFlow-OFL.txt](../../apps/web/public/licenses/Bravura-VexFlow-OFL.txt) |
| Academico Regular and Bold embedded in VexFlow | Steinberg Media Technologies GmbH, 2022; reserved font name Academico | [Academico-OFL.txt](../../apps/web/public/licenses/Academico-OFL.txt) |
| Bravura OTF used by native Android | Steinberg Media Technologies GmbH, 2026; reserved font name Bravura | [Bravura-OFL.txt](../../apps/web/public/licenses/Bravura-OFL.txt), also [bundled in the Android APK](../../apps/android/app/src/main/assets/licenses/Bravura-OFL.txt) |

The web and native Bravura distributions have different original copyright-year notices. Both are preserved rather than replacing the web font's original notice with the newer native one. Fonts are used without modification; no font names were changed.

## Verified provenance

VexFlow's MIT notice and author list were copied verbatim from the installed `vexflow@5.0.0` package. Its `build/esm/entry/vexflow-bravura.js` imports all three font data modules. The font license texts came from the [official VexFlow font-package repository at commit b2bc3a6](https://github.com/vexflow/vexflow-fonts/tree/b2bc3a6070225e4d395966b36de76c36a9429b1c), specifically [Academico's license](https://github.com/vexflow/vexflow-fonts/blob/b2bc3a6070225e4d395966b36de76c36a9429b1c/academico/LICENSE.txt) and [Bravura's license](https://github.com/vexflow/vexflow-fonts/blob/b2bc3a6070225e4d395966b36de76c36a9429b1c/bravura/LICENSE.txt).

Each base64 font embedded in the installed VexFlow package was decoded in memory and matched byte-for-byte by SHA256 to its WOFF2 file in that official repository revision:

| Embedded font | SHA256 |
| --- | --- |
| Academico Regular | `363caf009818b9cebc7a2644d96b5dc10a20d3b5e557afdb4fb1a9a53d57e329` |
| Academico Bold | `575c2e30fcf7dd9363e49890644b2ed23b6b518c9866aadb5370d470473297b6` |
| Bravura | `5c25278c208ca455dc7c3c0c95d833e134aca6d740a023767af50d0dfa06ef82` |

The native Bravura notice was copied from the existing Android asset, sourced with its OTF from [Steinberg's Bravura repository at commit 37b1943](https://github.com/steinbergmedia/bravura/tree/37b194378b710cc40e406ab6c4b07608bb9548ae). Native OTF checksum and packaging details are recorded in the [Android README](../../apps/android/README.md).

This record covers the notation renderer and font assets added for M2. When changing the VexFlow entry point, version or font selection, inspect its embedded fonts again and update the corresponding notices. It is not an inventory of every application or build-tool dependency.
