import { useEffect, useRef, useState } from "react";
import type { Engine } from "../economy/engine.ts";
import { ACTOR_ORDER, PERSON_ORDER, PHASES, formatPeaq, inspectionLine, shortAddress } from "../economy/model.ts";
import type { ActorId, Flow, PartyId, PersonId, Snapshot, Speed, TransferRow } from "../economy/types.ts";
import { ACTIVITY_STATUS } from "../peaq/activityStatus.ts";
import { LANDED_TRANSFERS } from "../peaq/landed.ts";
import { useAgungStatus } from "../peaq/useAgung.ts";
import { settleJob, useYardChain } from "../peaq/useYardChain.ts";
import type { YardStatus } from "../peaq/yardTypes.ts";
import { FarmScene } from "../scene/FarmScene.tsx";

const ACCENT: Record<PartyId, string> = {
  treasury: "bg-amber-300",
  robot: "bg-orange-500",
  drone: "bg-sky-300",
  battery: "bg-teal-300",
  customers: "bg-violet-300",
  plantOwner: "bg-amber-200",
  robotOwner: "bg-orange-300",
  city: "bg-sky-200",
};

const CIRCLE =
  "The sun powers the plant, the plant sells that power to the city, residents pay the city rent so the city can buy energy again, and the plant pays the robot owner so Kepler and Lumen keep the panels producing.";

function roleFor(flow: Flow | null, id: PartyId): "pays" | "receives" | null {
  if (!flow || flow.kind !== "pay") return null;
  if (flow.from === id) return "pays";
  if (flow.to === id) return "receives";
  return null;
}

function partyName(snap: Snapshot, id: PartyId): string {
  if (id === "customers" || id === "plantOwner" || id === "robotOwner" || id === "city") return snap.people[id].name;
  return snap.wallets[id].name;
}

function stepLine(snap: Snapshot): { title: string; detail: string } {
  const flow = snap.flow;
  if (flow?.kind === "pay") {
    return {
      title: `${partyName(snap, flow.from)} ${flow.from === "customers" ? "pay" : "pays"} ${partyName(snap, flow.to)}`,
      detail: `${flow.label} · ${formatPeaq(flow.amountCents)} PEAQ`,
    };
  }
  if (snap.runComplete) return { title: "Owners settle with the residents", detail: "The circle closes" };
  const phase = PHASES[snap.phaseIndex];
  if (snap.inspection) {
    return {
      title: inspectionLine(snap.inspection),
      detail: snap.inspection === "dirty" ? "Kepler stays still. He leaves to clean only after this." : "The glass is clear. Kepler stays until this can be read.",
    };
  }
  if (phase?.id === "soil") return { title: "Dust lands on the panels", detail: "The sun is up. Output falls until Kepler washes." };
  if (phase?.id === "survey") return { title: "Lumen inspects the panels", detail: "Kepler waits at the dock." };
  if (phase?.id === "wash") return { title: "Kepler cleans the panels", detail: "He takes the aisles and goes around a blocked row." };
  if (phase?.id === "inspect") return { title: "Lumen checks the yield", detail: "The drone measures what the plant can sell." };
  if (phase?.id === "recharge") return { title: "Kepler buys energy", detail: "The rover pays BESS-2 so it can roll out again." };
  if (phase?.id === "refill") return { title: "The plant restocks the battery", detail: "Generation fills the pack back up." };
  return { title: phase?.label ?? "Rheinau", detail: phase?.blurb ?? "" };
}

function emphasisClass(flow: Flow | null, id: PartyId): string {
  const role = roleFor(flow, id);
  if (role === "pays") return "bg-amber-200 text-slate-950 ring-4 ring-amber-500";
  if (role === "receives") return "bg-emerald-200 text-slate-950 ring-4 ring-emerald-600";
  if (flow?.kind === "pay") return "opacity-40";
  return "bg-slate-950/78 text-white ring-1 ring-white/10";
}

function leadParties(ids: readonly PartyId[], flow: Flow | null): PartyId[] {
  if (!flow || flow.kind !== "pay") return [...ids];
  const hot = [flow.from, flow.to].filter((id) => ids.includes(id));
  return [...hot, ...ids.filter((id) => !hot.includes(id))];
}

function realHash(hash: string | null, ok: boolean): string | null {
  if (!ok || !hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return hash;
}

export function Hud({ engine, snap }: { engine: Engine; snap: Snapshot }) {
  const agung = useAgungStatus();
  const yard = useYardChain(engine);
  const posted = useRef(new Set<string>());
  const generation = useRef(snap.resetGeneration);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (generation.current !== snap.resetGeneration) {
      generation.current = snap.resetGeneration;
      posted.current.clear();
    }
    for (const job of snap.chainJobs) {
      if (posted.current.has(job.id)) continue;
      posted.current.add(job.id);
      void settleJob(job).then((result) => {
        if (result.steps && result.steps.length > 0) {
          for (const step of result.steps) {
            const id = step.label === "Settlement" ? "settlement" : "settlement-robot";
            engine.recordTransfer({
              id,
              label: step.label,
              amountPeaq: step.amountPeaq,
              fromName: step.fromName,
              toName: step.toName,
              fromAddress: step.fromAddress,
              toAddress: step.toAddress,
              hash: step.txHash,
              explorer: step.explorer,
              ok: step.ok,
              error: step.error,
            });
          }
          if (!result.ok && result.steps.every((step) => step.ok)) {
            engine.recordTransfer({
              id: job.id,
              label: "Settlement",
              amountPeaq: result.amountPeaq ?? "",
              fromName: result.fromName ?? "Plant owner",
              toName: result.toName ?? "Electricity customers",
              fromAddress: result.fromAddress ?? "",
              toAddress: result.toAddress ?? "",
              hash: null,
              explorer: null,
              ok: false,
              error: result.error ?? "Settlement did not land.",
            });
          }
          return;
        }
        engine.recordTransfer({
          id: job.id,
          label: result.label ?? job.kind,
          amountPeaq: result.amountPeaq ?? "",
          fromName: result.fromName ?? "",
          toName: result.toName ?? "",
          fromAddress: result.fromAddress ?? "",
          toAddress: result.toAddress ?? "",
          hash: result.txHash ?? null,
          explorer: result.explorer ?? null,
          ok: result.ok,
          error: result.error ?? null,
        });
      });
    }
  }, [engine, snap]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        engine.togglePause();
      } else if (event.key === "r" || event.key === "R") {
        engine.reset();
      } else if (event.key === "1") engine.setSpeed(1);
      else if (event.key === "2") engine.setSpeed(2);
      else if (event.key === "4") engine.setSpeed(4);
      else if (event.key === "f" || event.key === "F") setExpanded((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const chainLabel =
    agung.state === "loading"
      ? "Reading Agung…"
      : agung.state === "offline"
        ? "Agung unreachable"
        : `Agung ${agung.chainId}`;
  const step = stepLine(snap);
  const people = leadParties(PERSON_ORDER, snap.flow) as PersonId[];
  const actors = leadParties(ACTOR_ORDER, snap.flow) as ActorId[];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <p className="shrink-0 bg-amber-100 px-4 py-2.5 text-[15px] font-semibold leading-snug text-slate-950 sm:text-lg">
        {CIRCLE}
      </p>
      <div
        className={
          expanded
            ? "grid min-h-0 flex-1 grid-cols-1 grid-rows-1"
            : "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:grid-rows-1"
        }
      >
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <FarmScene engine={engine} />
          </div>
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-t border-white/10 bg-slate-950 px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">{chainLabel}</p>
              <h1 className="text-2xl font-bold leading-tight text-amber-200 sm:text-4xl">{step.title}</h1>
              <p className="mt-0.5 text-base font-semibold leading-snug text-white sm:text-xl">{step.detail}</p>
            </div>
            <Controls engine={engine} snap={snap} expanded={expanded} onExpand={() => setExpanded((value) => !value)} />
          </div>
        </section>
        {expanded ? null : (
          <aside className="yard-scroll min-h-0 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto border-t border-white/10 bg-slate-950 p-2 md:border-t-0 md:border-l md:p-3">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              {people.map((id) => (
                <PersonCard key={id} id={id} snap={snap} yard={yard} />
              ))}
              {actors.map((id) => (
                <WalletCard key={id} id={id} snap={snap} yard={yard} />
              ))}
            </div>
            <ActivityNote />
            <TransactionPanel snap={snap} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Controls({
  engine,
  snap,
  expanded,
  onExpand,
}: {
  engine: Engine;
  snap: Snapshot;
  expanded: boolean;
  onExpand: () => void;
}) {
  const speeds: Speed[] = [1, 2, 4];
  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => engine.togglePause()}
        className="h-10 rounded-full bg-white px-3 text-sm font-semibold text-slate-950"
        aria-pressed={snap.paused}
      >
        {snap.paused ? "Play" : "Pause"}
      </button>
      <div className="flex h-10 items-center rounded-full bg-white/10 p-1">
        {speeds.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => engine.setSpeed(speed)}
            className={`h-8 rounded-full px-2.5 text-sm font-semibold ${
              snap.speed === speed ? "bg-amber-300 text-slate-950" : "text-white/80"
            }`}
            aria-pressed={snap.speed === speed}
          >
            {speed}×
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onExpand}
        className="h-10 rounded-full bg-amber-300 px-3 text-sm font-semibold text-slate-950"
        aria-pressed={expanded}
      >
        {expanded ? "Split view" : "Expand yard"}
      </button>
      <button
        type="button"
        onClick={() => engine.reset()}
        className="h-10 rounded-full border border-white/20 px-3 text-sm font-semibold text-white"
      >
        Reset
      </button>
    </div>
  );
}

function ActivityNote() {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-rose-200 p-3 text-slate-950">
      <p className="text-sm font-bold">{ACTIVITY_STATUS.label}</p>
      <p className="mt-1 text-sm font-semibold leading-snug">{ACTIVITY_STATUS.error}</p>
    </section>
  );
}

function TransactionPanel({ snap }: { snap: Snapshot }) {
  const rows = mergeRows(snap.transfers);
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Transactions</h2>
      <p className="mt-1 text-sm leading-snug text-white/70">
        {snap.runComplete ? "Settlement closes the circle." : "Payments appear here as they land on Agung."}
      </p>
      <ol className="mt-2 space-y-2">
        {rows.map((row) => (
          <TransferItem key={row.id} row={row} />
        ))}
      </ol>
    </section>
  );
}

function mergeRows(live: TransferRow[]): TransferRow[] {
  const map = new Map<string, TransferRow>();
  for (const row of LANDED_TRANSFERS) map.set(row.id, row);
  for (const row of live) map.set(row.id, row);
  return [...map.values()];
}

function TransferItem({ row }: { row: TransferRow }) {
  const hash = realHash(row.hash, row.ok);
  const href = hash ? `https://agung-testnet.subscan.io/tx/${hash}` : null;
  return (
    <li className="min-w-0 overflow-hidden rounded-xl bg-white/5 px-2.5 py-2">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{row.label}</p>
        <p className="shrink-0 font-mono text-sm text-amber-200">{row.amountPeaq} PEAQ</p>
      </div>
      <p className="mt-1 truncate text-sm text-white/80">
        {row.fromName} <span className="text-white/40">→</span> {row.toName}
      </p>
      <p className="truncate font-mono text-xs text-white/50" title={`${row.fromAddress} → ${row.toAddress}`}>
        {shortAddress(row.fromAddress)} → {shortAddress(row.toAddress)}
      </p>
      {hash && href ? (
        <a
          className="mt-1 block truncate font-mono text-sm text-sky-200 underline decoration-sky-200/40"
          href={href}
          target="_blank"
          rel="noreferrer"
          title={hash}
        >
          {shortAddress(hash)}
        </a>
      ) : (
        <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-rose-200">
          Did not land{row.error ? `: ${row.error}` : ""}
        </p>
      )}
    </li>
  );
}

function PersonCard({ id, snap, yard }: { id: PersonId; snap: Snapshot; yard: YardStatus | null }) {
  const wallet = snap.people[id];
  const chain = yard?.people.find((person) => person.id === id);
  const address = chain?.address ?? wallet.address;
  const hot = roleFor(snap.flow, id) !== null;
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl p-3 ${emphasisClass(snap.flow, id)}`}>
      <CardHead id={id} name={wallet.name} role={wallet.role} flow={snap.flow} hot={hot} />
      <AddressLine address={address} hot={hot} />
      <p className="mt-1 truncate font-mono text-xl leading-none font-semibold tabular-nums">
        {formatPeaq(wallet.balanceCents)}
        <span className={`ml-1 text-sm font-medium ${hot ? "text-slate-800" : "text-amber-200"}`}>PEAQ</span>
      </p>
    </article>
  );
}

function WalletCard({ id, snap, yard }: { id: ActorId; snap: Snapshot; yard: YardStatus | null }) {
  const wallet = snap.wallets[id];
  const machine = yard?.machines.find((item) => item.actor === id);
  const address = machine?.address ?? wallet.address;
  const hot = roleFor(snap.flow, id) !== null;
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl p-3 ${emphasisClass(snap.flow, id)}`}>
      <CardHead id={id} name={wallet.name} role={wallet.role} flow={snap.flow} hot={hot} />
      <AddressLine address={address} hot={hot} />
      <p className="mt-1 truncate font-mono text-xl leading-none font-semibold tabular-nums">
        {formatPeaq(wallet.balanceCents)}
        <span className={`ml-1 text-sm font-medium ${hot ? "text-slate-800" : "text-amber-200"}`}>PEAQ</span>
      </p>
      {machine?.machineId ? (
        <p className={`mt-1 truncate font-mono text-xs ${hot ? "text-slate-800" : "text-emerald-200"}`} title={machine.machineId}>
          machine {shortAddress(machine.machineId)}
        </p>
      ) : machine?.error ? (
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-rose-200">{machine.error}</p>
      ) : null}
    </article>
  );
}

function CardHead({
  id,
  name,
  role,
  flow,
  hot,
}: {
  id: PartyId;
  name: string;
  role: string;
  flow: Flow | null;
  hot: boolean;
}) {
  const roleNow = roleFor(flow, id);
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex min-w-0 items-center gap-1.5 text-lg font-bold leading-none">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${hot ? "bg-slate-950" : ACCENT[id]}`} />
          <span className="truncate">{name}</span>
        </h2>
        <p className={`mt-1 truncate text-xs font-semibold uppercase tracking-[0.12em] ${hot ? "text-slate-700" : "text-white/50"}`}>
          {role}
        </p>
      </div>
      {roleNow === "pays" ? (
        <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-sm font-bold text-amber-200">PAYS</span>
      ) : null}
      {roleNow === "receives" ? (
        <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-sm font-bold text-emerald-200">GETS</span>
      ) : null}
    </div>
  );
}

function AddressLine({ address, hot }: { address: string; hot: boolean }) {
  return (
    <p className={`mt-2 max-w-full truncate font-mono text-sm ${hot ? "text-slate-800" : "text-white/65"}`} title={address}>
      {shortAddress(address)}
    </p>
  );
}
