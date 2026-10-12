# Fuel the Robot Economy

**Machines that earn, pay, and recharge themselves on peaq.**

A solar plant only earns when its glass is clean. Fuel the Robot Economy is a live 3D solar farm in the browser. The machines that keep it clean are economic participants: a cleaning rover, an inspection drone, and a battery pack each hold a **peaq machine ID** and a wallet. They get paid for **verified work** and **buy their own energy**, settled on the peaq **Agung** testnet, with no invoice and no human approval in the loop.

Built for the [Germany side track: Advance the Machine Economy with peaq](https://superteam.fun/earn/listing/build-solutions-advancing-the-machine-economy-with-peaq) (Crypto World's Fair).

**Live demo:** [fuel-the-robot-economy.vercel.app](https://fuel-the-robot-economy.vercel.app). It runs in replay mode: no key, and every receipt links to a confirmed Agung transaction.

![The yard mid-cycle: 3D scene, live step caption, wallets with peaq machine IDs](docs/screenshots/yard-desktop.png)

## How it advances the Machine Economy

Most "robot fleet" demos stop at telemetry. Fuel the Robot Economy closes the economic loop around one real job:

1. **Proof of work, by a machine.** Lumen-04 (drone) inspects the array before and after the wash and hashes the recovered yield into a proof, using the same `computeDataHash` bytes as the peaq SDK.
2. **Payment released by that proof.** The city buys the recovered power from the plant owner, and the plant owner pays the robot owner for Kepler-01's cleaning and Lumen-04's inspection.
3. **Machine-to-machine energy purchase.** Kepler-01 pays the Battery for 22 kWh to recharge from its own wallet. The plant refills the Battery from its own generation.
4. **A loop that can run forever.** A Drain wallet funds each run (the city's power budget and Kepler's recharge budget). After three days, the plant owner, the robot owner, and the Battery send everything back to the Drain, so the next run starts from the same budget and only gas is spent.

This is the listing's "two machines, one deal" idea (a robot paying a charger) in an energy DePIN, with identity, proof, and settlement in one working loop rather than five partial features.

## What is real on peaq, and what is simulated

| Real on Agung (chain id 9990) | Simulated |
| --- | --- |
| **4 machine IDs** in MachineRegistry, activated with `@peaqos/peaq-os-sdk` `activateMachine` (plant treasury, Kepler-01, Lumen-04, Battery), all owned by the yard operator | Rover, drone, soiling, and battery physics (browser, no hardware) |
| **Every payment of a full run is a PEAQ transfer with a receipt**: the run budget, power, robot pay, recharges, and the return to the Drain, 14 transfers in all, sent by the yard server itself. Every hash links to [Subscan](https://agung-testnet.subscan.io) | Without a funded key, the page replays that run's receipts instead of sending new ones |
| Live reads: chain id, current block, MachineRegistry, DID precompile, and EventRegistry bytecode, plus wallet balances over the public RPC | Lumen's **activity event is not on chain**: Agung's EventRegistry reverts the call (see below) |

Do not take the labels on trust:

```bash
npm run verify
```

This recomputes each machine ID with the peaq SDK, checks that MachineRegistry reports the operator as owner, fetches the four activation receipts, and matches every transfer of the replayed run on sender, recipient, and amount.

### Machines

| Machine | Address | MachineRegistry ID | Activation |
| --- | --- | --- | --- |
| Plant treasury (machine type `Rheinau-treasury`) | [`0x8a61…d23A`](https://agung-testnet.subscan.io/account/0x8a61248e23e04b97A0A42A87D09459573478d23A) | `33972125727311862102242550464936382332590305066238494161796118837764432459771` | [`0xec8a…1859`](https://agung-testnet.subscan.io/tx/0xec8a622a893f77ed675902751ea196e5336ad11339a0bd3fc34e50f6d33c1859) |
| Kepler-01 (rover) | [`0xa389…0931`](https://agung-testnet.subscan.io/account/0xa3893E09F5546B56B6e845ad194e28a216730931) | `1962884760408859527843867200144780974073261720970703856069487751650844150575` | [`0xde6e…b990`](https://agung-testnet.subscan.io/tx/0xde6ee8f2b2b2b6154034bb7ea763865c9616241a61484a284dabedaa0517b990) |
| Lumen-04 (drone) | [`0x77cc…20d9`](https://agung-testnet.subscan.io/account/0x77cc0A6aeA9F14c842251aE1384E45A3F30320d9) | `70771729342491203195750444655678312409844457848436599576321158744592664857524` | [`0xd25a…b671`](https://agung-testnet.subscan.io/tx/0xd25a7b8a143b87a9ee0418d5b1370c75f902f1367f890d367535a0390030b671) |
| Battery (machine type BESS-2) | [`0x6F8A…df5d`](https://agung-testnet.subscan.io/account/0x6F8A86803dafE766F6381F781D5003BC5aa2df5d) | `23561826428746862383207998597570184258462227245211301004858601842139846427384` | [`0xae8d…dcf5`](https://agung-testnet.subscan.io/tx/0xae8de92ad5772c5d0fb4084316917235325b0e6c5200cfe12aa2065c666edcf5) |

The operator [`0x8a61…d23A`](https://agung-testnet.subscan.io/account/0x8a61248e23e04b97A0A42A87D09459573478d23A) was funded from the peaq Gas Station. Its wallet is also the Drain. The city, plant owner, robot owner, and machine wallets are derived from its key in memory.

### One confirmed run

The page replays this run when no key is loaded. The legs are in [`src/peaq/replayRun.ts`](src/peaq/replayRun.ts). The Drain sent out 0.18 PEAQ and got 0.18 PEAQ back.

| Step | Amount (PEAQ) | From → To | Receipt |
| --- | --- | --- | --- |
| Start: power budget | 0.15 | Drain → City | [`0xc2cb…e0ce`](https://agung-testnet.subscan.io/tx/0xc2cb0378c703d3d15b6bae922ba66587e960a04e44a91f107db8281c8be1e0ce) |
| Start: recharge budget | 0.03 | Drain → Kepler-01 | [`0x7a27…0671`](https://agung-testnet.subscan.io/tx/0x7a27c4b6926054fdebe908e7b1485727d1cbdde423658c8e3c06f99e3e750671) |
| Day 1 power | 0.05 | City → Plant owner | [`0x4ce9…69ec`](https://agung-testnet.subscan.io/tx/0x4ce9f0b8e5122bb3545b75ec1a70ba07cd8bcf7d0cc929793e80fce0c23769ec) |
| Day 1 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x3c4c…2210`](https://agung-testnet.subscan.io/tx/0x3c4c399d25ac257c2d81884e3898a376f89fcc511fdeafde6422a157c8f42210) |
| Day 1 recharge, 22 kWh | 0.01 | Kepler-01 → Battery | [`0x375a…caf9`](https://agung-testnet.subscan.io/tx/0x375af72cd7e116405ff4d733f46d14ff1862d20fde9b23aed62593f074eecaf9) |
| Day 2 power | 0.05 | City → Plant owner | [`0x0a32…baae`](https://agung-testnet.subscan.io/tx/0x0a326791f47ce144e394e3361bebf78affc739e4847942c9142124c0e388baae) |
| Day 2 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x236c…e05d`](https://agung-testnet.subscan.io/tx/0x236cbae29542cbd77364e0bb736108f8745bfee5779ba27fe34ded038970e05d) |
| Day 2 recharge, 22 kWh | 0.01 | Kepler-01 → Battery | [`0xed63…5ed7`](https://agung-testnet.subscan.io/tx/0xed6381bd6999927dd992e7b9223127f9366359c6814ec604159e92522bea5ed7) |
| Day 3 power | 0.05 | City → Plant owner | [`0xa39e…09de`](https://agung-testnet.subscan.io/tx/0xa39e8dc0c458c90aec4474bd2631613126c58579ae2998908397a9cc791a09de) |
| Day 3 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x9dc5…9b2b`](https://agung-testnet.subscan.io/tx/0x9dc52fc10867fc3a393d1fa8451327a5843688311545cb7b9f9577eba42c9b2b) |
| Day 3 recharge, 22 kWh | 0.01 | Kepler-01 → Battery | [`0x3cb2…5257`](https://agung-testnet.subscan.io/tx/0x3cb25cf5233bb906c1b25277f202fe683ad3e63d79f39ed01894fb695f7b5257) |
| End: back to the Drain | 0.06 | Plant owner → Drain | [`0x9699…028f`](https://agung-testnet.subscan.io/tx/0x969960b4b79fce8d1ff004609201b4f5ac5f1db31575a3e0ce001510ca2f028f) |
| End: back to the Drain | 0.09 | Robot owner → Drain | [`0x6134…69b0`](https://agung-testnet.subscan.io/tx/0x6134a4b20e9a682fd0f65c6e3571a27742d143950247e2d829cd27ab30cf69b0) |
| End: back to the Drain | 0.03 | Battery → Drain | [`0xdbb3…7591`](https://agung-testnet.subscan.io/tx/0xdbb3fc15913bc4c7895f51f50a2155432967492f0e3d52d700c33bac30677591) |

Subscan shows Agung's testnet token as AGNG. The app calls it PEAQ.

**Known gap.** Lumen's inspection should also be reported as a peaqOS activity event (`EVENT_TYPE_ACTIVITY`, self-reported trust). Simulating that call against EventRegistry `0x2DAD…0040` reverts with empty data, from both the operator and Lumen-04, so nothing was broadcast. The page shows this as "Not on chain yet" instead of inventing a hash.

## Run it

Requires Node 22.6+ (the server uses `--experimental-strip-types`). No key or account is needed.

```bash
npm install
npm run peaq    # yard server on :4318 (Agung reads, receipts, optional writer)
npm run dev     # page on http://127.0.0.1:4317, proxies /api to :4318
```

Or as a single production process:

```bash
npm run build && npm start   # serves the page and /api on http://127.0.0.1:4317
```

The page also works as a static build with no server. It then shows the verified machine IDs and replays the confirmed receipts from the browser.

| Command | What it does |
| --- | --- |
| `npm run verify` | Re-checks machine IDs and all receipts on Agung |
| `npm run sim` | Ledger self-test, plus checks that the browser constants still match the peaq SDK |
| `npm run lint` / `npm run build` | oxlint, then typecheck and production bundle |

**Controls:** Space pause · 1 / 2 / 4 speed · R restart · F expand the yard · H "How it works". Drag to orbit, scroll or pinch to zoom. One day takes about 55 s at 1×, and a full three-day run about 40 s at 4×.

### Sending new transactions (optional)

With a funded Agung key, the yard server activates any missing machines (`activateMachine`, entry bond read from `MachineSubscription.requiredPeaqAmount(0)`, 0.4 PEAQ on Agung) and then sends each payment as a native transfer while the page plays. Copy `.env.example` to `.env`, which is git-ignored, and set `PEAQOS_PRIVATE_KEY` or `PEAQOS_PRIVATE_KEY_FILE`. Put the treasury private key only in the environment or in a file outside the repo. Child wallets for the machines and owners are derived from that key in memory.

The header then shows "Live writer". Every page load and every restart (R) is a new run that sends new transactions. Receipts never carry over from an earlier run. Without a key, the header shows "Replaying confirmed receipts".

Agung tokens are free from the [peaq Gas Station](https://depinstation.peaq.xyz) (5 PEAQ per new wallet). The first start costs 1.6 PEAQ in bonds. Each run needs 0.18 PEAQ in the Drain and returns it at the end, so a run only costs gas. A run that is cut short leaves its money in the city or owner wallets, and the next completed run sweeps it back.

Every visitor's page load starts its own run, and runs share the same wallets, so keep one page open at a time. On a public URL, leave the key out (replay mode).

## Screenshots

| Run complete: every payment has an Agung hash | How it works: real vs simulated | Mobile |
| --- | --- | --- |
| ![Run complete](docs/screenshots/run-complete.png) | ![How it works](docs/screenshots/how-it-works.png) | ![Mobile](docs/screenshots/yard-mobile.png) |

## How it is built

- **Scene:** React 19, React Three Fiber, and drei (`src/scene`). The rover follows a wash route around a blocked row (`src/world/layout.ts`).
- **Economy:** a deterministic engine (`src/economy/engine.ts`) drives phases, wallets, and the chain jobs each payment should produce. `npm run sim` asserts the balances.
- **peaq:** viem reads Agung from the browser (`src/peaq/agung.ts`). `server/chain.ts` uses `@peaqos/peaq-os-sdk` for machine IDs, activation, and transfers. The browser never imports the SDK, because it pulls in Node built-ins.
- **Robotics framing:** rover and drone signals are named as ROS 2 topics would be (`/rover/battery`, `/array/yield_kw`, …). ROS 2 is not required. peaqOS ships a ROS 2 node (`peaq_ros2_peaqos`) for real hardware.

## Deploy

**Static (Vercel or any CDN).** `vercel.json` builds with `npm run build` into `dist/`. No environment variables are needed. Without the yard server, the page shows the verified machine IDs and replays the confirmed run.

**With the yard server (Docker).** This serves the page and `/api`, and sends new transactions when a key is mounted:

```bash
docker build -t fuel-the-robot-economy .
docker run --rm -p 4317:4317 fuel-the-robot-economy
```

Add `-e PEAQOS_PRIVATE_KEY_FILE=/run/secrets/agung.key -v /path/agung.key:/run/secrets/agung.key:ro` to enable writes. `deploy/Caddyfile` terminates HTTPS in front of port 4317.

## Demo video

A narrated walkthrough (2:45) covers one full day, the receipts on Subscan, a 4× run to settlement, and the "How it works" guide. The timed script is in [`docs/demo-script.md`](docs/demo-script.md).
