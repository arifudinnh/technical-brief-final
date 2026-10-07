import type { ReactNode } from 'react'
import { EXPLORER_URL } from '../lib/wagmi'

/** Status transaksi bersama untuk semua form (beli, jual, launch, graduate). */
export type TxStatus =
  | { type: 'idle' }
  | { type: 'signing' }
  | { type: 'pending'; hash: `0x${string}` }
  | { type: 'success'; hash: `0x${string}` }
  | { type: 'error'; message: string; rejected?: boolean }

interface TxStatusViewProps {
  status: TxStatus
  pendingLabel?: string
  successTitle?: string
  successDetail?: ReactNode
  onReset?: () => void
  resetLabel?: string
}

export default function TxStatusView({
  status,
  pendingLabel = 'Transaksi dikirim, menunggu konfirmasi blok…',
  successTitle = 'Transaksi berhasil!',
  successDetail,
  onReset,
  resetLabel = 'Coba Lagi',
}: TxStatusViewProps) {
  switch (status.type) {
    case 'signing':
      return (
        <div className="tx-status tx-status--pending" role="status">
          <span className="spinner" />
          Konfirmasi di wallet…
        </div>
      )

    case 'pending':
      return (
        <div className="tx-status tx-status--pending" role="status">
          <span className="spinner" />
          <span>{pendingLabel}</span>
          <a
            className="explorer-link"
            href={`${EXPLORER_URL}/tx/${status.hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Lihat di Explorer ↗
          </a>
        </div>
      )

    case 'success':
      return (
        <div className="tx-status tx-status--success" role="status">
          <span className="icon">✅</span>
          <div className="tx-status__body">
            <strong>{successTitle}</strong>
            {successDetail}
            <a
              className="explorer-link"
              href={`${EXPLORER_URL}/tx/${status.hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Lihat di Explorer ↗
            </a>
          </div>
          {onReset && (
            <button className="btn btn-sm btn-outline" onClick={onReset}>
              {resetLabel}
            </button>
          )}
        </div>
      )

    case 'error':
      return (
        <div
          className={`tx-status ${status.rejected ? 'tx-status--warning' : 'tx-status--error'}`}
          role="alert"
        >
          <span className="icon">{status.rejected ? '⚠️' : '❌'}</span>
          <div className="tx-status__body">
            <span>{status.message}</span>
            {onReset && (
              <button className="btn btn-sm btn-outline" onClick={onReset}>
                {resetLabel}
              </button>
            )}
          </div>
        </div>
      )

    default:
      return null
  }
}
