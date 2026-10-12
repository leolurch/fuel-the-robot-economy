import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PeaqosClient } from "@peaqos/peaq-os-sdk";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CITY_BUDGET_CENTS, KEPLER_BUDGET_CENTS, PERSON_META, PERSON_ORDER, POWER_CENTS, TARIFF, WORK_CENTS } from "../src/economy/model.ts";
import type { ActorId, ChainKind, PersonId } from "../src/economy/types.ts";
import { AGUNG_RPC, AGUNG_TOKENOMICS_10 } from "../src/peaq/agung.ts";
import { AGUNG_DEPLOYMENT } from "../src/peaq/deployment.ts";
import { KNOWN_MACHINES, KNOWN_PEOPLE } from "../src/peaq/knownMachines.ts";
import { KNOWN_RECEIPTS } from "../src/peaq/landed.ts";
import type { ChainTransfer, SettleResult, SettleStep, YardMachine, YardPerson, YardStatus } from "../src/peaq/yardTypes.ts";

const EXPLORER = "https://agung-testnet.subscan.io/tx/";
const STATE_FILE = process.env.AGUNG_STATE_FILE ?? "data/agung-machines.json";

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

type MachineSpec = {
  actor: ActorId;
  name: string;
  machineType: string;
  keyLabel: string | null;
};

const SPECS: MachineSpec[] = [
  { actor: "treasury", name: "Rheinau treasury", machineType: "Rheinau-treasury", keyLabel: null },
  { actor: "robot", name: "Kepler", machineType: "Kepler-01", keyLabel: "Kepler-01" },
  { actor: "drone", name: "Lumen", machineType: "Lumen-04", keyLabel: "Lumen-04" },
  { actor: "battery", name: "Battery", machineType: "BESS-2", keyLabel: "BESS-2" },
];

type Saved = Record<string, { machineId: string; txHash: string | null }>;

type Row = YardMachine & { account: PrivateKeyAccount | null };

let rows: Row[] = [];
let operator: PrivateKeyAccount | null = null;
let people: Record<PersonId, PrivateKeyAccount> | null = null;
const transfers: ChainTransfer[] = [];
let client: PeaqosClient<"tokenomics20"> | null = null;
let bondWei = 0n;
let blocker: string | null = null;
let tail: Promise<unknown> = Promise.resolve();

function explain(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
  }
  return error instanceof Error ? error.message : String(error);
}

function loadKey(): Hex | null {
  const inline = process.env.PEAQOS_PRIVATE_KEY?.trim();
  if (inline) return /^0x[0-9a-fA-F]{64}$/.test(inline) ? (inline as Hex) : null;
  const file = process.env.PEAQOS_PRIVATE_KEY_FILE?.trim();
  if (!file) return null;
  try {
    const text = readFileSync(file, "utf8").trim();
    return /^0x[0-9a-fA-F]{64}$/.test(text) ? (text as Hex) : null;
  } catch {
    return null;
  }
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

export async function startYard(): Promise<void> {
  try {
    bondWei = await readBond();
  } catch (error) {
    blocker = `Could not read the Agung entry bond: ${explain(error)}`;
    rows = knownMachines();
    return;
  }

  const key = loadKey();
  if (!key) {
    blocker = "Read-only mode: PEAQOS_PRIVATE_KEY is not set, so the yard replays receipts that already landed on Agung and sends nothing new.";
    rows = knownMachines();
    return;
  }

  operator = privateKeyToAccount(key);
  people = {
    city: privateKeyToAccount(childKey(key, "Rheinau-city")),
    plantOwner: privateKeyToAccount(childKey(key, "Rheinau-plant-owner")),
    robotOwner: privateKeyToAccount(childKey(key, "Rheinau-robot-owner")),
    drain: operator,
  };
  const saved = loadSaved();
  rows = SPECS.map((spec) => {
    const account = spec.keyLabel ? privateKeyToAccount(childKey(key, spec.keyLabel)) : operator!;
    const prior = saved[`${operator!.address}:${spec.machineType}`];
    const machineId = prior?.machineId ?? null;
    return {
      actor: spec.actor,
      name: spec.name,
      machineType: spec.machineType,
      address: account.address,
      did: machineId ? `did:peaq:${machineId}` : `did:peaq:${account.address}`,
      balance: "0",
      machineId,
      txHash: prior?.txHash ?? null,
      explorer: explorer(prior?.txHash ?? null),
      error: null,
      account,
    };
  });

  client = new PeaqosClient<"tokenomics20">({
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

  const balance = await publicClient.getBalance({ address: operator.address });
  if (balance < bondWei) {
    blocker = `Operator ${operator.address} balance is ${formatEther(balance)} PEAQ. The entry bond is ${formatEther(bondWei)} PEAQ per machine. No activation or transfer was submitted.`;
    for (const row of rows) row.error = blocker;
    return;
  }

  void enqueue(() => registerAll(balance)).catch((error: unknown) => {
    blocker = explain(error);
  });
}

async function registerAll(starting: bigint): Promise<void> {
  if (!client || !operator) return;
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

export async function yardStatus(): Promise<YardStatus> {
  if (rows.length === 0) rows = knownMachines();
  try {
    if (bondWei === 0n) bondWei = await readBond();
    await refreshBalances();
  } catch (error) {
    if (!blocker) blocker = explain(error);
  }
  const operatorBalance = operator
    ? formatEther(await publicClient.getBalance({ address: operator.address }).catch(() => 0n))
    : "0";
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
    operatorBalance,
    bondPeaq: formatEther(bondWei),
    blocker,
    readOnly: client === null,
    writesLanded,
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

type SettleInput = {
  id: string;
  kind: ChainKind;
  cycle: number;
  cleanlinessMilli: number;
  run: string;
};

/** With a key every page run sends fresh transfers. Without one, the yard replays receipts that already landed. */
export function settle(input: SettleInput): Promise<SettleResult> {
  if (!client || !operator) {
    const known = KNOWN_RECEIPTS[input.id];
    if (known?.ok) return Promise.resolve(known);
    return Promise.resolve({ ok: false, error: blocker ?? "No operator key is loaded. No transaction was submitted." });
  }
  const key = `${input.run}:${input.id}`;
  const prior = settled.get(key);
  if (prior?.ok) return Promise.resolve(prior);
  return enqueue(() => settleOnce(input));
}

async function settleOnce(input: SettleInput): Promise<SettleResult> {
  const key = `${input.run}:${input.id}`;
  if (!client || !operator) {
    return { ok: false, error: blocker ?? "No operator key is loaded. No transaction was submitted." };
  }
  const balance = await publicClient.getBalance({ address: operator.address });
  if (balance === 0n) {
    return {
      ok: false,
      error: `Operator balance is 0 PEAQ. No transaction was submitted.`,
    };
  }

  try {
    const chainId = await publicClient.getChainId();
    if (chainId !== AGUNG_DEPLOYMENT.chainId) {
      return { ok: false, error: `RPC chain id is ${chainId}. Refusing to send off Agung 9990.` };
    }
    if (!people) return { ok: false, error: "Owner wallets are not loaded. No transaction was submitted." };

    if (input.kind === "fund") {
      const funded = await fundRun(input.run, people);
      settled.set(key, funded);
      return funded;
    }
    if (input.kind !== "settlement") {
      const plan = transferPlan(input.kind, people);
      if (!plan) return { ok: false, error: "Machine wallets are not loaded. No transaction was submitted." };
      const { amount, from, to, fromName, toName, label } = plan;
      const sent = await sendNative(from, to, amount, fromName);
      if (!sent.ok || !sent.hash) {
        const failed = remember({
          id: input.id,
          run: input.run,
          label,
          amountPeaq: peaqString(amount),
          fromName,
          toName,
          fromAddress: from.address,
          toAddress: to,
          txHash: null,
          explorer: null,
          ok: false,
          error: sent.error ?? "Transfer did not land.",
        });
        return { ok: false, error: failed.error ?? "Transfer did not land." };
      }
      const row = remember({
        id: input.id,
        run: input.run,
        label,
        amountPeaq: peaqString(amount),
        fromName,
        toName,
        fromAddress: from.address,
        toAddress: to,
        txHash: sent.hash,
        explorer: explorer(sent.hash),
        ok: true,
        error: null,
      });
      const done: SettleResult = {
        ok: true,
        txHash: row.txHash ?? undefined,
        explorer: row.explorer ?? undefined,
        label: row.label,
        amountPeaq: row.amountPeaq,
        fromName: row.fromName,
        toName: row.toName,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
      };
      settled.set(key, done);
      return done;
    }

    const swept = await sweepToDrain(input.run, people);
    settled.set(key, swept);
    return swept;
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
  const chainId = await publicClient.getChainId();
  if (chainId !== 9990) return { ok: false, hash: null, error: `Refusing chain ${chainId}.` };
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
  const sent = await sendNative(from, to, amount, fromName);
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
  const steps: SettleStep[] = [];
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
async function sweepToDrain(run: string, owners: Record<PersonId, PrivateKeyAccount>): Promise<SettleResult> {
  const kepler = rows.find((row) => row.actor === "robot")?.account;
  const battery = rows.find((row) => row.actor === "battery")?.account;
  const sources: { id: string; name: string; account: PrivateKeyAccount | null | undefined }[] = [
    { id: "return-plant-owner", name: PERSON_META.plantOwner.name, account: owners.plantOwner },
    { id: "return-robot-owner", name: PERSON_META.robotOwner.name, account: owners.robotOwner },
    { id: "return-battery", name: "Battery", account: battery },
    { id: "return-kepler", name: "Kepler-01", account: kepler },
    { id: "return-city", name: PERSON_META.city.name, account: owners.city },
  ];
  const steps: SettleStep[] = [];
  for (const source of sources) {
    if (!source.account) continue;
    const amount = spendable(await publicClient.getBalance({ address: source.account.address }));
    if (amount === 0n) continue;
    steps.push(await sendStep(run, source.id, "Back to the Drain", source.account, source.name, owners.drain.address, PERSON_META.drain.name, amount));
  }
  return bundle(steps, "No wallet held anything to return. No settlement was submitted.");
}
