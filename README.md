# StayWeave — run your hotel, just ask

**Agent-native operations for independent hotels.** An owner (or a guest's own agent) describes what is needed in plain language. **NVIDIA Nemotron on Nebius Token Factory** interprets it; deterministic code coordinates rooms, housekeeping, linen, breakfast and staff; guests explicitly choose; the reservation and its operating plan are saved and read back together.

Nebius × NVIDIA Global AI Hackathon · **Best Apps and Agents** track · MIT license

| | |
|---|---|
| Live demo (judges) | https://stayweave.onrender.com/?demo=1 — free hosting: the first visit after idle takes about a minute to wake |
| Demo video | YouTube link in the Devpost submission (2:40) |
| Model | `nvidia/Nemotron-3.5-Super-VL` via Nebius Token Factory (OpenAI-compatible API) |

## How NVIDIA Nemotron and Nebius Token Factory are used

```
Owner chat / guest agent (REST)          ── natural language ──▶  Nemotron 3.5 Super (Nebius Token Factory)
                                                                  structured JSON: guests, dates, party, arrival,
                                                                  breakfast, REQUIRED vs PREFERRED needs + quoted evidence
                                          ◀── validated claims ──
Deterministic planner (server/coordination.js, matching.js, owner-booking.js)
  · evidence substrings checked, unknown rooms/dates rejected, missing fields asked (max 2 at a time)
  · joint allocation of several pending requests; confirmed stays and purchased rights never displaced
  · capacity checks: housekeeping minutes, team roster, free linen sets, breakfast covers
Guest explicitly chooses current terms ──▶ atomic ledger write: reservation + cleaning/linen/breakfast/roster ──▶ read back
```

- **Model role (server/ai.js, server/owner-agent.js, server/owner-booking.js):** intent and condition extraction, tool classification, clarifying-question content. The model never creates inventory, prices, approvals or completion.
- **Every call is metered in the UI:** model ID, latency, prompt/completion tokens and estimated cost per call. A cumulative inference budget guard stops calls when exceeded; failed or invalid extractions never touch the ledger.
- **Why Token Factory:** a hosted NVIDIA open model with an OpenAI-compatible endpoint let a two-person-scale project use a strong reasoning model without operating GPU serving.

## Try it (judges)

1. Open the demo URL above (`/?demo=1` is an isolated demo hotel; it does not touch other data).
2. In the left chat, type e.g. *“Priya Nair wants Nov 18 to 20, two guests. A sea view is a must. Marco Lee, same dates, one guest, would like a quiet room if possible.”*
3. StayWeave asks only for missing details (arrival, breakfast). Answer in plain words, then **Confirm details & find coordinated options**.
4. Use **Demo · act as <guest>** to make each simulated guest's explicit choice, then see the saved operating changes in chat, **Calendar** and **3D hotel**.
5. Other operating reports work too: *“Jules is absent today”*, *“We have 8 clean linen sets in total”*.

If no room satisfies every required constraint, the planner says so rather than inventing an offer. Demo data is synthetic. OTA/PMS write-back, payments and outbound messages are **not** connected (channel adapters are simulated).

**Availability note:** the demo runs on Render's free tier (Docker, this repository's `Dockerfile`). It sleeps after 15 minutes without traffic, so the first request can take about a minute; demo state resets when it restarts. If it is unreachable, run it locally as below (about two minutes).

## Run locally

Requires Node.js 22.12+.

```sh
npm install
cp .env.example .env            # add your own NEBIUS_API_KEY; set NEBIUS_INFERENCE_ENABLED=true
npm run build && npm start      # http://127.0.0.1:3001/?demo=1
# or: npm run dev               # http://127.0.0.1:5173/?demo=1 (Vite + API)
npm test                        # 119 tests
```

Without a key the app still runs; the chat reports that the model is disconnected. To serve it on a public host, set `STAYWEAVE_PUBLIC_HOST_SUFFIX` to that host's suffix (comma-separated, e.g. `.onrender.com`); otherwise only localhost requests are accepted. `docker build -t stayweave . && docker run -p 8080:8080 -e NEBIUS_API_KEY=... -e NEBIUS_INFERENCE_ENABLED=true -e STAYWEAVE_PUBLIC_HOST_SUFFIX=localhost stayweave` runs the production image.

## Built during the submission period

The repository's first commit is 2026-10-28, inside the submission period (Aug 26 – Oct 30, 2026). Earlier university coursework research on hotel operations informed the problem framing; it is not part of this codebase.

---

## Development log
## Product requirements

Start with [StayWeave PRD v1.0](docs/PRD.md) for the consolidated owner-agent product, conversational journeys, scope, acceptance criteria, metrics and roadmap. It distinguishes local implementation from production requirements and business hypotheses. The dated sections below retain implementation history.

## Conversation-native booking — 2026-10-30 (latest)

Natural-language owner requests now gather missing details and present review, joint matching, individual customer responses and saved operating effects inside chat. Up to three requests share a draft. Existing stays remain protected through amendments; customer choice stays separately authorized. See [CHAT_BOOKING.md](docs/CHAT_BOOKING.md). This supersedes booking form handoffs described below; detailed tools and the normal authenticated guest portal remain available.

## Owner-first agent workspace — 2026-10-30 (latest)

Open `/?demo=1` for the new conversation + property workspace. Natural-language operating reports connect real Nemotron interpretation to reviewed changes and owner-bounded recovery. Switch between a36-room overview, type-grouped reservation calendar and3D. Phone and tablet use the same responsive application; `/devices.html` presents both interactively. Existing presentations remain under explicit legacy/live routes.

Five real calls verified; $0.0034767 estimated token cost. Jules absence correctly requires active-work handover; a verified linen count increases free sets0→2 automatically inside policy. Existing confirmed stays/tasks and the ordinary world preserved. See [OWNER_AGENT.md](docs/OWNER_AGENT.md) for precise scope. The [video planning kit](video/DEMO_SKILLS.md) now includes a project skill, validated165-second shot plan and an8-second real capture test. Final narration, full film and publication remain pending.

## Interactive live presentation — 2026-10-29 (latest)

## Submission preparation — 2026-10-29

The local [video production kit](video/README.md) contains an editable motion insert, English narration draft and a caption/voice assembly pipeline. The private submission checklist, English Devpost draft and platform-integration claim matrix are in `docs/submission/` (gitignored). Additional Token Factory credit was redeemed successfully; no publication or final hackathon submission was performed in this preparation task.


Open `/?demo=1&immersive=1&live=1` or Replay → **Live · enter your own requests**. Enter one to three custom guest requests; actual Nebius responses feed the existing joint allocation engine. Each guest reviews current terms and explicitly chooses before reservation and operations are saved. Live 3D highlights proposals versus saved impacts, with actual response latency and scoped token-cost estimates. Requests include other eligible hotel guests; expand the shared allocation to see competition. Saved sessions and partial-success retries survive reload; no hotel reset.

Browser-verified: Aria required sea and chose 306; Noah preferred sea, declined 405 and chose 105. Breakfast Nov 2/3 moved 0→2→4; ready rooms correctly added no preparation. Two actual Nemotron responses: 1399/1529 ms, 1268 tokens, $0.0006144 estimated. Existing reservations/tasks and the ordinary world are preserved. 106 tests and build pass. [Live demo guide and evidence](docs/LIVE_PRESENTATION.md). Local demo consent/ledger; no OTA or payment execution.

## Unified hackathon presentation — 2026-10-29 (latest)

Open `/?demo=1&immersive=1&present=1` or **Present the full story**. A nine-chapter, approximately90-second replay connects recorded guest intake, joint allocation, independent choices, rejection, expiry, cancellation, re-offers and saved operations. The3D HUD shows exact provider model, seven recorded responses, per-call latency977–3318ms and $0.0028206 estimated inference cost. The desk distinguishes model interpretation, code validation and persisted effects; all numbers come from saved evidence, not a fabricated timeline. Replay makes no calls or bookings and never resets either world.

Optional **Run this request live** verifies the catalog and reinterprets one story request without changing reservations or tasks. Verified through the UI: Riley→required sea,1262ms,659tokens,$0.0003315 estimate; both world files unchanged. New live evidence is visibly separate from replay totals.104 tests and build passed; existing Three.js size advisory remains. [Presenter script, measurement scope and boundaries](docs/PRESENTATION_DEMO.md).

# StayWeave

## Guest reactions and automatic replanning — 2026-10-29 (latest)

The customer API/portal now supports declining a room or entire proposal, a fixed response deadline with explicit resumption, opt-in availability watching, and scope-bound cancellation preview/confirmation. Existing bookings survive declined or unanswered amendments. Cancelled stays release only pending work and unused linen; active physical work, in-house and completed stays become owner handover exceptions. Every event rechecks other guests, updates local channel messages, and records exact before/after operating effects.

Open `/?demo=1&immersive=1&lifecycle=1` or Agent → Guest reactions. **Replay the full story in 3D** replays saved events without model calls or new writes. The cumulative demo is complete: Drew rejects 405 and gets306; Sofia's pending alternative becomes405; Parker's105 response expires; Avery cancels502; Quinn receives and chooses502 for Nov12–14. Cancellation changes cleaning95→55min, team140→85min, available linen0→2sets and breakfast2→0 on Nov13/14; Quinn's explicit choice rebuilds these allocations. Prior confirmed stays and the ordinary world are preserved.

Five live Nemotron responses including one ambiguous request: $0.0017262 estimated; provider latency977–2561ms. The ambiguous request stopped safely and was preserved/declined before an explicit corrected request. Reactions/replanning require no additional model call. 101 tests and build pass (existing Three.js bundle advisory). See [full lifecycle demo and boundaries](docs/GUEST_LIFECYCLE_DEMO.md). Local ledger only; no OTA, payment/refund or physical completion claim.

## Concurrent customer agents — 2026-10-29

New stays and authenticated amendments now enter one automatic coordination loop (up to six pending requests per round). It preserves original reservations, compares compatible alternatives against room nights, staff, linen and breakfast, and rechecks after each choice. Guest choice tokens permit identical reviewed terms across unrelated state revisions; changed or expired terms require renewed choice. Waiting on a feasible independent guest change stays outside the owner exception queue; impossible capacity, unsupported conditions, active work and circular swaps escalate.

Open `/?demo=1&immersive=1&coordination=1` or Agent → Guest agents · coordinate together. The cumulative demo sent three concurrent live Nemotron requests, considered five customers with existing pending requests, and explicitly simulated three customer choices via separate authenticated HTTP calls. Saved Riley503, Jamie505, Casey504 for Nov5–7; Casey’s former Nov1–4 booking became replaced only on acceptance. Ready rooms avoid additional cleaning/linen; breakfast Nov2/3/4 becomes0, Nov6/7 becomes6. Sofia/Daniel remain pending; earlier exceptions remain. No sandbox reset or main-world mutation.

Three live calls:2,807 tokens,1,953/2,634/3,318ms,$0.0017313 estimated. Five-request planning279ms/110 expansions in this sample. 91 tests and production build pass. See [concurrent demo, contract and boundaries](docs/CONCURRENT_AGENTS_DEMO.md). This is bounded local coordination, not global optimization, inventory holds, autonomous guest consent, group swaps or live OTA execution.


## Operating agent: owner limits and exceptions — 2026-10-29

Open [the operating-agent demo](http://127.0.0.1:5173/?demo=1&immersive=1). **Agent** now handles extra cleaning, staff absence, physical linen shortage and consented same-day arrival changes. Owners set revisioned, 24-hour limits; feasible changes inside them save automatically, while real constraints or policy exceptions stay in the right-hand decision queue. The 3D hotel links affected rooms to exact reasons and before/after operations. Automatic history is collapsed; staff completion remains explicit.

Live Nemotron verified four grounded reports. This iteration used 9 model calls including 5 rejected development attempts: 14,845 tokens and $0.0108591 estimated token cost; accepted-call p50=2,409ms, p95=4,631ms. Current demo: 3 automatic outcomes, 1 owner-approved outcome and 1 active-work/handover exception, plus the two existing guest clarifications. The ordinary world remained unchanged. 80 tests and the production build pass. See [the current demo script, measurements and boundaries](docs/AUTOPILOT_DEMO.md).

This addition supersedes the earlier cleaning-only recovery scope below. Full room/date/party/meal amendments still need renewed guest choice; no live external dispatch is claimed.

## AI Plan: joint allocation and operational recovery — 2026-10-29

Open [the connected AI demo](http://127.0.0.1:5173/?demo=1&immersive=1&planning=1). The right desk now has **AI Plan → Guest mix / Resolve an issue / Evidence**. Pending requests can be jointly allocated (2–4 at a time), compared with a sequential baseline, published as guest suggestions, and committed only after guest choice. A bounded recovery agent interprets extra cleaning minutes, checks alternative schedules, explains a feasible choice and applies only a reviewed, current plan. The 3D hotel highlights all affected rooms and animates only the relevant service dependencies.

Actual account catalog and completions verified **`nvidia/Nemotron-3.5-Super-VL` through Nebius Token Factory**. This iteration measured 10 calls, 12,440 tokens, $0.0079278 estimated token cost, p50 2,340 ms and p95 3,112 ms. One initial explanation hit its output limit and was rejected; the corrected retry succeeded and both costs remain included. Four synthetic capacity cases and three live language cases passed. These small samples are not production accuracy or an SLA.

The current sandbox contains the completed 3-guest / extra-cleaning story. Replay is explicit and backs up the previous sandbox. The normal workspace was unchanged. No external OTA/PMS/guest dispatch, publication or billing change occurred. The adapter has a persistent local $0.10 inference budget; it does not alter provider billing settings.

See [the presentation script and measured evidence](docs/HACKATHON_AGENT_DEMO.md) for the workflow, tradeoffs, pricing sources and limits.


## 3D hackathon story

Open **[the isolated demo](http://127.0.0.1:5173/?demo=1)** after starting the dev server. Follow the six buttons at the top. Live Nebius uses the existing configured account; unchecking it uses labelled scripted interpretation and avoids model calls. Both modes run the real local planner and save/read back the resulting reservation and work. Restart only resets the isolated demo and archives its previous snapshot.

The orbitable 36-room hotel has a glass facade, interior cutaway, six floor selectors, room furniture, work-status actors and service spaces. Drag to rotate, scroll/pinch to zoom, or use Rotate. Select a request to replay the room → cleaning → linen → breakfast → team ripple. The strip below the building shows exact before/after values. Pause and OS reduced motion stop decorative motion; the room list and SVG fallback preserve access.

The sample story changes Taylor's twin room 102 into family room 404. Its already-scheduled turnover is reused, releasing 40 cleaning + 15 inspection minutes and 2 reserved linen sets from 102. Breakfast increases by 3 covers on each stay morning. Jordan's required connecting rooms cannot be guaranteed, so no reservation is made and the owner records a clarification. These are synthetic hotel records, not live OTA actions or measured savings.

Outside the director, new typed or guest-agent requests use the same recommendations/impact views. Select a not-yet-started reservation's room and **Change this stay** to enter a full replacement request; its current reservation is protected until guest acceptance. Started physical preparation or in-house stays require human coordination.


**A connected operating plan for independent hospitality.**

StayWeave explores how a guest's reservation change can become a coordinated plan for room preparation, inspection, linen, breakfast and the people doing the work. The owner reviews exceptions and decisions that require approval.

## Current demo: the property as an operating workspace

Requires Node.js 22.12+ and npm. Run `npm install`, then `npm run dev`, and open <http://127.0.0.1:5173>. For a locally configured Keychain model credential, use `NEBIUS_INFERENCE_ENABLED=true ./scripts/dev-keychain.sh` only while permitted credits/usage are available.

1. **Property:** select a room in the translucent isometric building. See its guest, source, preparation, linen and next staff actions. Explore six floors and filter by current state. Fixed front/rear room icons keep all 36 rooms selectable during rotation; focus a floor for closer inspection. Pause motion at any time.
2. **New request / Guest portal:** enter dates, party size, time window, breakfast and a natural-language request. Nemotron interprets required room features and optional preferences, including type, view, floor categories and proximity. Optional structured room/location fields enforce exact floor ranges and maximum route distances. Code computes up to three available room/arrival/price options. Unsupported required conditions go to **Needs you**.
3. **Guest choice:** open the guest page from the inbox. The customer reviews the original message, extracted conditions, unmet preferences and price, then explicitly selects and confirms. The server rechecks expiry, version, availability, fixed staff slots and linen.
4. **Connected result:** reservation, cleaning/inspection tasks, linen reservation and breakfast entitlements are saved in one local snapshot. The dashboard refreshes within five seconds. The confirmation is a local demo booking, with no payment or OTA action.
5. **Room actions:** Start / Done records drive cleaning and inspection animation. Complete inspection before check-in. On the simulated departure day, check out a guest to create turnover cleaning, inspection, linen reservations and fixed staff slots. A team member cannot work in two rooms at once. Maintenance takes an uncommitted room off sale; finishing the repair queues recovery preparation, and only inspection reopens it. Shortages remain reviewable exceptions with a retry action. Edit uncommitted rooms’ type, area, views, distances, features, capacity and nightly price. Count received linen deliveries separately.
6. **Inbox:** guest-agent and direct website requests use the local API. Airbnb, Booking.com, Agoda, Trip.com, phone and SMS are sample/manual inbound sources, **not connected external accounts**. An owner clarification is visible on the local guest page and API, without an external send.

The current operating workspace uses a 36-room fictional Harbor House with six room types (Classic King, Comfort Twin, Ocean Deluxe, Family Studio, Corner Suite and Accessible King), individual stay dates within a 30-day horizon, one room per request, and a fixed daily roster with breaks. Options are ranked by explicit preference matches, then earlier arrival, then total price. Confirmed stays are never displaced. Offers are not holds; all but an already-confirmed retry must pass a current-version check. It does not globally optimize pending requests against each other; the earlier Guest fit studio remains a separate joint-allocation experiment. A later booking needing extra turnover cannot be silently disrupted by inserting an earlier stay.

Existing turnover tasks and linen can be reused by a new booking without duplicate allocation. Room types have different bed arrangements, cleaning times and linen needs. Room windows show sea / garden / city views, with a central lift and facility location cues; operator-entered distances drive matching. These are illustrative routes, not a surveyed digital twin. Active guest/work/maintenance states come from records, not animation timers.

Older nine-room data migrates once to schema 2 while preserving reservations and tasks; the original snapshot is retained as `.stayweave/world-before-hotel-expansion.json`. The expansion adds 27 synthetic rooms, 13 sample in-house stays, two maintenance cases, three turnover examples, 60 demo linen sets, three roster members and a breakfast planning capacity of 48.

Agent HTTP intake, request-scoped guest capabilities, example client and consent contract: [AGENT_API.md](AGENT_API.md). State is stored in `.stayweave/world.json`; the local integration credential and client receipt stay in ignored private files. Run **one API process** per state directory. The operator surface is loopback-local, not a production tenant/auth system.

### Earlier planning studio

Open <http://127.0.0.1:5173/?studio=1> for the earlier 20-room Park-group change workflow, failure/retry experiment and Guest fit studio. It retains its separate `.stayweave/state.json` and `.stayweave/fit-draft.json`. It is not synchronized into the current hotel ledger.

### Guest fit studio

Select **Guest fit → Your property plan** to enter or edit up to seven rooms and six guest requests sharing one check-in/check-out window. Set room capacity, features, readiness and preparation times; enter guests’ explicit requirements, preferences, arrival times and confirmed room assignments; then enter linen and shift availability. Other reservations must be marked unavailable manually. Select **Find room combinations** to compare proposed assignments and their calculated cleaning, inspection and linen work. Select **Save local draft** to recalculate and save the chosen plan to `.stayweave/fit-draft.json`; the server reads it back and the UI reloads it on return. The draft may contain guest names and stays on the local machine.

In **Guest fit**, paste a guest or their agent’s message, select the associated guest, and choose **Interpret with Nemotron**. Review the exact quoted evidence before applying the suggested required features and preferences. Supported features are sea view, quiet room and step-free access. Multiple preferences can be compared together. Unsupported required or unclear conditions block calculation until addressed; unsupported preferences are displayed but not scored. The app sends the message to Nebius for interpretation, so use synthetic or consented data and do not include sensitive details. An external agent can call the local-only `POST /api/interpret-fit` with `{ "message": "..." }` to get the same reviewable claims; there is no authenticated agent integration, booking action, or remote exposure. Names, dates, party size and times are still entered separately. A model can omit or misclassify a condition, so the owner must check the original request.

The selected plan is a draft, not a confirmed reservation, a sent guest offer or a dispatched staff schedule. Later arrivals need guest acceptance. This plan is independent of the Park-group workflow and does not update its task list. It does not check staff breaks, existing tasks, other reservations, multi-day turnovers or live inventory. Room combinations are ranked under the stated priority policy; the staff schedule is a greedy heuristic and may miss feasible options. All dates within a plan are shared; per-request dates, pricing and PMS/OTA connections are not implemented. The older fixed example remains available under **Explore sample scenario**.

## Model configuration

The optional interpretation endpoint is designed for an NVIDIA Nemotron model through Nebius Token Factory. Without a key, the interface uses manual input and clearly indicates that the model is disconnected. Copy `.env.example` to `.env` and configure your own credentials locally; never commit or share your key. Actual inference was verified for sample inputs; production accuracy and billed cost are not established. Inference is paused by default; after verifying available credits and your spending settings, set `NEBIUS_INFERENCE_ENABLED=true` locally to allow calls. Availability, time arithmetic, inventory, staffing, pricing and approval are determined by application code, not model output. On macOS, if you have stored a key in your Keychain under service `StayWeave-Nebius` and account `local`, start the app with `./scripts/dev-keychain.sh` to load it into the local process without writing it into the repository.

## Boundaries

This is a hackathon prototype, not a live hotel integration. It does not connect to a PMS or OTA, send messages or purchase orders, process payments, or make actual staffing changes. Guest acceptance, staff evidence, delivery and records are simulated. Readback verifies the local persisted demo record, not an external provider. Pricing, demand, operational savings and customer willingness to pay remain hypotheses.

## Development

```bash
npm test
npm run build
```

The API runs locally on port 3001; Vite proxies `/api` requests during development. `npm start` serves the built frontend and API from the same local server after a build.

## License

MIT. See [LICENSE](LICENSE).

## Coastal command room and channel automation — 2026-10-28

The hotel is now a coastal 3D diorama: animated water, sand, pier, palms, loungers, daytime/sunset lighting, orbit/zoom and a coastal camera preset. The viewport-sized immersive mode retains Inbox, Request, Work and Channels controls. Escape exits immersion; dialogs handle Escape locally. `/?immersive=1&inbox=1` opens the main local workspace in this mode; add `demo=1` for the isolated hackathon state.

Inbox cards show the full source platform, guest message, next recommended action, request→options→choice→operations progress and channel job state. Platform/status filters, exception-first ordering, direct room jumps and Compare options → 3D recommendation/operating ripple are connected. Source badges also remain visible on the selected request. OTA/phone/SMS entries are explicitly sample/manual inputs, not live imports.

`server/channels.js` reconciles reply drafts and 30-day room-night inventory every time a local snapshot is saved. Per-channel rules are persisted with independent optimistic revision checks. Local website/agent replies become readable `request.channelMessage` fields in the authenticated guest API and guest UI. External jobs remain `connector_needed`; unsupported requirements remain `needs_review`. Payload hashing deduplicates jobs; replaced or disabled payloads become superseded/paused. Explicit sandbox tests save idempotent receipts with `externalTransmission:false`. No outbound connector, OTA rate/room mapping, SMS/phone transport, or real platform account was connected. Inventory represents unbooked room nights, not a room-ready promise.

First migration backs up pre-channel state to `world-before-channel-automation.json`. Browser changes were confined to the isolated demo: paused/re-enabled Agoda drafts and recorded one availability sandbox receipt. Ordinary reservation/task/linen state was retained. No model calls or external messages were made in this iteration.

Verification: 59 Node tests, production build, desktop 1440×1050 and mobile390×844. Checked source filters, recommendation navigation, channel rule save/readback, sandbox receipt, camera/lighting, immersive controls and responsive channel popup. Mobile body width390/390 and dialog349/349 (client/scroll). Corrected a legacy `.choice` CSS collision and isolated 3D controls beneath dialogs. Three.js lazy chunk ~602kB minified/~155kB gzip retains Vite's advisory. 21st search returned401; local review returned43 informational material/token-color findings, no blockers. Screenshots in `.stayweave/coastal-inbox.png` and `channel-automation.png`.

## Tycoon controls (2026-10-29)

Open `http://127.0.0.1:5173/?immersive=1`. The hotel always stays in its compact building form. Click a room's interior or its fixed front/rear icon; **Rooms** provides another accessible directory. All36 controls remain visible while rotating. Select a status to locate vacant rooms or preparation work. **Tasks** groups owner decisions and staff work; its room arrow focuses that floor. **Start task / Mark done** update the existing local ledger with readiness gates. **Inbox** retains platform badges, recommendations and the request-to-operations ripple.

The clock shows actual Seoul time; scene lighting follows it, with labelled day/sunset/night previews. Room occupants and staff poses are illustrations of recorded state. Animation never records completion or tracks people. The plan date is separate from the live clock.

Room controls now use graphic state symbols: checks, beds, suitcases, laundry baskets, moving brooms, clipboards, magnifiers and striped barriers. The selected room has cyan-filled floor/wall planes and a linking line. The previous Open hotel view and camera-dependent text plates were removed at the user’s request.

## Customer-agent stay changes

Guests can change dates, room/type, party and meals from the existing guest portal. The original reservation remains protected while alternatives are discussed; explicit selection atomically updates the reservation and operations. In the isolated demo, open **Agent → Coordinate dates, rooms & guest counts → Casey Lane · Selected & saved** to replay the latest3D impact. See [the demo guide](docs/CUSTOMER_CHANGE_DEMO.md) and [API v4](AGENT_API.md). Real Nemotron interpretation and83 automated tests verified; external OTA/PMS execution remains unconnected.
