import { ethers } from "hardhat";
import deployConfig from "../config/deployment.json";

type ConfigToken = {
  name: string
  symbol: string
  initialMint: string
  decimals?: number
  address?: string
};

type DeploymentConfig = {
  testWallet?: string
  tokens?: ConfigToken[]
};

const CONFIG = deployConfig as DeploymentConfig;
const TOKENS: ConfigToken[] = CONFIG.tokens ?? [];

if (TOKENS.length === 0) {
  console.warn("No tokens defined in hardhat/config/deployment.json – nothing to deploy.");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  const rawWallet = CONFIG.testWallet?.trim();
  const targetWallet = rawWallet && ethers.isAddress(rawWallet) ? rawWallet : undefined;

  if (rawWallet && !targetWallet) {
    console.warn(`Configured testWallet is not a valid address: ${rawWallet}`);
  }

  if (targetWallet) {
    console.log(`Mint target wallet: ${targetWallet}`);
  } else {
    console.log('No valid testWallet configured. Tokens will remain with deployer.');
  }

  if (TOKENS.length === 0) {
    return;
  }

  const Token = await ethers.getContractFactory('TestToken');

  for (const tokenConfig of TOKENS) {
    const { name, symbol, initialMint, decimals = 18 } = tokenConfig;

    console.log(`\nDeploying ${symbol} (${name})...`);
    const token = await Token.deploy(name, symbol);
    const address = await token.getAddress();
    console.log(`${symbol} deployed to: ${address}`);

    if (targetWallet) {
      const amount = ethers.parseUnits(initialMint, decimals);
      const tx = await token.mint(targetWallet, amount);
      await tx.wait();
      console.log(`Minted ${initialMint} ${symbol} to ${targetWallet}`);
    } else {
      console.log(
        `No mint target - ${symbol} constructor supply (1,000,000) sent to ${deployer.address}`
      );
    }

    console.log(
      `Update hardhat/config/deployment.json with \"address\": \"${address}\" for ${symbol} to surface it in the UI.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
