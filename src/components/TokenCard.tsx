import { useState } from 'react'
import type { TokenInfo } from '../hooks/useTokenList'
import { formatSmallPrice, calcProgressBps, phaseLabel, formatAmount, formatQuote } from '../lib/utils'

interface TokenCardProps {
  token: TokenInfo
  selected: boolean
  onSelect: (token: TokenInfo) => void
  onOpenDetail: (token: TokenInfo) => void
}

export default function TokenCard({ token, selected, onSelect, onOpenDetail }: TokenCardProps) {
  const [imgError, setImgError] = useState(false)
  const { label, color } = phaseLabel(token.phase)

  // Harga = quoteReserve / tokenReserve (satuan quote per token, semua bigint).
  const priceQuote = token.tokenReserve > 0n ? (token.quoteReserve * 10n ** 18n) / token.tokenReserve : 0n
  const priceDisplay =
    priceQuote > 0n ? `${formatSmallPrice(priceQuote, token.pairDecimals)} ${token.pairSymbol}` : '–'

  const progressBps = calcProgressBps(token.realQuoteReserve, token.graduationThreshold)
  const progressPct = (progressBps / 100).toFixed(1)
  const showImg = token.logo && !imgError

  return (
    <div
      id={`token-card-${token.address.slice(2, 8)}`}
      className={`token-card ${selected ? 'token-card--selected' : ''} ${color}`}
      onClick={() => onSelect(token)}
    >
      <div className="token-card__header">
        <div className="token-logo">
          {showImg ? (
            <img
              src={token.logo}
              alt={`${token.name} logo`}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="token-logo__placeholder">{token.symbol.slice(0, 2)}</div>
          )}
        </div>

        <div className="token-meta">
          <div className="token-name-row">
            <span className="token-name">{token.name}</span>
            <span className={`phase-badge phase-badge--${color}`}>{label}</span>
          </div>
          <span className="token-symbol">${token.symbol}</span>
        </div>

        <div className="token-card__badges">
          {token.phase === 1 && (
            <span className="badge badge-warning" title="Threshold tercapai — siap graduate">
              Siap Graduate
            </span>
          )}
          {!token.isEthPaired && (
            <span className="badge badge-info" title="Token ini tidak dipasangkan dengan ETH">
              Non-ETH
            </span>
          )}
        </div>
      </div>

      <div className="token-card__price">
        <span className="price-label">Harga</span>
        <span className="price-value">{priceDisplay}</span>
      </div>

      <div className="token-card__progress">
        <div className="progress-header">
          <span className="progress-label">Progress Graduation</span>
          <span className="progress-pct">{progressPct}%</span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-bar__fill ${progressBps >= 10000 ? 'progress-bar__fill--done' : ''}`}
            style={{ width: `${Math.min(progressBps / 100, 100)}%` }}
          />
        </div>
        <div className="progress-detail">
          <span>
            {formatQuote(token.realQuoteReserve, token.pairDecimals)} {token.pairSymbol} terkumpul
          </span>
          <span>
            {formatQuote(token.graduationThreshold, token.pairDecimals)} {token.pairSymbol} target
          </span>
        </div>
      </div>

      <div className="token-card__footer">
        <button
          className="btn btn-outline btn-sm"
          onClick={e => {
            e.stopPropagation()
            onOpenDetail(token)
          }}
        >
          Detail
        </button>
        <span className="token-card__supply" title="Sisa token di bonding curve">
          {formatAmount(token.tokenReserve)} tersisa
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={e => {
            e.stopPropagation()
            onSelect(token)
          }}
        >
          {selected ? 'Terpilih' : 'Beli'}
        </button>
      </div>
    </div>
  )
}
