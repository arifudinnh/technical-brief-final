import { useState } from 'react'
import { useTokenList, type TokenInfo } from './hooks/useTokenList'
import AppHeader from './components/AppHeader'
import TokenCard from './components/TokenCard'
import TradePanel from './components/TradePanel'
import TokenDetail from './components/TokenDetail'
import { EXPLORER_URL } from './lib/wagmi'
import heroIllustration from './assets/hero.png'

const PHASE_FILTERS: { value: number | 'all'; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 0, label: 'Live' },
  { value: 1, label: 'Graduating' },
  { value: 2, label: 'Graduated' },
  { value: 3, label: 'Cancelled' },
]

export default function App() {
  const { tokens, loading, error, reload, refreshToken } = useTokenList()
  const [selectedAddress, setSelectedAddress] = useState<`0x${string}` | null>(null)
  const [detailAddress, setDetailAddress] = useState<`0x${string}` | null>(null)
  const [filterPhase, setFilterPhase] = useState<number | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Turunkan alamat → objek token terbaru (otomatis ikut update setelah refresh).
  const selectedToken = selectedAddress ? (tokens.find(t => t.address === selectedAddress) ?? null) : null
  const detailToken = detailAddress ? (tokens.find(t => t.address === detailAddress) ?? null) : null

  const filteredTokens = tokens.filter(t => {
    const matchPhase = filterPhase === 'all' || t.phase === filterPhase
    const q = searchQuery.trim().toLowerCase()
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q)
    return matchPhase && matchSearch
  })

  const handleSelect = (token: TokenInfo) => {
    setSelectedAddress(prev => (prev === token.address ? null : token.address))
  }

  const handleOpenDetail = (token: TokenInfo) => {
    setSelectedAddress(null)
    setDetailAddress(token.address)
  }

  const hasActiveFilter = Boolean(searchQuery) || filterPhase !== 'all'

  return (
    <div className="app">
      <AppHeader onReload={reload} />

      <main className="main">
        {detailToken ? (
          <TokenDetail
            token={detailToken}
            onBack={() => setDetailAddress(null)}
            onTxSuccess={refreshToken}
          />
        ) : (
          <div className="main__content">
            {/* Daftar token */}
            <div className="tokens-panel">
              <div className="panel-header">
                <h1 className="panel-title">Token Launchpad</h1>
                <div className="panel-controls">
                  <div className="search-wrapper">
                    <svg
                      className="search-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      id="search-token"
                      type="text"
                      className="search-input"
                      placeholder="Cari token…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button
                    id="btn-refresh"
                    className="btn btn-outline btn-sm"
                    onClick={reload}
                    disabled={loading}
                    title="Refresh daftar token"
                  >
                    {loading ? <span className="spinner" /> : '↻'} Refresh
                  </button>
                </div>
              </div>

              {/* Filter phase */}
              <div className="phase-filters">
                {PHASE_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    id={`filter-phase-${value}`}
                    className={`phase-filter-btn ${filterPhase === value ? 'phase-filter-btn--active' : ''}`}
                    onClick={() => setFilterPhase(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* States: loading / error / empty / list */}
              {loading ? (
                <div className="state-container">
                  <div className="loading-grid">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="token-card token-card--skeleton">
                        <div className="skeleton skeleton-logo" />
                        <div className="skeleton skeleton-text" />
                        <div className="skeleton skeleton-text skeleton-text--short" />
                        <div className="skeleton skeleton-bar" />
                      </div>
                    ))}
                  </div>
                  <p className="loading-hint">Mengambil token dari blockchain…</p>
                </div>
              ) : error ? (
                <div className="state-container state--error">
                  <div className="error-icon">⚠️</div>
                  <h2>Gagal Memuat Token</h2>
                  <p>{error}</p>
                  <button id="btn-retry" className="btn btn-primary" onClick={reload}>
                    Coba Lagi
                  </button>
                </div>
              ) : filteredTokens.length === 0 ? (
                <div className="state-container state--empty">
                  {hasActiveFilter ? (
                    <>
                      <div className="empty-icon">🔍</div>
                      <h2>Token Tidak Ditemukan</h2>
                      <p>Tidak ada token yang cocok dengan filter.</p>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setSearchQuery('')
                          setFilterPhase('all')
                        }}
                      >
                        Reset Filter
                      </button>
                    </>
                  ) : (
                    <>
                      <img src={heroIllustration} alt="" className="empty-illustration" />
                      <h2>Belum Ada Token</h2>
                      <p>Belum ada token yang diluncurkan di launchpad ini.</p>
                      <button className="btn btn-primary" onClick={reload}>
                        Muat Ulang
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="token-grid">
                  {filteredTokens.map(token => (
                    <TokenCard
                      key={token.address}
                      token={token}
                      selected={selectedToken?.address === token.address}
                      onSelect={handleSelect}
                      onOpenDetail={handleOpenDetail}
                    />
                  ))}
                </div>
              )}

              <div className="token-count">
                {!loading && !error && `${filteredTokens.length} token`}
              </div>
            </div>

            {/* Panel trading (Beli / Jual / Riwayat) */}
            {selectedToken && (
              <div className="buy-panel">
                <div className="buy-panel__header">
                  <h2>
                    Trading <span className="token-sym">${selectedToken.symbol}</span>
                  </h2>
                  <button
                    id="btn-close-buy"
                    className="btn-close"
                    onClick={() => setSelectedAddress(null)}
                    aria-label="Tutup panel trading"
                  >
                    ✕
                  </button>
                </div>
                <TradePanel token={selectedToken} onTxSuccess={refreshToken} />
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>LaunchPad — uji coba bonding curve di Robinhood Chain Testnet</span>
          <div className="footer__links">
            <span>Chain ID 46630</span>
            <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer">
              Explorer ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
