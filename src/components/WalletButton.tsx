import { useState } from 'react'
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi'
import { EXPLORER_URL } from '../lib/wagmi'
import { shortAddress, formatEth, isUserRejected } from '../lib/utils'
import { useWalletNetwork } from '../hooks/useWalletNetwork'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function hasInjectedProvider(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { ethereum?: Eip1193Provider }).ethereum
  )
}

/** Terjemahkan kegagalan `connect()` menjadi pesan singkat yang bisa ditindaklanjuti. */
function connectErrorMessage(error: unknown): string {
  if (isUserRejected(error)) return 'Percobaan connect dibatalkan di wallet.'
  const msg = String((error as { message?: string })?.message ?? error)
  if (/no (injected )?provider|not available|window\.ethereum|ProviderNotFound/i.test(msg)) {
    return 'Wallet tidak terdeteksi — install MetaMask atau ekstensi wallet dulu.'
  }
  return msg.split('\n')[0].slice(0, 160) || 'Gagal menghubungkan wallet. Coba lagi.'
}

export default function WalletButton() {
  const { address } = useAccount()
  const { isWrongNetwork, switchToRobinhood } = useWalletNetwork()
  const { connect, connectors, error: connectError, isPending, reset } = useConnect()
  const { disconnect } = useDisconnect()
  const [showDropdown, setShowDropdown] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const { data: balance } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 10000 },
  })

  const handleConnect = () => {
    setLocalError(null)
    const connector = connectors.find(c => c.id === 'injected') ?? connectors[0]
    if (!connector) {
      setLocalError('Connector wallet tidak tersedia — muat ulang halaman.')
      return
    }
    // Tanpa provider, connect() gagal senyap → beri pesan langsung.
    if (!hasInjectedProvider()) {
      setLocalError('Wallet tidak terdeteksi — install MetaMask atau ekstensi wallet dulu.')
      return
    }
    connect({ connector })
  }

  if (!address) {
    const errorMessage = localError ?? (connectError ? connectErrorMessage(connectError) : null)
    return (
      <div className="wallet-connect">
        <button
          id="btn-connect-wallet"
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={isPending}
        >
          {isPending ? (
            <span className="spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 3h-3a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h3"/>
              <circle cx="16" cy="12" r="1" fill="currentColor"/>
            </svg>
          )}
          <span className="label-lg">{isPending ? 'Menghubungkan…' : 'Connect Wallet'}</span>
          <span className="label-sm">{isPending ? 'Hubungkan…' : 'Connect'}</span>
        </button>

        {errorMessage && (
          <div className="connect-error" role="alert">
            <span>{errorMessage}</span>
            <button
              className="connect-error__close"
              aria-label="Tutup pesan"
              onClick={() => {
                setLocalError(null)
                reset()
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    )
  }

  if (isWrongNetwork) {
    return (
      <button id="btn-switch-network" className="btn btn-warning" onClick={switchToRobinhood}>
        <span className="label-lg">⚠️ Switch ke Robinhood Testnet</span>
        <span className="label-sm">⚠️ Switch</span>
      </button>
    )
  }

  return (
    <div className="wallet-info" style={{ position: 'relative' }}>
      <button
        id="btn-wallet-info"
        className="btn btn-connected"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <span className="wallet-dot" />
        <span className="wallet-address">{shortAddress(address)}</span>
        <span className="wallet-balance">
          {balance ? `${formatEth(balance.value)} ETH` : '…'}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {showDropdown && (
        <div className="wallet-dropdown">
          <div className="wallet-dropdown-addr">{address}</div>
          <div className="wallet-dropdown-balance">
            {balance ? `${formatEth(balance.value, 6)} ETH` : '…'}
          </div>
          <a
            href={`${EXPLORER_URL}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="wallet-dropdown-link"
          >
            Lihat di Explorer ↗
          </a>
          <button
            id="btn-disconnect"
            className="btn btn-danger btn-sm"
            onClick={() => { disconnect(); setShowDropdown(false) }}
          >
            Disconnect
          </button>
        </div>
      )}

      {showDropdown && <div className="overlay" onClick={() => setShowDropdown(false)} />}
    </div>
  )
}
