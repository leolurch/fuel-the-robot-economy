import type { ActorId, PersonId, Phase } from "./types.ts";

/**
 * Yard prices in 0.01 PEAQ steps.
 * Agung's entry bond is a chain constant (0.4 PEAQ per machine). After that, a run
 * only costs gas: the Drain funds the city and Kepler at the start, and every
 * wallet returns its balance to the Drain at the end.
 */
export const TARIFF = {
  recoveredCents: 5,
  robotWageCents: 2,
  droneFeeCents: 1,
  rechargeCents: 1,
  rechargeKwh: 22,
} as const;

/** The city pays this for each day's power. The plant pays the robot owner the work below. */
export const POWER_CENTS = TARIFF.recoveredCents;
export const WORK_CENTS = TARIFF.robotWageCents + TARIFF.droneFeeCents;
export const PLANT_EARN_CENTS = POWER_CENTS - WORK_CENTS;
export const RUN_CYCLES = 3;

/** What the Drain sends out at the start of a run, and gets back at the end. */
export const CITY_BUDGET_CENTS = POWER_CENTS * RUN_CYCLES;
export const KEPLER_BUDGET_CENTS = TARIFF.rechargeCents * RUN_CYCLES;
export const RUN_BUDGET_CENTS = CITY_BUDGET_CENTS + KEPLER_BUDGET_CENTS;

export const OPENING_CENTS: Record<ActorId, number> = {
  treasury: 0,
  robot: 0,
  drone: 0,
  battery: 0,
};

export const NAMEPLATE_KW = 480;
export const INVENTORY_FULL = 168;
export const INVENTORY_CAP = 220;

export const ACTOR_META: Record<ActorId, { name: string; role: string }> = {
  treasury: { name: "Rheinau treasury", role: "Plant machine" },
  robot: { name: "Kepler-01", role: "Cleaning rover" },
  drone: { name: "Lumen-04", role: "Inspection drone" },
  battery: { name: "Battery", role: "Sells energy to Kepler" },
};

export const ACTOR_ORDER: ActorId[] = ["robot", "drone", "battery"];

export const PERSON_META: Record<PersonId, { name: string; role: string }> = {
  city: { name: "City", role: "Buys the plant's power" },
  plantOwner: { name: "Plant owner", role: "Owns Rheinau" },
  robotOwner: { name: "Robot owner", role: "Owns Kepler and Lumen" },
  drain: { name: "Drain", role: "Funds each run, collects it back" },
};

export const PERSON_ORDER: PersonId[] = ["city", "plantOwner", "robotOwner", "drain"];

export const PERSON_OPENING_CENTS: Record<PersonId, number> = {
  city: 0,
  plantOwner: 0,
  robotOwner: 0,
  drain: RUN_BUDGET_CENTS,
};

export const PHASES: readonly {
  id: Phase;
  label: string;
  short: string;
  seconds: number;
  blurb: string;
}[] = [
  { id: "soil", label: "Soil", short: "Soil", seconds: 4.2, blurb: "Dust cuts output" },
  { id: "survey", label: "Inspect", short: "Inspect", seconds: 8.6, blurb: "Lumen checks before the wash" },
  { id: "wash", label: "Wash", short: "Wash", seconds: 18, blurb: "Kepler cleans the rows" },
  { id: "inspect", label: "Inspect", short: "Inspect", seconds: 8.2, blurb: "Lumen checks the yield" },
  { id: "pay", label: "Pay", short: "Pay", seconds: 6.4, blurb: "The city buys power" },
  { id: "recharge", label: "Recharge", short: "Charge", seconds: 6.2, blurb: "Kepler buys energy" },
  { id: "refill", label: "Refill", short: "Refill", seconds: 3.2, blurb: "Plant restocks the pack" },
];

export function inspectionLine(verdict: "dirty" | "clean"): string {
  return verdict === "dirty" ? "Lumen inspection: panels are dirty" : "Lumen inspection: panels are clean";
}

export function formatPeaq(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole.toLocaleString("en-US")}.${frac}`;
}

export function shortDid(did: string): string {
  const address = did.slice(did.lastIndexOf(":") + 1);
  if (address.length < 12) return did;
  return `did:peaq:${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
