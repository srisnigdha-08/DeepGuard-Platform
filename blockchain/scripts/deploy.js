// Deploy with: npx hardhat run scripts/deploy.js --network amoy
// Prerequisites:
//   1. npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
//   2. Set ALCHEMY_KEY and BLOCKCHAIN_PRIVATE_KEY in .env
//   3. Fund wallet with testnet MATIC from https://faucet.polygon.technology

const hre = require("hardhat");

async function main() {
  console.log("Deploying MediaVerification to", hre.network.name, "...");

  const MediaVerification = await hre.ethers.getContractFactory("MediaVerification");
  const contract          = await MediaVerification.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("✅ MediaVerification deployed to:", address);
  console.log("");
  console.log("Add to server/.env:");
  console.log("  CONTRACT_ADDRESS=" + address);
  console.log("  BLOCKCHAIN_ENABLED=true");
  console.log("");
  if (hre.network.name === "amoy") {
    console.log("View on explorer:");
    console.log("  https://amoy.polygonscan.com/address/" + address);
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
