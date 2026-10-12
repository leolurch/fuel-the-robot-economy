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
};

export type YardStatus = {
  chainId: number;
  deploymentId: string;
  operator: `0x${string}` | null;
  operatorBalance: string;
  bondPeaq: string;
  blocker: string | null;
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
