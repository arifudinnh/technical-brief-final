import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { BLOCK_CHUNK_SIZE, robinhoodTestnet } from '../lib/wagmi'
import { mapLimit } from '../lib/utils'
import type { TokenInfo } from './useTokenList'

export interface CurveTx {
  type: 'buy' | 'sell'
  txHash: `0x${string}`
  blockNumber: bigint
  logIndex: number
  /** Buy */
  quoteIn: bigint | null
  tokensOut: bigint | null
  /** Sell */
  tokensIn: bigint | null
  quoteOut: bigint | null
  timestamp: number | null
}

const CURVE_BUY_EVENT = parseAbiItem(
  'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 creatorTax)'
)
const CURVE_SELL_EVENT = parseAbiItem(
  'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut)'
)

const MAX_EVENTS = 30
const TIMESTAMP_CONCURRENCY = 5
const CHUNK_BLOCKS = BLOCK_CHUNK_SIZE + 1n

function getBatchedClient() {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0], { batch: true }),
  })
}

/**
 * Riwayat transaksi bonding curve (event CurveBuy / CurveSell) untuk 1 token.
 * Scan dari blok terbaru ke blok launch (backward) agar transaksi terbaru
 * ditemukan dengan jumlah request paling sedikit.
 */
export function useTxHistory(token: TokenInfo, refreshToken = 0) {
  const wagmiClient = usePublicClient()
  const [events, setEvents] = useState<CurveTx[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const getClient = useCallback(() => wagmiClient ?? getBatchedClient(), [wagmiClient])

  const load = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current

    const run = (async () => {
      setLoading(true)
      setError(null)
      try {
        const client = getClient()
        const latestBlock = await client.getBlockNumber()
        const launchBlock = token.launchBlock
        const found: CurveTx[] = []

        // Backward scan: blok terbaru dulu, berhenti saat cukup.
        let toBlock = latestBlock
        while (toBlock >= launchBlock && found.length < MAX_EVENTS) {
          const fromBlock =
            toBlock - CHUNK_BLOCKS + 1n < launchBlock ? launchBlock : toBlock - CHUNK_BLOCKS + 1n

          const [buys, sells] = await Promise.all([
            client.getLogs({
              address: token.curveAddress,
              event: CURVE_BUY_EVENT,
              fromBlock,
              toBlock,
            }),
            client.getLogs({
              address: token.curveAddress,
              event: CURVE_SELL_EVENT,
              fromBlock,
              toBlock,
            }),
          ])

          for (const log of buys) {
            const a = log.args
            if (!log.transactionHash || a.quoteIn === undefined || a.tokensOut === undefined) continue
            found.push({
              type: 'buy',
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              quoteIn: a.quoteIn,
              tokensOut: a.tokensOut,
              tokensIn: null,
              quoteOut: null,
              timestamp: null,
            })
          }
          for (const log of sells) {
            const a = log.args
            if (!log.transactionHash || a.tokensIn === undefined || a.quoteOut === undefined) continue
            found.push({
              type: 'sell',
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              quoteIn: null,
              tokensOut: null,
              tokensIn: a.tokensIn,
              quoteOut: a.quoteOut,
              timestamp: null,
            })
          }

          toBlock = fromBlock - 1n
        }

        // Terbaru di atas.
        found.sort((a, b) => {
          if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1
          return b.logIndex - a.logIndex
        })
        const recent = found.slice(0, MAX_EVENTS)

        // Ambil timestamp blok (dibatasi konkurensi, gagal = tampilkan blok saja).
        const uniqueBlocks = [...new Set(recent.map(tx => tx.blockNumber.toString()))].map(BigInt)
        const timestamps = await mapLimit(uniqueBlocks, TIMESTAMP_CONCURRENCY, async blockNumber => {
          try {
            const block = await client.getBlock({ blockNumber })
            return [blockNumber.toString(), Number(block.timestamp)] as const
          } catch {
            return [blockNumber.toString(), null] as const
          }
        })
        const tsMap = new Map(timestamps)

        setEvents(recent.map(tx => ({ ...tx, timestamp: tsMap.get(tx.blockNumber.toString()) ?? null })))
      } catch (e) {
        console.error('Failed to load tx history:', e)
        setError('Gagal memuat riwayat transaksi. Periksa koneksi jaringan Anda.')
        setEvents([])
      } finally {
        setLoading(false)
      }
    })()

    inFlightRef.current = run
    void run.finally(() => {
      if (inFlightRef.current === run) inFlightRef.current = null
    })
    return run
  }, [getClient, token.curveAddress, token.launchBlock])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  return { events, loading, error, reload: load }
}
