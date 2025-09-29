export const RWA_TOKENS = ['MPL', 'CFG', 'GFI', 'TOKENFI']

export const CONTRACTS = {
  USDY: {
    address: '0x96f6ef951840721adbf46ac996b59e0235cb985c',
    chain: 'ethereum',
  },
  // TODO: add Centrifuge pool token contracts here when you know which pools you want to track
}

export const LOCAL_TOKENS = [
  {
    address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // the tokenAddress from deploy.ts
    symbol: "DTT",
    decimals: 18,
    name: "Dev Test Token",
    chainId: 31337, // Hardhat local network
  },
];

