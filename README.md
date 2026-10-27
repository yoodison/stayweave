# StayWeave

**A connected operating plan for independent hospitality.**

StayWeave explores how a guest's reservation change can become a coordinated plan for room preparation, inspection, linen, breakfast and the people doing the work. The owner reviews exceptions and decisions that require approval.

## Try the demo

Requires Node.js 22.12+ and npm.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The app uses a fictional 20-room property and local, synthetic records.

1. Open **Review request** and select **See the impact**. The scheduler considers room checkout times, cleaning, inspection, staff shifts and breaks, and linen availability.
2. Preview an arrival choice and simulate the guest accepting it. Breakfast is a separate choice. Enable **Test an exception** to simulate a failed housekeeping update, then retry it from the exception queue.
3. Inspect the read-back operating plan. A breakfast purchase is a draft requiring owner approval; approval does not send an order.
4. Open **Team tasks** and replay staff completion. Scheduled work is distinct from simulated completion.

Use the reset icon in the upper-right corner to repeat the scenario. Local demo state is stored in `.stayweave/` and is not committed.

## Model configuration

The optional interpretation endpoint is designed for an NVIDIA Nemotron model through Nebius Token Factory. Without a key, the interface uses manual input and clearly indicates that the model is disconnected. Copy `.env.example` to `.env` and configure your own credentials locally; never commit or share your key. **Inference, latency and cost have not yet been validated.** Inference is paused by default; after verifying available credits and your spending settings, set `NEBIUS_INFERENCE_ENABLED=true` locally to allow calls. Availability, time arithmetic, inventory, staffing, pricing and approval are determined by application code, not model output. On macOS, if you have stored a key in your Keychain under service `StayWeave-Nebius` and account `local`, start the app with `./scripts/dev-keychain.sh` to load it into the local process without writing it into the repository.

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
