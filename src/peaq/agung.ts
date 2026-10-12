import { createPublicClient, defineChain, formatEther, http, type Address } from "viem";
import type { ActorId } from "../economy/types.ts";
import { AGUNG_DEPLOYMENT } from "./deployment.ts";

export const AGUNG_RPC = "https://peaq-agung.api.onfinality.io/public";

/** Tokenomics 1.0 Agung addresses from the peaqOS install docs. Precompiles share these slots on every peaq runtime. */
export const AGUNG_TOKENOMICS_10 = {
  identityRegistry: "0x9E9463a65c7B74623b3b6Cdc39F71be7274e5971",
  identityStaking: "0x55f336714aDb0749DbFE33b057a1702405564E3d",
  eventRegistry: "0x2DAD8905380993940e340C5cE6d313d5c2780040",
  machineNft: "0xB41C2A4f1c19b6B06beaAce0F5CD8439e77C4b1c",
  didRegistry: "0x0000000000000000000000000000000000000800",
  batchPrecompile: "0x0000000000000000000000000000000000000805",
} as const;

const agungChain = defineChain({
  id: AGUNG_DEPLOYMENT.chainId,
  name: "Agung",
  nativeCurrency: { name: "PEAQ", symbol: "PEAQ", decimals: 18 },
  rpcUrls: { default: { http: [AGUNG_RPC] } },
});

export const agungClient = createPublicClient({
  chain: agungChain,
  transport: http(AGUNG_RPC, { timeout: 8_000 }),
});

export type AgungLive = {
  state: "live";
  chainId: number;
  expectedChainId: number;
  blockNumber: string;
  deploymentId: string;
  machineRegistry: boolean;
  didRegistry: boolean;
  eventRegistry: boolean;
  balances: Record<ActorId, string>;
};

export type AgungRead =
  | { state: "loading" }
  | { state: "offline"; message: string }
  | AgungLive;

function hasCode(code: string | undefined): boolean {
  return Boolean(code && code !== "0x" && code.length > 2);
}

export async function readAgung(addresses: Record<ActorId, Address>): Promise<AgungLive> {
  const ids: ActorId[] = ["treasury", "robot", "drone", "battery"];
  const [chainId, blockNumber, machineCode, didCode, eventCode, ...balances] = await Promise.all([
    agungClient.getChainId(),
    agungClient.getBlockNumber(),
    agungClient.getBytecode({
      address: AGUNG_DEPLOYMENT.contracts.machineRegistry as Address,
    }),
    agungClient.getBytecode({ address: AGUNG_TOKENOMICS_10.didRegistry }),
    agungClient.getBytecode({ address: AGUNG_TOKENOMICS_10.eventRegistry }),
    ...ids.map((id) => agungClient.getBalance({ address: addresses[id] })),
  ]);

  const balanceMap = {} as Record<ActorId, string>;
  ids.forEach((id, index) => {
    balanceMap[id] = formatEther(balances[index] ?? 0n);
  });

  return {
    state: "live",
    chainId,
    expectedChainId: AGUNG_DEPLOYMENT.chainId,
    blockNumber: blockNumber.toString(),
    deploymentId: AGUNG_DEPLOYMENT.deploymentId,
    machineRegistry: hasCode(machineCode),
    didRegistry: hasCode(didCode),
    eventRegistry: hasCode(eventCode),
    balances: balanceMap,
  };
}
