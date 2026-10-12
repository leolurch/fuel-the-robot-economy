/**
 * Drives one full yard run against a writer the way the page does, one job at a time.
 *   node --experimental-strip-types scripts/record-run.ts [baseUrl] [--write]
 * With --write, a fully landed run replaces src/peaq/replayRun.ts.
 */
import { writeFileSync } from "node:fs";
import { PERSON_META } from "../src/economy/model.ts";
import type { ChainKind } from "../src/economy/types.ts";
import type { SettleResult, SettleStep } from "../src/peaq/yardTypes.ts";

const base = (process.argv.slice(2).find((arg) => arg.startsWith("http")) ?? "http://127.0.0.1:4318").replace(/\/$/, "");
const write = process.argv.includes("--write");
const run = `record-${Math.random().toString(36).slice(2, 10)}`;

const jobs: { id: string; kind: ChainKind; cycle: number; cleanlinessMilli: number }[] = [{ id: "fund", kind: "fund", cycle: 1, cleanlinessMilli: 0 }];
for (const cycle of [1, 2, 3]) {
  jobs.push({ id: `${cycle}:power`, kind: "power", cycle, cleanlinessMilli: 955 });
  jobs.push({ id: `${cycle}:work`, kind: "work", cycle, cleanlinessMilli: 955 });
  jobs.push({ id: `${cycle}:recharge`, kind: "recharge", cycle, cleanlinessMilli: 955 });
}
jobs.push({ id: "settlement", kind: "settlement", cycle: 3, cleanlinessMilli: 955 });

type Leg = { job: string; step: SettleStep };
const legs: Leg[] = [];
let failed = false;
console.log(`Run ${run} against ${base}`);
for (const job of jobs) {
  const started = Date.now();
  const response = await fetch(`${base}/api/peaq/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...job, run }),
  });
  const result = (await response.json()) as SettleResult;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.replay) {
    console.log(`REFUSED ${job.id}: ${result.error}`);
    process.exit(2);
  }
  const steps: SettleStep[] =
    result.steps ??
    [{
      id: job.id,
      label: result.label ?? job.kind,
      amountPeaq: result.amountPeaq ?? "",
      fromName: result.fromName ?? "",
      toName: result.toName ?? "",
      fromAddress: result.fromAddress ?? "0x",
      toAddress: result.toAddress ?? "0x",
      txHash: result.txHash ?? null,
      explorer: result.explorer ?? null,
      ok: result.ok,
      error: result.error ?? null,
    }];
  for (const step of steps) {
    legs.push({ job: job.id, step });
    console.log(`${step.ok ? "ok  " : "FAIL"} ${job.id.padEnd(11)} ${step.label} ${step.kind === "event" ? "(event)" : `${step.amountPeaq} PEAQ`} ${step.fromName} → ${step.toName} ${step.txHash ?? step.error}`);
    if (!step.ok) failed = true;
  }
  console.log(`     ${seconds}s`);
}

if (write && !failed) {
  const reserve = PERSON_META.drain.name;
  const body = legs
    .filter((leg) => !leg.step.id.startsWith("recover-"))
    .map(({ job, step }) => {
      const fromName = step.fromName === reserve ? "Run reserve" : step.fromName;
      const toName = step.toName === reserve ? "Run reserve" : step.toName;
      const lines = [
        `    job: ${JSON.stringify(job)},`,
        `    id: ${JSON.stringify(step.id)},`,
        `    label: ${JSON.stringify(step.label)},`,
        `    amountPeaq: ${JSON.stringify(step.amountPeaq)},`,
        `    fromName: ${JSON.stringify(fromName)},`,
        `    toName: ${JSON.stringify(toName)},`,
        `    from: ${JSON.stringify(step.fromAddress)},`,
        `    to: ${JSON.stringify(step.toAddress)},`,
        `    hash: ${JSON.stringify(step.txHash)},`,
      ];
      if (step.kind === "event") lines.push(`    kind: "event",`);
      return `  {\n${lines.join("\n")}\n  },`;
    })
    .join("\n");
  const header = `export type ReplayLeg = {
  /** Chain job that produced the transaction: "fund", "1:power", …, "settlement". */
  job: string;
  /** Same as job for single transfers, or the step id inside a job with several transactions. */
  id: string;
  label: string;
  amountPeaq: string;
  fromName: string;
  toName: string;
  from: \`0x\${string}\`;
  to: \`0x\${string}\`;
  hash: \`0x\${string}\`;
  /** Lumen's EventRegistry submissions carry no PEAQ. */
  kind?: "event";
};

/** One full run sent by the yard writer on Agung, recorded by scripts/record-run.ts. Hashes come from receipts. */
export const REPLAY_RUN: readonly ReplayLeg[] = [
`;
  writeFileSync("src/peaq/replayRun.ts", `${header}${body}\n];\n`);
  console.log(`Wrote ${legs.length} legs to src/peaq/replayRun.ts`);
}
process.exit(failed ? 1 : 0);
