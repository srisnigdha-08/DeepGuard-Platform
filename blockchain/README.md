# DeepGuard MediaVerification Smart Contract Prototype

> **Current Status: Prototype / Not Deployed**
>
> DeepGuard includes a Solidity-based MediaVerification prototype.
> The contract has been compiled and unit-tested locally, but it has
> not been deployed to Polygon and the production application does
> not currently interact with Polygon mainnet or testnet.

---

## Overview

The `MediaVerification.sol` contract is designed to provide an immutable on-chain ledger for media authenticity verification:
- **Hashing**: SHA-256 or Keccak-256 media digest calculated off-chain.
- **Registration**: Authenticated record containing registrant address, block timestamp, IPFS metadata URI, and media type.
- **Tamper Evidence**: If a video or image is manipulated after registration, the computed hash mismatches the on-chain record.

---

## Verification & Test Results

The smart contract has been compiled with Solidity `0.8.19` (EVM target: `paris`) and verified using Hardhat:

```bash
npm run compile
# Output: Compiled 1 Solidity file successfully (evm target: paris).

npm test
# Output: 5 passing (502ms)
#   √ should deploy with a valid address
#   √ should register a new media hash successfully
#   √ should reject registering a duplicate media hash
#   √ should reject zero hash
#   √ should verify registered and unregistered hashes
```

---

## Safe Deployment Guide (Polygon Testnet)

Follow these steps when preparing to deploy the prototype to a testnet. **Never deploy to mainnet without formal third-party audit and secure multisig administration.**

### 1. Wallet Setup
- Create a dedicated development wallet (e.g., via MetaMask or Rabby).
- **Never** use a wallet containing real mainnet assets.
- Export the private key for the testnet account.

### 2. Testnet Configuration & Faucet
- Note: Polygon Mumbai was deprecated in April 2024. Use **Polygon Amoy Testnet**:
  - Network Name: Polygon Amoy Testnet
  - RPC URL: `https://rpc-amoy.polygon.technology/`
  - Chain ID: `80002`
  - Currency: `MATIC`
  - Explorer: `https://amoy.polygonscan.com/`
- Request testnet tokens from the official Polygon Faucet: `https://faucet.polygon.technology/`.

### 3. RPC Configuration
- Sign up for a free Alchemy or Infura account.
- Create an app for Polygon Amoy to obtain an RPC API key.

### 4. Environment Variables
- Copy `.env.example` to `.env`:
  ```bash
  cp .env.example .env
  ```
- Set `ALCHEMY_KEY` and `BLOCKCHAIN_PRIVATE_KEY` in `.env`.
- Verify `.env` is ignored by version control (in `.gitignore`).

### 5. Contract Compilation & Test
```bash
npm install
npm run compile
npm test
```

### 6. Deployment Command
To deploy to the configured testnet:
```bash
npx hardhat run scripts/deploy.js --network amoy
```

### 7. Record Deployment Details
Upon successful deployment, record:
- Network name and Chain ID
- Contract address
- Deployment transaction hash
- Gas used
- Contract ABI (`artifacts/contracts/MediaVerification.sol/MediaVerification.json`)

### 8. Backend / Frontend Integration Steps
1. Add to `server/.env`:
   ```env
   CONTRACT_ADDRESS=<deployed_address>
   BLOCKCHAIN_ENABLED=true
   BLOCKCHAIN_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/<key>
   ```
2. In `server/src/services/blockchainService.js`:
   - Initialize `ethers.JsonRpcProvider` and `ethers.Contract` with the ABI and `CONTRACT_ADDRESS`.
   - On each confirmed detection, compute `sha256(fileBuffer)` and submit `registerMedia(hash, ipfsUri, mediaType)`.
3. In `client/src/pages/Result.jsx`:
   - Display a verified on-chain badge with clickable link to Polygonscan (`https://amoy.polygonscan.com/tx/<txHash>`).
