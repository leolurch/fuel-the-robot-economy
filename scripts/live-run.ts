/** Live run sent by the yard server with operator key 5 on Agung. Hashes were read from receipts, not invented. */
export const LIVE_OPERATOR = "0x8a61248e23e04b97A0A42A87D09459573478d23A";

export const LIVE_MACHINES = [
  { machineType: "Rheinau-treasury", address: "0x8a61248e23e04b97A0A42A87D09459573478d23A", machineId: "33972125727311862102242550464936382332590305066238494161796118837764432459771", activationTx: "0xec8a622a893f77ed675902751ea196e5336ad11339a0bd3fc34e50f6d33c1859" },
  { machineType: "Kepler-01", address: "0xa3893E09F5546B56B6e845ad194e28a216730931", machineId: "1962884760408859527843867200144780974073261720970703856069487751650844150575", activationTx: "0xde6ee8f2b2b2b6154034bb7ea763865c9616241a61484a284dabedaa0517b990" },
  { machineType: "Lumen-04", address: "0x77cc0A6aeA9F14c842251aE1384E45A3F30320d9", machineId: "70771729342491203195750444655678312409844457848436599576321158744592664857524", activationTx: "0xd25a7b8a143b87a9ee0418d5b1370c75f902f1367f890d367535a0390030b671" },
  { machineType: "BESS-2", address: "0x6F8A86803dafE766F6381F781D5003BC5aa2df5d", machineId: "23561826428746862383207998597570184258462227245211301004858601842139846427384", activationTx: "0xae8de92ad5772c5d0fb4084316917235325b0e6c5200cfe12aa2065c666edcf5" },
] as const;

export const LIVE_FLOAT_TX = "0xd9b25cb256a65bf6e9be15728890af97d592a2fe93b57d7eea2eab6f0f05cdfb";

export const LIVE_TRANSFERS = [
  { id: "rent", label: "Apartment rent", amountPeaq: "0.05", fromName: "Residents", toName: "City", from: "0x8a61248e23e04b97A0A42A87D09459573478d23A", to: "0x0f6213A1f06eCDE70823EAb4132f89a0bFd83Fd6", hash: "0x4159aa0a4f850a98b3f7fa6853bc3267506722f14ffda7a04394fe49bf31c5eb" },
  { id: "1:power", label: "Power", amountPeaq: "0.05", fromName: "Residents", toName: "Plant owner", from: "0x8a61248e23e04b97A0A42A87D09459573478d23A", to: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", hash: "0x856a256a49e1a9cf12729ddbf82029f89f8f4a3e109c92051442b9b8dabcedda" },
  { id: "1:work", label: "Cleaning and inspection", amountPeaq: "0.03", fromName: "Plant owner", toName: "Robot owner", from: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", to: "0x84AFCdE8e20c78189Cb792af78901ead5c364a81", hash: "0x75507a1f898c2753c5e0ec0a380f90db503cacd284a60c1198ebcccdac047e3c" },
  { id: "1:recharge", label: "22 kWh recharge", amountPeaq: "0.01", fromName: "Kepler-01", toName: "BESS-2", from: "0xa3893E09F5546B56B6e845ad194e28a216730931", to: "0x6F8A86803dafE766F6381F781D5003BC5aa2df5d", hash: "0xa9e92e6b9f92d024e811d79427de993708dc6248b66e4882f47a8dbb6d4496cb" },
  { id: "2:power", label: "Power", amountPeaq: "0.05", fromName: "Residents", toName: "Plant owner", from: "0x8a61248e23e04b97A0A42A87D09459573478d23A", to: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", hash: "0x4c64684800a3df9dd2e74ce5eb9232759f0b4dd00459dd9c01ba98f406faa034" },
  { id: "2:work", label: "Cleaning and inspection", amountPeaq: "0.03", fromName: "Plant owner", toName: "Robot owner", from: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", to: "0x84AFCdE8e20c78189Cb792af78901ead5c364a81", hash: "0x5de2f24b93346cb71ce15d7cc08969d4a6cc9d7aba9db6861d81f30900fe2665" },
  { id: "2:recharge", label: "22 kWh recharge", amountPeaq: "0.01", fromName: "Kepler-01", toName: "BESS-2", from: "0xa3893E09F5546B56B6e845ad194e28a216730931", to: "0x6F8A86803dafE766F6381F781D5003BC5aa2df5d", hash: "0x550dd2b74d9b5e03d1d9352b7f69e4295a9c4fafcdcb32e6f42dff96436753cd" },
  { id: "3:power", label: "Power", amountPeaq: "0.05", fromName: "Residents", toName: "Plant owner", from: "0x8a61248e23e04b97A0A42A87D09459573478d23A", to: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", hash: "0x4c3fe0928984bb5e67924a0df50fc3f29d464753039e2e8e7545669b2badef60" },
  { id: "3:work", label: "Cleaning and inspection", amountPeaq: "0.03", fromName: "Plant owner", toName: "Robot owner", from: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", to: "0x84AFCdE8e20c78189Cb792af78901ead5c364a81", hash: "0x17b635f3285a298fd84d38a6241d159a2c10a9a826e26719457e1d287072af74" },
  { id: "3:recharge", label: "22 kWh recharge", amountPeaq: "0.01", fromName: "Kepler-01", toName: "BESS-2", from: "0xa3893E09F5546B56B6e845ad194e28a216730931", to: "0x6F8A86803dafE766F6381F781D5003BC5aa2df5d", hash: "0xdca3482b425ae0fde841ef51ebc4fea35dcebbd0ed6aa7d7165ec05fae8d4532" },
  { id: "settlement-robot", label: "Robot earnings into settlement", amountPeaq: "0.0899", fromName: "Robot owner", toName: "Plant owner", from: "0x84AFCdE8e20c78189Cb792af78901ead5c364a81", to: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", hash: "0x20fe1db877919055c2712cde9f12099397c4cd449e4dd66b1c5868db075dde64" },
  { id: "settlement", label: "Settlement", amountPeaq: "0.1498", fromName: "Plant owner", toName: "Residents", from: "0x130B2111C24e55B03918CAe018F4C0fABFDe2EaB", to: "0x8a61248e23e04b97A0A42A87D09459573478d23A", hash: "0x121c5380848c89ee9604f50a4c925dfabe2b7d0171d179572af86fa587a3de3d" },
] as const;
