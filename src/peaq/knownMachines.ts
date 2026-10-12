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
  activationTx: `0x${string}`;
}[] = [
  {
    actor: "treasury",
    machineType: "Rheinau-treasury",
    address: YARD_OPERATOR,
    machineId: "102441207943741495815144671880889482642676067611685166339896603723990339550998",
    activationTx: "0x03cebbe41c47450d51ecbf48a76e219112692b50eeceb8b143af15a13428ad78",
  },
  {
    actor: "robot",
    machineType: "Kepler-01",
    address: "0x8D63581101AD3DE66DCF1c2Ab569B6c442e2b77E",
    machineId: "108602975430599403666987812419548965340727236481014319489660215287370279879996",
    activationTx: "0x5b0b19e25dbaa639c91d938c85def41956c7974b38d81bd90d6f03cb3933836c",
  },
  {
    actor: "drone",
    machineType: "Lumen-04",
    address: "0x42647B681D98961A45f4fc6e4Bc5F5d56892F138",
    machineId: "88409303619999558588125362065661591412349648541783424028499915752405324092273",
    activationTx: "0x8e3bd0dd6ec7733e2f365a54f0e6da94b659ae70801333b77fe5d8230662efdf",
  },
  {
    actor: "battery",
    machineType: "BESS-2",
    address: "0x0fF7df529aD2C19DF6637a8b1C148C268C3Eb943",
    machineId: "106466828269666555797166757514327820279976210156543034156017671456103315692484",
    activationTx: "0xda4782a80e5f94269cd82342d68e420abdb976314dfe936ac409e994646255f8",
  },
];

/** Owner wallets derived from the operator key. They signed the rent, power, work, and settlement receipts. */
export const KNOWN_PEOPLE: Record<PersonId, `0x${string}`> = {
  customers: YARD_OPERATOR,
  plantOwner: "0xc04DFd51d21d62B5915Ec01B821260367053b1cC",
  robotOwner: "0xDe7cCd73d2054DC2820BacbBFAa514F30d9467DD",
  city: "0x0dF74639f0adEaDCdc1BFc37ee0Ac60933db4A1E",
};
