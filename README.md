# Rheinau Solar Yard

A live in-browser 3D solar farm where four machines settle with each other. Panels soil and lose output, a cleaning rover washes them, an inspection drone verifies the recovered yield, and that proof releases payment from the plant treasury. The rover then buys a recharge from the on-site battery pack and still keeps a surplus, so the loop can repeat.

The scene is rendered with React Three Fiber. It is not a video.

## The loop

The page auto-plays. One cycle, at 1×, is about 35 seconds:

1. **Soil.** Dust builds on the modules and array output falls.
2. **Wash.** Kepler drives the rows with the brush on the glass. Its battery falls.
3. **Inspect.** Lumen flies a pass and hashes an activity event. Cleanliness above the bar books **0.05 PEAQ** of recovered generation on the yard ledger.
4. **Pay.** The treasury pays Kepler **0.02 PEAQ** and Lumen **0.01 PEAQ**. The plant keeps **0.02 PEAQ** on the yard ledger.
5. **Recharge.** Kepler drives to BESS-2 and pays **0.01 PEAQ** for **22 kWh**. Kepler keeps **0.01 PEAQ** of its wage.
6. **Refill.** The plant puts 22 kWh back into the pack. BESS-2's wallet does not move on the refill; it already rose when it sold the energy.

Pause, 1× / 2× / 4×, and Reset sit in the header. Space pauses, R resets, and 1 / 2 / 4 set the speed. The event log names who paid whom.

## Wallets

| Machine | Role | Opens with |
| --- | --- | --- |
| Rheinau treasury | Farm wallet, the inverter house | 3.00 PEAQ |
| Kepler | Cleaning rover | 0.10 PEAQ |
| Lumen | Inspection drone | 0.05 PEAQ |
| BESS-2 | Battery pack / charger | 0.20 PEAQ |

Each card shows a `did:peaq:` address DID, the simulated balance, the last transfer, and the on-chain PEAQ balance of that address.

## What is live peaq, and what is simulated

Live, no key required:

- The page reads Agung over `https://peaq-agung.api.onfinality.io/public` with viem: chain id, block number, bytecode of MachineRegistry, the DID precompile `0x…0800`, and the Agung EventRegistry, plus the native PEAQ balance of each machine address.
- Chain id **9990** and the MachineRegistry address come from the Economics 2.0 record `agung-2026-08-28`. `npm run sim` loads `@peaqos/peaq-os-sdk` and checks those fields still match `resolveTokenomics20Deployment("agung-2026-08-28")`.
- Inspection payloads are keccak256 hashes, the same bytes as the SDK's `computeDataHash`. The sim test checks that match. They are tagged as an activity event (`EVENT_TYPE_ACTIVITY` = 1) with self-reported trust (`TRUST_SELF_REPORTED` = 0).

The browser does not import `@peaqos/peaq-os-sdk`. That package pulls Node built-ins (`process`, `fs`) and throws before React can render. The SDK still runs in `npm run sim`.

The yard server (`npm run peaq`, or `npm start` after a build) loads `@peaqos/peaq-os-sdk` and, when `PEAQOS_PRIVATE_KEY` can pay, calls `activateMachine` for Rheinau-treasury, Kepler-01, Lumen-04, and BESS-2, then sends the wage, drone fee, and recharge as native transfers and `submitEvent` for the inspection. The browser never imports the SDK.

The entry bond is whatever `MachineSubscription.requiredPeaqAmount(0)` returns. On Agung that is **0.4 PEAQ** per machine, paid in the `0x…0809` token, which matches the native balance. It is not a 1 PEAQ constant.

If the key is missing or the balance is below the bond, the server does not submit a transaction. The header and the event log say the write did not land.

## Deploy on a VPS

```bash
docker build -t rheinau-solar-yard .
docker run --rm -p 4317:4317 \
  -e PEAQOS_PRIVATE_KEY_FILE=/run/secrets/agung.key \
  -v /etc/rheinau/agung.key:/run/secrets/agung.key:ro \
  rheinau-solar-yard
```

Or without Docker: `npm install && npm run build && npm start`. The process binds `0.0.0.0:$PORT` (default 4317) and serves the built page plus `/api/peaq`.

Put the treasury private key only in the environment or in a file outside the repo. Point a domain at the host and use `deploy/Caddyfile` so Caddy terminates HTTPS and proxies to port 4317. No Kubernetes and no paid host are required.

## ROS 2

`ros2` is not on this machine, and this demo does not install it. The rover loop runs in the browser. The same signals are shown as topic names a ROS graph would carry: `/rover/battery`, `/rover/coverage`, `/rover/cmd`, `/drone/cmd`, `/array/soiling`, `/array/yield_kw`, `/bess/inventory_kwh`. peaqOS does ship a ROS 2 node (`peaq_ros2_peaqos`) for on-chain machines; it is not required to watch this yard.

## Run

```bash
npm install
npm run peaq    # Agung writer on 0.0.0.0:4318
npm run dev     # page on 0.0.0.0:4317, proxies /api to 4318
```

Open http://127.0.0.1:4317 .

```bash
npm run sim     # ledger self-test, no browser
npm run build   # typecheck and production bundle
npm start       # serve dist and /api on 0.0.0.0:4317
```

Copy `.env.example` to a file that is not committed when you add a key. See `.env.example` for `PEAQOS_PRIVATE_KEY` and `PEAQOS_PRIVATE_KEY_FILE`.
