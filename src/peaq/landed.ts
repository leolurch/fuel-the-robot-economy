import type { TransferRow } from "../economy/types.ts";
import { KNOWN_PEOPLE } from "./knownMachines.ts";
import type { SettleResult } from "./yardTypes.ts";

export const AGUNG_EXPLORER_TX = "https://agung-testnet.subscan.io/tx/";
export const AGUNG_EXPLORER_ACCOUNT = "https://agung-testnet.subscan.io/account/";

/** Payments already confirmed on Agung. Hashes were read from receipts, not invented. */
export const LANDED_TRANSFERS: TransferRow[] = [
  {
    id: "rent",
    label: "Apartment rent",
    amountPeaq: "0.05",
    fromName: "Residents",
    toName: "City",
    fromAddress: "0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C",
    toAddress: "0x0dF74639f0adEaDCdc1BFc37ee0Ac60933db4A1E",
    hash: "0x1a780caf5366661a95d23510608fd36fb3e60d7d939b6ca97412007a786dac76",
    explorer:
      "https://agung-testnet.subscan.io/tx/0x1a780caf5366661a95d23510608fd36fb3e60d7d939b6ca97412007a786dac76",
    ok: true,
    error: null,
  },
  {
    id: "landed-wage",
    label: "Wash wage",
    amountPeaq: "0.02",
    fromName: "Rheinau treasury",
    toName: "Kepler-01",
    fromAddress: "0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C",
    toAddress: "0x8D63581101AD3DE66DCF1c2Ab569B6c442e2b77E",
    hash: "0xfb92dc648fdb91f668842e3d813c46cf3ac6e7fe3973d0e6d69408b31c2e1164",
    explorer:
      "https://agung-testnet.subscan.io/tx/0xfb92dc648fdb91f668842e3d813c46cf3ac6e7fe3973d0e6d69408b31c2e1164",
    ok: true,
    error: null,
  },
  {
    id: "landed-fee",
    label: "Inspection fee",
    amountPeaq: "0.01",
    fromName: "Rheinau treasury",
    toName: "Lumen-04",
    fromAddress: "0x90f700f3645b7d062b4520fEcB12E7a1Db0F575C",
    toAddress: "0x42647B681D98961A45f4fc6e4Bc5F5d56892F138",
    hash: "0x6555b9e04045a488aaad417c4125f0f3fd40847509421af93ee86dc17aa13071",
    explorer:
      "https://agung-testnet.subscan.io/tx/0x6555b9e04045a488aaad417c4125f0f3fd40847509421af93ee86dc17aa13071",
    ok: true,
    error: null,
  },
  {
    id: "landed-recharge",
    label: "Recharge",
    amountPeaq: "0.01",
    fromName: "Kepler-01",
    toName: "BESS-2",
    fromAddress: "0x8D63581101AD3DE66DCF1c2Ab569B6c442e2b77E",
    toAddress: "0x0fF7df529aD2C19DF6637a8b1C148C268C3Eb943",
    hash: "0xf27f9652c6af53f31f4fae33a1764cbb12f3fb57b1991b090f8fdfd9d1ecec1c",
    explorer:
      "https://agung-testnet.subscan.io/tx/0xf27f9652c6af53f31f4fae33a1764cbb12f3fb57b1991b090f8fdfd9d1ecec1c",
    ok: true,
    error: null,
  },
];

const CUSTOMERS = KNOWN_PEOPLE.customers;
const PLANT = KNOWN_PEOPLE.plantOwner;
const ROBOT_OWNER = KNOWN_PEOPLE.robotOwner;
const CITY = KNOWN_PEOPLE.city;

function explorer(hash: string): string {
  return `${AGUNG_EXPLORER_TX}${hash}`;
}

function knownPay(
  label: string,
  amountPeaq: string,
  fromName: string,
  toName: string,
  fromAddress: `0x${string}`,
  toAddress: `0x${string}`,
  txHash: `0x${string}`,
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
    explorer: explorer(txHash),
  };
}

/** Receipts already confirmed on Agung. Returned as-is so a restarted writer does not send them again. */
export const KNOWN_RECEIPTS: Record<string, SettleResult> = {
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
    explorer: explorer("0xe36ca39cad2d37cdc69900a460cfa267c5209aa2d9cd19ae157660c9b296f6e7"),
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
