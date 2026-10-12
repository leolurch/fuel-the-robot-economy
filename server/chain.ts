import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  keccak256,
  parseAbi,
  toBytes,
  toHex,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CITY_BUDGET_CENTS, KEPLER_BUDGET_CENTS, PERSON_META, PERSON_ORDER, POWER_CENTS, TARIFF, WORK_CENTS } from "../src/economy/model.ts";
import type { ActorId, ChainKind, PersonId } from "../src/economy/types.ts";
import { AGUNG_RPC, AGUNG_TOKENOMICS_10 } from "../src/peaq/agung.ts";
import { AGUNG_DEPLOYMENT } from "../src/peaq/deployment.ts";
import { KNOWN_MACHINES, KNOWN_PEOPLE } from "../src/peaq/knownMachines.ts";
import type { ChainTransfer, SettleResult, SettleStep, YardMachine, YardPerson, YardStatus } from "../src/peaq/yardTypes.ts";
import { admitRun, holdRun, releaseRun, walletsBusy } from "./guard.ts";
import { loadOperatorKey } from "./secret.ts";

const EXPLORER = "https://agung-testnet.subscan.io/tx/";
const STATE_FILE = process.env.AGUNG_STATE_FILE ?? "data/agung-machines.json";
/** Below this the Drain cannot fund a run (0.18 PEAQ) with room for gas, so runs replay instead. */
const MIN_DRAIN_WEI = 25n * 10n ** 16n;

const agung = defineChain({
  id: AGUNG_DEPLOYMENT.chainId,
  name: "Agung",
  nativeCurrency: { name: "PEAQ", symbol: "PEAQ", decimals: 18 },
  rpcUrls: { default: { http: [AGUNG_RPC] } },
});

const publicClient = createPublicClient({ chain: agung, transport: http(AGUNG_RPC, { timeout: 20_000 }) });

const bondAbi = [
  {
    type: "function",
    name: "requiredPeaqAmount",
    stateMutability: "view",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Agung's EventRegistry is still the Tokenomics 1.0 contract: 9-arg submitEvent (no currency) keyed by IdentityRegistry 1.0 ids. SDK 0.8 encodes a 10-arg call that does not exist there. */
const legacyEventAbi = parseAbi([
  "function machineIdOfOwner(address) view returns (uint256)",
  "function submitEvent(uint256 machineId,uint8 eventType,uint256 value,uint256 timestamp,bytes32 dataHash,uint8 trustLevel,uint256 sourceChainId,bytes32 sourceTxHash,bytes metadata)",
  "error MachineNotFound()",
  "error NotAuthorizedSubmitter()",
  "error FutureTimestamp()",
  "error MetadataTooLarge()",
  "error MachineDeactivated()",
]);

type MachineSpec = {
  actor: ActorId;
  name: string;
  machineType: string;
  keyLabel: string | null;
};

const SPECS: MachineSpec[] = [
  { actor: "treasury", name: "Plant treasury", machineType: "Rheinau-treasury", keyLabel: null },
  { actor: "robot", name: "Kepler", machineType: "Kepler-01", keyLabel: "Kepler-01" },
  { actor: "drone", name: "Lumen", machineType: "Lumen-04", keyLabel: "Lumen-04" },
  { actor: "battery", name: "Battery", machineType: "BESS-2", keyLabel: "BESS-2" },
];

type Saved = Record<string, { machineId: string; txHash: string | null }>;

type Row = YardMachine & { account: PrivateKeyAccount | null };

export type Visitor = { id: string };

let rows: Row[] = [];
let operator: PrivateKeyAccount | null = null;
let people: Record<PersonId, PrivateKeyAccount> | null = null;
const transfers: ChainTransfer[] = [];
let bondWei = 0n;
let blocker: string | null = null;
let tail: Promise<unknown> = Promise.resolve();
let lumenLegacyId: bigint | null = null;

function explain(error: unknown): string {
  if (error && typeof error === "object") {
    const short = "shortMessage" in error ? String(error.shortMessage) : "";
    if (short) return short;
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Child keys stay in memory. One operator secret is enough for the recharge signature. */
function childKey(parent: Hex, label: string): Hex {
  return keccak256(new Uint8Array([...toBytes(parent), ...toBytes(label)]));
}

function loadSaved(): Saved {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Saved;
  } catch {
    return {};
  }
}

function saveMachine(slot: string, machineId: string, txHash: string | null): void {
  const saved = loadSaved();
  saved[slot] = { machineId, txHash };
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(saved, null, 2));
}

function centsToWei(cents: number): bigint {
  return BigInt(cents) * 10n ** 16n;
}

function peaqString(wei: bigint): string {
  return formatEther(wei);
}

function explorer(hash: string | null): string | null {
  return hash ? `${EXPLORER}${hash}` : null;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readBond(): Promise<bigint> {
  const amount = await publicClient.readContract({
    address: AGUNG_DEPLOYMENT.contracts.machineSubscription,
    abi: bondAbi,
    functionName: "requiredPeaqAmount",
    args: [0],
  });
  return amount;
}

/** Without a signing key the yard shows the machines the operator already activated on Agung. */
function knownMachines(): Row[] {
  return SPECS.map((spec) => {
    const known = KNOWN_MACHINES.find((machine) => machine.actor === spec.actor);
    const address = (known?.address ?? "0x0000000000000000000000000000000000000000") as Address;
    return {
      actor: spec.actor,
      name: spec.name,
      machineType: spec.machineType,
      address,
      did: known ? `did:peaq:${known.machineId}` : `did:peaq:${address}`,
      balance: "0",
      machineId: known?.machineId ?? null,
      txHash: known?.activationTx ?? null,
      explorer: known ? `https://agung-testnet.subscan.io/tx/${known.activationTx}` : null,
      error: null,
      account: null,
    };
  });
}

/**
 * `register` activates missing machines with the peaq SDK (the local server does this). Hosted
 * functions skip it and sign for the machines the operator already activated.
 */
export async function startYard(options: { register: boolean }): Promise<void> {
  try {
    bondWei = await readBond();
  } catch (error) {
    blocker = `Could not read the Agung entry bond: ${explain(error)}`;
    rows = knownMachines();
    return;
  }

  const key = await loadOperatorKey();
  if (!key) {
    blocker = "No operator key is loaded on this server, so runs replay receipts that already landed on Agung.";
    rows = knownMachines();
    return;
  }

  operator = privateKeyToAccount(key);
  // Derivation labels predate the project name; changing them changes every derived address.
  people = {
    city: privateKeyToAccount(childKey(key, "Rheinau-city")),
    plantOwner: privateKeyToAccount(childKey(key, "Rheinau-plant-owner")),
    robotOwner: privateKeyToAccount(childKey(key, "Rheinau-robot-owner")),
    drain: operator,
  };
  const saved = loadSaved();
  rows = SPECS.map((spec) => {
    const account = spec.keyLabel ? privateKeyToAccount(childKey(key, spec.keyLabel)) : operator!;
    const known = KNOWN_MACHINES.find((machine) => machine.actor === spec.actor && machine.address === account.address);
    const prior = saved[`${operator!.address}:${spec.machineType}`];
    const machineId = prior?.machineId ?? known?.machineId ?? null;
    const txHash = prior?.txHash ?? known?.activationTx ?? null;
    return {
      actor: spec.actor,
      name: spec.name,
      machineType: spec.machineType,
      address: account.address,
      did: machineId ? `did:peaq:${machineId}` : `did:peaq:${account.address}`,
      balance: "0",
      machineId,
      txHash,
      explorer: explorer(txHash),
      error: null,
      account,
    };
  });

  if (!options.register) {
    const missing = rows.filter((row) => row.machineId === null);
    blocker = missing.length === 0 ? null : `Not activated on Agung: ${missing.map((row) => row.machineType).join(", ")}.`;
    return;
  }

  const balance = await publicClient.getBalance({ address: operator.address });
  if (balance < bondWei) {
    blocker = `Operator ${operator.address} balance is ${formatEther(balance)} PEAQ. The entry bond is ${formatEther(bondWei)} PEAQ per machine. No activation or transfer was submitted.`;
    for (const row of rows) row.error = blocker;
    return;
  }

  void enqueue(() => registerAll(key, balance)).catch((error: unknown) => {
    blocker = explain(error);
  });
}

async function registerAll(key: Hex, starting: bigint): Promise<void> {
  if (!operator) return;
  const { PeaqosClient } = await import("@peaqos/peaq-os-sdk");
  const client = new PeaqosClient<"tokenomics20">({
    rpcUrl: process.env.PEAQOS_RPC_URL?.trim() || AGUNG_RPC,
    privateKey: key,
    contracts: {
      identityRegistry: AGUNG_TOKENOMICS_10.identityRegistry,
      identityStaking: AGUNG_TOKENOMICS_10.identityStaking,
      eventRegistry: AGUNG_TOKENOMICS_10.eventRegistry,
      machineNft: AGUNG_TOKENOMICS_10.machineNft,
      didRegistry: AGUNG_TOKENOMICS_10.didRegistry,
      batchPrecompile: AGUNG_TOKENOMICS_10.batchPrecompile,
    },
    tokenomics20: { deploymentId: "agung-2026-08-28" },
  });
  let balance = starting;
  for (const row of rows) {
    const subject = keccak256(toBytes(`rheinau.v1.${operator.address}.${row.machineType}`));
    let machineId: bigint;
    try {
      machineId = await client.computeMachineId(row.machineType, subject);
    } catch (error) {
      row.error = explain(error);
      continue;
    }
    try {
      const owner = await client.getMachineOwner(machineId);
      row.machineId = machineId.toString();
      row.did = `did:peaq:${row.machineId}`;
      if (owner.toLowerCase() !== operator.address.toLowerCase()) {
        row.error = `Machine ${row.machineId} is already owned by ${owner}.`;
      }
      continue;
    } catch (error) {
      const text = explain(error);
      if (!text.includes("MACHINE_NOT_FOUND") && !text.includes("not found")) {
        row.error = text;
        continue;
      }
    }
    if (balance < bondWei) {
      row.error = `Not submitted. Balance ${formatEther(balance)} PEAQ is below the ${formatEther(bondWei)} PEAQ bond.`;
      continue;
    }
    try {
      const result = await client.activateMachine({
        controller: row.address,
        verificationMethods: [],
        authentication: [],
        serviceEndpoints: [],
        machineType: row.machineType,
        credentialSubject: subject,
        manufacturer: operator.address,
        tier: 0,
        maxNetPeaqAmount: bondWei,
      });
      row.machineId = result.machineId.toString();
      row.did = `did:peaq:${row.machineId}`;
      row.txHash = result.transactionHash;
      row.explorer = explorer(result.transactionHash);
      row.error = null;
      saveMachine(`${operator.address}:${row.machineType}`, row.machineId, result.transactionHash);
      balance = await publicClient.getBalance({ address: operator.address });
    } catch (error) {
      row.error = `Activation did not land: ${explain(error)}`;
    }
  }
  const failed = rows.filter((row) => row.machineId === null);
  blocker = failed.length === 0 ? null : failed.map((row) => `${row.machineType}: ${row.error}`).join(" ");
}

async function refreshBalances(): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      if (row.address === "0x0000000000000000000000000000000000000000") return;
      const wei = await publicClient.getBalance({ address: row.address });
      row.balance = formatEther(wei);
    }),
  );
}

async function liveAvailability(drainWei: bigint): Promise<{ available: boolean; reason: string | null }> {
  if (!operator || !people) return { available: false, reason: blocker ?? "No operator key is loaded on this server." };
  if (drainWei < MIN_DRAIN_WEI) {
    return { available: false, reason: `The run reserve holds ${formatEther(drainWei)} PEAQ, below the ${formatEther(MIN_DRAIN_WEI)} PEAQ a run needs.` };
  }
  if (await walletsBusy().catch(() => false)) {
    return { available: false, reason: "Another visitor's live run is using the yard wallets right now." };
  }
  return { available: true, reason: null };
}

export async function yardStatus(): Promise<YardStatus> {
  if (rows.length === 0) rows = knownMachines();
  try {
    if (bondWei === 0n) bondWei = await readBond();
    await refreshBalances();
  } catch (error) {
    if (!blocker) blocker = explain(error);
  }
  const operatorWei = operator ? await publicClient.getBalance({ address: operator.address }).catch(() => 0n) : 0n;
  const writesLanded = rows.some((row) => row.txHash !== null) || transfers.some((row) => row.ok);
  const personRows: YardPerson[] = PERSON_ORDER.map((id) => ({
    id,
    name: PERSON_META[id].name,
    role: PERSON_META[id].role,
    address: people ? people[id].address : KNOWN_PEOPLE[id],
    balance: "0",
  }));
  await Promise.all(
    personRows.map(async (person) => {
      const wei = await publicClient.getBalance({ address: person.address }).catch(() => 0n);
      person.balance = formatEther(wei);
    }),
  );
  return {
    chainId: AGUNG_DEPLOYMENT.chainId,
    deploymentId: AGUNG_DEPLOYMENT.deploymentId,
    operator: operator?.address ?? null,
    operatorBalance: formatEther(operatorWei),
    bondPeaq: formatEther(bondWei),
    blocker,
    readOnly: operator === null,
    writesLanded,
    live: await liveAvailability(operatorWei),
    people: personRows,
    transfers: transfers.map((row) => ({ ...row })),
    machines: rows.map((row) => ({
      actor: row.actor,
      name: row.name,
      machineType: row.machineType,
      address: row.address,
      did: row.did,
      balance: row.balance,
      machineId: row.machineId,
      txHash: row.txHash,
      explorer: row.explorer,
      error: row.error,
    })),
  };
}

const settled = new Map<string, SettleResult>();

export type SettleInput = {
  id: string;
  kind: ChainKind;
  cycle: number;
  cleanlinessMilli: number;
  run: string;
};

function refuse(reason: string): SettleResult {
  return { ok: false, replay: true, error: reason };
}

/**
 * Every page run sends fresh transactions while it holds the yard wallets. A refusal (no key,
 * low reserve, busy, rate limit) is marked `replay` so the page switches to confirmed receipts.
 */
export async function settle(input: SettleInput, visitor: Visitor): Promise<SettleResult> {
  if (!operator || !people) return refuse(blocker ?? "No operator key is loaded on this server.");
  const key = `${input.run}:${input.id}`;
  const prior = settled.get(key);
  if (prior?.ok) return prior;

  if (input.kind === "fund") {
    const drainWei = await publicClient.getBalance({ address: operator.address });
    if (drainWei < MIN_DRAIN_WEI) {
      return refuse(`The run reserve holds ${formatEther(drainWei)} PEAQ, below the ${formatEther(MIN_DRAIN_WEI)} PEAQ a run needs.`);
    }
    const admitted = await admitRun(input.run, visitor.id);
    if (!admitted.ok) return refuse(admitted.reason);
  } else {
    const held = await holdRun(input.run);
    if (!held.ok) return refuse(held.reason);
  }

  const result = await enqueue(() => settleOnce(input));
  if (result.ok) settled.set(key, result);
  if (input.kind === "settlement") await releaseRun(input.run);
  return result;
}

async function settleOnce(input: SettleInput): Promise<SettleResult> {
  if (!operator || !people) return refuse(blocker ?? "No operator key is loaded on this server.");
  try {
    const chainId = await publicClient.getChainId();
    if (chainId !== AGUNG_DEPLOYMENT.chainId) {
      return { ok: false, error: `RPC chain id is ${chainId}. Refusing to send off Agung 9990.` };
    }
    if (input.kind === "fund") return await fundRun(input.run, people);
    if (input.kind === "settlement") return await sweepToDrain(input.run, people, "return", "Settlement");
    const plan = transferPlan(input.kind, people);
    if (!plan) return { ok: false, error: "Machine wallets are not loaded. No transaction was submitted." };
    const pay = sendStep(input.run, input.id, plan.label, plan.from, plan.fromName, plan.to, plan.toName, plan.amount);
    if (input.kind !== "work") return bundle([await pay], "The transfer did not land.");
    // Lumen's report and the robot owner's pay go out together; they come from different wallets.
    const [event, paid] = await Promise.all([submitInspection(input.run, input.cycle, input.cleanlinessMilli), pay]);
    return bundle([event, paid], "The work payment did not land.");
  } catch (error) {
    return { ok: false, error: `Agung rejected the write: ${explain(error)}` };
  }
}

const STEP = 10n ** 14n;
/** Each wallet keeps about this much for gas. Sweeps round to the nearest 0.0001 PEAQ so receipts stay readable. */
const GAS_RESERVE = STEP;
const GAS_FLOOR = 10n ** 12n;

function spendable(balance: bigint): bigint {
  let amount = ((balance - GAS_RESERVE + STEP / 2n) / STEP) * STEP;
  if (amount > balance - GAS_FLOOR) amount -= STEP;
  return amount > 0n ? amount : 0n;
}

async function sendNative(
  from: PrivateKeyAccount,
  to: Address,
  amount: bigint,
  fromName: string,
): Promise<{ ok: boolean; hash: Hex | null; error: string | null }> {
  const balance = await publicClient.getBalance({ address: from.address });
  const gasPrice = await publicClient.getGasPrice();
  const gas = 21_000n * gasPrice * 4n;
  if (amount <= 0n || balance < amount + gas) {
    return {
      ok: false,
      hash: null,
      error: `${fromName} holds ${formatEther(balance)} PEAQ, which cannot cover ${formatEther(amount)} PEAQ plus gas. No transaction was submitted.`,
    };
  }
  const wallet = createWalletClient({ account: from, chain: agung, transport: http(AGUNG_RPC) });
  const hash = await wallet.sendTransaction({ account: from, chain: agung, to, value: amount });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") {
    return { ok: false, hash, error: `Transfer reverted on Agung: ${hash}` };
  }
  return { ok: true, hash, error: null };
}

/** Lumen-04 reports each inspection to EventRegistry from its own wallet, as legacy machine 352. */
async function submitInspection(run: string, cycle: number, cleanlinessMilli: number): Promise<SettleStep> {
  const lumen = rows.find((row) => row.actor === "drone");
  const base = {
    id: `${cycle}:inspection`,
    label: "Lumen inspection event",
    amountPeaq: "0",
    fromName: "Lumen-04",
    toName: "EventRegistry",
    fromAddress: lumen?.address ?? ("0x0000000000000000000000000000000000000000" as Address),
    toAddress: AGUNG_TOKENOMICS_10.eventRegistry as Address,
    kind: "event" as const,
  };
  const finish = (step: SettleStep): SettleStep => {
    remember({ run, ...step });
    return step;
  };
  const fail = (error: string, hash: Hex | null = null) => finish({ ...base, txHash: hash, explorer: null, ok: false, error });
  if (!lumen?.account) return fail("Lumen-04 is not loaded. No event was submitted.");
  try {
    if (lumenLegacyId === null) {
      lumenLegacyId = await publicClient.readContract({
        address: AGUNG_TOKENOMICS_10.identityRegistry,
        abi: legacyEventAbi,
        functionName: "machineIdOfOwner",
        args: [lumen.address],
      });
    }
    if (lumenLegacyId === 0n) {
      lumenLegacyId = null;
      return fail("Lumen-04 has no IdentityRegistry 1.0 id, which Agung's EventRegistry requires. No event was submitted.");
    }
    const report = { kind: "inspection", machine: "Lumen-04", economics20MachineId: lumen.machineId, run, cycle, cleanlinessMilli, at: new Date().toISOString() };
    const { request } = await publicClient.simulateContract({
      account: lumen.account,
      address: AGUNG_TOKENOMICS_10.eventRegistry,
      abi: legacyEventAbi,
      functionName: "submitEvent",
      // eventType 1 = activity, trustLevel 0 = self-reported. The timestamp must not be ahead of the block.
      args: [
        lumenLegacyId,
        1,
        0n,
        BigInt(Math.floor(Date.now() / 1000) - 15),
        keccak256(toBytes(JSON.stringify(report))),
        0,
        0n,
        zeroHash,
        toHex(JSON.stringify({ t: "inspection", day: cycle, cleanlinessMilli })),
      ],
    });
    const wallet = createWalletClient({ account: lumen.account, chain: agung, transport: http(AGUNG_RPC) });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") return fail(`Event reverted on Agung: ${hash}`, hash);
    return finish({ ...base, txHash: hash, explorer: explorer(hash), ok: true, error: null });
  } catch (error) {
    return fail(`Agung rejected the inspection event: ${explain(error)}`);
  }
}

function transferPlan(
  kind: "power" | "work" | "recharge",
  owners: Record<PersonId, PrivateKeyAccount>,
): { amount: bigint; from: PrivateKeyAccount; to: Address; fromName: string; toName: string; label: string } | null {
  if (kind === "power") {
    return { amount: centsToWei(POWER_CENTS), from: owners.city, to: owners.plantOwner.address, fromName: PERSON_META.city.name, toName: PERSON_META.plantOwner.name, label: "Power" };
  }
  if (kind === "work") {
    return { amount: centsToWei(WORK_CENTS), from: owners.plantOwner, to: owners.robotOwner.address, fromName: PERSON_META.plantOwner.name, toName: PERSON_META.robotOwner.name, label: "Cleaning and inspection" };
  }
  const kepler = rows.find((row) => row.actor === "robot")?.account;
  const battery = rows.find((row) => row.actor === "battery");
  if (!kepler || !battery) return null;
  return { amount: centsToWei(TARIFF.rechargeCents), from: kepler, to: battery.address, fromName: "Kepler-01", toName: "Battery", label: `${TARIFF.rechargeKwh} kWh recharge` };
}

function remember(row: ChainTransfer): ChainTransfer {
  const index = transfers.findIndex((item) => item.id === row.id && item.run === row.run);
  if (index >= 0) transfers[index] = row;
  else transfers.push(row);
  if (transfers.length > 400) transfers.splice(0, transfers.length - 400);
  return row;
}

async function sendStep(
  run: string,
  id: string,
  label: string,
  from: PrivateKeyAccount,
  fromName: string,
  to: Address,
  toName: string,
  amount: bigint,
): Promise<SettleStep> {
  let sent: { ok: boolean; hash: Hex | null; error: string | null };
  try {
    sent = await sendNative(from, to, amount, fromName);
  } catch (error) {
    sent = { ok: false, hash: null, error: `Agung rejected the transfer: ${explain(error)}` };
  }
  const step: SettleStep = {
    id,
    label,
    amountPeaq: peaqString(amount),
    fromName,
    toName,
    fromAddress: from.address,
    toAddress: to,
    txHash: sent.ok ? sent.hash : null,
    explorer: sent.ok && sent.hash ? explorer(sent.hash) : null,
    ok: sent.ok,
    error: sent.ok ? null : sent.error,
    kind: "transfer",
  };
  remember({ run, ...step });
  return step;
}

function bundle(steps: SettleStep[], emptyError: string): SettleResult {
  const last = steps[steps.length - 1];
  const failed = steps.find((step) => !step.ok);
  if (!last) return { ok: false, error: emptyError, steps };
  if (failed) return { ok: false, error: failed.error ?? `${failed.label} did not land.`, steps };
  return {
    ok: true,
    txHash: last.txHash ?? undefined,
    explorer: last.explorer ?? undefined,
    label: last.label,
    amountPeaq: last.amountPeaq,
    fromName: last.fromName,
    toName: last.toName,
    fromAddress: last.fromAddress,
    toAddress: last.toAddress,
    steps,
  };
}

/** A wallet that was never funded also gets a gas reserve, so it can pay its own way through the run. */
async function budgetFor(address: Address, cents: number): Promise<bigint> {
  const held = await publicClient.getBalance({ address });
  return centsToWei(cents) + (held < GAS_RESERVE / 2n ? GAS_RESERVE : 0n);
}

async function fundRun(run: string, owners: Record<PersonId, PrivateKeyAccount>): Promise<SettleResult> {
  const kepler = rows.find((row) => row.actor === "robot");
  if (!kepler) return { ok: false, error: "Kepler-01 is not loaded. No transaction was submitted." };
  // A run that never reached its settlement (closed tab, lost lease) left money in the loop. Return it first.
  const recovered = await sweepToDrain(run, owners, "recover", "Unfinished run returned");
  const steps: SettleStep[] = [...(recovered.steps ?? [])];
  const city = await sendStep(run, "fund-city", "Power budget", owners.drain, PERSON_META.drain.name, owners.city.address, PERSON_META.city.name, await budgetFor(owners.city.address, CITY_BUDGET_CENTS));
  steps.push(city);
  if (city.ok) {
    steps.push(
      await sendStep(run, "fund-kepler", "Recharge budget", owners.drain, PERSON_META.drain.name, kepler.address, "Kepler-01", await budgetFor(kepler.address, KEPLER_BUDGET_CENTS)),
    );
  }
  return bundle(steps, "The run was not funded.");
}

/** Every wallet in the loop returns what it holds to the Drain, so the next run starts from the same budget. */
async function sweepToDrain(
  run: string,
  owners: Record<PersonId, PrivateKeyAccount>,
  prefix: string,
  label: string,
): Promise<SettleResult> {
  const kepler = rows.find((row) => row.actor === "robot")?.account;
  const battery = rows.find((row) => row.actor === "battery")?.account;
  const sources: { id: string; name: string; account: PrivateKeyAccount | null | undefined }[] = [
    { id: "plant-owner", name: PERSON_META.plantOwner.name, account: owners.plantOwner },
    { id: "robot-owner", name: PERSON_META.robotOwner.name, account: owners.robotOwner },
    { id: "battery", name: "Battery", account: battery },
    { id: "kepler", name: "Kepler-01", account: kepler },
    { id: "city", name: PERSON_META.city.name, account: owners.city },
  ];
  const sends = await Promise.all(
    sources.map(async (source) => {
      if (!source.account) return null;
      const amount = spendable(await publicClient.getBalance({ address: source.account.address }));
      if (amount === 0n) return null;
      return sendStep(run, `${prefix}-${source.id}`, label, source.account, source.name, owners.drain.address, PERSON_META.drain.name, amount);
    }),
  );
  const steps = sends.filter((step): step is SettleStep => step !== null);
  return bundle(steps, "No wallet held anything to return. No settlement was submitted.");
}
