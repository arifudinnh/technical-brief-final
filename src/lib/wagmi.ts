import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { type Chain } from 'viem'

export const RPC_URL = 'https://robinhood-sepolia-rpc.publicnode.com'
export const EXPLORER_URL = 'https://explorer.testnet.chain.robinhood.com'

export const robinhoodTestnet = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Explorer',
      url: EXPLORER_URL,
    },
  },
  testnet: true,
} as const satisfies Chain

export const LAUNCH_FACTORY_ADDRESS = '0x533cE670f1372cb402D49866608b92e7bc2b4493' as const
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
/** Blok deploy LaunchFactory — batas bawah scanning event. */
export const FACTORY_DEPLOY_BLOCK = 129157568n
/** Batas eth_getLogs RPC: 49.999 blok per request. */
export const BLOCK_CHUNK_SIZE = 49999n

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(RPC_URL),
  },
})
