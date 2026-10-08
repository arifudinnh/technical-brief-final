import { useState } from 'react'
import type { TokenInfo } from '../hooks/useTokenList'
import {
  calcProgressBps,
  formatBps,
  formatAmount,
  formatQuote,
  formatSmallPrice,
  phaseLabel,
  shortAddress,
} from '../lib/utils'
import { EXPLORER_URL } from '../lib/wagmi'
import TradePanel from './TradePanel'
import GraduateButton from './GraduateButton'

interface TokenDetailProps {
  token: TokenInfo
  onBack: () => void
  onTxSuccess: (tokenAddress: `0x${string}`) => void
}

function AddressChip({ label, address }: { label: string; address: `0x${string}` }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard tidak tersedia — abaikan */
    }
  }

  return (
    <div className="addr-chip">
      <span className="addr-chip__label">{label}</span>
      <button className="addr-chip__value" onClick={handleCopy} title="Klik untuk salin alamat">
        {shortAddress(address)}
        <span className={`addr-chip__icon ${copied ? 'addr-chip__icon--copied' : ''}`}>
          {copied ? '✓' : '⧉'}
        </span>
      </button>
      <a
        className="addr-chip__link"
        href={`${EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Buka di explorer"
      >
        ↗
      </a>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {sub && <span className="stat-card__sub">{sub}</span>}
    </div>
  )
}

export default function TokenDetail({ token, onBack, onTxSuccess }: TokenDetailProps) {
  const { label, color } = phaseLabel(token.phase)

  const priceQuote =
    token.tokenReserve > 0n ? (token.quoteReserve * 10n ** 18n) / token.tokenReserve : 0n
  const priceDisplay =
    priceQuote > 0n ? `${formatSmallPrice(priceQuote, token.pairDecimals)} ${token.pairSymbol}` : '–'

  const progressBps = calcProgressBps(token.realQuoteReserve, token.graduationThreshold)
  const progressPct = (progressBps / 100).toFixed(1)
  const [imgError, setImgError] = useState(false)
  const showImg = token.logo && !imgError

  return (
    <div className="detail">
      {/* Top bar */}
      <div className="detail__topbar">
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          ← Kembali
        </button>
        <div className="detail__topbar-badges">
          {!token.isEthPaired && (
            <span className="badge badge-info" title="Token ini tidak dipasangkan dengan ETH">
              Non-ETH
            </span>
          )}
          <span className={`phase-badge phase-badge--${color}`}>{label}</span>
        </div>
      </div>

      {/* Hero */}
      <section className="detail__hero">
        <div className="token-logo token-logo--lg">
          {showImg ? (
            <img src={token.logo} alt={`${token.name} logo`} onError={() => setImgError(true)} />
          ) : (
            <div className="token-logo__placeholder">{token.symbol.slice(0, 2)}</div>
          )}
        </div>
        <div className="detail__hero-meta">
          <h1 className="detail__title">{token.name}</h1>
          <span className="detail__symbol">${token.symbol}</span>
          {token.description && <p className="detail__desc">{token.description}</p>}
        </div>
      </section>

      <div className="detail__body">
        <div className="detail__main">
          {/* Statistik */}
          <div className="stats-grid">
            <StatCard label="Harga" value={priceDisplay} />
            <StatCard
              label="Progress"
              value={`${progressPct}%`}
              sub={`${formatQuote(token.realQuoteReserve, token.pairDecimals)} / ${formatQuote(token.graduationThreshold, token.pairDecimals)} ${token.pairSymbol}`}
            />
            <StatCard
              label={`Likuiditas (${token.pairSymbol})`}
              value={formatQuote(token.quoteReserve, token.pairDecimals)}
              sub="quote reserve"
            />
            <StatCard label="Sisa Token" value={formatAmount(token.tokenReserve)} sub="token reserve" />
            <StatCard label="Fee Trading" value={formatBps(token.feeBps)} />
            <StatCard label="Creator Tax" value={formatBps(token.creatorTaxBps)} />
          </div>

          {/* Progress bar */}
          <div className="progress-card">
            <div className="progress-header">
              <span className="progress-label">Progress Graduation</span>
              <span className="progress-pct">{progressPct}%</span>
            </div>
            <div className="progress-bar progress-bar--lg">
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
                target {formatQuote(token.graduationThreshold, token.pairDecimals)} {token.pairSymbol}
              </span>
            </div>
          </div>

          <GraduateButton token={token} onSuccess={() => onTxSuccess(token.address)} />

          {/* Info kontrak */}
          <div className="info-card">
            <h3 className="info-card__title">Info Kontrak</h3>
            <div className="info-card__rows">
              <AddressChip label="Token" address={token.address} />
              <AddressChip label="Curve" address={token.curveAddress} />
              <AddressChip label="Deployer" address={token.deployer} />
              <div className="info-row">
                <span className="info-row__label">Launch Config</span>
                <span className="info-row__value">#{token.launchConfigId.toString()}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Blok Launch</span>
                <span className="info-row__value">#{token.launchBlock.toString()}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Pair Token</span>
                <span className="info-row__value">
                  {token.isEthPaired ? 'ETH' : `${token.pairSymbol} (${shortAddress(token.pairToken)})`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Panel trading */}
        <div className="detail__trade">
          <TradePanel token={token} onTxSuccess={onTxSuccess} />
        </div>
      </div>
    </div>
  )
}
