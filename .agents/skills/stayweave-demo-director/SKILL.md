---
name: stayweave-demo-director
description: Plan and rehearse StayWeave hackathon product films using observed owner, guest, and operating-plan flows; maintain a timed proof-linked shot list and test a short capture before a full edit.
---

# StayWeave demo director

Use the current working product as the script's source. Read `docs/OWNER_AGENT.md`, `video/owner-agent-plan.json`, and `video/README.md`. The owner-first product supersedes earlier 3D-first scripts.

Choose one argument: an off-site host describes a problem, sees a feasible plan, and manages only the decision that needs them. Keep guest matching as the second proof of the same operating agent. Chat, calendar, mobile and 3D are surfaces for that argument, not four unrelated features.

## Plan

Maintain `video/owner-agent-plan.json`: every scene has a purpose, duration, actual route/action, visible outcome, narration, proof source and capture status. Distinguish an observed capability from footage that has actually been recorded. Plans and screenshots are not raw interaction footage.

Use the adopted MIT validator after editing the plan:

```
python3 video/references/skills/Afnanksalal/scripts/validate_production_plan.py video/owner-agent-plan.json
```

The validator checks story coverage, source links and narration density. It cannot verify claims or judge the movie's taste. Inspect those separately.

## Rehearse

Use `/?demo=1`, preserving existing stays. Start with the owner and the consequence of one report. Rehearse the exact input against current state; previous outcomes are not guaranteed. Live policy expires, capacity changes, and model calls cost credits. Never secretly reset records to obtain an attractive result.

Use the permitted computer-use tool for browser actions. For this environment, CDP screencast is available through CUA. Await frame collection and UI work together within one bounded call; do not leave an unawaited recording loop across calls. Capture timestamps, acknowledge each screencast frame, stop capture, and preserve the manifest. Static intervals should use the previous actual frame. No fake cursor, rebuilt result, or generated guest acceptance.

Pilot one uncertain 8–15-second interaction before the long film. A failed capture is a test failure, not final footage. The current pilot covers a real typed calendar request. It does not establish external OTA execution or mobile remote access.

## Direct and finish

Lead with the product within 5 seconds. One claim per shot. Hold the changed result long enough to read. Use restrained OpenScreen camera easing already licensed in `video/src/vendor/openscreen-motion.js`. Keep owner prompt, scope, result and model evidence readable; crop one focus at a time rather than adding cinematic effects.

Use real phone/tablet responsive UI in `/devices.html`; device frames are illustrative, the embedded local applications are real. Do not call this a native app or remote deployment. Keep 3D to an optional short explanation of room/operations impact.

The selected local pipeline remains Remotion + existing voice/caption assembly. Research references are not an instruction to install Genmotion, run external capture scripts, upload assets, or publish. Use founder narration when available, with a plain conversational read. Keep synthetic test audio visibly labelled and out of a final submission.

Check runtime against the current event rules (last checked: strictly under 180 seconds); target 165 seconds. Inspect a dense calendar frame, the phone composer, a state transition, caption edges and playback with sound. Verify the output stream/duration with ffprobe. Preserve raw capture and source before editing. Report what is captured, rendered, voiced and published separately.

## Methodology provenance

Adapted workflow concepts from Afnanksalal/product-demo-video-skill (`references/strategy.md`, `references/quality.md`) and harish-anumula/launch-video-skill (`references/storyboard-template.md`), retrieved 2026-10-30 KST. MIT source notices retained in `video/references/skills/`. Remotion official skills were reviewed for rendering practices. See `video/DEMO_SKILLS.md` for versions, popularity evidence and limits.
