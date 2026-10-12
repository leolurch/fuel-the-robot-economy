import { getAddress, keccak256, toBytes } from "viem";
import type { ActorId, IdentityBook } from "../economy/types.ts";

function identity(label: string): { address: `0x${string}`; did: string } {
  const hash = keccak256(toBytes(`rheinau.solar.yard.v1.${label}`));
  const address = getAddress(`0x${hash.slice(-40)}`);
  return { address, did: `did:peaq:${address}` };
}

/** Fallback address DIDs until the yard server reports the operator's machines. */
export const YARD_IDENTITIES: IdentityBook = {
  treasury: identity("treasury"),
  robot: identity("kepler"),
  drone: identity("lumen"),
  battery: identity("bess-2"),
};

export const ACTOR_IDS = Object.keys(YARD_IDENTITIES) as ActorId[];
