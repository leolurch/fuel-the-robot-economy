import {
  EVENT_TYPE_ACTIVITY,
  TRUST_SELF_REPORTED,
  computeDataHash,
  resolveTokenomics20Deployment,
} from "@peaqos/peaq-os-sdk";
import { AGUNG_DEPLOYMENT } from "../peaq/deployment.ts";
import {
  EVENT_TYPE_ACTIVITY as BROWSER_EVENT,
  TRUST_SELF_REPORTED as BROWSER_TRUST,
  computeDataHash as browserHash,
} from "../peaq/proof.ts";
import { Engine, inspectionPayload } from "./engine.ts";
import { DOCK, clearanceProblems, firstAroundProgress, washRoute } from "../world/layout.ts";
import {
  OPENING_CENTS,
  PERSON_OPENING_CENTS,
  PHASES,
  PLANT_EARN_CENTS,
  CITY_BUDGET_CENTS,
  KEPLER_BUDGET_CENTS,
  POWER_CENTS,
  RUN_BUDGET_CENTS,
  RUN_CYCLES,
  TARIFF,
  WORK_CENTS,
} from "./model.ts";
import type { ActorId } from "./types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const resolved = resolveTokenomics20Deployment("agung-2026-08-28");
assert(resolved.chainId === AGUNG_DEPLOYMENT.chainId, "Agung chain id drifted from the peaq SDK");
assert(resolved.deploymentId === AGUNG_DEPLOYMENT.deploymentId, "deployment id drifted");
assert(
  resolved.contracts.machineRegistry.toLowerCase() === AGUNG_DEPLOYMENT.contracts.machineRegistry.toLowerCase(),
  "MachineRegistry drifted from the peaq SDK",
);
assert(EVENT_TYPE_ACTIVITY === BROWSER_EVENT && TRUST_SELF_REPORTED === BROWSER_TRUST, "event constants drifted");
const lockPayload = new TextEncoder().encode("fuel-the-robot-economy-sdk-lock");
assert(computeDataHash(lockPayload) === browserHash(lockPayload), "browser hash is not computeDataHash");

function runUntil(engine: Engine, cycle: number): void {
  let guard = 0;
  while (engine.snapshot().cycle < cycle) {
    engine.tick(0.05);
    guard += 1;
    if (guard > 20_000) throw new Error(`timed out waiting for cycle ${cycle}`);
  }
}

function expectNet(label: string, actual: number, opening: number, perCycle: number, cycles: number): void {
  const expected = opening + perCycle * cycles;
  assert(actual === expected, `${label} ${actual} !== ${expected}`);
}

const fast = new Engine();
fast.setSpeed(4);
runUntil(fast, 2);
const once = fast.snapshot();
assert(once.phase === "soil", `expected soil at cycle 2, got ${once.phase}`);
assert(once.people.drain.balanceCents === PERSON_OPENING_CENTS.drain - RUN_BUDGET_CENTS, `drain ${once.people.drain.balanceCents}`);
assert(once.people.city.balanceCents === CITY_BUDGET_CENTS - POWER_CENTS, `city ${once.people.city.balanceCents}`);
expectNet("plant", once.people.plantOwner.balanceCents, PERSON_OPENING_CENTS.plantOwner, PLANT_EARN_CENTS, 1);
expectNet("robot owner", once.people.robotOwner.balanceCents, PERSON_OPENING_CENTS.robotOwner, WORK_CENTS, 1);
expectNet("treasury", once.wallets.treasury.balanceCents, OPENING_CENTS.treasury, 0, 1);
expectNet("robot", once.wallets.robot.balanceCents, OPENING_CENTS.robot + KEPLER_BUDGET_CENTS, -TARIFF.rechargeCents, 1);
expectNet("drone", once.wallets.drone.balanceCents, OPENING_CENTS.drone, 0, 1);
expectNet("battery", once.wallets.battery.balanceCents, OPENING_CENTS.battery, TARIFF.rechargeCents, 1);
assert(once.robotBattery > 0.9, `battery not recharged: ${once.robotBattery}`);
assert(Math.abs(once.inventoryKwh - 168) < 0.001, `inventory ${once.inventoryKwh}`);
assert(once.proofHash.startsWith("0x") && once.proofHash.length === 66, once.proofHash);
assert(
  once.proofHash === computeDataHash(inspectionPayload(1, once.cleanlinessMilli)),
  "proof hash drifted from peaq computeDataHash",
);
assert(once.events.some((event) => event.text.includes("The run budget goes out")), "missing run funding");
assert(once.events.some((event) => event.text.includes("The city pays the plant owner")), "missing power payment");
assert(once.chainJobs.some((job) => job.kind === "fund"), "missing fund job");
assert(once.events.some((event) => event.text.includes("pays the robot owner")), "missing robot-owner payment");
assert(once.events.some((event) => event.text.includes("pays the Battery")), "missing recharge payment");
assert(once.chainJobs.some((job) => job.kind === "power"), "missing power job");
assert(once.chainJobs.some((job) => job.kind === "work"), "missing work job");
assert(once.events.some((event) => event.kind === "energy"), "missing refill");

const pausedAt = once.wallets.robot.balanceCents;
fast.togglePause();
for (let i = 0; i < 30; i += 1) fast.tick(0.05);
assert(fast.snapshot().wallets.robot.balanceCents === pausedAt, "pause did not hold the ledger");
assert(fast.snapshot().paused, "pause flag");

fast.reset();
const opened = fast.snapshot();
assert(opened.cycle === 1 && opened.phase === "soil", "reset phase");
const ids: ActorId[] = ["treasury", "robot", "drone", "battery"];
for (const id of ids) {
  assert(opened.wallets[id].balanceCents === OPENING_CENTS[id], `reset ${id}`);
}
assert(opened.people.drain.balanceCents === PERSON_OPENING_CENTS.drain, "reset drain");

const steady = new Engine();
let guard = 0;
let closed = steady.snapshot();
while (!closed.runComplete) {
  steady.tick(0.05);
  closed = steady.snapshot();
  guard += 1;
  if (guard > 20_000) throw new Error("timed out waiting for the three-day run");
}
assert(closed.cycle === RUN_CYCLES, `run stopped on cycle ${closed.cycle}`);
assert(closed.paused, "run should hold after settlement");
assert(closed.people.drain.balanceCents === PERSON_OPENING_CENTS.drain, `drain did not get the run back: ${closed.people.drain.balanceCents}`);
for (const id of ["city", "plantOwner", "robotOwner"] as const) {
  assert(closed.people[id].balanceCents === 0, `${id} still holds ${closed.people[id].balanceCents}`);
}
for (const id of ["robot", "battery"] as const) {
  assert(closed.wallets[id].balanceCents === 0, `${id} still holds ${closed.wallets[id].balanceCents}`);
}
assert(closed.chainJobs.some((job) => job.kind === "settlement"), "missing settlement job");
assert(closed.events.some((event) => event.text.includes("Funds reset for the next run")), "missing settlement log");

const gaps = clearanceProblems();
assert(gaps.length === 0, gaps.slice(0, 6).join(" | ") || "clearance");
assert(PHASES[1]?.id === "survey" && PHASES[2]?.id === "wash", "inspection must finish before the wash");
assert(washRoute().weights.every((weight) => weight === 1), "aisle speed is not constant");
assert(firstAroundProgress() > 0.3 && firstAroundProgress() < 0.7, "around-row timing");

const pace = new Engine();
pace.setSpeed(1);
let paceClock = 0;
while (pace.snapshot().phase !== "wash") {
  pace.tick(0.05);
  paceClock += 0.05;
  if (paceClock > 40) throw new Error("wash did not start");
}
const stepSpeeds: number[] = [];
let previous = pace.snapshot().robot;
const washBegan = paceClock;
while (paceClock < washBegan + 6) {
  pace.tick(0.05);
  paceClock += 0.05;
  const robot = pace.snapshot().robot;
  stepSpeeds.push(Math.hypot(robot.x - previous.x, robot.z - previous.z) / 0.05);
  previous = robot;
}
const window = 20;
let slowest = Number.POSITIVE_INFINITY;
let fastest = 0;
for (let index = 0; index + window <= stepSpeeds.length; index += 1) {
  let sum = 0;
  for (let step = 0; step < window; step += 1) sum += stepSpeeds[index + step] ?? 0;
  const average = sum / window;
  slowest = Math.min(slowest, average);
  fastest = Math.max(fastest, average);
}
assert(fastest / slowest < 1.12, `Kepler speed jumped from ${slowest.toFixed(2)} to ${fastest.toFixed(2)}`);

const shown = new Engine();
shown.setSpeed(4);
let sawDirty = false;
let sawClean = false;
let leftDock = false;
for (let i = 0; i < 8000 && (!sawDirty || !sawClean || !leftDock); i += 1) {
  shown.tick(0.05);
  const snap = shown.snapshot();
  if (snap.phase === "survey" && snap.inspection === "dirty") {
    sawDirty = true;
    const still = Math.hypot(snap.robot.x - DOCK.x, snap.robot.z - DOCK.z);
    assert(still < 0.05, "Kepler moved during the dirty inspection");
  }
  if (snap.phase === "wash" && snap.progress > 0.08) {
    const moved = Math.hypot(snap.robot.x - DOCK.x, snap.robot.z - DOCK.z);
    if (moved > 2) leftDock = true;
  }
  if (snap.phase === "inspect" && snap.inspection === "clean") sawClean = true;
}
assert(sawDirty, "missing dirty inspection hold");
assert(leftDock, "Kepler did not leave to clean after the inspection");
assert(sawClean, "missing clean inspection hold");

console.log("sim ok");
console.log(
  `day surplus plant owner ${PLANT_EARN_CENTS / 100} PEAQ, robot owner ${WORK_CENTS / 100} PEAQ`,
);
