import type { ActorId, PersonId, Phase } from "./types.ts";

/**
 * Yard prices in 0.01 PEAQ steps.
 * Agung's entry bond is a chain constant (0.4 PEAQ). A published 3 AGNG drip
 * leaves about 1.4 PEAQ after four bonds. At 0.03 PEAQ leaving the treasury
 * each cycle (0.02 wage + 0.01 drone fee) that remainder covers about 40 cycles.
 * The rover's 0.02 wage still pays the 0.01 recharge and keeps 0.01.
 */
export const TARIFF = {
  recoveredCents: 5,
  robotWageCents: 2,
  droneFeeCents: 1,
  rechargeCents: 1,
  rechargeKwh: 22,
} as const;

export const TREASURY_KEEP_CENTS =
  TARIFF.recoveredCents - TARIFF.robotWageCents - TARIFF.droneFeeCents;

export const ROBOT_SURPLUS_CENTS = TARIFF.robotWageCents - TARIFF.rechargeCents;

/** Customers pay this for the power. The plant pays the robot owner the work below. */
export const POWER_CENTS = TARIFF.recoveredCents;
/** One apartment payment, enough for the city to buy the plant's energy again. */
export const RENT_CENTS = TARIFF.recoveredCents;
export const WORK_CENTS = TARIFF.robotWageCents + TARIFF.droneFeeCents;
export const PLANT_EARN_CENTS = POWER_CENTS - WORK_CENTS;
export const RUN_CYCLES = 3;

export const OPENING_CENTS: Record<ActorId, number> = {
  treasury: 300,
  robot: 10,
  drone: 5,
  battery: 20,
};

export const NAMEPLATE_KW = 480;
export const INVENTORY_FULL = 168;
export const INVENTORY_CAP = 220;

export const ACTOR_META: Record<ActorId, { name: string; role: string }> = {
  treasury: { name: "Rheinau treasury", role: "Plant machine" },
  robot: { name: "Kepler-01", role: "Cleaning rover" },
  drone: { name: "Lumen-04", role: "Inspection drone" },
  battery: { name: "BESS-2", role: "Battery pack" },
};

export const ACTOR_ORDER: ActorId[] = ["robot", "drone", "battery"];

export const PERSON_META: Record<PersonId, { name: string; role: string }> = {
  customers: { name: "Residents", role: "Pay the city for apartments" },
  plantOwner: { name: "Plant owner", role: "Owns Rheinau" },
  robotOwner: { name: "Robot owner", role: "Owns Kepler and Lumen" },
  city: { name: "City", role: "Buys the plant's energy" },
};

export const PERSON_ORDER: PersonId[] = ["customers", "plantOwner", "robotOwner", "city"];

export const PERSON_OPENING_CENTS: Record<PersonId, number> = {
  customers: POWER_CENTS * RUN_CYCLES,
  plantOwner: 0,
  robotOwner: 0,
  city: 0,
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
  { id: "pay", label: "Pay", short: "Pay", seconds: 6.4, blurb: "Customers buy power" },
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
