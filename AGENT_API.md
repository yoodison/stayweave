# StayWeave customer-agent API

This is a working **local HTTP integration**, not an MCP server, OTA connector or production booking API. It accepts one room request at a time, including customer-coordinated amendments. A customer agent can request options, present them to its customer, and commit exactly the chosen option. The local guest page provides the human selection step without requiring the agent to infer consent.

## Run and try

Start the server with the configured model credential and inference enabled. The server generates a private local integration credential in `.stayweave/agent-key` (mode 0600). Do not commit, print, paste into the UI, or publish it. `scripts/guest-agent.mjs` reads it directly.

```sh
node scripts/guest-agent.mjs request examples/guest-request.json
node scripts/guest-agent.mjs read
```

The example client is an independent HTTP consumer, not an LLM agent framework. An actual customer agent can implement the same contract. It persists its idempotency key and returned capability in `.stayweave/agent-session.json` (0600) without printing secrets. Repeating the same input retries the same request; use a changed input or a separate request/client session for a new inquiry.

After the customer has reviewed the original message, interpreted conditions, arrival, unmet preferences and total, and explicitly chosen one returned option:

```sh
node scripts/guest-agent.mjs select EXACT_RETURNED_OPTION_ID --customer-confirmed
```

Do not select merely because a model prefers an option. Alternatively, open the request in the owner inbox and choose **Open guest choice**. The customer page displays options and requires a review checkbox and a separate confirmation button.

## Contract

Base URL: `http://127.0.0.1:3001`. Machine-readable summary: `GET /api/agent/schema`.

| Endpoint | Authorization | Result |
| --- | --- | --- |
| `POST /api/agent/requests` | Integration bearer credential + unique `Idempotency-Key` | Nebius interpretation, proposed options, `requestToken`, `guestPath` |
| `GET /api/guest/requests/:id` | Request bearer capability | Request, owner note, its selected reservation and linked tasks |
| `POST /api/guest/requests/:id/refresh` | Request bearer capability | New 15-minute options against current inventory/work |
| `POST /api/guest/requests/:id/changes` | Request bearer capability + unique `Idempotency-Key` | Full replacement proposal, new scoped `requestToken` and original reservation |
| `POST /api/guest/requests/:id/withdraw` | Proposal bearer capability | Decline only this proposal with `{keepOriginal:true}` |
| `POST /api/guest/requests/:id/select` | Request bearer capability | Atomic local reservation and operations receipt |

All writes use `Content-Type: application/json`. Intake fields are shown in [examples/guest-request.json](examples/guest-request.json). Dates, party size, arrival window and breakfast quantities are typed, explicit fields. The hotel interpreter extracts required/optional conditions for view, quiet, step-free access, room/bed type, high/low floor and proximity categories from the message. The legacy studio keeps its original three-feature vocabulary. Exact numeric distances/floors in prose are not silently approximated; use the structured fields and resolve flagged conflicting or unsupported claims. Unsupported required or ambiguous conditions block offers. Customers must check for omissions or incorrect classifications; quoted evidence validation is not proof of semantic accuracy.

Optional `spatial` object (all supplied values are hard filters, left-out fields are unrestricted):

```json
{
  "roomId": "504",
  "type": "family",
  "view": "garden",
  "minFloor": 4,
  "maxFloor": 6,
  "elevatorMax": 40,
  "breakfastMax": 80
}
```

Types: `king`, `twin`, `deluxe`, `family`, `suite`, `accessible`. Views: `sea`, `garden`, `city`. Floor limits: integers 1–6. Route caps: `elevatorMax`, `breakfastMax`, `gymMax`, `poolMax`, integers 0–300 meters. Invalid/unknown fields are rejected before model invocation. The hotel geometry and routes are synthetic operator-entered metadata. Proximity categories are visible: near elevator ≤15 m, away ≥30 m, near breakfast ≤50 m, gym ≤40 m, pool ≤60 m; high floors 4–6, low floors 1–2.

A selected booking may reference `sharedOrderId`. The receipt returns `sharedOrder` and its linked tasks along with booking-specific tasks. A shared turnover already reserves/consumes the linen; do not add it again to the booking. Cancellation retains independent turnover work.

Selection body:

```json
{
  "optionId": "the returned option ID",
  "version": 1,
  "conditionsReviewed": true,
  "customerConfirmed": true
}
```

Use the actual returned `offerVersion`, never a hardcoded version. Repeating a confirmed selection returns the same booking; selecting a different option for a confirmed request is rejected. The booleans record the integrating client's assertion of consent, not an independent proof of human action. A production integration needs authenticated customer identity, delegated-authority scope and a consent audit record.

An offer is **not an inventory hold**. Stale versions, expiration, room conflicts and resource shortages require refresh and renewed choice. No automatic substitution or price acceptance occurs. Intake duplicate keys with changed payloads are rejected. Invalid requests do not invoke the model. Concurrent duplicate intake shares a single in-flight model request in one process; a crash after a provider call but before persistence can still lead to a repeated inference call on retry.

## Planning rules and boundaries

- Guest required features, capacity, dates and staff/linen feasibility are hard filters. Options are ranked by stated preference matches, then earlier arrival, then total price. Already confirmed stays are fixed; competing pending requests are not globally optimized or held.
- Fixed cleaning and inspection slots include existing work and staff breaks. The planner is greedy and can miss a feasible allocation. The same example roster repeats over the supported 30-day horizon. The property date is explicitly a simulated date, not the computer clock.
- One local file stores reservations, work, linen reservations/consumption, guest requests and activity. Before replacing it, the server reads back the candidate. Only one API process may own it. Filesystem failure produces no success acknowledgement and no half-applied in-memory booking.
- Owner-local task routes support `POST /api/world/tasks/:id/start` and `/complete`. The Start action requires completed predecessors and an idle assignee; animations follow recorded state. Cleaning consumes allocated linen once. Cancellation releases pending work and unconsumed reservations, preserving consumed stock and completed work. Inspection requires cleaning first. Only the property's simulated current-date work can be completed.
- Breakfast is a cover/capacity plan for mornings after check-in through checkout. The displayed daily stock is a fixed planning capacity, not a food inventory depletion model; no order is placed.
- Future stays that would create an unplanned turnover before a later confirmed stay are excluded rather than silently changing that later promise.
- Owner-local `/api/world/reservations/:id/stay` accepts `check_in` / `check_out`: inspection/readiness is required for check-in; checkout is limited to an in-house stay departing on the simulated operating date and queues turnover once. `/api/world/rooms/:id/prepare` schedules or retries preparation after shortages. `/api/world/rooms/:id/maintenance` accepts `{action:"open",kind:"repair"|"construction",note,version}` or `{action:"repair_done",version}`. New work protects stays and existing preparation. Repair completion keeps the room off sale until recovery inspection; insufficient staff/linen becomes `needs_schedule`. These actions record local staff simulation, not dispatch.
- Owner room editing protects active preparation resources and all existing confirmed stays. A room with any confirmed reservation cannot be edited through this MVP.
- Guest notes, the local website, CLI and API operate locally. OTA, phone and SMS labels are manual/sample sources until connected. The UI neither transmits messages to them nor records fake provider acknowledgement.
- The operator surface is trusted-local only. Loopback/host/origin guards and integration tokens do not replace production tenancy, access controls, rate/spend budgets, TLS or a transaction database. Do not expose it through a tunnel as-is.

Booking.com’s actual messaging API is for authenticated connectivity integrations; it is not created by putting a source badge on an inbox. See [official connectivity documentation](https://developers.booking.com/connectivity/docs) and [messaging authentication](https://developers.booking.com/connectivity/docs/messaging-api/understanding-the-messaging-api). Nebius inference follows the [official OpenAI-compatible API](https://api.tokenfactory.nebius.com/docs).

## Connected change and 3D demo (2026-10-28)

- Owner-local `POST /api/world/reservations/:id/change` accepts a **complete replacement request** using the intake fields plus an `Idempotency-Key`. Describe all requirements to keep; this is not a partial natural-language patch. The guest name/source are taken from the original stay. Concurrent retries share one inference; retrying after acceptance returns the same request.
- The original confirmed stay remains valid during proposal. New options are planned against a temporary state that releases only its pending booking-owned preparation and unconsumed linen. Customer selection through the existing scoped guest endpoint atomically marks the old booking `replaced`, cancels its scheduled tasks, marks its request `amended`, and persists the replacement and new resource allocation. Shared turnover work remains attached to the room, so it is not duplicated or cancelled. Old capabilities cannot book an amended request again.
- Checked-in/out stays and booking-owned work that has started or completed require manual coordination; they are rejected by this amendment flow. No refunds, OTA amendments or payments execute.
- Options expose deterministic `impact` snapshots; confirmed requests retain `appliedImpact`. Counts distinguish active scheduled cleaning/team minutes across all dates, fresh linen available, and breakfast covers per service date. They are not payroll savings or purchase orders. Breakfast capacity is a hard feasibility condition.
- `/?demo=1` prefixes UI API calls with `/api/demo`. Its state lives in `.stayweave/hackathon-demo/`, separate from ordinary owner/agent records. Only this router has `/api/world/demo/scenario`, `/select/:id` and `/reset`. Reset preserves a dated prior snapshot. The director explicitly simulates customer choice; it does not prove real customer consent. Live Nebius and visibly labelled scripted interpretation are selectable; scripted mode still executes the actual planner and persistence flow.
- The 3D scene is illustrative Three.js geometry with orbit/zoom, facade/cutaway, six floors and selectable rooms. Animated paths illustrate dependencies, not measured movements; staff status changes only through recorded actions. Front-facing labels, floor focus and a full room list keep the 36-room view legible. Unsupported WebGL falls back to the prior SVG view.


## Owner planning routes (2026-10-29)

Loopback-only operator routes; not guest authority. Prefix `/api/demo` for the isolated sandbox.

- `POST /api/world/planning/model {}`: authenticated provider catalog check; no completion.
- `GET /api/world/planning/metrics`: measured usage and local adapter budget since instrumentation, not billed spend.
- `POST /api/world/planning/joint {requestIds:[...]}`:2–4 pending new requests; returns stored, expiring, version-bound alternatives and sequential baseline.
- `POST /api/world/planning/:id/publish {planId}`: prepare suggestions without booking/holding. Existing authenticated guest read/refresh/select endpoints handle individual choices.
- `POST /api/world/planning/incident {message}`: live Nemotron interpretation, deterministic extra-cleaning recovery alternatives, then model advice. Unsupported incidents422; stale concurrent world409. No execution.
- `POST /api/world/planning/:id/apply {planId,confirmed:true}`: approved feasible recovery only; revalidate current version and exact task changes, save/read back.
- `POST /api/world/planning/evaluate {live:true}`: four synthetic planning and three measured live language cases. `live:false` skips model calls.
- Sandbox only: `POST /api/demo/api/world/planning/demo-intake {live:true}` and `POST /api/demo/api/world/planning/:id/demo-confirm {planId,simulateCustomers:true}`. All-guest consent is explicitly simulated and unavailable in the ordinary namespace.

Planning calls are serialized per namespace. Local booking/task writes use clone→validate→atomic snapshot→readback, preserving the prior in-memory state on storage failure. Joint suggestions survive safe refresh only while still feasible and unexpired; they reserve no inventory. Actual inference uses the shared persistent budget journal and fails closed at the local cap.

## Confirmed arrival changes and the operating agent

Schema version 3 advertises `POST /api/guest/requests/:id/arrival-change`. Send the request bearer capability, a unique `Idempotency-Key` and `{ "arrival": 885, "confirmed": true }` only after this customer confirms that exact local time. The booking must be confirmed, arrive today and not be checked in. The response reports `resolved` or `exception`, the current reservation and `readback`. Until resolved, the old arrival remains authoritative. A matching pending incident can receive this trusted consent without duplicating the case. A key reused for different booking/time is rejected.

```sh
node scripts/guest-agent.mjs arrival 14:45 --customer-confirmed
```

The client privately retains the arrival-change idempotency key for retry. No model decision substitutes for customer confirmation. Existing shifts, readiness, exact consent and owner limits are checked before atomic persistence. Room, dates, price and breakfast remain unchanged. This path does not support a full stay amendment.

Owner-local routes: `POST /api/world/autopilot/policy`, `/report`, `/:id/approve`, `/:id/consent`, `/recheck`. Reports require a version and idempotency key; live reports use grounded model interpretation, structured reports are operator-verified. Policy has an optimistic revision and 24-hour expiry. Approval needs the exact current version, policy revision, plan key and confirmed flag; consent needs the exact guest booking/time. See [AUTOPILOT_DEMO.md](docs/AUTOPILOT_DEMO.md). These owner routes inherit the existing loopback-only demo boundary; do not expose them publicly.

## Customer-coordinated stay changes — schema4

`POST /api/guest/requests/:id/changes` is authorized by the existing guest request capability. Supply the complete updated intake fields; guest name and inbound source remain bound to the original reservation. `requirementsMode: "preserve"` is the guest default: keep existing required features/preferences and merge explicit spatial overrides. `"replace"` explicitly supplies a complete new set of room conditions. The owner-local legacy change route defaults to replace. Exact `spatial.roomId` is an optional hard constraint and must exist.

The response returns the new proposal's capability and its `originalReservation`. Use that **new capability** to read, refresh, select or withdraw the proposal. An original capability cannot select the child proposal. Authenticated receipts include recoverable `changeProposals` links; treat those links as credentials. The old reservation stays confirmed during all proposal/revision work, including a needs-review result. Requests in `needs_review` expose clarification on the customer page; agents can submit a revised complete request.

After explicit reviewed choice, select with the returned option ID and offerVersion. Revalidation and persistence must succeed before replacement is acknowledged. The old reservation becomes replaced, pending owned tasks are cancelled, unused linen is released, new preparation is allocated, meal dates change and sibling proposals close. Started owned work or checked-in stays require manual coordination. No unilateral owner/agent move, payment, refund or OTA change is performed. Repeated selection returns the same result. A subsequent change on the confirmed child targets the new reservation.

Decline with `POST /api/guest/requests/:id/withdraw {"keepOriginal":true}`. This cancels the pending proposal only. It cannot cancel a confirmed stay. Offers expire after15 minutes; refresh and obtain renewed customer choice on any stale version.

CLI example after an existing confirmed client session:

```sh
node scripts/guest-agent.mjs change examples/guest-change.json
node scripts/guest-agent.mjs read
# Only after the customer reviews and chooses this exact returned option:
node scripts/guest-agent.mjs select EXACT_RETURNED_OPTION_ID --customer-confirmed
# Alternatively, decline a still-pending proposal:
node scripts/guest-agent.mjs withdraw --keep-original
```

The example client persists capabilities/idempotency privately, makes actual HTTP calls, and never chooses an option on its own. It is an integration example, not an autonomous consumer LLM. Normal CLI sessions use ordinary local records; the browser demo and its API prefix `/api/demo` use isolated synthetic records.

## Concurrent coordination — schema5

New requests and amendments automatically join bounded groups of up to six eligible pending requests after local writes. Read your authenticated request to receive its `coordination` status (`offered`, `waiting`, `queued`, `exception`), generic reason and recommended room. Other guests’ messages, identities and capabilities are not returned. `GET /api/world` exposes the owner's aggregate current/history, not a guest endpoint. The operator may explicitly recheck with `POST /api/world/coordination/recheck {}`. Proposals do not hold inventory.

Submit the returned option's optional `choiceToken` with the existing select body. It binds the exact guest-visible terms and has its own15-minute expiry. A request capability and both review/confirmation booleans are still mandatory. The server revalidates the same terms against current availability/resources, permitting safe concurrent selections when only operational state changed. Without the token, existing strict offerVersion checks still apply. Tokens never authorize different terms or other requests. Expired/unavailable/changed options return409 `STALE_OFFER`; read/refresh and obtain renewed customer choice. Tokens are persisted privately for restart/idempotency; internal quote ledgers are omitted from public receipts.

The guest page polls its authenticated receipt and resets review when the chosen terms change. The CLI persists and sends the returned token with the exact selected option. No client automatically consents. Server writes remain single-process atomic snapshots; simultaneous requests are supported locally, not across multiple API processes.

Demo-only routes `POST /api/world/coordination/demo-intake` and `/demo-choose {"simulateCustomers":true}` exist solely under `/api/demo`. They use actual overlapping authenticated loopback HTTP requests and the configured interpreter, preserving prior demo data. They must never be described as real guest authorization. Failed individual choices remain partial outcomes; no blanket group success is inferred.

## API v6: guest responses and cancellation

All endpoints below require the same request-scoped bearer capability (or local integration credential). They return a read-back guest receipt; other guests' recommendations remain private.

| POST suffix on `/api/guest/requests/:id` | Input | Result |
|---|---|---|
| `/decline` | `{optionId, choiceToken}` or `{all:true}` | Exclude that room and re-offer, or decline the whole proposal |
| `/wait` | `{wait:true}` | Watch capacity without an owner exception or booking promise |
| `/resume` | `{}` | Reopen expired/declined proposal using current conditions |
| `/cancel-preview` | `{}` | `cancellation` with scope-bound token, expiry, impact/blocked reason |
| `/cancel` | `{cancelToken, confirmed:true}` | Atomic cancellation, or a protected handover exception |

New API offers have a fixed15-minute response deadline; `/refresh` cannot reopen or renew expired offers. `/resume` is an explicit customer action. Exact cancellations are replay-safe across restart. Consumed linen/completed tasks remain recorded; pending amendments close when their original stay is cancelled. No fees/refunds or external delivery are implemented.

The separate CLI supports `decline <option ID|all> --customer-confirmed`, `wait`, `resume`, `cancel-preview`, and `cancel --customer-confirmed`. It retains cancellation tokens privately and prints only reviewable impacts, never the token. Do not run the final cancellation command without the customer's reviewed choice. See [full demo](docs/GUEST_LIFECYCLE_DEMO.md).
