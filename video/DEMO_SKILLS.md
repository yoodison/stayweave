# Demo planning references and applied workflow

Checked 2026-10-30 KST. These complement the earlier editing-tool research; they are not all popular, proven studios.

| Source | Current evidence | What was actually used |
|---|---|---|
| [Remotion official skills](https://github.com/remotion-dev/skills) | 5,869 cumulative GitHub stars; pushed Oct 26; pinned SHA in references/skills/metadata.json | Reviewed official composition/preview/caption routing. Existing Remotion 4.0.539 workspace retained. No claim of expert storytelling from a renderer. |
| [launch-video-skill](https://github.com/harish-anumula/launch-video-skill) | 2 stars; pushed Oct 26; MIT | Reviewed narrative shapes and shot pacing. Retained source/license; selected chronological owner story. Did not use reconstructed UI to impersonate live behavior. |
| [product-demo-video-skill](https://github.com/Afnanksalal/product-demo-video-skill) | 0 stars; pushed Aug 28; MIT | Inspected strategy, quality guide and the production-plan validator. Actually ran its unchanged validator against our 165-second plan; 9 scenes, 4 evidence sources, PASS. Its optional Genmotion/Playwright execution stack was not installed or used. |

Stars are cumulative; this is not a recent growth measurement. The two small repositories are useful methods to test, not evidence of broad community endorsement. Source files were retrieved for inspection; no third-party install script or capture daemon was run. Source notices remain beside the inspected MIT content. Review-only references live in a gitignored `references/` directory; the local director skill links them intentionally.

## Applied to StayWeave

The project skill is `.agents/skills/stayweave-demo-director/SKILL.md`. It adapts evidence-linked planning to the available local Remotion/FFmpeg and permitted CUA capture tools. This is a scoped local skill, not a global installation or a claim that every upstream instruction was followed.

`owner-agent-plan.json` is a 165-second walkthrough: off-site host → typed operating report → constrained plan → automatic result and genuine exception → guest fit/choice → operating impact → phone/tablet → model evidence. Each shot has its route, proof, spoken line and capture status. The final takes, human narration and captions remain pending.

## Actual pilot test

- `renders/owner-agent-pilot-8s.mp4`: 1920×1080 H.264, 30fps, 8.000 seconds, silent. A real browser screencast of typing “Show me the room calendar,” a real Nebius response, and the resulting calendar. It is not a replacement mock UI or a still slideshow.
- CUA CDP screencast observed 98 changed frames over 2.316 seconds during a 14-second capture window. The static tail correctly holds the final actual frame; the edit retains eight seconds. Source frames/timestamps remain in `renders/owner-pilot-frames/`.
- Browser playback verified the full 8.000-second H.264 file: ended=true, currentTime=8, media error=null.
- Pilot proves capture plumbing and input→model→view timing, not all nine scenes or the final edit's narration/motion quality. Text is small at full-screen 1080p; the final cut needs purposeful crops and a less dense initial chat history. Do not call this a finished submission film.
- An initial unawaited capture loop lost its tool session; corrected capture awaits collection and UI work together in one bounded call. Discard the earlier incomplete capture as submission material.

## Before final filming

1. Rehearse the exact incident against current ledger and owner-policy expiry. Never assume saved demo outcomes will repeat.
2. Record the selected live flow, keeping original captures. Use a task-focused crop for the prompt and outcome.
3. Record founder narration from the approved timed plan; align captions to that recording, not estimated words.
4. Use `scripts/assemble.py` for normalization, burned captions and output QA. Existing synthetic-tone smoke test is not the final soundtrack.
5. Verify duration strictly under 180 seconds and current event rules before public upload. No upload or submission has occurred.
