import type { ActorId, PersonId } from "../economy/types.ts";

/** Operator key that activated the yard machines on Agung. Its wallet is the Drain that funds every run. */
export const YARD_OPERATOR = "0x8a61248e23e04b97A0A42A87D09459573478d23A" as const;

/**
 * Machines already activated on Agung by the yard operator. `npm run verify` recomputes each
 * machine ID with the peaq SDK and checks the registry owner, so these are not trusted blindly.
 * The battery was registered with machine type "BESS-2"; the yard calls it Battery.
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
    machineId: "33972125727311862102242550464936382332590305066238494161796118837764432459771",
    activationTx: "0xec8a622a893f77ed675902751ea196e5336ad11339a0bd3fc34e50f6d33c1859",
  },
  {
    actor: "robot",
    machineType: "Kepler-01",
    address: "0xa3893E09F5546B56B6e845ad194e28a216730931",
    machineId: "1962884760408859527843867200144780974073261720970703856069487751650844150575",
    activationTx: "0xde6ee8f2b2b2b6154034bb7ea763865c9616241a61484a284dabedaa0517b990",
  },
  {
    actor: "drone",
    machineType: "Lumen-04",
    address: "0x77cc0A6aeA9F14c842251aE1384E45A3F30320d9",
    machineId: "70771729342491203195750444655678312409844457848436599576321158744592664857524",
    activationTx: "0xd25a7b8a143b87a9ee0418d5b1370c75f902f1367f890d367535a0390030b671",
  },
  {
    actor: "battery",
    machineType: "BESS-2",
    address: "0x6F8A86803dafE766F6381F781D5003BC5aa2df5d",
    machineId: "23561826428746862383207998597570184258462227245211301004858601842139846427384",
    activationTx: "0xae8de92ad5772c5d0fb4084316917235325b0e6c5200cfe12aa2065c666edcf5",
  },
];

/** Wallets derived from the operator key. The Drain is the operator itself. */
export const KNOWN_PEOPLE: Record<PersonId, `0x${string}`> = {
  city: "0x0f6213A1f06eCDE70823EAb4132f89a0bFd83Fd6",
  plantOwner: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB",
  robotOwner: "0x84AFCdE8e20c78189Cb792af78901ead5c364a81",
  drain: YARD_OPERATOR,
};
