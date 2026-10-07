import { useAccount, useChainId, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import WalletButton from './WalletButton'
import LaunchToken from './LaunchToken'
import { LAUNCH_FACTORY_ADDRESS, robinhoodTestnet } from '../lib/wagmi'
import launchFactoryAbi from '../abi/LaunchFactory'

interface AppHeaderProps {
  /** Refresh daftar token (dipakai tombol Launch). */
  onReload: () => void
}

export default function AppHeader({ onReload }: AppHeaderProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()

  // Baca launchFee untuk verifikasi koneksi RPC (langkah 1 brief).
  const { data: launchFee } = useReadContract({
    address: LAUNCH_FACTORY_ADDRESS,
    abi: launchFactoryAbi,
    functionName: 'launchFee',
  })

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id

  return (
    <>
      <header className="header">
        <div className="header__inner">
          <div className="header__logo">
            <div className="logo-icon">🚀</div>
            <div className="logo-text">
              <span className="logo-title">LaunchPad</span>
              <span className="logo-sub">Robinhood Testnet</span>
            </div>
          </div>

          <div className="header__center">
            {launchFee !== undefined && (
              <div className="launch-fee-badge" title="Launch Fee saat ini">
                Launch Fee: {formatEther(launchFee)} ETH
              </div>
            )}
          </div>

          <div className="header__actions">
            {isWrongNetwork && <div className="network-warning">⚠️ Network Salah</div>}
            <LaunchToken onLaunched={onReload} />
            <WalletButton />
          </div>
        </div>
      </header>

      {isWrongNetwork && (
        <div className="network-banner" role="alert">
          <span>⚠️ Kamu sedang di network yang salah — fitur transaksi dinonaktifkan.</span>
          <WalletButton />
        </div>
      )}
    </>
  )
}
