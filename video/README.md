## Owner-first film update — 2026-10-30

Use [DEMO_SKILLS.md](DEMO_SKILLS.md) and `owner-agent-plan.json` instead of the older3D-first shot plan. Project director skill at `../.agents/skills/stayweave-demo-director/SKILL.md`;165seconds,9scenes,validated. `renders/owner-agent-pilot-8s.mp4` is an actual silent1080p30 browser recording test. Final full takes and narration remain pending.

# StayWeave video production kit

Prepared 2026-10-29. This is a production pipeline and an original 8-second architecture insert, **not the completed submission video**. Actual screen takes, recorded founder narration and aligned final captions are still required. Private evidence and submission drafts live in `../docs/submission/` and are intentionally not tracked.

## Tools researched

Release versions were checked against each repository's GitHub latest-release API on 2026-10-29. Pinning avoids an unplanned upgrade before the deadline.

| Step | Repository / checked release | Use and current status |
|---|---|---|
| Screen capture | [Cap](https://github.com/CapSoftware/Cap/releases/tag/cap-v0.6.2), released Oct 28 | Studio recording/cursor editing alternative; the later OpenScreen review below updates the capture shortlist. Not installed by this task. Inspect license before redistributing its code. |
| Capture fallback | [OBS Studio](https://github.com/obsproject/obs-studio/releases/tag/33.0.0), Oct 23 | Stable scene capture; not installed. QuickTime is a built-in fallback. |
| Motion + final render | [Remotion](https://github.com/remotion-dev/remotion/releases/tag/v4.0.539), Oct 26 | Installed locally here, pinned; React-native editing workflow. [License/pricing](https://www.remotion.dev/docs/license/pricing) depends on usage/company size; not an MIT assumption. |
| Motion alternative | [Motion Canvas](https://github.com/motion-canvas/motion-canvas/releases/tag/v3.17.2), Dec 14 2024 | Alternative, not installed; no reason to operate two motion editors for this deadline. Old latest release alone does not establish project inactivity. |
| Local transcription | [whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.5), Oct 6 | Optional Apple Silicon transcription and SRT generation. Not installed; no model downloaded. |
| Voice recording/edit | [Audacity](https://github.com/audacity/audacity/releases/tag/Audacity-4.0.1), Sep 30 | Human narration, cleanup and timing; not installed. A WAV from another recorder works too. |
| Audio/video validation | [FFmpeg](https://github.com/FFmpeg/FFmpeg), installed 9.0.1 | ffmpeg/ffprobe available. This build lacks libass: subtitles are rendered by Remotion instead. |

21st video was also tried; the selected published block rendered unavailable. Its draft is not approved footage. This kit uses Remotion directly and does not claim to be a 21st renderer.

## Setup and motion insert

```sh
cd /Users/yoominjun/Documents/StayWeave/video
npm ci --ignore-scripts --no-audit --no-fund
npm run studio
npm run still
npm run motion -- --concurrency=2
```

`StayWeaveFlow` produces an 8-second 1920×1080/30fps architecture insert. It labels itself as an illustration, not product footage. Use the actual application for most of the film. Source and captions use original text, without third-party logos or music.

## Recording and post-production

1. Follow `../docs/submission/VIDEO_PLAN.md`. Save raw captures in `raw/`, actual recorded narration in `audio/`. Those directories and renders are ignored; keep originals separately backed up.
2. Cut the picture to approximately 165 seconds in a local editor, including the motion insert only where it helps. Export `raw/picture-lock.mp4`. Record `audio/narration.wav` after the cut, based on `narration.en.md`.
3. Create an accurate SRT aligned to the recorded voice. If using whisper.cpp later, consult its checked-out CLI help and README for model/download and SRT flags; proofread every line. Do not use the smoke-test captions as real subtitles.
4. Assemble:

```sh
python3 scripts/assemble.py \
  --picture raw/picture-lock.mp4 \
  --voice audio/narration.wav \
  --srt captions/final.en.srt \
  --output renders/stayweave-submission-v1.mp4
```

The script rejects missing streams, overlapping/reversed/out-of-range captions, silent narration, voice longer than picture, an existing output, and a final duration ≥180 seconds. It performs two-pass voice loudness normalization (target −16 LUFS / −1.5 dBTP), pads short audio, burns captions through React, and checks 1080p/30fps with an audio stream. It preserves an SRT and JSON format report beside the MP4. This is a format check, not semantic or editorial approval.

`public/assembly-*` temporary copies are deleted on ordinary completion/error. They are gitignored even after a hard interruption. No API key or remote speech service is required. The config uses installed Google Chrome on this Mac because the downloaded headless-shell build stalled while loading the root. Other environments fall back to Remotion's browser download. Rendering uses two workers to limit local load.

## Delivery review

- Under three minutes; English; actual functional app visible; public YouTube required.
- Distinguish live model calls, recorded replay, local scenarios and future integrations in-frame.
- Metrics show sample size, exact model, latency scope and **estimated inference** expense. No invented p95, customer ROI or production reliability.
- Human watch-through with headphones; confirm voice/caption timing and check final audio loudness/peaks in the editor. The normalization target alone is not a measured final YouTube result.
- Review third-party licenses and asset rights before publication. Do not upload credit mail or billing evidence.
- Publish only after review; preserve a fixed final version through the competition deadline.

## Local verification completed

On 2026-10-29, rendered `renders/flow.mp4` (8-second H.264 motion insert) and `renders/pipeline-smoke-v2.mp4` (1080p/30fps with normalized synthetic tone, two timed captions, and a visible test watermark). Format checks and caption timing rejection checks passed. This verifies the assembly path, not a completed screen-recorded submission or actual voiceover. Open `renders/pipeline-smoke-v2.png` for the tested caption layout.

## Product-led editorial direction — 2026-10-29

The new default visual direction is `StayWeaveEditorial`: actual hotel imagery, quiet typography, three sustained scenes and controlled camera movement. OpenScreen v2.1.2 easing and perceptual zoom math are used under MIT; see [third-party notices](THIRD_PARTY_NOTICES.md). The original five-card `StayWeaveFlow` remains available but is no longer the recommended lead visual.

```sh
npm run editorial:still
npm run editorial
```

The resulting `renders/editorial-v1.mp4` is a 21-second silent **motion study using actual UI stills**, labelled in-frame. It is not a functional screen recording or a final submission. App imagery is copied from browser-captured local evidence. It has not been generated or redesigned by an image model.

For an actual 16:9 screen recording, copy the clip to `public/recording.mp4`, adapt `assets/directed-footage.example.json` to its real duration and intended focus, then render:

```sh
./node_modules/.bin/remotion render src/index.jsx StayWeaveDirectedFootage renders/directed-take.mp4 --props assets/directed-footage.example.json
```

This changes framing, not source playback speed; it adds no fake clicks or pointer. Keep model-call evidence unsped and make edits clear. Then include the take in the picture lock and use `scripts/assemble.py` with actual narration and aligned SRT.

Research and evidence selection: `../docs/submission/VIDEO_REPO_RESEARCH.md`. Other reviewed desktop applications were not installed. No new accounts, subscriptions or hosted AI rendering were used.

Visual review: inspected all three settled scenes and verified 21 seconds, H.264, 1920×1080 at 30 fps. Magnified evidence screenshots are softer than native-resolution footage; the final capture should replace these stills before submission.
