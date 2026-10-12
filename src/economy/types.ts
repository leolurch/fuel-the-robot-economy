export type ActorId = "treasury" | "robot" | "drone" | "battery";

export type PersonId = "city" | "plantOwner" | "robotOwner" | "drain";

export type PartyId = ActorId | PersonId;

export type Phase = "soil" | "survey" | "wash" | "inspect" | "pay" | "recharge" | "refill";

export type InspectionVerdict = "dirty" | "clean";

export type Speed = 1 | 2 | 4;

export type RoverCmd = "idle" | "drive" | "wash" | "hold" | "dock" | "charge";

export type DroneCmd = "loiter" | "survey" | "verify" | "hold";

/** "budget" and "settle" move money to and from the run reserve, which is never drawn. */
export type FlowKind = "pay" | "book" | "energy" | "budget" | "settle";

export type Flow = {
  kind: FlowKind;
  from: PartyId;
  to: PartyId;
  amountCents: number;
  label: string;
  progress: number;
};

export type LogKind = "info" | "pay" | "proof" | "energy";

export const CHAIN_KINDS = ["fund", "power", "work", "recharge", "settlement"] as const;

export type ChainKind = (typeof CHAIN_KINDS)[number];

/** A PEAQ transfer, or a machine event written to EventRegistry. */
export type LegKind = "transfer" | "event";

export type TransferRow = {
  id: string;
  label: string;
  amountPeaq: string;
  fromName: string;
  toName: string;
  fromAddress: string;
  toAddress: string;
  hash: string | null;
  explorer: string | null;
  ok: boolean;
  error: string | null;
  kind?: LegKind;
  /** Receipt from the confirmed replay run rather than a write sent for this page. */
  replay?: boolean;
};

export type ChainJob = {
  id: string;
  kind: ChainKind;
  cycle: number;
  cleanlinessMilli: number;
  state: "pending" | "settled";
};

export type LogEvent = {
  id: number;
  cycle: number;
  phase: string;
  kind: LogKind;
  text: string;
};

export type Wallet = {
  id: PartyId;
  name: string;
  role: string;
  address: `0x${string}`;
  did: string;
  balanceCents: number;
  lastTx: string;
};

export type Pose = {
  x: number;
  z: number;
  heading: number;
};

export type Snapshot = {
  phase: Phase;
  phaseIndex: number;
  progress: number;
  cycle: number;
  paused: boolean;
  speed: Speed;
  rowDirt: number[];
  robotBattery: number;
  inventoryKwh: number;
  inventoryCap: number;
  yieldKw: number;
  /** Output just before the wash, so the HUD can show what cleaning recovered. */
  soiledKw: number;
  nameplateKw: number;
  coverage: number;
  roverCmd: RoverCmd;
  droneCmd: DroneCmd;
  robot: Pose;
  drone: Pose;
  brushEngaged: boolean;
  flow: Flow | null;
  wallets: Record<ActorId, Wallet>;
  people: Record<PersonId, Wallet>;
  transfers: TransferRow[];
  daylight: number;
  runComplete: boolean;
  events: LogEvent[];
  topics: Record<string, string>;
  proofHash: string;
  cleanlinessMilli: number;
  inspection: InspectionVerdict | null;
  chainJobs: ChainJob[];
  resetGeneration: number;
};

export type MachineIdentity = {
  address: `0x${string}`;
  did: string;
};

export type IdentityBook = Record<ActorId, MachineIdentity>;
