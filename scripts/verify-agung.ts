import { PeaqosClient } from "@peaqos/peaq-os-sdk";
import { createPublicClient, decodeFunctionData, formatEther, hexToString, http, keccak256, parseAbi, toBytes, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { AGUNG_RPC, AGUNG_TOKENOMICS_10 } from "../src/peaq/agung.ts";
import { ACTIVITY_STATUS } from "../src/peaq/activityStatus.ts";
import { AGUNG_DEPLOYMENT } from "../src/peaq/deployment.ts";
import { KNOWN_MACHINES, YARD_OPERATOR } from "../src/peaq/knownMachines.ts";
import { REPLAY_RUN } from "../src/peaq/replayRun.ts";

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

console.log(`\nActivation receipts (${KNOWN_MACHINES.length})`);
for (const machine of KNOWN_MACHINES) {
  try {
    const receipt = await client.getTransactionReceipt({ hash: machine.activationTx });
    const ok = receipt.status === "success";
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} block ${receipt.blockNumber} activateMachine ${machine.machineType}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${machine.activationTx} ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

if (REPLAY_RUN.length === 0) {
  failures += 1;
  console.log("\nFAIL no replay run recorded in src/peaq/replayRun.ts");
}
const replayTransfers = REPLAY_RUN.filter((row) => row.kind !== "event");
console.log(`\nReplayed run: sender, recipient, and amount must match (${replayTransfers.length})`);
for (const row of replayTransfers) {
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

const legacyEventAbi = parseAbi([
  "function machineIdOfOwner(address) view returns (uint256)",
  "function getEventCount(uint256 machineId) view returns (uint256)",
  "function submitEvent(uint256 machineId,uint8 eventType,uint256 value,uint256 timestamp,bytes32 dataHash,uint8 trustLevel,uint256 sourceChainId,bytes32 sourceTxHash,bytes metadata)",
]);
const lumen = KNOWN_MACHINES.find((machine) => machine.actor === "drone")!;
const eventHashes = [ACTIVITY_STATUS.hash, ...REPLAY_RUN.filter((row) => row.kind === "event").map((row) => row.hash)];
console.log(`\nLumen inspection events (EventRegistry ${AGUNG_TOKENOMICS_10.eventRegistry}, sender must be Lumen-04, ${eventHashes.length})`);
try {
  const legacyId = await client.readContract({
    address: AGUNG_TOKENOMICS_10.identityRegistry,
    abi: legacyEventAbi,
    functionName: "machineIdOfOwner",
    args: [lumen.address],
  });
  const count = await client.readContract({
    address: AGUNG_TOKENOMICS_10.eventRegistry,
    abi: legacyEventAbi,
    functionName: "getEventCount",
    args: [legacyId],
  });
  const countOk = legacyId !== 0n && count >= BigInt(eventHashes.length);
  if (!countOk) failures += 1;
  console.log(`${countOk ? "ok  " : "FAIL"} Lumen-04 is IdentityRegistry 1.0 machine ${legacyId} with ${count} events on record`);
  for (const hash of eventHashes) {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: hash as Hex }),
      client.getTransaction({ hash: hash as Hex }),
    ]);
    const call = decodeFunctionData({ abi: legacyEventAbi, data: tx.input });
    const args = call.functionName === "submitEvent" ? call.args : null;
    const ok =
      receipt.status === "success" &&
      tx.from.toLowerCase() === lumen.address.toLowerCase() &&
      tx.to?.toLowerCase() === AGUNG_TOKENOMICS_10.eventRegistry.toLowerCase() &&
      args !== null &&
      args[0] === legacyId;
    if (!ok) failures += 1;
    const metadata = args ? hexToString(args[8]) : "";
    console.log(`${ok ? "ok  " : "FAIL"} block ${receipt.blockNumber} submitEvent machine ${args?.[0] ?? "?"} ${metadata}`);
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
}

console.log(failures === 0 ? "\nAll Fuel the Robot Economy machine IDs, payments, and inspection events check out on Agung." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
