# Rheinau Solar Yard

**Machines that earn, pay, and recharge themselves on peaq.**

A solar plant only earns when its glass is clean. Rheinau Solar Yard is a live 3D solar farm in the browser. The machines that keep it clean are economic participants: a cleaning rover, an inspection drone, and a battery pack each hold a **peaq machine ID** and a wallet. They get paid for **verified work** and **buy their own energy**, settled on the peaq **Agung** testnet, with no invoice and no human approval in the loop.

Built for the [Germany side track: Advance the Machine Economy with peaq](https://superteam.fun/earn/listing/build-solutions-advancing-the-machine-economy-with-peaq) (Crypto World's Fair).

![The yard mid-cycle: 3D scene, live step caption, wallets with peaq machine IDs](docs/screenshots/yard-desktop.png)

## How it advances the Machine Economy

Most "robot fleet" demos stop at telemetry. Rheinau closes the economic loop around one real job:

1. **Proof of work, by a machine.** Lumen-04 (drone) inspects the array before and after the wash and hashes the recovered yield into a proof, using the same `computeDataHash` bytes as the peaq SDK.
2. **Payment released by that proof.** The plant sells the recovered power, then pays the robot owner for Kepler-01's cleaning and Lumen-04's inspection.
3. **Machine-to-machine energy purchase.** Kepler-01 pays BESS-2 (battery) for 22 kWh to recharge, and still keeps a surplus. The plant refills the battery from its own generation.
4. **Settlement.** After three days, the owners' earnings flow back and the circle closes: residents pay the city rent, the city buys the plant's energy, and the plant pays for the machines that keep it producing.

This is the listing's "two machines, one deal" idea (a robot paying a charger) in an energy DePIN, with identity, proof, and settlement in one working loop rather than five partial features.

## What is real on peaq, and what is simulated

| Real on Agung (chain id 9990) | Simulated |
| --- | --- |
| **4 machine IDs** in MachineRegistry, activated with `@peaqos/peaq-os-sdk` `activateMachine` (plant treasury, Kepler-01, Lumen-04, BESS-2), all owned by the yard operator | Rover, drone, soiling, and battery physics (browser, no hardware) |
| **12 PEAQ transfers with receipts**: rent, power, robot pay, wash wage, inspection fee, recharge, and the settlement. Every hash links to [Subscan](https://agung-testnet.subscan.io) | Without a funded key, the page replays those receipts instead of sending new ones |
| **A full live run** sent by the yard server itself: 4 fresh activations under a second operator, then all 12 payments of a three-day run, including Kepler-01 paying BESS-2 from its own wallet each day ([details](#live-run-on-agung)) | |
| Live reads: chain id, current block, MachineRegistry, DID precompile, and EventRegistry bytecode, plus wallet balances over the public RPC | Lumen's **activity event is not on chain**: Agung's EventRegistry reverts the call (see below) |

The four `activateMachine` transactions are linked below and from each machine card. Do not take the labels on trust:

```bash
npm run verify
```

This recomputes each machine ID with the peaq SDK, checks that MachineRegistry reports the operator as owner, and fetches every receipt from Agung: the replayed set (4 activations, 12 payments) and the live run (4 activations, Kepler's float, 12 payments, each matched on sender, recipient, and amount).

<details>
<summary>Machine IDs and a few receipts</summary>

| Machine | Address | MachineRegistry ID | Activation |
| --- | --- | --- | --- |
| Rheinau treasury | [`0x90f7…575C`](https://agung-testnet.subscan.io/account/0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C) | `102441207943741495815144671880889482642676067611685166339896603723990339550998` | [`0x03ce…ad78`](https://agung-testnet.subscan.io/tx/0x03cebbe41c47450d51ecbf48a76e219112692b50eeceb8b143af15a13428ad78) |
| Kepler-01 (rover) | [`0x8D63…b77E`](https://agung-testnet.subscan.io/account/0x8D63581101AD3DE66DCF1c2Ab569B6c442e2b77E) | `108602975430599403666987812419548965340727236481014319489660215287370279879996` | [`0x5b0b…836c`](https://agung-testnet.subscan.io/tx/0x5b0b19e25dbaa639c91d938c85def41956c7974b38d81bd90d6f03cb3933836c) |
| Lumen-04 (drone) | [`0x4264…F138`](https://agung-testnet.subscan.io/account/0x42647B681D98961A45f4fc6e4Bc5F5d56892F138) | `88409303619999558588125362065661591412349648541783424028499915752405324092273` | [`0x8e3b…efdf`](https://agung-testnet.subscan.io/tx/0x8e3bd0dd6ec7733e2f365a54f0e6da94b659ae70801333b77fe5d8230662efdf) |
| BESS-2 (battery) | [`0x0fF7…b943`](https://agung-testnet.subscan.io/account/0x0fF7df529aD2C19DF6637a8b1C148C268C3Eb943) | `106466828269666555797166757514327820279976210156543034156017671456103315692484` | [`0xda47…55f8`](https://agung-testnet.subscan.io/tx/0xda4782a80e5f94269cd82342d68e420abdb976314dfe936ac409e994646255f8) |

- Kepler-01 pays BESS-2 for a recharge: [`0xf27f…ec1c`](https://agung-testnet.subscan.io/tx/0xf27f9652c6af53f31f4fae33a1764cbb12f3fb57b1991b090f8fdfd9d1ecec1c)
- Treasury pays Kepler-01 the wash wage: [`0xfb92…1164`](https://agung-testnet.subscan.io/tx/0xfb92dc648fdb91f668842e3d813c46cf3ac6e7fe3973d0e6d69408b31c2e1164)
- Plant owner pays robot owner for cleaning and inspection: [`0xb636…7dd0`](https://agung-testnet.subscan.io/tx/0xb636c5d73105481104db2e75405fc6500f5e21e317d95171d0060f9a06877dd0)
- Closing settlement: [`0xe36c…f6e7`](https://agung-testnet.subscan.io/tx/0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7)

Subscan shows Agung's testnet token as AGNG. The app calls it PEAQ.

</details>

### Live run on Agung

With a funded key loaded, the yard server sent one complete three-day run on its own, with no hand-made transactions. Operator [`0x8a61…d23A`](https://agung-testnet.subscan.io/account/0x8a61248e23e04b97A0A42A87D09459573478d23A) was funded from the peaq Gas Station, activated four new machine IDs, gave Kepler-01 a 0.1 PEAQ operating float ([`0xd9b2…cdfb`](https://agung-testnet.subscan.io/tx/0xd9b25cb256a65bf6e9be15728890af97d592a2fe93b57d7eea2eab6f0f05cdfb)), and then sent each payment as the page reached it. The full list, with addresses and machine IDs, is in [`scripts/live-run.ts`](scripts/live-run.ts).

| Payment | Amount | From → To | Receipt |
| --- | --- | --- | --- |
| Apartment rent | 0.05 | Residents → City | [`0x4159…c5eb`](https://agung-testnet.subscan.io/tx/0x4159aa0a4f850a98b3f7fa6853bc3267506722f14ffda7a04394fe49bf31c5eb) |
| Day 1 power | 0.05 | Residents → Plant owner | [`0x856a…edda`](https://agung-testnet.subscan.io/tx/0x856a256a49e1a9cf12729ddbf82029f89f8f4a3e109c92051442b9b8dabcedda) |
| Day 1 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x7550…7e3c`](https://agung-testnet.subscan.io/tx/0x75507a1f898c2753c5e0ec0a380f90db503cacd284a60c1198ebcccdac047e3c) |
| Day 1 recharge, 22 kWh | 0.01 | Kepler-01 → BESS-2 | [`0xa9e9…96cb`](https://agung-testnet.subscan.io/tx/0xa9e92e6b9f92d024e811d79427de993708dc6248b66e4882f47a8dbb6d4496cb) |
| Day 2 power | 0.05 | Residents → Plant owner | [`0x4c64…a034`](https://agung-testnet.subscan.io/tx/0x4c64684800a3df9dd2e74ce5eb9232759f0b4dd00459dd9c01ba98f406faa034) |
| Day 2 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x5de2…2665`](https://agung-testnet.subscan.io/tx/0x5de2f24b93346cb71ce15d7cc08969d4a6cc9d7aba9db6861d81f30900fe2665) |
| Day 2 recharge, 22 kWh | 0.01 | Kepler-01 → BESS-2 | [`0x550d…53cd`](https://agung-testnet.subscan.io/tx/0x550dd2b74d9b5e03d1d9352b7f69e4295a9c4fafcdcb32e6f42dff96436753cd) |
| Day 3 power | 0.05 | Residents → Plant owner | [`0x4c3f…ef60`](https://agung-testnet.subscan.io/tx/0x4c3fe0928984bb5e67924a0df50fc3f29d464753039e2e8e7545669b2badef60) |
| Day 3 cleaning and inspection | 0.03 | Plant owner → Robot owner | [`0x17b6…af74`](https://agung-testnet.subscan.io/tx/0x17b635f3285a298fd84d38a6241d159a2c10a9a826e26719457e1d287072af74) |
| Day 3 recharge, 22 kWh | 0.01 | Kepler-01 → BESS-2 | [`0xdca3…4532`](https://agung-testnet.subscan.io/tx/0xdca3482b425ae0fde841ef51ebc4fea35dcebbd0ed6aa7d7165ec05fae8d4532) |
| Robot earnings into settlement | 0.0899 | Robot owner → Plant owner | [`0x20fe…de64`](https://agung-testnet.subscan.io/tx/0x20fe1db877919055c2712cde9f12099397c4cd449e4dd66b1c5868db075dde64) |
| Settlement | 0.1498 | Plant owner → Residents | [`0x121c…de3d`](https://agung-testnet.subscan.io/tx/0x121c5380848c89ee9604f50a4c925dfabe2b7d0171d179572af86fa587a3de3d) |

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

With a funded Agung key, the yard server activates any missing machines (`activateMachine`, entry bond read from `MachineSubscription.requiredPeaqAmount(0)`, 0.4 PEAQ on Agung), tops Kepler-01 up to a 0.1 PEAQ float when it holds less than 0.05, and then sends each payment as a native transfer while the page plays. Copy `.env.example` to `.env`, which is git-ignored, and set `PEAQOS_PRIVATE_KEY` or `PEAQOS_PRIVATE_KEY_FILE`. Put the treasury private key only in the environment or in a file outside the repo. Child wallets for the machines and owners are derived from that key in memory.

The header then shows "Live writer". Every page load and every restart (R) is a new run that sends new transactions. Receipts never carry over from an earlier run. Without a key, the header shows "Replaying confirmed receipts".

Agung tokens are free from the [peaq Gas Station](https://depinstation.peaq.xyz) (5 PEAQ per new wallet). The first start costs 1.6 PEAQ in bonds plus Kepler's float. After that, a run costs the operator about 0.05 PEAQ (the city keeps the rent) and Kepler 0.03 PEAQ in recharges. Most of the rest flows back through the settlement.

Every visitor's page load starts its own run, so on a public URL either leave the key out (replay mode) or expect each visit to spend from the operator wallet.

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

```bash
docker build -t rheinau-solar-yard .
docker run --rm -p 4317:4317 rheinau-solar-yard
```

Add `-e PEAQOS_PRIVATE_KEY_FILE=/run/secrets/agung.key -v /path/agung.key:/run/secrets/agung.key:ro` to enable writes. `deploy/Caddyfile` terminates HTTPS in front of port 4317.

## Demo video

A narrated walkthrough (2:45) covers one full day, the receipts on Subscan, a 4× run to settlement, and the "How it works" guide. The timed script is in [`docs/demo-script.md`](docs/demo-script.md).
