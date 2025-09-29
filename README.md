# RWA Dashboard — Complete

Next.js 14 + wagmi v2 + RainbowKit + React Query v5 + Tailwind.  
Live data from DeFiLlama + direct on-chain reads via viem.

## Features
- **WalletConnect** (RainbowKit) with env var `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- **Protocols page**: Ondo, Centrifuge, Maple, Goldfinch, TokenFi (TVL/APY)
- **Portfolio page**: ETH balances (MPL/CFG/GFI/TokenFi) from DeFiLlama + **USDY** via direct ERC20 reads
- **Config-first**: token addresses live in `src/config/tokens.ts`
- **Type-safe ABI**: split ABIs in `src/config/erc20Abi.ts`

## Quickstart
```bash
cp .env.example .env.local  # put your WalletConnect project id
npm install
npm run dev
```
Open http://localhost:3000

## Notes
- If WalletConnect logs a 403, ensure `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set.
- To add Centrifuge pools, append their token contracts in `src/config/tokens.ts` and mirror the USDY pattern.
