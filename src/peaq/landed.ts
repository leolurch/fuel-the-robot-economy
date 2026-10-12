import type { SettleResult, SettleStep } from "./yardTypes.ts";
import { REPLAY_RUN, type ReplayLeg } from "./replayRun.ts";

export const AGUNG_EXPLORER_TX = "https://agung-testnet.subscan.io/tx/";
export const AGUNG_EXPLORER_ACCOUNT = "https://agung-testnet.subscan.io/account/";

function step(leg: ReplayLeg): SettleStep {
  return {
    id: leg.id,
    label: leg.label,
    amountPeaq: leg.amountPeaq,
    fromName: leg.fromName,
    toName: leg.toName,
    fromAddress: leg.from,
    toAddress: leg.to,
    txHash: leg.hash,
    explorer: `${AGUNG_EXPLORER_TX}${leg.hash}`,
    ok: true,
    error: null,
    kind: leg.kind ?? "transfer",
  };
}

function receipts(legs: readonly ReplayLeg[]): Record<string, SettleResult> {
  const jobs = new Map<string, ReplayLeg[]>();
  for (const leg of legs) jobs.set(leg.job, [...(jobs.get(leg.job) ?? []), leg]);
  const out: Record<string, SettleResult> = {};
  for (const [job, group] of jobs) {
    const last = group[group.length - 1];
    const single = group.length === 1 && last.id === job;
    out[job] = {
      ok: true,
      txHash: last.hash,
      explorer: `${AGUNG_EXPLORER_TX}${last.hash}`,
      label: last.label,
      amountPeaq: last.amountPeaq,
      fromName: last.fromName,
      toName: last.toName,
      fromAddress: last.from,
      toAddress: last.to,
      steps: single ? undefined : group.map(step),
    };
  }
  return out;
}

/** Receipts of one full run already confirmed on Agung, keyed by the yard's chain job id. Replay mode shows these. */
export const KNOWN_RECEIPTS: Record<string, SettleResult> = receipts(REPLAY_RUN);
