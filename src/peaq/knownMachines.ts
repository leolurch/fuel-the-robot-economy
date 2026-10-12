import type { ActorId, PersonId } from "../economy/types.ts";

/** Operator key that activated the yard machines and signed the landed transfers on Agung. */
export const YARD_OPERATOR = "0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C" as const;

/**
 * Machines already activated on Agung by the yard operator. `npm run verify` recomputes each
 * machine ID with the peaq SDK and checks the registry owner, so these are not trusted blindly.
 */
export const KNOWN_MACHINES: {
  actor: ActorId;
  machineType: string;
  address: `0x${string}`;
  machineId: string;
}[] = [
  {
    actor: "treasury",
    machineType: "Rheinau-treasury",
    address: YARD_OPERATOR,
    machineId: "102441207943741495815144671880889482642676067611685166339896603723990339550998",
  },
  {
    actor: "robot",
    machineType: "Kepler-01",
    address: "0x8D63581101AD3DE66DCF1c2Ab569B6c442e2b77E",
    machineId: "108602975430599403666987812419548965340727236481014319489660215287370279879996",
  },
  {
    actor: "drone",
    machineType: "Lumen-04",
    address: "0x42647B681D98961A45f4fc6e4Bc5F5d56892F138",
    machineId: "88409303619999558588125362065661591412349648541783424028499915752405324092273",
  },
  {
    actor: "battery",
    machineType: "BESS-2",
    address: "0x0fF7df529aD2C19DF6637a8b1C148C268C3Eb943",
    machineId: "106466828269666555797166757514327820279976210156543034156017671456103315692484",
  },
];

/** Owner wallets derived from the operator key. They signed the rent, power, work, and settlement receipts. */
export const KNOWN_PEOPLE: Record<PersonId, `0x${string}`> = {
  customers: YARD_OPERATOR,
  plantOwner: "0xc04DFd51d21d62B5915Ec01B821260367053b1cC",
  robotOwner: "0xDe7cCd73d2054DC2820BacbBFAa514F30d9467DD",
  city: "0x0dF74639f0adEaDCdc1BFc37ee0Ac60933db4A1E",
};
