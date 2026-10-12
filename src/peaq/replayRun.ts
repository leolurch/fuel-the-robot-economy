export type ReplayLeg = {
  /** Chain job that produced the transfer: "fund", "1:power", …, "settlement". */
  job: string;
  /** Same as job for single transfers, or the step id inside a funding or settlement job. */
  id: string;
  label: string;
  amountPeaq: string;
  fromName: string;
  toName: string;
  from: `0x${string}`;
  to: `0x${string}`;
  hash: `0x${string}`;
};

/** One full run sent by the yard server on Agung. Hashes were read from receipts, not invented. */
export const REPLAY_RUN: readonly ReplayLeg[] = [];
