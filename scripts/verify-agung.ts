import { PeaqosClient } from "@peaqos/peaq-os-sdk";
import { createPublicClient, formatEther, http, keccak256, toBytes, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { AGUNG_RPC, AGUNG_TOKENOMICS_10 } from "../src/peaq/agung.ts";
import { AGUNG_DEPLOYMENT } from "../src/peaq/deployment.ts";
import { KNOWN_MACHINES, YARD_OPERATOR } from "../src/peaq/knownMachines.ts";
import { KNOWN_RECEIPTS, LANDED_TRANSFERS } from "../src/peaq/landed.ts";
import { LIVE_FLOAT_TX, LIVE_MACHINES, LIVE_OPERATOR, LIVE_TRANSFERS } from "./live-run.ts";

const rpc = process.env.PEAQOS_RPC_URL?.trim() || AGUNG_RPC;
const client = createPublicClient({ transport: http(rpc, { timeout: 20_000 }) });

// Reads only: the throwaway key never signs anything.
const sdk = new PeaqosClient<"tokenomics20">({
  rpcUrl: rpc,
  privateKey: generatePrivateKey(),
  contracts: {
    identityRegistry: AGUNG_TOKENOMICS_10.identityRegistry,
    identityStaking: AGUNG_TOKENOMICS_10.identityStaking,
    eventRegistry: AGUNG_TOKENOMICS_10.eventRegistry,
    machineNft: AGUNG_TOKENOMICS_10.machineNft,
    didRegistry: AGUNG_TOKENOMICS_10.didRegistry,
    batchPrecompile: AGUNG_TOKENOMICS_10.batchPrecompile,
  },
  tokenomics20: { deploymentId: AGUNG_DEPLOYMENT.deploymentId },
});

let failures = 0;
const chainId = await client.getChainId();
console.log(`Agung RPC ${rpc} · chain id ${chainId}`);
if (chainId !== AGUNG_DEPLOYMENT.chainId) {
  console.log(`expected chain id ${AGUNG_DEPLOYMENT.chainId}`);
  process.exit(1);
}

async function checkMachines(operator: string, machines: readonly { machineType: string; machineId: string }[]): Promise<void> {
  console.log(`\nMachine IDs (MachineRegistry, owner must be ${operator})`);
  for (const machine of machines) {
    const subject = keccak256(toBytes(`rheinau.v1.${operator}.${machine.machineType}`));
    try {
      const id = await sdk.computeMachineId(machine.machineType, subject);
      const owner = await sdk.getMachineOwner(id);
      const ok = id.toString() === machine.machineId && owner.toLowerCase() === operator.toLowerCase();
      if (!ok) failures += 1;
      console.log(`${ok ? "ok  " : "FAIL"} ${machine.machineType.padEnd(17)} id ${id} owner ${owner}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${machine.machineType.padEnd(17)} ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
}

await checkMachines(YARD_OPERATOR, KNOWN_MACHINES);
await checkMachines(LIVE_OPERATOR, LIVE_MACHINES);

const hashes = new Map<string, string>();
for (const machine of KNOWN_MACHINES) hashes.set(machine.activationTx, `activateMachine ${machine.machineType}`);
for (const row of LANDED_TRANSFERS) if (row.hash) hashes.set(row.hash, `${row.label} ${row.fromName} → ${row.toName}`);
for (const machine of LIVE_MACHINES) hashes.set(machine.activationTx, `activateMachine ${machine.machineType} (live run)`);
hashes.set(LIVE_FLOAT_TX, "Kepler-01 operating float (live run)");
for (const result of Object.values(KNOWN_RECEIPTS)) {
  if (result.txHash) hashes.set(result.txHash, `${result.label} ${result.fromName} → ${result.toName}`);
  for (const step of result.steps ?? []) if (step.txHash) hashes.set(step.txHash, `${step.label} ${step.fromName} → ${step.toName}`);
}

console.log(`\nActivation and payment receipts (${hashes.size})`);
for (const [hash, label] of hashes) {
  try {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as Hex }),
      client.getTransaction({ hash: hash as Hex }),
    ]);
    const ok = receipt.status === "success";
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} block ${receipt.blockNumber} ${formatEther(tx.value).padEnd(8)} PEAQ ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${hash} ${label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

console.log(`\nLive run: sender, recipient, and amount must match (${LIVE_TRANSFERS.length})`);
for (const row of LIVE_TRANSFERS) {
  try {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: row.hash as Hex }),
      client.getTransaction({ hash: row.hash as Hex }),
    ]);
    const ok =
      receipt.status === "success" &&
      tx.from.toLowerCase() === row.from.toLowerCase() &&
      tx.to?.toLowerCase() === row.to.toLowerCase() &&
      formatEther(tx.value) === row.amountPeaq;
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} block ${receipt.blockNumber} ${row.amountPeaq.padEnd(8)} PEAQ ${row.label} ${row.fromName} → ${row.toName}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${row.hash} ${row.label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

console.log(failures === 0 ? "\nAll Rheinau machine IDs and receipts check out on Agung." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
