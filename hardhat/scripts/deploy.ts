import { ethers } from "hardhat";

async function main() {
  const Token = await ethers.getContractFactory("TestToken");
  const token = await Token.deploy("Dev Test Token", "DTT");
  
  // ethers v6: deploy() already waits for deployment
  console.log("✅ Token deployed to:", await token.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
