import { createHash } from "node:crypto";
import { hasBlobStore, readSharedJson, writeSharedJson } from "./secret.ts";

/**
 * All live runs share one set of wallets, so only one run may hold them at a time. On Vercel the
 * lease lives in the private blob store so every function instance sees it; locally it stays in memory.
 */
const LEASE_FILE = "writer/lease.json";
const HOUR = 3_600_000;
/** A run that sends nothing for this long (closed tab, long pause) gives up the wallets. */
export const LEASE_TTL_MS = 120_000;
export const RUNS_PER_VISITOR_PER_HOUR = 6;
export const RUNS_PER_HOUR = 40;

type Holder = { run: string; visitor: string; at: number };
type LeaseState = { holder: Holder | null; starts: { visitor: string; at: number }[] };

export type Admission = { ok: true } | { ok: false; reason: string };

let memory: LeaseState = { holder: null, starts: [] };

async function read(): Promise<LeaseState> {
  if (!hasBlobStore()) return memory;
  return (await readSharedJson<LeaseState>(LEASE_FILE)) ?? { holder: null, starts: [] };
}

async function write(state: LeaseState): Promise<void> {
  memory = state;
  await writeSharedJson(LEASE_FILE, state);
}

const BUSY = "Another visitor's live run is using the yard wallets right now.";

/** Raw IPs are never stored, only a salted hash. */
export function visitorId(ip: string): string {
  return createHash("sha256").update(`fuel-the-robot-economy:${ip}`).digest("hex").slice(0, 16);
}

export async function admitRun(run: string, visitor: string): Promise<Admission> {
  const now = Date.now();
  const state = await read();
  const starts = state.starts.filter((start) => now - start.at < HOUR);
  const holder = state.holder;
  if (holder?.run === run) return { ok: true };
  if (holder && holder.visitor !== visitor && now - holder.at < LEASE_TTL_MS) return { ok: false, reason: BUSY };
  if (starts.length >= RUNS_PER_HOUR) {
    return { ok: false, reason: `The live writer already sent ${RUNS_PER_HOUR} runs in the last hour.` };
  }
  const mine = starts.filter((start) => start.visitor === visitor).length;
  if (mine >= RUNS_PER_VISITOR_PER_HOUR) {
    return { ok: false, reason: `This connection already started ${mine} live runs in the last hour.` };
  }
  await write({ holder: { run, visitor, at: now }, starts: [...starts, { visitor, at: now }] });
  if (hasBlobStore()) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const check = await read();
    if (check.holder?.run !== run) return { ok: false, reason: BUSY };
  }
  return { ok: true };
}

/** Every later job of a run must still hold the lease; holding it refreshes the timer. */
export async function holdRun(run: string): Promise<Admission> {
  const state = await read();
  if (state.holder?.run !== run) {
    return {
      ok: false,
      reason: "This run lost the yard wallets: it sat idle too long or another run took over.",
    };
  }
  await write({ ...state, holder: { ...state.holder, at: Date.now() } });
  return { ok: true };
}

export async function releaseRun(run: string): Promise<void> {
  const state = await read();
  if (state.holder?.run === run) await write({ ...state, holder: null });
}

/** A page asking about its own run is not blocked by its own lease. */
export async function walletsBusy(ownRun: string | null = null): Promise<boolean> {
  const state = await read();
  return state.holder !== null && state.holder.run !== ownRun && Date.now() - state.holder.at < LEASE_TTL_MS;
}
