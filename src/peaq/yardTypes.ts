import type { ActorId, PersonId } from "../economy/types.ts";

export type YardMachine = {
  actor: ActorId;
  name: string;
  machineType: string;
  address: `0x${string}`;
  did: string;
  balance: string;
  machineId: string | null;
  txHash: string | null;
  explorer: string | null;
  error: string | null;
};

export type YardPerson = {
  id: PersonId;
  name: string;
  role: string;
  address: `0x${string}`;
  balance: string;
};

export type ChainTransfer = {
  id: string;
  label: string;
  amountPeaq: string;
  fromName: string;
  toName: string;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  txHash: string | null;
  explorer: string | null;
  ok: boolean;
  error: string | null;
  /** Page run that triggered the transfer, so a reset page does not pick up an older run's rows. */
  run?: string;
};

export type YardStatus = {
  chainId: number;
  deploymentId: string;
  operator: `0x${string}` | null;
  operatorBalance: string;
  bondPeaq: string;
  blocker: string | null;
  /** True when the server has no signing key and only replays confirmed receipts. */
  readOnly?: boolean;
  writesLanded: boolean;
  machines: YardMachine[];
  people: YardPerson[];
  transfers: ChainTransfer[];
};

export type SettleStep = {
  label: string;
  amountPeaq: string;
  fromName: string;
  toName: string;
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  txHash: string | null;
  explorer: string | null;
  ok: boolean;
  error: string | null;
};

export type SettleResult = {
  ok: boolean;
  /** Nothing to show for this job, e.g. a recharge in read-only mode, where the landed recharge receipt is listed instead. */
  skipped?: boolean;
  error?: string;
  txHash?: string;
  explorer?: string;
  label?: string;
  amountPeaq?: string;
  fromName?: string;
  toName?: string;
  fromAddress?: `0x${string}`;
  toAddress?: `0x${string}`;
  steps?: SettleStep[];
};
