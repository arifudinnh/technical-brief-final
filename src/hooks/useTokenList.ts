import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createPublicClient,
  http,
  parseAbiItem,
  encodeFunctionData,
  decodeFunctionResult,
} from 'viem'
import { usePublicClient } from 'wagmi'
import {
  LAUNCH_FACTORY_ADDRESS,
  FACTORY_DEPLOY_BLOCK,
  BLOCK_CHUNK_SIZE,
  MULTICALL3_ADDRESS,
  robinhoodTestnet,
} from '../lib/wagmi'
import multicallAbi, { type Multicall3Call } from '../abi/multicall'
import launchFactoryAbi from '../abi/LaunchFactory'
import bondingCurveAbi from '../abi/BondingCurve'
import launcherTokenAbi from '../abi/LauncherToken'

export interface TokenInfo {
  address: `0x${string}`
  curveAddress: `0x${string}`
  deployer: `0x${string}`
  pairToken: `0x${string}`
  launchConfigId: bigint
  launchBlock: bigint
  name: string
  symbol: string
  logo: string
  description: string
  quoteReserve: bigint
  tokenReserve: bigint
  realQuoteReserve: bigint
  graduationThreshold: bigint
  feeBps: bigint
  creatorTaxBps: bigint
  phase: number
  isEthPaired: boolean
  /** Simbol token quote (pair) — "ETH" untuk pair ETH, hasil `symbol()` untuk aset lain. */
  pairSymbol: string
  /** Desimal token quote (pair) — 18 untuk ETH, hasil `decimals()` untuk aset lain. */
  pairDecimals: number
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const TOKEN_LAUNCHED_EVENT = parseAbiItem(
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)'
)

/** Urutan call per token di dalam satu multicall3. */
const CALL = {
  NAME: 0,
  SYMBOL: 1,
  LOGO: 2,
  DESCRIPTION: 3,
  RESERVES: 4,
  REAL_QUOTE: 5,
  THRESHOLD: 6,
  FEE: 7,
  CREATOR_TAX: 8,
  LAUNCHED: 9,
} as const
const CALLS_PER_TOKEN = Object.keys(CALL).length
/** Index call tambahan (hanya untuk token non-ETH): pair symbol, pair decimals. */
const PAIR_SYMBOL = CALLS_PER_TOKEN
const PAIR_DECIMALS = CALLS_PER_TOKEN + 1

function getFallbackClient() {
  return createPublicClient({
    chain: robinhoodTestnet,
    transport: http(robinhoodTestnet.rpcUrls.default.http[0]),
  })
}

/** Bungkus encodeFunctionData menjadi elemen multicall (allowFailure: true). */
function mcall(target: `0x${string}`, callData: `0x${string}`): Multicall3Call {
  return { target, allowFailure: true, callData }
}

type RawToken = {
  token: `0x${string}`
  curve: `0x${string}`
  deployer: `0x${string}`
  pairToken: `0x${string}`
  launchConfigId: bigint
  graduationThreshold: bigint
  launchBlock: bigint
}

export function useTokenList() {
  const wagmiClient = usePublicClient()
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestTokensRef = useRef<TokenInfo[]>([])
  const inFlightRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    latestTokensRef.current = tokens
  }, [tokens])

  const getClient = useCallback(() => wagmiClient ?? getFallbackClient(), [wagmiClient])

  /** Ambil semua event TokenLaunched (chunked 49.999 blok per request). */
  const fetchTokenAddresses = useCallback(async (): Promise<RawToken[]> => {
    const client = getClient()
    const latestBlock = await client.getBlockNumber()
    let fromBlock = FACTORY_DEPLOY_BLOCK
    const results: RawToken[] = []

    while (fromBlock <= latestBlock) {
      const toBlock =
        fromBlock + BLOCK_CHUNK_SIZE > latestBlock
          ? latestBlock
          : fromBlock + BLOCK_CHUNK_SIZE

      const logs = await client.getLogs({
        address: LAUNCH_FACTORY_ADDRESS,
        event: TOKEN_LAUNCHED_EVENT,
        fromBlock,
        toBlock,
      })

      for (const log of logs) {
        const args = log.args
        if (!args.token || !args.curve || !args.deployer || !args.pairToken) continue
        results.push({
          token: args.token,
          curve: args.curve,
          deployer: args.deployer,
          pairToken: args.pairToken,
          launchConfigId: args.launchConfigId ?? 0n,
          graduationThreshold: args.graduationThreshold ?? 0n,
          launchBlock: log.blockNumber,
        })
      }
      fromBlock = toBlock + 1n
    }
    return results
  }, [getClient])

  /** Batch semua data token lewat Multicall3 (≥10 call per token → 1 request). */
  const enrichTokens = useCallback(
    async (rawTokens: RawToken[]): Promise<TokenInfo[]> => {
      if (rawTokens.length === 0) return []
      const client = getClient()

      const calls: Multicall3Call[] = []
      /** Offset call pertama tiap token di dalam batch (call pair bersifat opsional). */
      const offsets: number[] = []
      for (const t of rawTokens) {
        offsets.push(calls.length)
        calls.push(mcall(t.token, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'name' })))
        calls.push(mcall(t.token, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'symbol' })))
        calls.push(mcall(t.token, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'logo' })))
        calls.push(mcall(t.token, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'description' })))
        calls.push(mcall(t.curve, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'getReserves' })))
        calls.push(mcall(t.curve, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'realQuoteReserve' })))
        calls.push(mcall(t.curve, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'graduationThreshold' })))
        calls.push(mcall(t.curve, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'feeBps' })))
        calls.push(mcall(t.curve, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'creatorTaxBps' })))
        calls.push(
          mcall(
            LAUNCH_FACTORY_ADDRESS,
            encodeFunctionData({ abi: launchFactoryAbi, functionName: 'getLaunchedToken', args: [t.token] })
          )
        )
        // Pair non-ETH: baca simbol & desimalnya supaya harga bisa ditampilkan dengan benar.
        if (t.pairToken !== ZERO_ADDRESS) {
          calls.push(mcall(t.pairToken, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'symbol' })))
          calls.push(mcall(t.pairToken, encodeFunctionData({ abi: launcherTokenAbi, functionName: 'decimals' })))
        }
      }

      const multicallResult = await client.readContract({
        address: MULTICALL3_ADDRESS,
        abi: multicallAbi,
        functionName: 'aggregate3',
        args: [calls],
      })

      const enriched: TokenInfo[] = []

      for (let i = 0; i < rawTokens.length; i++) {
        const t = rawTokens[i]
        const base = offsets[i]

        /** Data hasil call ke-i; lempar error bila call gagal / data kosong. */
        const dataAt = (index: number): `0x${string}` => {
          const entry = multicallResult[base + index]
          if (!entry || !entry.success || entry.returnData === '0x') {
            throw new Error(`multicall entry ${index} failed`)
          }
          return entry.returnData
        }
        /** Decode dengan fallback aman bila data tidak tersedia. */
        const safe = <T>(fn: () => T, fallback: T): T => {
          try {
            return fn()
          } catch {
            return fallback
          }
        }

        const name = safe(
          () => decodeFunctionResult({ abi: launcherTokenAbi, functionName: 'name', data: dataAt(CALL.NAME) }),
          t.token
        )
        const symbol = safe(
          () => decodeFunctionResult({ abi: launcherTokenAbi, functionName: 'symbol', data: dataAt(CALL.SYMBOL) }),
          '???'
        )
        const logo = safe(
          () => decodeFunctionResult({ abi: launcherTokenAbi, functionName: 'logo', data: dataAt(CALL.LOGO) }),
          ''
        )
        const description = safe(
          () =>
            decodeFunctionResult({
              abi: launcherTokenAbi,
              functionName: 'description',
              data: dataAt(CALL.DESCRIPTION),
            }),
          ''
        )
        const reserves = safe(
          (): readonly [bigint, bigint] =>
            decodeFunctionResult({ abi: bondingCurveAbi, functionName: 'getReserves', data: dataAt(CALL.RESERVES) }),
          [0n, 0n]
        )
        const realQuoteReserve = safe(
          () =>
            decodeFunctionResult({
              abi: bondingCurveAbi,
              functionName: 'realQuoteReserve',
              data: dataAt(CALL.REAL_QUOTE),
            }),
          0n
        )
        const graduationThreshold = safe(
          () =>
            decodeFunctionResult({
              abi: bondingCurveAbi,
              functionName: 'graduationThreshold',
              data: dataAt(CALL.THRESHOLD),
            }),
          t.graduationThreshold
        )
        const feeBps = safe(
          () => decodeFunctionResult({ abi: bondingCurveAbi, functionName: 'feeBps', data: dataAt(CALL.FEE) }),
          100n
        )
        const creatorTaxBps = safe(
          () =>
            decodeFunctionResult({
              abi: bondingCurveAbi,
              functionName: 'creatorTaxBps',
              data: dataAt(CALL.CREATOR_TAX),
            }),
          0n
        )
        const launched = safe(
          () =>
            decodeFunctionResult({
              abi: launchFactoryAbi,
              functionName: 'getLaunchedToken',
              data: dataAt(CALL.LAUNCHED),
            }),
          null
        )

        const isEthPaired = t.pairToken === ZERO_ADDRESS
        const pairSymbol = isEthPaired
          ? 'ETH'
          : safe(
              () =>
                decodeFunctionResult({
                  abi: launcherTokenAbi,
                  functionName: 'symbol',
                    data: dataAt(PAIR_SYMBOL),
                }),
              `${t.pairToken.slice(0, 6)}…${t.pairToken.slice(-4)}`
            )
        const pairDecimals = isEthPaired
          ? 18
          : safe(
              () =>
                decodeFunctionResult({
                  abi: launcherTokenAbi,
                  functionName: 'decimals',
                    data: dataAt(PAIR_DECIMALS),
                }),
              18
            )

        enriched.push({
          address: t.token,
          curveAddress: t.curve,
          deployer: t.deployer,
          pairToken: t.pairToken,
          launchConfigId: t.launchConfigId,
          launchBlock: t.launchBlock,
          name,
          symbol,
          logo,
          description,
          quoteReserve: reserves[0],
          tokenReserve: reserves[1],
          realQuoteReserve,
          graduationThreshold: graduationThreshold || t.graduationThreshold,
          feeBps,
          creatorTaxBps,
          phase: launched?.phase ?? 0,
          isEthPaired,
          pairSymbol,
          pairDecimals,
        })
      }

      // Urutkan: token terbaru di atas.
      return enriched.sort((a, b) => (a.launchBlock === b.launchBlock ? 0 : a.launchBlock > b.launchBlock ? -1 : 1))
    },
    [getClient]
  )

  /**
   * Muat ulang daftar token.
   * - `initial`   : load pertama (skeleton tampil, list masih kosong).
   * - `manual`    : user menekan tombol Refresh (spinner di tombol, list tidak dikosongkan).
   * - `background`: polling tiap 30 detik (senyap — daftar tidak pernah diganti skeleton).
   */
  const load = useCallback(
    (mode: 'initial' | 'manual' | 'background' = 'manual'): Promise<void> => {
      if (inFlightRef.current) return inFlightRef.current

      const run = (async () => {
        const hasData = latestTokensRef.current.length > 0
        if (!hasData) setLoading(true)
        if (mode === 'manual') setRefreshing(true)
        try {
          const rawTokens = await fetchTokenAddresses()
          const enriched = await enrichTokens(rawTokens)
          setTokens(enriched)
          setError(null)
        } catch (e) {
          console.error('Failed to load tokens:', e)
          // Hanya tampilkan layar error bila belum ada data sama sekali.
          if (latestTokensRef.current.length === 0) {
            setError('Gagal memuat daftar token. Periksa koneksi jaringan Anda.')
          }
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      })()

      inFlightRef.current = run
      void run.finally(() => {
        if (inFlightRef.current === run) inFlightRef.current = null
      })
      return run
    },
    [fetchTokenAddresses, enrichTokens]
  )

  /** Refresh ringan 1 token (reserves + phase) setelah transaksi. */
  const refreshToken = useCallback(
    async (tokenAddress: `0x${string}`) => {
      const client = getClient()
      const token = latestTokensRef.current.find(t => t.address === tokenAddress)
      if (!token) return

      try {
        const results = await client.readContract({
          address: MULTICALL3_ADDRESS,
          abi: multicallAbi,
          functionName: 'aggregate3',
          args: [
            [
              mcall(token.curveAddress, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'getReserves' })),
              mcall(token.curveAddress, encodeFunctionData({ abi: bondingCurveAbi, functionName: 'realQuoteReserve' })),
              mcall(
                LAUNCH_FACTORY_ADDRESS,
                encodeFunctionData({ abi: launchFactoryAbi, functionName: 'getLaunchedToken', args: [tokenAddress] })
              ),
            ],
          ],
        })

        const safeDecode = <T>(index: number, fn: (data: `0x${string}`) => T, fallback: T): T => {
          const entry = results[index]
          if (!entry || !entry.success || entry.returnData === '0x') return fallback
          try {
            return fn(entry.returnData)
          } catch {
            return fallback
          }
        }

        const reserves = safeDecode(
          0,
          data => decodeFunctionResult({ abi: bondingCurveAbi, functionName: 'getReserves', data }),
          [token.quoteReserve, token.tokenReserve] as const
        )
        const realQuoteReserve = safeDecode(
          1,
          data => decodeFunctionResult({ abi: bondingCurveAbi, functionName: 'realQuoteReserve', data }),
          token.realQuoteReserve
        )
        const launched = safeDecode(
          2,
          data => decodeFunctionResult({ abi: launchFactoryAbi, functionName: 'getLaunchedToken', data }),
          null
        )

        setTokens(prev =>
          prev.map(t =>
            t.address === tokenAddress
              ? {
                  ...t,
                  quoteReserve: reserves[0],
                  tokenReserve: reserves[1],
                  realQuoteReserve,
                  phase: launched?.phase ?? t.phase,
                }
              : t
          )
        )
      } catch (e) {
        console.error('Failed to refresh token:', e)
      }
    },
    [getClient]
  )

  // Load awal + polling token baru tiap 30 detik (tanpa mengosongkan daftar).
  useEffect(() => {
    void load('initial')
    const interval = setInterval(() => {
      void load('background')
    }, 30000)
    return () => clearInterval(interval)
  }, [load])

  return { tokens, loading, refreshing, error, reload: () => load('manual'), refreshToken }
}
