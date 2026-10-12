import { useEffect, useRef, useState } from "react";
import type { Engine } from "../economy/engine.ts";
import type { ChainJob, IdentityBook, PersonId } from "../economy/types.ts";
import { KNOWN_RECEIPTS } from "./landed.ts";
import type { SettleResult, YardStatus } from "./yardTypes.ts";

/** Scopes server-side receipts to this page load so a reload sends fresh transfers instead of reusing old ones. */
export const SESSION = Math.random().toString(36).slice(2, 10);

export function useYardChain(engine: Engine, run: string): YardStatus | null {
  const [status, setStatus] = useState<YardStatus | null>(null);
  const seen = useRef("");

  useEffect(() => {
    let cancel = false;
    const pull = async () => {
      try {
        const response = await fetch("/api/peaq");
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
        if (body.people?.some((person) => person.id === "city")) {
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

export async function settleJob(job: ChainJob, run: string): Promise<SettleResult> {
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
      }),
    });
    if (!response.ok) throw new Error(`yard server answered ${response.status}`);
    return (await response.json()) as SettleResult;
  } catch (error) {
    const known = KNOWN_RECEIPTS[job.id];
    if (known) return known;
    if (job.kind === "recharge") return { ok: false, skipped: true };
    const message = error instanceof Error ? error.message : "request failed";
    return { ok: false, error: `Agung write did not land: ${message}` };
  }
}
