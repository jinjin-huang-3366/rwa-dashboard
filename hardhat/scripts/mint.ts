import { ethers, network } from "hardhat";
import { parseUnits } from "ethers";

async function main() {
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // from deploy.ts
  const recipient = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // MetaMask test account
  const amount = parseUnits("1000", 18); // ethers v6 syntax

  const Token = await ethers.getContractAt("TestToken", tokenAddress);
  const tx = await Token.mint(recipient, amount);
  await tx.wait();

  console.log(`✅ Minted ${amount.toString()} tokens to ${recipient}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
