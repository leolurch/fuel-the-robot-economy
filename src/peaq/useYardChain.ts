import { useEffect, useRef, useState } from "react";
import type { Engine } from "../economy/engine.ts";
import type { ChainJob, IdentityBook, PersonId } from "../economy/types.ts";
import { AGUNG_DEPLOYMENT } from "./deployment.ts";
import { KNOWN_RECEIPTS } from "./landed.ts";
import type { SettleResult, YardStatus } from "./yardTypes.ts";

/** Scopes server-side receipts to this page load so a reload sends fresh transfers instead of reusing old ones. */
export const SESSION = Math.random().toString(36).slice(2, 10);

/** Static hosts (Vercel, any CDN) have no /api. Machines and people fall back to the known Agung identities. */
const STATIC_REPLAY: YardStatus = {
  chainId: AGUNG_DEPLOYMENT.chainId,
  deploymentId: AGUNG_DEPLOYMENT.deploymentId,
  operator: null,
  operatorBalance: "0",
  bondPeaq: "1",
  blocker: "This host serves the page without the writer, so runs replay the confirmed Agung run.",
  readOnly: true,
  writesLanded: true,
  live: { available: false, reason: "This host serves the page without the writer." },
  machines: [],
  people: [],
  transfers: [],
};

let serverMissing = false;

export function hasYardServer(): boolean {
  return !serverMissing;
}

export function useYardChain(engine: Engine, run: string): YardStatus | null {
  const [status, setStatus] = useState<YardStatus | null>(null);
  const seen = useRef("");

  useEffect(() => {
    let cancel = false;
    const pull = async () => {
      if (serverMissing) {
        setStatus(STATIC_REPLAY);
        return;
      }
      try {
        const response = await fetch("/api/peaq");
        const json = response.headers.get("content-type")?.includes("application/json") ?? false;
        if (response.status === 404 || response.status === 405 || (response.ok && !json)) {
          serverMissing = true;
          if (!cancel) setStatus(STATIC_REPLAY);
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as YardStatus;
        if (cancel) return;
        setStatus(body);
        const book = {} as IdentityBook;
        for (const machine of body.machines) {
          book[machine.actor] = { address: machine.address, did: machine.did };
        }
        const funded = body.machines.every(
          (machine) => machine.address !== "0x0000000000000000000000000000000000000000",
        );
        const signature = body.machines.map((machine) => `${machine.address}:${machine.did}`).join("|");
        if (body.machines.length === 4 && funded && seen.current !== signature) {
          seen.current = signature;
          engine.setIdentities(book);
        }
        if (body.people?.some((person) => person.id === "drain")) {
          const people = {} as Record<PersonId, { address: `0x${string}` }>;
          for (const person of body.people) people[person.id] = { address: person.address };
          engine.setPeople(people);
        }
        for (const row of body.transfers ?? []) {
          if (row.run !== run) continue;
          engine.recordTransfer({
            id: row.id,
            label: row.label,
            amountPeaq: row.amountPeaq,
            fromName: row.fromName,
            toName: row.toName,
            fromAddress: row.fromAddress,
            toAddress: row.toAddress,
            hash: row.txHash,
            explorer: row.explorer,
            ok: row.ok,
            error: row.error,
            kind: row.kind,
          });
        }
      } catch {
        if (!cancel) setStatus(null);
      }
    };
    void pull();
    const id = window.setInterval(() => {
      void pull();
    }, 8_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [engine, run]);

  return status;
}

type RunQueue = { tail: Promise<unknown>; replay: string | null; afterBlock: number };

const queues = new Map<string, RunQueue>();

function replayed(job: ChainJob): SettleResult {
  const known = KNOWN_RECEIPTS[job.id];
  if (!known) return { ok: false, replay: true, error: "No confirmed receipt exists for this step." };
  return { ...known, replay: true };
}

/**
 * Jobs of one run go to the writer one at a time, in order, so a settlement never overtakes the
 * recharge before it. Once the writer refuses a run, the rest of that run replays confirmed receipts.
 */
export function settleJob(job: ChainJob, run: string, onReplay: (reason: string) => void): Promise<SettleResult> {
  let queue = queues.get(run);
  if (!queue) {
    queue = { tail: Promise.resolve(), replay: null, afterBlock: 0 };
    queues.set(run, queue);
  }
  const state = queue;
  const next = state.tail.then(() => settleNow(job, run, state, onReplay));
  state.tail = next.catch(() => undefined);
  return next;
}

async function settleNow(job: ChainJob, run: string, state: RunQueue, onReplay: (reason: string) => void): Promise<SettleResult> {
  const switchToReplay = (reason: string) => {
    state.replay = reason;
    onReplay(reason);
    return replayed(job);
  };
  if (state.replay) return replayed(job);
  if (serverMissing) return switchToReplay("This host serves the page without the writer.");
  try {
    const response = await fetch("/api/peaq/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: job.id,
        kind: job.kind,
        cycle: job.cycle,
        cleanlinessMilli: job.cleanlinessMilli,
        run,
        afterBlock: state.afterBlock || undefined,
      }),
    });
    const json = response.headers.get("content-type")?.includes("application/json") ?? false;
    if (response.status === 404 || response.status === 405 || (response.ok && !json)) {
      serverMissing = true;
      return switchToReplay("This host serves the page without the writer.");
    }
    if (response.status === 429) return switchToReplay("Too many requests from this connection.");
    if (!response.ok) throw new Error(`the writer answered ${response.status}`);
    const result = (await response.json()) as SettleResult;
    if (result.replay) return switchToReplay(result.error ?? "The writer did not take this run.");
    for (const step of result.steps ?? []) state.afterBlock = Math.max(state.afterBlock, step.block ?? 0);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return { ok: false, error: `Agung write did not land: ${message}` };
  }
}
