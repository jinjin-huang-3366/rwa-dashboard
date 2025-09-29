import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // Use a fixed mnemonic so the same accounts are generated every time
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 20, // number of accounts to generate
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
};

export default config;
