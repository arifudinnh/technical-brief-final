import type { Abi } from 'viem'

/**
 * ABI minimal Multicall3.aggregate3() — dipakai untuk batch read RPC
 * (10 call per token dalam 1 request, lihat hooks/useTokenList.ts).
 */
const abi = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const

export default abi satisfies Abi

export type Multicall3Call = {
  target: `0x${string}`
  allowFailure: boolean
  callData: `0x${string}`
}
