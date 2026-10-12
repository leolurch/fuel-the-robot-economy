import { keccak256 } from "viem";

/** Same numeric codes as @peaqos/peaq-os-sdk EVENT_TYPE_ACTIVITY and TRUST_SELF_REPORTED. */
export const EVENT_TYPE_ACTIVITY = 1;
export const TRUST_SELF_REPORTED = 0;

/** Same bytes as the SDK's computeDataHash, which is keccak256. Locked in npm run sim. */
export function computeDataHash(rawData: Uint8Array): `0x${string}` {
  return keccak256(rawData);
}
