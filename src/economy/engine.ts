import { KNOWN_PEOPLE } from "../peaq/knownMachines.ts";
import { EVENT_TYPE_ACTIVITY, TRUST_SELF_REPORTED, computeDataHash } from "../peaq/proof.ts";
import {
  DOCK,
  DOCK_HEADING,
  FIELD_X,
  FIELD_Z,
  ROW_COUNT,
  inspectPoints,
  pathLengths,
  returnPath,
  samplePath,
  washRoute,
  type WashPoint,
} from "../world/layout.ts";
import {
  ACTOR_META,
  INVENTORY_CAP,
  INVENTORY_FULL,
  NAMEPLATE_KW,
  OPENING_CENTS,
  PERSON_META,
  PERSON_OPENING_CENTS,
  PHASES,
  PLANT_EARN_CENTS,
  inspectionLine,
  POWER_CENTS,
  RENT_CENTS,
  RUN_CYCLES,
  TARIFF,
  WORK_CENTS,
  formatPeaq,
} from "./model.ts";
import type {
  ActorId,
  ChainJob,
  ChainKind,
  DroneCmd,
  Flow,
  IdentityBook,
  LogEvent,
  LogKind,
  PartyId,
  PersonId,
  InspectionVerdict,
  Phase,
  Pose,
  RoverCmd,
  Snapshot,
  Speed,
  TransferRow,
  Wallet,
} from "./types.ts";

const CLEAN_DIRT = 0.045;
const SOIL_END = 0.8;
const CHARGE_LOW = 0.33;
const CHARGE_FULL = 0.94;
const INVENTORY_AFTER_SALE = INVENTORY_FULL - TARIFF.rechargeKwh;

const FALLBACK: IdentityBook = {
  treasury: {
    address: "0x1111111111111111111111111111111111111111",
    did: "did:peaq:0x1111111111111111111111111111111111111111",
  },
  robot: {
    address: "0x2222222222222222222222222222222222222222",
    did: "did:peaq:0x2222222222222222222222222222222222222222",
  },
  drone: {
    address: "0x3333333333333333333333333333333333333333",
    did: "did:peaq:0x3333333333333333333333333333333333333333",
  },
  battery: {
    address: "0x4444444444444444444444444444444444444444",
    did: "did:peaq:0x4444444444444444444444444444444444444444",
  },
};

type Flags = {
  proof: boolean;
  paidPower: boolean;
  paidWork: boolean;
  boughtCharge: boolean;
  rechargeOrigin: boolean;
  refillOrigin: boolean;
};

function freshFlags(): Flags {
  return {
    proof: false,
    paidPower: false,
    paidWork: false,
    boughtCharge: false,
    rechargeOrigin: false,
    refillOrigin: false,
  };
}

const DEFAULT_PEOPLE: Record<PersonId, { address: `0x${string}` }> = {
  customers: { address: KNOWN_PEOPLE.customers },
  plantOwner: { address: KNOWN_PEOPLE.plantOwner },
  robotOwner: { address: KNOWN_PEOPLE.robotOwner },
  city: { address: KNOWN_PEOPLE.city },
};

export function inspectionPayload(cycle: number, cleanlinessMilli: number): Uint8Array {
  const body = [
    "rheinau.v1",
    `cycle=${cycle}`,
    `cleanliness=${cleanlinessMilli}`,
    `recovered=${TARIFF.recoveredCents}`,
    `event=${EVENT_TYPE_ACTIVITY}`,
    `trust=${TRUST_SELF_REPORTED}`,
  ].join("|");
  return new TextEncoder().encode(body);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function daylightFor(phase: Phase, progress: number): number {
  if (phase === "soil") return lerp(0.28, 0.72, progress);
  if (phase === "survey") return lerp(0.72, 0.9, progress);
  if (phase === "wash") return lerp(0.9, 1, progress);
  if (phase === "inspect") return lerp(1, 0.78, progress);
  if (phase === "pay") return lerp(0.78, 0.42, progress);
  if (phase === "recharge") return lerp(0.42, 0.12, progress);
  return lerp(0.12, 0.05, progress);
}

function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export class Engine {
  phase: Phase = "soil";
  rowDirt: number[] = Array.from({ length: ROW_COUNT }, () => CLEAN_DIRT);
  robot: Pose = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
  drone: Pose = { x: FIELD_X, z: FIELD_Z, heading: 0 };
  robotBattery = 0.9;
  inventoryKwh = INVENTORY_FULL;
  coverage = 1;
  roverCmd: RoverCmd = "idle";
  droneCmd: DroneCmd = "loiter";
  brushEngaged = false;
  flow: Flow | null = null;
  paused = false;
  speed: Speed = 1;
  proofHash = "";
  cleanlinessMilli = 0;
  inspection: InspectionVerdict | null = null;
  daylight = 0.55;
  runComplete = false;

  private phaseIndex = 0;
  private phaseElapsed = 0;
  private cycle = 1;
  private totalTime = 0;
  private eventId = 0;
  private events: LogEvent[] = [];
  private wallets: Record<ActorId, Wallet>;
  private people: Record<PersonId, Wallet>;
  private personAddresses: Record<PersonId, { address: `0x${string}` }> = { ...DEFAULT_PEOPLE };
  private rentSent = false;
  private transfers: TransferRow[] = [];
  private flags: Flags = freshFlags();
  private listeners = new Set<(snapshot: Snapshot) => void>();
  private emitAccum = 0;
  private batteryAtWashStart = 0.9;
  private refillFrom = INVENTORY_FULL;
  private identities: IdentityBook;
  private chainJobs: ChainJob[] = [];
  private resetGeneration = 0;
  private readonly wash = washRoute().points;
  private readonly washMeta = pathLengths(washRoute().points, washRoute().weights);
  private readonly survey = inspectPoints();
  private readonly surveyMeta = pathLengths(inspectPoints());
  private readonly dockRun = returnPath(washRoute().points[washRoute().points.length - 1]);
  private readonly dockMeta = pathLengths(this.dockRun);

  constructor(identities?: IdentityBook) {
    this.identities = identities ?? FALLBACK;
    this.wallets = this.openingWallets();
    this.people = this.openingPeople();
    this.reset();
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  tick(dt: number): void {
    const clamped = Math.min(Math.max(dt, 0), 0.05);
    if (!this.paused) this.advance(clamped * this.speed);
    this.emitAccum += clamped;
    if (this.emitAccum >= 0.1) {
      this.emitAccum = 0;
      this.emit();
    }
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.emit();
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.emit();
  }

  setIdentities(identities: IdentityBook): void {
    this.identities = identities;
    const ids: ActorId[] = ["treasury", "robot", "drone", "battery"];
    for (const id of ids) {
      this.wallets[id].address = identities[id].address;
      this.wallets[id].did = identities[id].did;
    }
    this.emit();
  }

  setPeople(addresses: Record<PersonId, { address: `0x${string}` }>): void {
    this.personAddresses = addresses;
    const ids: PersonId[] = ["customers", "plantOwner", "robotOwner", "city"];
    for (const id of ids) {
      this.people[id].address = addresses[id].address;
    }
    this.emit();
  }

  recordTransfer(row: TransferRow): void {
    const job = this.chainJobs.find((item) => item.id === row.id);
    if (job && job.state === "pending") job.state = "settled";
    const hashOk = row.hash !== null && /^0x[0-9a-fA-F]{64}$/.test(row.hash);
    const stored: TransferRow = {
      ...row,
      hash: row.ok && hashOk ? row.hash : null,
      explorer: row.ok && hashOk ? row.explorer : null,
      ok: row.ok && hashOk,
      error: row.ok && hashOk ? null : row.error ?? "Agung write did not land.",
    };
    const index = this.transfers.findIndex((item) => item.id === stored.id);
    if (index >= 0) {
      const prior = this.transfers[index];
      if (prior.ok === stored.ok && prior.hash === stored.hash && prior.error === stored.error) return;
      this.transfers[index] = stored;
    } else this.transfers.push(stored);
    const text = stored.ok
      ? `${stored.label} ${stored.amountPeaq} PEAQ confirmed`
      : `${stored.label} did not land`;
    this.touchParty(stored, text);
    this.log(stored.ok ? "pay" : "info", stored.ok ? `${stored.fromName} → ${stored.toName} ${stored.amountPeaq} PEAQ on Agung` : `${stored.label}: ${stored.error}`);
    this.emit();
  }

  reset(): void {
    this.resetGeneration += 1;
    this.chainJobs = [];
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.cycle = 1;
    this.totalTime = 0;
    this.paused = false;
    this.robotBattery = 0.9;
    this.inventoryKwh = INVENTORY_FULL;
    this.coverage = 1;
    this.proofHash = "";
    this.cleanlinessMilli = Math.round((1 - CLEAN_DIRT) * 1000);
    this.daylight = 0.35;
    this.runComplete = false;
    this.flags = freshFlags();
    this.events = [];
    this.eventId = 0;
    this.transfers = [];
    this.rentSent = false;
    this.wallets = this.openingWallets();
    this.people = this.openingPeople();
    this.rowDirt = Array.from({ length: ROW_COUNT }, () => CLEAN_DIRT);
    this.robot = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
    this.onEnter();
    this.apply(0);
    this.emit();
  }

  snapshot(): Snapshot {
    const avg = this.averageDirt();
    return {
      phase: PHASES[this.phaseIndex].id,
      phaseIndex: this.phaseIndex,
      progress: this.phaseElapsed / PHASES[this.phaseIndex].seconds,
      cycle: this.cycle,
      paused: this.paused,
      speed: this.speed,
      rowDirt: [...this.rowDirt],
      robotBattery: this.robotBattery,
      inventoryKwh: this.inventoryKwh,
      inventoryCap: INVENTORY_CAP,
      yieldKw: NAMEPLATE_KW * (1 - 0.46 * avg),
      nameplateKw: NAMEPLATE_KW,
      coverage: this.coverage,
      roverCmd: this.roverCmd,
      droneCmd: this.droneCmd,
      robot: { ...this.robot },
      drone: { ...this.drone },
      brushEngaged: this.brushEngaged,
      flow: this.flow ? { ...this.flow } : null,
      wallets: {
        treasury: { ...this.wallets.treasury },
        robot: { ...this.wallets.robot },
        drone: { ...this.wallets.drone },
        battery: { ...this.wallets.battery },
      },
      people: {
        customers: { ...this.people.customers },
        plantOwner: { ...this.people.plantOwner },
        robotOwner: { ...this.people.robotOwner },
        city: { ...this.people.city },
      },
      transfers: this.transfers.map((row) => ({ ...row })),
      daylight: this.daylight,
      runComplete: this.runComplete,
      events: this.events.slice(-24),
      topics: {
        "/array/soiling": avg.toFixed(2),
        "/array/yield_kw": (NAMEPLATE_KW * (1 - 0.46 * avg)).toFixed(0),
        "/rover/battery": this.robotBattery.toFixed(2),
        "/rover/coverage": this.coverage.toFixed(2),
        "/rover/cmd": this.roverCmd,
        "/drone/cmd": this.droneCmd,
        "/bess/inventory_kwh": this.inventoryKwh.toFixed(0),
      },
      proofHash: this.proofHash,
      cleanlinessMilli: this.cleanlinessMilli,
      inspection: this.inspection,
      chainJobs: this.chainJobs.filter((job) => job.state === "pending").map((job) => ({ ...job })),
      resetGeneration: this.resetGeneration,
    };
  }

  private openingWallets(): Record<ActorId, Wallet> {
    const ids: ActorId[] = ["treasury", "robot", "drone", "battery"];
    const wallets = {} as Record<ActorId, Wallet>;
    for (const id of ids) {
      const meta = ACTOR_META[id];
      const who = this.identities[id];
      wallets[id] = {
        id,
        name: meta.name,
        role: meta.role,
        address: who.address,
        did: who.did,
        balanceCents: OPENING_CENTS[id],
        lastTx: "Opening balance on the yard ledger",
      };
    }
    return wallets;
  }

  private openingPeople(): Record<PersonId, Wallet> {
    const ids: PersonId[] = ["customers", "plantOwner", "robotOwner", "city"];
    const people = {} as Record<PersonId, Wallet>;
    for (const id of ids) {
      const meta = PERSON_META[id];
      const who = this.personAddresses[id] ?? DEFAULT_PEOPLE[id];
      people[id] = {
        id,
        name: meta.name,
        role: meta.role,
        address: who.address,
        did: "",
        balanceCents: PERSON_OPENING_CENTS[id],
        lastTx:
          id === "customers"
            ? "Pays the city for the apartments"
            : id === "city"
              ? "Waiting for apartment rent"
              : "Waiting for the first payment",
      };
    }
    return people;
  }

  private party(id: PartyId): Wallet {
    if (id === "customers" || id === "plantOwner" || id === "robotOwner" || id === "city") return this.people[id];
    return this.wallets[id];
  }

  private touchParty(row: TransferRow, text: string): void {
    const people = Object.values(this.people);
    const machines = Object.values(this.wallets);
    for (const wallet of [...people, ...machines]) {
      if (wallet.address.toLowerCase() === row.fromAddress.toLowerCase() || wallet.name === row.fromName) {
        wallet.lastTx = text;
      }
      if (wallet.address.toLowerCase() === row.toAddress.toLowerCase() || wallet.name === row.toName) {
        wallet.lastTx = text;
      }
    }
  }

  private advance(dt: number): void {
    this.totalTime += dt;
    this.phaseElapsed += dt;
    const duration = PHASES[this.phaseIndex].seconds;
    if (this.phaseElapsed >= duration) {
      this.apply(1);
      this.phaseElapsed -= duration;
      const finishedRun = this.phaseIndex === PHASES.length - 1 && this.cycle >= RUN_CYCLES;
      this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
      if (finishedRun) {
        this.finishRun();
        return;
      }
      if (this.phaseIndex === 0) this.cycle += 1;
      this.onEnter();
      const next = PHASES[this.phaseIndex].seconds;
      this.apply(Math.min(1, this.phaseElapsed / next));
    } else {
      this.apply(this.phaseElapsed / duration);
    }
  }

  private onEnter(): void {
    const phase = PHASES[this.phaseIndex].id;
    if (phase === "soil") {
      this.flags = freshFlags();
      if (this.cycle > 1) {
        this.log(
          "info",
          `Day ${this.cycle - 1} closed. The plant owner kept ${formatPeaq(PLANT_EARN_CENTS)} PEAQ and the robot owner earned ${formatPeaq(WORK_CENTS)} PEAQ.`,
        );
      } else {
        this.log(
          "info",
          "Rheinau runs three compressed days. Customers buy the power, the plant pays the robot owner, and the rover still recharges.",
        );
      }
      this.log(
        "info",
        "Dust is settling on the modules. Array output falls until Kepler washes the glass.",
      );
    } else if (phase === "survey") {
      this.log(
        "info",
        "Lumen inspects the panels. Kepler stays at the dock until the result is on screen.",
      );
    } else if (phase === "wash") {
      this.batteryAtWashStart = this.robotBattery;
      this.log(
        "info",
        "Kepler leaves the charger and washes each row. The brush is on the glass and the battery is falling.",
      );
    } else if (phase === "inspect") {
      this.log(
        "info",
        "Lumen is flying an inspection pass to verify the glass and the recovered yield.",
      );
    } else if (phase === "pay") {
      this.log(
        "info",
        "Customers pay the plant owner for the day's power. The plant owner pays the robot owner for Kepler and Lumen.",
      );
    } else if (phase === "recharge") {
      this.log(
        "info",
        "Kepler's battery is low. It drives to BESS-2 to buy a recharge with its wages.",
      );
    } else if (phase === "refill") {
      this.log(
        "energy",
        `The plant refills BESS-2 with ${TARIFF.rechargeKwh} kWh from generation. The pack's wallet does not move; it already rose on the sale.`,
      );
    }
  }

  private apply(progress: number): void {
    const phase = PHASES[this.phaseIndex].id;
    this.phase = phase;
    this.daylight = daylightFor(phase, progress);
    if (!this.runComplete) this.flow = null;
    this.brushEngaged = false;
    this.inspection = null;

    if (phase === "soil") {
      const dirt = CLEAN_DIRT + (SOIL_END - CLEAN_DIRT) * progress;
      this.rowDirt = Array.from({ length: ROW_COUNT }, () => dirt);
      this.robot = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
      this.coverage = 0;
      this.roverCmd = "idle";
      this.droneCmd = "loiter";
      this.placeDroneLoiter();
      this.applyRent(progress);
    } else if (phase === "survey") {
      this.applySurvey(progress);
    } else if (phase === "wash") {
      this.applyWash(progress);
    } else if (phase === "inspect") {
      this.applyInspect(progress);
    } else if (phase === "pay") {
      this.holdAtField();
      this.roverCmd = "hold";
      this.droneCmd = "hold";
      this.placeDroneLoiter();
      this.applyPay(progress);
    } else if (phase === "recharge") {
      this.applyRecharge(progress);
    } else {
      this.robot = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
      this.roverCmd = "charge";
      this.droneCmd = "loiter";
      this.placeDroneLoiter();
      this.applyRefill(progress);
    }
  }

  private applyRent(progress: number): void {
    if (this.cycle !== 1) return;
    if (!this.rentSent && progress >= 0.18) {
      this.rentSent = true;
      this.move(
        "customers",
        "city",
        RENT_CENTS,
        `Sent ${formatPeaq(RENT_CENTS)} PEAQ to the city`,
        `Received ${formatPeaq(RENT_CENTS)} PEAQ apartment rent`,
      );
      this.enqueue("rent");
      this.log(
        "pay",
        `Residents pay the city ${formatPeaq(RENT_CENTS)} PEAQ for their apartments, so the city can buy the plant's energy again.`,
      );
    }
    if (progress >= 0.12 && progress < 0.96) {
      this.flow = {
        kind: "pay",
        from: "customers",
        to: "city",
        amountCents: RENT_CENTS,
        label: "Apartment rent",
        progress: (progress - 0.12) / 0.84,
      };
    }
  }

  private verdict(): InspectionVerdict {
    return this.averageDirt() > 0.2 ? "dirty" : "clean";
  }

  private flyDrone(progress: number): void {
    const sample = samplePath(this.survey, this.surveyMeta.lengths, this.surveyMeta.total, progress * this.surveyMeta.total);
    this.drone = { x: sample.x, z: sample.z, heading: sample.heading };
  }

  private applySurvey(progress: number): void {
    this.robot = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
    this.roverCmd = "hold";
    const fly = 0.5;
    if (progress < fly) {
      this.flyDrone(progress / fly);
      this.droneCmd = "survey";
      return;
    }
    const hover = this.survey[this.survey.length - 1];
    this.drone = { x: hover.x, z: hover.z, heading: 0 };
    this.droneCmd = "verify";
    this.inspection = this.verdict();
    this.logOnce(inspectionLine(this.inspection));
  }

  private logOnce(text: string): void {
    if (this.events.some((event) => event.text === text && event.cycle === this.cycle)) return;
    this.log("proof", text);
  }

  private applyWash(progress: number): void {
    const sample = samplePath(
      this.wash,
      this.washMeta.lengths,
      this.washMeta.total,
      progress * this.washMeta.total,
    );
    const destination = this.wash[sample.index + 1] as WashPoint | undefined;
    const cleaning = destination?.cleanRow ?? null;
    this.robot = {
      x: sample.x,
      z: sample.z,
      heading: cleaning === null ? sample.heading : Math.PI,
    };
    this.brushEngaged = cleaning !== null;
    this.roverCmd = cleaning === null ? "drive" : "wash";
    this.rowDirt = this.dirtFromWash(sample.index, sample.t);
    const cleanFraction = this.cleanFraction(sample.index, sample.t);
    this.coverage = cleanFraction;
    this.robotBattery = lerp(this.batteryAtWashStart, CHARGE_LOW, cleanFraction);
    this.droneCmd = "loiter";
    this.placeDroneLoiter();
  }

  private dirtFromWash(segmentIndex: number, segmentT: number): number[] {
    const dirt = Array.from({ length: ROW_COUNT }, () => SOIL_END);
    for (let i = 0; i < segmentIndex; i += 1) {
      const row = this.wash[i + 1]?.cleanRow;
      if (row !== null && row !== undefined) dirt[row] = CLEAN_DIRT;
    }
    const row = this.wash[segmentIndex + 1]?.cleanRow;
    if (row !== null && row !== undefined) {
      dirt[row] = lerp(SOIL_END, CLEAN_DIRT, segmentT);
    }
    return dirt;
  }

  private cleanFraction(segmentIndex: number, segmentT: number): number {
    let done = 0;
    for (let i = 0; i < segmentIndex; i += 1) {
      if (this.wash[i + 1]?.cleanRow !== null && this.wash[i + 1]?.cleanRow !== undefined) done += 1;
    }
    const row = this.wash[segmentIndex + 1]?.cleanRow;
    if (row !== null && row !== undefined) done += segmentT;
    return done / ROW_COUNT;
  }

  private applyInspect(progress: number): void {
    const fly = 0.48;
    if (progress < fly) this.flyDrone(progress / fly);
    else {
      const hover = this.survey[this.survey.length - 1];
      this.drone = { x: hover.x, z: hover.z, heading: 0 };
      this.inspection = this.verdict();
      this.logOnce(inspectionLine(this.inspection));
    }
    this.holdAtField();
    this.roverCmd = "hold";
    this.droneCmd = progress >= 0.72 ? "verify" : "survey";
    this.coverage = 1;
    if (!this.flags.proof && progress >= 0.72) {
      this.flags.proof = true;
      const avg = this.averageDirt();
      this.cleanlinessMilli = Math.round((1 - avg) * 1000);
      this.proofHash = computeDataHash(inspectionPayload(this.cycle, this.cleanlinessMilli));
      const pct = (this.cleanlinessMilli / 10).toFixed(1);
      const short = `${this.proofHash.slice(0, 10)}…${this.proofHash.slice(-4)}`;
      this.log(
        "proof",
        `Lumen-04 verified cleanliness at ${pct}%. Proof ${short}. The customers pay the plant owner for this power.`,
      );
    }
    if (progress >= 0.72) {
      this.flow = {
        kind: "book",
        from: "drone",
        to: "treasury",
        amountCents: TARIFF.recoveredCents,
        label: "Recovered yield booked",
        progress: Math.min(1, (progress - 0.72) / 0.28),
      };
    }
  }

  private applyPay(progress: number): void {
    if (!this.flags.paidPower && progress >= 0.22) {
      this.flags.paidPower = true;
      this.move(
        "customers",
        "plantOwner",
        POWER_CENTS,
        `Sent ${formatPeaq(POWER_CENTS)} PEAQ to the plant owner`,
        `Received ${formatPeaq(POWER_CENTS)} PEAQ from the customers`,
      );
      this.enqueue("power");
      this.log(
        "pay",
        `Residents pay the plant owner ${formatPeaq(POWER_CENTS)} PEAQ for the day's power.`,
      );
    }
    if (!this.flags.paidWork && progress >= 0.58) {
      this.flags.paidWork = true;
      this.move(
        "plantOwner",
        "robotOwner",
        WORK_CENTS,
        `Sent ${formatPeaq(WORK_CENTS)} PEAQ to the robot owner`,
        `Received ${formatPeaq(WORK_CENTS)} PEAQ from the plant owner`,
      );
      this.enqueue("work");
      this.log(
        "pay",
        `Plant owner pays the robot owner ${formatPeaq(WORK_CENTS)} PEAQ for Kepler-01 and Lumen-04. The plant keeps ${formatPeaq(PLANT_EARN_CENTS)} PEAQ.`,
      );
    }
    if (progress >= 0.22 && progress < 0.56) {
      this.flow = {
        kind: "pay",
        from: "customers",
        to: "plantOwner",
        amountCents: POWER_CENTS,
        label: "Power",
        progress: (progress - 0.22) / 0.34,
      };
    } else if (progress >= 0.58) {
      this.flow = {
        kind: "pay",
        from: "plantOwner",
        to: "robotOwner",
        amountCents: WORK_CENTS,
        label: "Cleaning and inspection",
        progress: Math.min(1, (progress - 0.58) / 0.42),
      };
    }
  }

  private applyRecharge(progress: number): void {
    if (progress < 0.46) {
      const sample = samplePath(
        this.dockRun,
        this.dockMeta.lengths,
        this.dockMeta.total,
        (progress / 0.46) * this.dockMeta.total,
      );
      this.robot = { x: sample.x, z: sample.z, heading: sample.heading };
      this.roverCmd = "dock";
      this.robotBattery = CHARGE_LOW;
    } else {
      this.robot = { x: DOCK.x, z: DOCK.z, heading: DOCK_HEADING };
      this.roverCmd = "charge";
      this.robotBattery = lerp(CHARGE_LOW, CHARGE_FULL, (progress - 0.46) / 0.54);
    }
    this.droneCmd = "loiter";
    this.placeDroneLoiter();
    if (!this.flags.boughtCharge && progress >= 0.5) {
      this.flags.boughtCharge = true;
      this.inventoryKwh = INVENTORY_AFTER_SALE;
      this.move(
        "robot",
        "battery",
        TARIFF.rechargeCents,
        `Sent ${formatPeaq(TARIFF.rechargeCents)} PEAQ to BESS-2`,
        `Received ${formatPeaq(TARIFF.rechargeCents)} PEAQ from Kepler`,
      );
      this.enqueue("recharge");
      this.log(
        "pay",
        `Kepler-01 pays BESS-2 ${formatPeaq(TARIFF.rechargeCents)} PEAQ for ${TARIFF.rechargeKwh} kWh and rolls back out with a full pack.`,
      );
    }
    if (progress >= 0.5 && progress < 0.82) {
      this.flow = {
        kind: "pay",
        from: "robot",
        to: "battery",
        amountCents: TARIFF.rechargeCents,
        label: `${TARIFF.rechargeKwh} kWh recharge`,
        progress: (progress - 0.5) / 0.32,
      };
    }
  }

  private applyRefill(progress: number): void {
    if (!this.flags.refillOrigin) {
      this.flags.refillOrigin = true;
      this.refillFrom = this.inventoryKwh;
    }
    this.inventoryKwh = lerp(this.refillFrom, INVENTORY_FULL, smooth(progress));
    this.flow = {
      kind: "energy",
      from: "treasury",
      to: "battery",
      amountCents: 0,
      label: `${TARIFF.rechargeKwh} kWh from the plant`,
      progress,
    };
  }

  private holdAtField(): void {
    const end = this.wash[this.wash.length - 1];
    if (!end) return;
    this.robot = { x: end.x, z: end.z, heading: Math.PI };
  }

  private placeDroneLoiter(): void {
    const angle = this.totalTime * 0.38;
    this.drone = {
      x: FIELD_X + Math.cos(angle) * 5.2,
      z: FIELD_Z + Math.sin(angle) * 3.4,
      heading: angle + Math.PI / 2,
    };
  }

  private averageDirt(): number {
    let sum = 0;
    for (const value of this.rowDirt) sum += value;
    return sum / this.rowDirt.length;
  }

  private finishRun(): void {
    this.runComplete = true;
    this.paused = true;
    this.phase = "refill";
    this.phaseIndex = PHASES.length - 1;
    const plantEarned = this.people.plantOwner.balanceCents;
    const robotEarned = this.people.robotOwner.balanceCents;
    const bundled = plantEarned + robotEarned;
    if (plantEarned > 0) {
      this.people.plantOwner.balanceCents = 0;
      this.people.customers.balanceCents += plantEarned;
    }
    if (robotEarned > 0) {
      this.people.robotOwner.balanceCents = 0;
      this.people.customers.balanceCents += robotEarned;
    }
    this.people.customers.lastTx = `Settlement returns ${formatPeaq(bundled)} PEAQ`;
    this.people.plantOwner.lastTx = "Earnings returned to the customers";
    this.people.robotOwner.lastTx = "Earnings returned to the customers";
    this.flow = {
      kind: "pay",
      from: "plantOwner",
      to: "customers",
      amountCents: bundled,
      label: "Settlement",
      progress: 1,
    };
    this.enqueue("settlement");
    this.log(
      "pay",
      `Settlement bundles ${formatPeaq(bundled)} PEAQ from the plant owner and the robot owner and sends it back to the customers.`,
    );
    this.emit();
  }

  private move(from: PartyId, to: PartyId, cents: number, sent: string, received: string): void {
    const source = this.party(from);
    const target = this.party(to);
    source.balanceCents -= cents;
    target.balanceCents += cents;
    source.lastTx = `Yard ledger: ${sent}`;
    target.lastTx = `Yard ledger: ${received}`;
  }

  private enqueue(kind: ChainKind): void {
    const id = kind === "settlement" || kind === "rent" ? kind : `${this.cycle}:${kind}`;
    if (this.chainJobs.some((job) => job.id === id)) return;
    this.chainJobs.push({
      id,
      kind,
      cycle: this.cycle,
      cleanlinessMilli: this.cleanlinessMilli,
      state: "pending",
    });
  }

  private log(kind: LogKind, text: string): void {
    this.events.push({
      id: (this.eventId += 1),
      cycle: this.cycle,
      phase: PHASES[this.phaseIndex].label,
      kind,
      text,
    });
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
