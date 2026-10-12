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
  };
}

function receipts(legs: readonly ReplayLeg[]): Record<string, SettleResult> {
  const out: Record<string, SettleResult> = {};
  for (const leg of legs) {
    const last = step(leg);
    const prior = out[leg.job];
    const steps = leg.id === leg.job ? undefined : [...(prior?.steps ?? []), last];
    out[leg.job] = {
      ok: true,
      txHash: leg.hash,
      explorer: `${AGUNG_EXPLORER_TX}${leg.hash}`,
      label: leg.label,
      amountPeaq: leg.amountPeaq,
      fromName: leg.fromName,
      toName: leg.toName,
      fromAddress: leg.from,
      toAddress: leg.to,
      steps,
    };
  }
  return out;
}

/** Receipts of one full run already confirmed on Agung, keyed by the yard's chain job id. Read-only mode replays these. */
export const KNOWN_RECEIPTS: Record<string, SettleResult> = receipts(REPLAY_RUN);
