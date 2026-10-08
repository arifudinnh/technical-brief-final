import { formatUnits } from 'viem'

/**
 * Format harga yang sangat kecil dengan notasi subscript: `0.₅1234` = 0,000001234.
 * Angka subscript = jumlah nol setelah tanda titik sehingga tidak menyesatkan.
 * Tidak pernah menampilkan `0.00`.
 */
export function formatSmallPrice(wei: bigint, tokenDecimals = 18): string {
  if (wei === 0n) return '0'

  const ethValue = Number(formatUnits(wei, tokenDecimals))

  if (ethValue === 0) return '< 0.000001'
  if (ethValue >= 1) return ethValue.toFixed(4)
  if (ethValue >= 0.001) return ethValue.toFixed(6)

  const str = ethValue.toFixed(20)
  const match = str.match(/^0\.(0+)(\d+)/)
  if (match) {
    const zeros = match[1].length
    const sig = match[2].slice(0, 4)
    if (zeros >= 2) {
      const subscriptDigits: Record<string, string> = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      }
      const sub = zeros.toString().split('').map(d => subscriptDigits[d]).join('')
      return `0.${sub}${sig}`
    }
  }
  return ethValue.toPrecision(4)
}

/**
 * Format amount token/ETH menjadi angka lokal (id-ID) yang mudah dibaca.
 */
export function formatAmount(value: bigint, decimals = 18, maxFractionDigits = 4): string {
  return parseFloat(formatUnits(value, decimals)).toLocaleString('id-ID', {
    maximumFractionDigits: maxFractionDigits,
  })
}

/**
 * Format nilai quote (bigint, satuan terkecil) dengan desimal token quote apa pun.
 * Dipakai untuk ETH (18 desimal) maupun token pair non-ETH.
 */
export function formatQuote(value: bigint, decimals: number, fractionDigits = 4): string {
  const num = Number(formatUnits(value, decimals))
  if (num === 0) return (0).toFixed(fractionDigits)
  return num.toFixed(fractionDigits)
}

/**
 * Format ETH (bigint wei) dengan jumlah desimal tetap.
 */
export function formatEth(wei: bigint, fractionDigits = 4): string {
  return formatQuote(wei, 18, fractionDigits)
}

/**
 * Format basis point menjadi persen (mis. 100 → "1%").
 */
export function formatBps(bps: bigint | number): string {
  const value = typeof bps === 'bigint' ? Number(bps) : bps
  return `${(value / 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
}

/**
 * Progress graduation dalam basis point (0–10000).
 */
export function calcProgressBps(realQuoteReserve: bigint, graduationThreshold: bigint): number {
  if (graduationThreshold === 0n) return 0
  const bps = (realQuoteReserve * 10000n) / graduationThreshold
  return Number(bps > 10000n ? 10000n : bps)
}

/**
 * Estimasi token yang didapat dari jumlah ETH (math bigint, fee di depan).
 */
export function calcTokensOut(
  quoteIn: bigint,
  quoteReserve: bigint,
  tokenReserve: bigint,
  feeBps: bigint,
  creatorTaxBps: bigint
): bigint {
  const fee = (quoteIn * feeBps) / 10000n
  const creatorTax = (quoteIn * creatorTaxBps) / 10000n
  const net = quoteIn - fee - creatorTax
  if (net <= 0n || quoteReserve + net === 0n) return 0n
  return (net * tokenReserve) / (quoteReserve + net)
}

/**
 * Estimasi ETH yang diterima dari penjualan token (math bigint).
 *
 * Model konservatif: biaya (fee + creator tax) dihitung dari keluaran,
 * sehingga estimasi selalu ≤ nilai sebenarnya bila kontrak menagih biaya
 * di sisi input. Estimasi yang terlalu tinggi akan membuat transaksi revert
 * SlippageExceeded, jadi lebih aman memilih estimasi bawah.
 */
export function calcSellQuoteOut(
  tokensIn: bigint,
  quoteReserve: bigint,
  tokenReserve: bigint,
  feeBps: bigint,
  creatorTaxBps: bigint
): bigint {
  if (tokensIn <= 0n || tokenReserve <= 0n || quoteReserve <= 0n) return 0n
  const gross = (quoteReserve * tokensIn) / (tokenReserve + tokensIn)
  const fee = (gross * feeBps) / 10000n
  const creatorTax = (gross * creatorTaxBps) / 10000n
  const net = gross - fee - creatorTax
  return net > 0n ? net : 0n
}

/**
 * Terapkan slippage (basis point) pada nilai estimasi → batas minimum.
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n
}

/**
 * Label phase token.
 */
export function phaseLabel(phase: number): { label: string; color: string } {
  switch (phase) {
    case 0: return { label: 'Live', color: 'phase-live' }
    case 1: return { label: 'Graduating', color: 'phase-graduating' }
    case 2: return { label: 'Graduated', color: 'phase-graduated' }
    case 3: return { label: 'Cancelled', color: 'phase-cancelled' }
    default: return { label: 'Unknown', color: 'phase-unknown' }
  }
}

/**
 * Potong alamat ethereum agar ringkas.
 */
export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Deteksi penolakan transaksi oleh user (MetaMask kode 4001 / EIP-1193).
 */
export function isUserRejected(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth++) {
    const err = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (err.code === 4001 || err.code === 'ACTION_REJECTED') return true
    if (typeof err.message === 'string' && /user (rejected|denied)|rejected the request/i.test(err.message)) {
      return true
    }
    current = err.cause
  }
  return false
}

/**
 * Terjemahkan error kontrak/ RPC menjadi pesan yang mudah dipahami.
 */
export function parseContractError(error: unknown): string {
  const msg = String((error as { message?: string })?.message ?? error)
  if (isUserRejected(error)) return 'Transaksi ditolak di wallet.'
  if (msg.includes('SlippageExceeded')) return 'Harga bergerak terlalu jauh, slippage melebihi toleransi. Coba lagi atau naikkan slippage.'
  if (msg.includes('MinimumOutputRequired')) return 'Hasil minimum tidak tercapai karena harga berubah. Coba lagi.'
  if (msg.includes('CurveGraduated')) return 'Token ini sudah graduate dari bonding curve dan tidak bisa dibeli di sini lagi.'
  if (msg.includes('InsufficientLiquidity')) return 'Likuiditas bonding curve tidak cukup untuk transaksi ini.'
  if (msg.includes('InsufficientInputAmount') || msg.includes('ZeroAmount')) return 'Jumlah transaksi terlalu kecil (0). Masukkan jumlah yang lebih besar.'
  if (msg.includes('InsufficientOutputAmount')) return 'Jumlah hasil terlalu kecil, kemungkinan karena likuiditas tipis. Coba lagi.'
  if (msg.includes('NativeValueMismatch')) return 'Nilai ETH yang dikirim tidak sesuai dengan permintaan kontrak. Muat ulang form dan coba lagi.'
  if (msg.includes('insufficient funds') || msg.includes('InsufficientFunds')) return 'Saldo ETH tidak cukup untuk transaksi ini.'
  if (msg.includes('ExceededMaxFeePerGas') || msg.includes('fee cap') || msg.includes('gas')) return 'Estimasi gas gagal. Transaksi mungkin akan gagal.'
  return 'Transaksi gagal. Silakan coba lagi.'
}

/**
 * Relatif waktu (unix detik) → "5 menit lalu".
 */
export function timeAgo(unixSeconds: number, nowMs = Date.now()): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds)
  if (diff < 60) return 'baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  return new Date(unixSeconds * 1000).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Jalankan pemetaan async dengan batas konkurensi (menghindari rate limit RPC).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}
