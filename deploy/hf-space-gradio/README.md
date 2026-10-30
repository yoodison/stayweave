---
title: StayWeave
emoji: 🏨
colorFrom: green
colorTo: gray
sdk: gradio
sdk_version: 4.44.1
app_file: app.py
python_version: "3.12"
pinned: false
license: mit
short_description: Agent-native hotel ops on NVIDIA Nemotron + Nebius
---

# StayWeave

Agent-native operations for independent hotels. NVIDIA Nemotron 3.5 Super on Nebius Token Factory interprets requests; deterministic code coordinates rooms, housekeeping, linen, breakfast and staff.

Open the app with `?demo=1` for the isolated demo hotel. Source: https://github.com/yoodison/stayweave

`app.py` runs the prebuilt Node.js server from the `demo-v1` GitHub release (checksum-verified). The `NEBIUS_API_KEY` secret is set in the Space settings. Demo state resets when the Space restarts.
