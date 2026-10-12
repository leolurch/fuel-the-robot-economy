import type { TransferRow } from "../economy/types.ts";

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
