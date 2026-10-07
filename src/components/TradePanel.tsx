import { useState } from 'react'
import type { TokenInfo } from '../hooks/useTokenList'
import BuyForm from './BuyForm'
import SellForm from './SellForm'
import TxHistory from './TxHistory'

interface TradePanelProps {
  token: TokenInfo
  /** Dipanggil setelah transaksi berhasil (untuk refresh data token). */
  onTxSuccess: (tokenAddress: `0x${string}`) => void
}

type TradeTab = 'buy' | 'sell' | 'history'

const TABS: { id: TradeTab; label: string }[] = [
  { id: 'buy', label: 'Beli' },
  { id: 'sell', label: 'Jual' },
  { id: 'history', label: 'Riwayat' },
]

export default function TradePanel({ token, onTxSuccess }: TradePanelProps) {
  const [tab, setTab] = useState<TradeTab>('buy')
  const [historyVersion, setHistoryVersion] = useState(0)

  const handleTxSuccess = async (tokenAddress: `0x${string}`) => {
    setHistoryVersion(v => v + 1)
    await onTxSuccess(tokenAddress)
  }

  return (
    <div className="trade-panel">
      <div className="trade-tabs" role="tablist" aria-label="Aksi token">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`trade-tab ${tab === id ? 'trade-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="trade-tab__content" role="tabpanel">
        {tab === 'buy' && <BuyForm key={token.address} token={token} onSuccess={handleTxSuccess} />}
        {tab === 'sell' && <SellForm key={token.address} token={token} onSuccess={handleTxSuccess} />}
        {tab === 'history' && (
          <TxHistory key={token.address} token={token} refreshToken={historyVersion} />
        )}
      </div>
    </div>
  )
}
