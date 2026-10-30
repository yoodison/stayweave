# Third-party source used in the video workspace

## OpenScreen v2.1.2

`src/vendor/openscreen-motion.js` adapts [`src/lib/zoomMath/mathUtils.ts`](https://github.com/getopenscreen/openscreen/blob/v2.1.2/src/lib/zoomMath/mathUtils.ts) from [getopenscreen/openscreen](https://github.com/getopenscreen/openscreen), release v2.1.2 (release commit prefix d8889c6). Type annotations were removed and `clamp01` inlined; motion equations are preserved.

Copyright (c) 2025 Siddharth Vaddem
Copyright (c) 2025-2026 OpenScreen contributors

MIT license reproduced in [licenses/OpenScreen-MIT.txt](licenses/OpenScreen-MIT.txt). The imported critically damped easing and logarithmic zoom interpolation are used by the editorial and directed-footage compositions. We did not install the OpenScreen desktop application or use its recording/export engine in this iteration.

## Remotion

Remotion 4.0.539 is used as a dependency for composition and rendering. Its applicable [license](https://www.remotion.dev/docs/license) remains separate from OpenScreen's MIT license. This workspace is not relicensing Remotion.

## Product imagery

`public/stayweave-verified-ui.png` is a copy of the project's browser-captured local-demo evidence (`docs/evidence/live-presentation-3d.png`). `public/stayweave-real-ui.png` is a fresh native browser screenshot of the local prototype. Guest records are synthetic; measurements refer to previously saved actual model responses. The editorial composition uses the former still and explicitly labels camera movement as editorial. No external stock footage, music, or voice is included.
