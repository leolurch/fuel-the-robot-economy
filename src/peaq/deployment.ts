/**
 * Agung Economics 2.0 record from @peaqos/peaq-os-sdk
 * resolveTokenomics20Deployment("agung-2026-08-28").
 * The browser does not import that package: it pulls Node built-ins and crashes the page.
 * `npm run sim` loads the SDK and checks these fields still match.
 */
export const AGUNG_DEPLOYMENT = {
  deploymentId: "agung-2026-08-28",
  network: "agung",
  chainId: 9990,
  contracts: {
    infoDesk: "0x72b66AF120c55371cA6e5Ce38D4e10dF1bA30Bb1",
    machineRegistry: "0x538da35489B1F0035799a8351E67835ae4ABb377",
    machineStateAndSync: "0xA7D33726232aae30622643a18047f0Ca3e159da9",
    machineSubscription: "0xaDCc5dD8CD57E3198B881c3388F25D2fD69B5aDc",
    crossChainMirror: "0xd5F8d5944c5d488B1cD698D642FC8156a8CD0c0c",
    machineBridgeAdapter: "0x0406e7bE522AEa626aee54f6258D415215e59F76",
    subscriptionTokenProvisionPool: "0x8A3692Ad0AcF79BB89413514Af9957d95032e19B",
  },
} as const;
