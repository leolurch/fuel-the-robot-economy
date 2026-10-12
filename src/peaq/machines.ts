import type { ActorId, IdentityBook } from "../economy/types.ts";
import { KNOWN_MACHINES } from "./knownMachines.ts";

/** Machines already activated on Agung, shown until the yard server reports its own operator's machines. */
export const YARD_IDENTITIES = Object.fromEntries(
  KNOWN_MACHINES.map((machine) => [
    machine.actor,
    { address: machine.address, did: `did:peaq:${machine.machineId}` },
  ]),
) as IdentityBook;

export const ACTOR_IDS = Object.keys(YARD_IDENTITIES) as ActorId[];
