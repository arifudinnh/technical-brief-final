import { useState } from 'react'
import { useAccount, useBalance, useChainId, useSwitchChain, useConnect, useDisconnect } from 'wagmi'
import { robinhoodTestnet, EXPLORER_URL, RPC_URL } from '../lib/wagmi'
import { shortAddress, formatEth } from '../lib/utils'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getInjectedProvider(): Eip1193Provider | undefined {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum
}

export default function WalletButton() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [showDropdown, setShowDropdown] = useState(false)

  const { data: balance } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 10000 },
  })

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id

  const handleConnect = () => {
    const connector = connectors.find(c => c.id === 'injected') ?? connectors[0]
    if (connector) connect({ connector })
  }

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: robinhoodTestnet.id })
    } catch {
      // Chain belum ada di wallet — tambahkan manual (wallet_addEthereumChain).
      try {
        await getInjectedProvider()?.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0xB656',
              chainName: robinhoodTestnet.name,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER_URL],
            },
          ],
        })
      } catch (addErr) {
        console.error('Failed to add/switch network:', addErr)
      }
    }
  }

  if (!address) {
    return (
      <button id="btn-connect-wallet" className="btn btn-primary" onClick={handleConnect}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 3h-3a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h3"/>
          <circle cx="16" cy="12" r="1" fill="currentColor"/>
        </svg>
        Connect Wallet
      </button>
    )
  }

  if (isWrongNetwork) {
    return (
      <button id="btn-switch-network" className="btn btn-warning" onClick={handleSwitchNetwork}>
        ⚠️ Switch ke Robinhood Testnet
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
