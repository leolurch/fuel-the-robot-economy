import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { Engine } from "../economy/engine.ts";
import { ACTOR_ORDER, PERSON_ORDER, PHASES, RUN_CYCLES, formatPeaq, inspectionLine, shortAddress } from "../economy/model.ts";
import type { ActorId, Flow, PartyId, PersonId, Snapshot, Speed, TransferRow } from "../economy/types.ts";
import { KNOWN_MACHINES } from "../peaq/knownMachines.ts";
import { AGUNG_EXPLORER_ACCOUNT, AGUNG_EXPLORER_TX } from "../peaq/landed.ts";
import { useAgungStatus } from "../peaq/useAgung.ts";
import { SESSION, settleJob, useYardChain } from "../peaq/useYardChain.ts";
import type { YardStatus } from "../peaq/yardTypes.ts";
import type { AgungRead } from "../peaq/agung.ts";
import { FarmScene } from "../scene/FarmScene.tsx";

const ACCENT: Record<PartyId, string> = {
  treasury: "bg-amber-300",
  robot: "bg-orange-500",
  drone: "bg-sky-300",
  battery: "bg-teal-300",
  city: "bg-sky-200",
  plantOwner: "bg-amber-200",
  robotOwner: "bg-orange-300",
  drain: "bg-violet-300",
};

const CIRCLE =
  "The sun powers the plant, the city buys that power, the plant pays the robot owner so Kepler and Lumen keep the panels producing, and at the end the run settles so the next one starts fresh.";

function roleFor(flow: Flow | null, id: PartyId): "pays" | "receives" | null {
  if (flow?.kind === "budget") return flow.to === id ? "receives" : null;
  if (!flow || flow.kind !== "pay") return null;
  if (flow.from === id) return "pays";
  if (flow.to === id) return "receives";
  return null;
}

function partyName(snap: Snapshot, id: PartyId): string {
  if (id === "city" || id === "plantOwner" || id === "robotOwner" || id === "drain") return snap.people[id].name;
  return snap.wallets[id].name;
}

function stepLine(snap: Snapshot): { title: string; detail: string } {
  const flow = snap.flow;
  if (flow?.kind === "pay") {
    return {
      title: `${partyName(snap, flow.from)} pays ${partyName(snap, flow.to)}`,
      detail: `${flow.label} · ${formatPeaq(flow.amountCents)} PEAQ`,
    };
  }
  if (flow?.kind === "budget") {
    return { title: `${partyName(snap, flow.to)} gets its run budget`, detail: `${flow.label} · ${formatPeaq(flow.amountCents)} PEAQ` };
  }
  if (snap.runComplete) {
    return { title: "Settled — funds reset for next run", detail: `${formatPeaq(flow?.amountCents ?? 0)} PEAQ returned. Press R to run again.` };
  }
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
  if (phase?.id === "recharge") return { title: "Kepler buys energy", detail: "The rover pays the Battery so it can roll out again." };
  if (phase?.id === "refill") return { title: "The plant restocks the battery", detail: "Generation fills the pack back up." };
  return { title: phase?.label ?? "Fuel the Robot Economy", detail: phase?.blurb ?? "" };
}

function emphasisClass(flow: Flow | null, id: PartyId): string {
  const role = roleFor(flow, id);
  if (role === "pays") return "bg-amber-200 text-slate-950 ring-4 ring-amber-500";
  if (role === "receives") return "bg-emerald-200 text-slate-950 ring-4 ring-emerald-600";
  if (flow?.kind === "pay" || flow?.kind === "budget") return "opacity-40";
  return "bg-slate-950/78 text-white ring-1 ring-white/10";
}

function leadParties(ids: readonly PartyId[], flow: Flow | null): PartyId[] {
  if (!flow || (flow.kind !== "pay" && flow.kind !== "budget")) return [...ids];
  const hot = [flow.from, flow.to].filter((id) => ids.includes(id));
  return [...hot, ...ids.filter((id) => !hot.includes(id))];
}

function realHash(hash: string | null, ok: boolean): string | null {
  if (!ok || !hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return hash;
}

export function Hud({ engine, snap }: { engine: Engine; snap: Snapshot }) {
  const agung = useAgungStatus();
  const run = `${SESSION}-${snap.resetGeneration}`;
  const yard = useYardChain(engine, run);
  const live = yard !== null && !yard.readOnly && yard.operator !== null;
  const posted = useRef(new Set<string>());
  const generation = useRef(snap.resetGeneration);
  const [expanded, setExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [replays, setReplays] = useState<Record<string, string>>({});
  const [liveRuns, setLiveRuns] = useState<string[]>([]);
  const mode = runMode(yard, replays[run] ?? null, liveRuns.includes(run));

  useEffect(() => {
    if (generation.current !== snap.resetGeneration) {
      generation.current = snap.resetGeneration;
      posted.current.clear();
    }
    for (const job of snap.chainJobs) {
      if (posted.current.has(job.id)) continue;
      posted.current.add(job.id);
      const onReplay = (reason: string) => setReplays((prior) => (prior[run] ? prior : { ...prior, [run]: reason }));
      void settleJob(job, run, onReplay).then((result) => {
        const replay = result.replay === true;
        if (job.kind === "fund" && result.ok && !replay) setLiveRuns((prior) => (prior.includes(run) ? prior : [...prior, run]));
        if (result.steps && result.steps.length > 0) {
          for (const step of result.steps) {
            engine.recordTransfer({
              id: step.id,
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
              kind: step.kind,
              replay,
            });
          }
          if (!result.ok && result.steps.every((step) => step.ok)) {
            engine.recordTransfer({
              id: job.id,
              label: job.kind === "fund" ? "Run budget" : "Settlement",
              amountPeaq: result.amountPeaq ?? "",
              fromName: result.fromName ?? "",
              toName: result.toName ?? "",
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
          replay,
        });
      });
    }
  }, [engine, snap, run]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("dialog, input, textarea")) return;
      if (event.key === " ") {
        event.preventDefault();
        engine.togglePause();
      } else if (event.key === "r" || event.key === "R") {
        engine.reset();
      } else if (event.key === "1") engine.setSpeed(1);
      else if (event.key === "2") engine.setSpeed(2);
      else if (event.key === "4") engine.setSpeed(4);
      else if (event.key === "f" || event.key === "F") setExpanded((value) => !value);
      else if (event.key === "?" || event.key === "h" || event.key === "H") setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  const step = stepLine(snap);
  const people = leadParties(PERSON_ORDER, snap.flow) as PersonId[];
  const actors = leadParties(ACTOR_ORDER, snap.flow) as ActorId[];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <Header agung={agung} mode={mode} onHelp={() => setHelpOpen(true)} />
      <p className="shrink-0 bg-amber-100 px-3 py-2 text-[13px] font-semibold leading-snug text-slate-950 sm:px-4 sm:text-base lg:text-lg">
        {CIRCLE}
      </p>
      <HowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />
      <div
        className={
          expanded
            ? "grid min-h-0 flex-1 grid-cols-1 grid-rows-1"
            : "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:grid-rows-1"
        }
      >
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#8fb4c6]">
            <SceneBoundary>
              <FarmScene engine={engine} />
            </SceneBoundary>
            <PowerMeter snap={snap} />
          </div>
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-t border-white/10 bg-slate-950 px-3 py-2.5 sm:px-4">
            <div className="min-w-[min(100%,16rem)] flex-1" aria-live="polite">
              <PhaseStrip snap={snap} />
              <h2 className="mt-1.5 text-2xl font-bold leading-tight text-amber-200 sm:text-4xl">{step.title}</h2>
              <p className="mt-0.5 text-base font-semibold leading-snug text-white sm:text-xl">{step.detail}</p>
            </div>
            <Controls engine={engine} snap={snap} expanded={expanded} onExpand={() => setExpanded((value) => !value)} />
          </div>
        </section>
        {expanded ? null : (
          <aside className="yard-scroll min-h-0 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto border-t border-white/10 bg-slate-950 p-2 md:border-t-0 md:border-l md:p-3">
            <SectionLabel>People and owners</SectionLabel>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
              {people.map((id) => (
                <PersonCard key={id} id={id} snap={snap} yard={yard} />
              ))}
            </div>
            <SectionLabel>Machines with a peaq ID</SectionLabel>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
              {actors.map((id) => (
                <WalletCard key={id} id={id} snap={snap} yard={yard} live={live} />
              ))}
            </div>
            <TransactionPanel snap={snap} mode={mode} />
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

/** Live array output from the simulation, and what the wash recovered once Lumen checks it. */
function PowerMeter({ snap }: { snap: Snapshot }) {
  const avgDirt = snap.rowDirt.reduce((sum, value) => sum + value, 0) / snap.rowDirt.length;
  const share = snap.yieldKw / snap.nameplateKw;
  const gainKw = Math.round(snap.yieldKw - snap.soiledKw);
  const gainPct = Math.round(((snap.yieldKw - snap.soiledKw) / snap.soiledKw) * 100);
  const showGain = (snap.phase === "inspect" || snap.phase === "pay") && gainKw > 0;
  const healthy = share >= 0.9;
  const clean = (100 - avgDirt * 100).toFixed(1);
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-[25] flex items-center gap-2 sm:inset-x-auto sm:left-3 sm:top-3 sm:flex-col sm:items-start sm:gap-1.5">
      <div className="min-w-0 flex-1 rounded-xl bg-slate-950/85 px-2.5 py-1.5 shadow-lg ring-1 ring-white/10 sm:w-56 sm:flex-none sm:px-3 sm:py-2">
        <p className="hidden items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-white/65 sm:flex">
          <span>Plant output</span>
          <span>{clean}% clean</span>
        </p>
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-base font-bold tabular-nums text-white sm:text-2xl">
            {Math.round(snap.yieldKw)}
            <span className="ml-1 text-xs font-semibold text-white/60 sm:text-sm">
              / {snap.nameplateKw} kW<span className="sm:hidden"> output</span>
            </span>
          </span>
          <span className="text-[12px] font-semibold text-white/70 sm:hidden">{clean}% clean</span>
        </p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${healthy ? "bg-emerald-400" : "bg-amber-400"}`}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
      </div>
      {showGain ? (
        <div className="shrink-0 rounded-xl bg-emerald-400 px-2.5 py-1 text-slate-950 shadow-lg sm:px-3 sm:py-1.5">
          <p className="text-xl font-black leading-none tabular-nums sm:text-4xl">+{gainKw} kW</p>
          <p className="mt-0.5 text-[12px] font-bold sm:text-base">+{gainPct}% after cleaning</p>
        </div>
      ) : null}
    </div>
  );
}

type RunMode = { live: boolean; title: string; detail: string | null } | null;

function runMode(yard: YardStatus | null, replayReason: string | null, admitted: boolean): RunMode {
  if (replayReason) return { live: false, title: "Replaying a confirmed run", detail: replayReason };
  if (admitted) return { live: true, title: "Live on Agung", detail: "This run is sending fresh transactions right now." };
  if (yard === null) return null;
  if (yard.live?.available) return { live: true, title: "Live on Agung", detail: "Each run sends fresh transactions from the yard's wallets." };
  return { live: false, title: "Replaying a confirmed run", detail: yard.live?.reason ?? yard.blocker };
}

function TransactionPanel({ snap, mode }: { snap: Snapshot; mode: RunMode }) {
  const rows = snap.transfers;
  const confirmed = rows.filter((row) => realHash(row.hash, row.ok)).length;
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Agung receipts</h2>
        <p className="shrink-0 text-xs font-semibold text-emerald-300">{confirmed} confirmed</p>
      </div>
      {mode ? (
        <div
          className={`mt-2 rounded-xl px-2.5 py-2 ring-1 ${mode.live ? "bg-emerald-400/10 ring-emerald-300/30" : "bg-sky-400/10 ring-sky-300/25"}`}
          role="status"
        >
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${mode.live ? "text-emerald-200" : "text-sky-200"}`}>
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${mode.live ? "animate-pulse bg-emerald-400" : "bg-sky-300"}`} />
            {mode.title}
          </p>
          {mode.detail ? <p className="mt-0.5 text-[13px] leading-snug text-white/70">{mode.detail}</p> : null}
          {mode.live ? null : (
            <p className="mt-0.5 text-[13px] leading-snug text-white/70">
              The hashes below are a full earlier run by the same machines, each confirmed on Agung.
            </p>
          )}
        </div>
      ) : null}
      <p className="mt-2 text-sm leading-snug text-white/70">
        {snap.runComplete
          ? "Settled. Funds reset for the next run. Every hash opens on Subscan."
          : "Each payment and each Lumen inspection event links to its transaction on the Agung testnet."}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-xl bg-white/5 px-2.5 py-2 text-sm text-white/60">
          Waiting for the first payment of this run to confirm on Agung.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((row) => (
            <TransferItem key={row.id} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TransferItem({ row }: { row: TransferRow }) {
  const hash = realHash(row.hash, row.ok);
  const href = hash ? `${AGUNG_EXPLORER_TX}${hash}` : null;
  return (
    <li className="min-w-0 overflow-hidden rounded-xl bg-white/5 px-2.5 py-2">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">
          {row.label}
          {row.replay ? <span className="ml-1.5 rounded bg-sky-400/15 px-1 py-px text-[11px] font-semibold text-sky-200">replay</span> : null}
        </p>
        {row.kind === "event" ? (
          <p className="shrink-0 rounded bg-emerald-400/15 px-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-200">Event</p>
        ) : (
          <p className="shrink-0 font-mono text-sm text-amber-200">{row.amountPeaq} PEAQ</p>
        )}
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
  const address = chain && !/^0x0{40}$/.test(chain.address) ? chain.address : wallet.address;
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

function WalletCard({ id, snap, yard, live }: { id: ActorId; snap: Snapshot; yard: YardStatus | null; live: boolean }) {
  const wallet = snap.wallets[id];
  const machine = yard?.machines.find((item) => item.actor === id);
  const address = machine && !/^0x0{40}$/.test(machine.address) ? machine.address : wallet.address;
  const known = live ? undefined : KNOWN_MACHINES.find((item) => item.actor === id);
  const machineId = machine?.machineId ?? known?.machineId ?? null;
  const activation = machine?.explorer ?? (known ? `${AGUNG_EXPLORER_TX}${known.activationTx}` : null);
  const hot = roleFor(snap.flow, id) !== null;
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl p-3 ${emphasisClass(snap.flow, id)}`}>
      <CardHead id={id} name={wallet.name} role={wallet.role} flow={snap.flow} hot={hot} />
      <AddressLine address={address} hot={hot} />
      <p className="mt-1 truncate font-mono text-xl leading-none font-semibold tabular-nums">
        {formatPeaq(wallet.balanceCents)}
        <span className={`ml-1 text-sm font-medium ${hot ? "text-slate-800" : "text-amber-200"}`}>PEAQ</span>
      </p>
      {machineId ? (
        <a
          className={`mt-1.5 flex min-w-0 items-center gap-1.5 font-mono text-xs hover:underline ${hot ? "text-slate-800" : "text-emerald-200"}`}
          title={`MachineRegistry ID ${machineId}. Opens the activation transaction.`}
          href={activation ?? undefined}
          target="_blank"
          rel="noreferrer"
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${hot ? "bg-slate-800" : "bg-emerald-300"}`} />
          <span className="truncate">Machine ID {shortAddress(machineId)}</span>
        </a>
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
  const real = /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address);
  const className = `mt-2 block max-w-full truncate font-mono text-sm ${hot ? "text-slate-800" : "text-white/65"}`;
  if (!real) return <p className={className}>Address pending</p>;
  return (
    <a
      className={`${className} underline decoration-current/30 underline-offset-2 hover:decoration-current`}
      href={`${AGUNG_EXPLORER_ACCOUNT}${address}`}
      target="_blank"
      rel="noreferrer"
      title={`${address} on Subscan`}
    >
      {shortAddress(address)}
    </a>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{children}</h2>;
}

function chainText(agung: AgungRead): { text: string; tone: string } {
  if (agung.state === "loading") return { text: "Connecting to Agung…", tone: "bg-amber-300 animate-pulse" };
  if (agung.state === "offline") return { text: "Agung unreachable", tone: "bg-rose-400" };
  const block = Number(agung.blockNumber).toLocaleString("en-US");
  return { text: `Agung ${agung.chainId} · block ${block}`, tone: "bg-emerald-400" };
}

function Header({ agung, mode, onHelp }: { agung: AgungRead; mode: RunMode; onHelp: () => void }) {
  const chain = chainText(agung);
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight sm:text-lg">Fuel the Robot Economy</h1>
          <p className="hidden truncate text-xs text-white/55 sm:block">
            Machines that earn, pay, and recharge themselves on peaq
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="hidden items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 ring-1 ring-white/10 md:inline-flex"
          role="status"
          title={agung.state === "offline" ? agung.message : undefined}
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${chain.tone}`} />
          {chain.text}
        </span>
        {mode ? (
          <span
            className={`hidden rounded-full px-2.5 py-1 text-xs font-medium ring-1 lg:inline-flex ${
              mode.live ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25" : "bg-sky-400/10 text-sky-200 ring-sky-300/20"
            }`}
            title={mode.detail ?? undefined}
          >
            {mode.live ? "Live on Agung" : "Replay"}
          </span>
        ) : null}
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full md:hidden ${chain.tone}`} title={chain.text} />
        <button
          type="button"
          onClick={onHelp}
          className="h-9 rounded-full border border-amber-300/60 px-3 text-sm font-semibold text-amber-200 hover:bg-amber-300/10"
        >
          How it works
        </button>
      </div>
    </header>
  );
}

function PhaseStrip({ snap }: { snap: Snapshot }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
        {snap.runComplete ? "Run complete" : `Day ${snap.cycle} of ${RUN_CYCLES}`}
      </p>
      <ol className="flex min-w-0 gap-1 overflow-hidden" aria-label="Loop phases">
        {PHASES.map((phase, index) => {
          const state = snap.runComplete || index < snap.phaseIndex ? "done" : index === snap.phaseIndex ? "now" : "next";
          return (
            <li
              key={`${phase.id}-${index}`}
              aria-current={state === "now" ? "step" : undefined}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                state === "now"
                  ? "bg-amber-300 text-slate-950"
                  : state === "done"
                    ? "bg-white/10 text-white/70"
                    : "text-white/35"
              }`}
            >
              {phase.short}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-0 grid place-items-center bg-slate-900 p-6 text-center">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">The 3D yard could not start</p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            This browser did not give the page a WebGL context. The wallets and Agung receipts on the right still
            update. Try a current Chrome, Edge, or Firefox with hardware acceleration on.
          </p>
        </div>
      </div>
    );
  }
}

function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="how-title"
      className="m-auto max-h-[min(88vh,760px)] w-[min(94vw,680px)] overflow-y-auto rounded-3xl bg-slate-900 p-0 text-white shadow-2xl ring-1 ring-white/10 backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-5 py-4 backdrop-blur">
        <h2 id="how-title" className="text-xl font-bold">How Fuel the Robot Economy works</h2>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-full bg-white px-3 text-sm font-semibold text-slate-950"
          autoFocus
        >
          Back to the yard
        </button>
      </div>
      <div className="space-y-5 px-5 py-5 text-[15px] leading-relaxed text-white/80">
        <p>
          A solar plant only earns when its glass is clean. In this yard, the machines that keep it clean are economic
          participants: each one has a peaq machine ID and a wallet, gets paid for verified work, and buys its own
          energy. No invoice and no human approval sit between the work and the payment.
        </p>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">One day in the yard</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:text-amber-200/70">
            <li>Dust settles on the panels and output falls.</li>
            <li><b className="text-white">Lumen-04</b>, the drone, inspects the rows and reports them dirty.</li>
            <li><b className="text-white">Kepler-01</b>, the rover, washes every row and routes around a blocked one.</li>
            <li>Lumen flies again, hashes the recovered yield into a proof, and reports the inspection to peaq's EventRegistry.</li>
            <li>The city pays the plant owner 0.05 PEAQ for that power.</li>
            <li>The plant owner pays the robot owner 0.03 PEAQ for cleaning and inspection.</li>
            <li>Kepler pays the Battery 0.01 PEAQ for 22 kWh, then the plant refills the battery.</li>
          </ol>
          <p className="mt-2">
            Each run starts with a budget: 0.15 PEAQ to the city for three days of power and 0.03 PEAQ to Kepler for
            three recharges. After three days the run settles: the plant owner, the robot owner, and the Battery return
            everything, so the next run starts from the same budget and only gas is spent.
          </p>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Real on peaq Agung</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-emerald-300/70">
            <li>Four machine IDs in MachineRegistry, activated with the peaq SDK: the plant treasury, Kepler-01, Lumen-04, and the Battery.</li>
            <li>Every payment of a full run is a PEAQ transfer with a receipt: the run budget, power, robot pay, recharges, and the settlement. Machine IDs and hashes link to Subscan.</li>
            <li>Each day Lumen-04 signs an inspection event from its own wallet into Agung's EventRegistry, as machine 352. Its hash sits in the receipts next to the payment it unlocks.</li>
            <li>Opening the page starts a live run: a server-side writer signs fresh transactions for this visit. The keys never reach the browser.</li>
            <li>Live reads of the chain id, current block, and contract bytecode, straight from the public Agung RPC.</li>
            <li>
              <code className="rounded bg-white/10 px-1 font-mono text-sm">npm run verify</code> recomputes the machine IDs and checks every receipt.
            </li>
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Simulated</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-sky-200/70">
            <li>The rover, drone, soiling, and battery physics run in the browser. There is no physical hardware.</li>
            <li>
              One live run at a time shares the yard's wallets. If another visitor's run is in progress, the rate limit is
              reached, or the run reserve is low, the page says so and replays a full earlier run whose receipts are all on
              Agung.
            </li>
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Controls</h3>
          <p className="mt-2">
            <Kbd>Space</Kbd> pause · <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>4</Kbd> speed · <Kbd>R</Kbd> restart ·{" "}
            <Kbd>F</Kbd> expand the yard · <Kbd>H</Kbd> this guide. Drag to orbit, scroll or pinch to zoom.
          </p>
        </section>
      </div>
    </dialog>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white">{children}</kbd>
  );
}
