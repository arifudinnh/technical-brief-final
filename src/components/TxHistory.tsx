import type { TokenInfo } from '../hooks/useTokenList'
import { useTxHistory } from '../hooks/useTxHistory'
import { formatAmount, formatEth, timeAgo } from '../lib/utils'
import { EXPLORER_URL } from '../lib/wagmi'

interface TxHistoryProps {
  token: TokenInfo
  /** Naikkan nilai ini setelah transaksi berhasil untuk memicu refetch. */
  refreshToken?: number
}

function SkeletonRow() {
  return (
    <li className="tx-history__item tx-history__item--skeleton">
      <span className="skeleton skeleton-pill" />
      <span className="skeleton skeleton-text" />
      <span className="skeleton skeleton-text skeleton-text--short" />
    </li>
  )
}

export default function TxHistory({ token, refreshToken = 0 }: TxHistoryProps) {
  const { events, loading, error, reload } = useTxHistory(token, refreshToken)

  if (loading) {
    return (
      <ul className="tx-history__list" aria-busy="true">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </ul>
    )
  }

  if (error) {
    return (
      <div className="state-container state--error">
        <div className="error-icon">⚠️</div>
        <p>{error}</p>
        <button className="btn btn-outline btn-sm" onClick={reload}>Coba Lagi</button>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="state-container state--empty">
        <div className="empty-icon">🗒️</div>
        <p>Belum ada transaksi untuk token ini.</p>
      </div>
    )
  }

  return (
    <div className="tx-history">
      <div className="tx-history__head">
        <span>Riwayat transaksi</span>
        <span className="tx-history__count">{events.length} terakhir</span>
      </div>

      <ul className="tx-history__list">
        {events.map(tx => {
          const isBuy = tx.type === 'buy'
          return (
            <li key={`${tx.txHash}-${tx.logIndex}`} className="tx-history__item">
              <span className={`tx-type ${isBuy ? 'tx-type--buy' : 'tx-type--sell'}`}>
                {isBuy ? 'Beli' : 'Jual'}
              </span>

              <div className="tx-history__amounts">
                <strong>
                  {isBuy ? '+' : '−'}
                  {formatAmount(isBuy ? (tx.tokensOut ?? 0n) : (tx.tokensIn ?? 0n))}
                </strong>{' '}
                {token.symbol}
                <span className="tx-history__quote">
                  {isBuy ? '−' : '+'}
                  {formatEth(isBuy ? (tx.quoteIn ?? 0n) : (tx.quoteOut ?? 0n), 6)} ETH
                </span>
              </div>

              <div className="tx-history__meta">
                <span>{tx.timestamp ? timeAgo(tx.timestamp) : `Blok #${tx.blockNumber}`}</span>
                <a
                  href={`${EXPLORER_URL}/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Explorer ↗
                </a>
              </div>
            </li>
          )
        })}
      </ul>

      <button className="btn btn-outline btn-sm tx-history__reload" onClick={reload}>
        ↻ Muat ulang
      </button>
    </div>
  )
}
