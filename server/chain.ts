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
import { PERSON_META, POWER_CENTS, RENT_CENTS, WORK_CENTS } from "../src/economy/model.ts";
import type { ActorId, ChainKind, PersonId } from "../src/economy/types.ts";
import { AGUNG_RPC, AGUNG_TOKENOMICS_10 } from "../src/peaq/agung.ts";
import { AGUNG_DEPLOYMENT } from "../src/peaq/deployment.ts";
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
  { actor: "battery", name: "BESS-2", machineType: "BESS-2", keyLabel: "BESS-2" },
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

function saveMachine(machineType: string, machineId: string, txHash: string | null): void {
  const saved = loadSaved();
  saved[machineType] = { machineId, txHash };
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

function emptyMachines(): Row[] {
  return SPECS.map((spec) => {
    const address = "0x0000000000000000000000000000000000000000" as Address;
    return {
      actor: spec.actor,
      name: spec.name,
      machineType: spec.machineType,
      address,
      did: `did:peaq:${address}`,
      balance: "0",
      machineId: null,
      txHash: null,
      explorer: null,
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
    rows = emptyMachines();
    return;
  }

  const key = loadKey();
  if (!key) {
    blocker = "PEAQOS_PRIVATE_KEY is not set. No activation or transfer was submitted.";
    rows = emptyMachines();
    return;
  }

  operator = privateKeyToAccount(key);
  people = {
    customers: operator,
    plantOwner: privateKeyToAccount(childKey(key, "Rheinau-plant-owner")),
    robotOwner: privateKeyToAccount(childKey(key, "Rheinau-robot-owner")),
    city: privateKeyToAccount(childKey(key, "Rheinau-city")),
  };
  const saved = loadSaved();
  rows = SPECS.map((spec) => {
    const account = spec.keyLabel ? privateKeyToAccount(childKey(key, spec.keyLabel)) : operator!;
    const prior = saved[spec.machineType];
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
      saveMachine(row.machineType, row.machineId, result.transactionHash);
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
  if (rows.length === 0) rows = emptyMachines();
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
  const personRows: YardPerson[] = people
    ? (["customers", "plantOwner", "robotOwner", "city"] as const).map((id) => ({
        id,
        name: PERSON_META[id].name,
        role: PERSON_META[id].role,
        address: people![id].address,
        balance: "0",
      }))
    : [];
  if (people) {
    await Promise.all(
      personRows.map(async (person) => {
        const wei = await publicClient.getBalance({ address: person.address }).catch(() => 0n);
        person.balance = formatEther(wei);
      }),
    );
  }
  return {
    chainId: AGUNG_DEPLOYMENT.chainId,
    deploymentId: AGUNG_DEPLOYMENT.deploymentId,
    operator: operator?.address ?? null,
    operatorBalance,
    bondPeaq: formatEther(bondWei),
    blocker,
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

const CUSTOMERS = "0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C" as Address;
const PLANT = "0xc04DFd51d21d62B5915Ec01B821260367053b1cC" as Address;
const ROBOT_OWNER = "0xDe7cCd73d2054DC2820BacbBFAa514F30d9467DD" as Address;
const CITY = "0x0dF74639f0adEaDCdc1BFc37ee0Ac60933db4A1E" as Address;

function knownPay(
  label: string,
  amountPeaq: string,
  fromName: string,
  toName: string,
  fromAddress: Address,
  toAddress: Address,
  txHash: Hex,
): SettleResult {
  return {
    ok: true,
    label,
    amountPeaq,
    fromName,
    toName,
    fromAddress,
    toAddress,
    txHash,
    explorer: explorer(txHash) ?? undefined,
  };
}

/** Receipts already confirmed on Agung. Returned as-is so a restarted writer does not send them again. */
const KNOWN_RECEIPTS: Record<string, SettleResult> = {
  rent: knownPay(
    "Apartment rent",
    "0.05",
    "Residents",
    "City",
    CUSTOMERS,
    CITY,
    "0x1a780caf5366661a95d23510608fd36fb3e60d7d939b6ca97412007a786dac76",
  ),
  "1:power": knownPay(
    "Power",
    "0.05",
    "Residents",
    "Plant owner",
    CUSTOMERS,
    PLANT,
    "0x0942a7918570d833fe1461c46e05da4576648ef3066350ac3dc88ea8897febfc",
  ),
  "1:work": knownPay(
    "Cleaning and inspection",
    "0.03",
    "Plant owner",
    "Robot owner",
    PLANT,
    ROBOT_OWNER,
    "0xb636c5d73105481104db2e75405fc6500f5e21e317d95171d0060f9a06877dd0",
  ),
  "2:power": knownPay(
    "Power",
    "0.05",
    "Residents",
    "Plant owner",
    CUSTOMERS,
    PLANT,
    "0x4373fc71868d0e2ce35850f806b749bdf17b042afc880b170599d403e320706d",
  ),
  "2:work": knownPay(
    "Cleaning and inspection",
    "0.03",
    "Plant owner",
    "Robot owner",
    PLANT,
    ROBOT_OWNER,
    "0x1f1c9a89c669f328271f5179e86d456fc8ab87418eafc30473a79e1a52ecbe00",
  ),
  "3:power": knownPay(
    "Power",
    "0.05",
    "Residents",
    "Plant owner",
    CUSTOMERS,
    PLANT,
    "0x7b7496a6c48d9fb2e3654e0a6ebf945cb48e314eb0e574dd8b35feda056220de",
  ),
  "3:work": knownPay(
    "Cleaning and inspection",
    "0.03",
    "Plant owner",
    "Robot owner",
    PLANT,
    ROBOT_OWNER,
    "0x5dd55bda4f926bfa19daf9ddd7683aa8648155d84634b0ab8065272d0e84d7e9",
  ),
  settlement: {
    ok: true,
    label: "Settlement",
    amountPeaq: "0.1498",
    fromName: "Plant owner",
    toName: "Residents",
    fromAddress: PLANT,
    toAddress: CUSTOMERS,
    txHash: "0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7",
    explorer: explorer("0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7") ?? undefined,
    steps: [
      {
        label: "Robot earnings into settlement",
        amountPeaq: "0.0899",
        fromName: "Robot owner",
        toName: "Plant owner",
        fromAddress: ROBOT_OWNER,
        toAddress: PLANT,
        txHash: "0xdd86458f99ae44622bcfaf1aa2262f22faf628a7cd9ca65d389e804c4d9e5d9b",
        explorer: explorer("0xdd86458f99ae44622bcfaf1aa2262f22faf628a7cd9ca65d389e804c4d9e5d9b"),
        ok: true,
        error: null,
      },
      {
        label: "Settlement",
        amountPeaq: "0.1498",
        fromName: "Plant owner",
        toName: "Residents",
        fromAddress: PLANT,
        toAddress: CUSTOMERS,
        txHash: "0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7",
        explorer: explorer("0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7"),
        ok: true,
        error: null,
      },
    ],
  },
};

export function settle(input: {
  id: string;
  kind: ChainKind;
  cycle: number;
  cleanlinessMilli: number;
}): Promise<SettleResult> {
  const prior = settled.get(input.id) ?? KNOWN_RECEIPTS[input.id];
  if (prior?.ok) {
    settled.set(input.id, prior);
    return Promise.resolve(prior);
  }
  return enqueue(() => settleOnce(input));
}

async function settleOnce(input: {
  id: string;
  kind: ChainKind;
  cycle: number;
  cleanlinessMilli: number;
}): Promise<SettleResult> {
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

    if (input.kind === "power" || input.kind === "work" || input.kind === "rent") {
      const amount =
        input.kind === "power" ? centsToWei(POWER_CENTS) : input.kind === "work" ? centsToWei(WORK_CENTS) : centsToWei(RENT_CENTS);
      const from = input.kind === "work" ? people.plantOwner : people.customers;
      const to = input.kind === "power" ? people.plantOwner : input.kind === "work" ? people.robotOwner : people.city;
      const fromName = input.kind === "work" ? PERSON_META.plantOwner.name : PERSON_META.customers.name;
      const toName =
        input.kind === "power"
          ? PERSON_META.plantOwner.name
          : input.kind === "work"
            ? PERSON_META.robotOwner.name
            : PERSON_META.city.name;
      const label = input.kind === "power" ? "Power" : input.kind === "work" ? "Cleaning and inspection" : "Apartment rent";
      const sent = await sendNative(from, to.address, amount, fromName);
      if (!sent.ok || !sent.hash) {
        const failed = remember({
          id: input.id,
          label,
          amountPeaq: peaqString(amount),
          fromName,
          toName,
          fromAddress: from.address,
          toAddress: to.address,
          txHash: null,
          explorer: null,
          ok: false,
          error: sent.error ?? "Transfer did not land.",
        });
        return { ok: false, error: failed.error ?? "Transfer did not land." };
      }
      const row = remember({
        id: input.id,
        label,
        amountPeaq: peaqString(amount),
        fromName,
        toName,
        fromAddress: from.address,
        toAddress: to.address,
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
      settled.set(input.id, done);
      return done;
    }

    const bundled = await settleCircle();
    settled.set(input.id, bundled);
    return bundled;
  } catch (error) {
    return { ok: false, error: `Agung rejected the write: ${explain(error)}` };
  }
}

const GAS_RESERVE = 10n ** 14n;

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

function remember(row: ChainTransfer): ChainTransfer {
  const index = transfers.findIndex((item) => item.id === row.id);
  if (index >= 0) transfers[index] = row;
  else transfers.push(row);
  return row;
}

async function settleCircle(): Promise<SettleResult> {
  if (!people) return { ok: false, error: "Owner wallets are not loaded. No transaction was submitted." };
  const steps: SettleStep[] = [];
  const robotBal = await publicClient.getBalance({ address: people.robotOwner.address });
  const robotSend = robotBal > GAS_RESERVE ? robotBal - GAS_RESERVE : 0n;
  if (robotSend > 0n) {
    const sent = await sendNative(people.robotOwner, people.plantOwner.address, robotSend, PERSON_META.robotOwner.name);
    const step: SettleStep = {
      label: "Robot earnings into settlement",
      amountPeaq: peaqString(robotSend),
      fromName: PERSON_META.robotOwner.name,
      toName: PERSON_META.plantOwner.name,
      fromAddress: people.robotOwner.address,
      toAddress: people.plantOwner.address,
      txHash: sent.ok ? sent.hash : null,
      explorer: sent.ok && sent.hash ? explorer(sent.hash) : null,
      ok: sent.ok,
      error: sent.ok ? null : sent.error,
    };
    steps.push(step);
    remember({ id: "settlement-robot", ...step });
    if (!sent.ok) {
      return { ok: false, error: sent.error ?? "Robot earnings did not move. Settlement was not submitted.", steps };
    }
  }

  const plantBal = await publicClient.getBalance({ address: people.plantOwner.address });
  const plantSend = plantBal > GAS_RESERVE ? plantBal - GAS_RESERVE : 0n;
  if (plantSend <= 0n) {
    return {
      ok: false,
      error: "Plant owner has no earnings to return. No settlement was submitted.",
      steps,
    };
  }
  const sent = await sendNative(people.plantOwner, people.customers.address, plantSend, PERSON_META.plantOwner.name);
  const step: SettleStep = {
    label: "Settlement",
    amountPeaq: peaqString(plantSend),
    fromName: PERSON_META.plantOwner.name,
    toName: PERSON_META.customers.name,
    fromAddress: people.plantOwner.address,
    toAddress: people.customers.address,
    txHash: sent.ok ? sent.hash : null,
    explorer: sent.ok && sent.hash ? explorer(sent.hash) : null,
    ok: sent.ok,
    error: sent.ok ? null : sent.error,
  };
  steps.push(step);
  remember({ id: "settlement", ...step });
  if (!sent.ok || !sent.hash) {
    return { ok: false, error: sent.error ?? "Settlement did not land.", steps };
  }
  return {
    ok: true,
    txHash: sent.hash,
    explorer: explorer(sent.hash) ?? undefined,
    label: "Settlement",
    amountPeaq: peaqString(plantSend),
    fromName: PERSON_META.plantOwner.name,
    toName: PERSON_META.customers.name,
    fromAddress: people.plantOwner.address,
    toAddress: people.customers.address,
    steps,
  };
}
