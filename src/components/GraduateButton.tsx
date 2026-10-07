import { useState } from 'react'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import type { TokenInfo } from '../hooks/useTokenList'
import { isUserRejected, parseContractError } from '../lib/utils'
import { LAUNCH_FACTORY_ADDRESS, robinhoodTestnet } from '../lib/wagmi'
import launchFactoryAbi from '../abi/LaunchFactory'
import TxStatusView, { type TxStatus } from './TxStatusView'

interface GraduateButtonProps {
  token: TokenInfo
  /** Dipanggil setelah graduation sukses (refresh daftar token). */
  onSuccess: () => void
}

/**
 * Tombol graduation (bonus D): memanggil LaunchFactory.createGraduatedPool(token)
 * — tersedia saat token phase 1 (graduating / threshold tercapai).
 */
export default function GraduateButton({ token, onSuccess }: GraduateButtonProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [txStatus, setTxStatus] = useState<TxStatus>({ type: 'idle' })

  // Hanya tampil di phase 1 — tetap tampilkan pesan sukses sampai ditutup.
  if (token.phase !== 1 && txStatus.type !== 'success') return null

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id
  const isIdle = txStatus.type === 'idle'
  const canGraduate = isConnected && !isWrongNetwork && isIdle && !!walletClient && !!publicClient

  const disableReason = !isConnected
    ? 'Connect wallet dulu untuk graduate'
    : isWrongNetwork
    ? 'Switch ke Robinhood Testnet'
    : ''

  const handleGraduate = async () => {
    if (!canGraduate || !walletClient || !publicClient) return

    setTxStatus({ type: 'signing' })
    try {
      const hash = await walletClient.writeContract({
        address: LAUNCH_FACTORY_ADDRESS,
        abi: launchFactoryAbi,
        functionName: 'createGraduatedPool',
        args: [token.address],
      })
      setTxStatus({ type: 'pending', hash })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStatus({ type: 'success', hash })
      onSuccess()
    } catch (e) {
      setTxStatus({ type: 'error', message: parseContractError(e), rejected: isUserRejected(e) })
    }
  }

  return (
    <div className="graduate-card">
      <div className="graduate-card__info">
        <span className="graduate-card__badge">Siap Graduate</span>
        <div>
          <strong>Threshold tercapai</strong>
          <p>
            Pool DEX belum dibuat. Tekan tombol untuk memanggil{' '}
            <code>createGraduatedPool()</code> — siapa saja boleh.
          </p>
        </div>
      </div>

      <TxStatusView
        status={txStatus}
        pendingLabel="Menunggu konfirmasi graduation…"
        successTitle="Graduation berhasil!"
        successDetail={<div>Pool untuk {token.symbol} berhasil dibuat.</div>}
        onReset={isIdle ? undefined : () => setTxStatus({ type: 'idle' })}
        resetLabel="Tutup"
      />

      {(txStatus.type === 'idle' || txStatus.type === 'signing') && (
        <button
          id="btn-graduate"
          className="btn btn-primary btn-graduate"
          onClick={handleGraduate}
          disabled={!canGraduate}
          title={disableReason}
        >
          {txStatus.type === 'signing' ? (
            <>
              <span className="spinner" /> Konfirmasi di wallet
            </>
          ) : (
            'Graduate Sekarang (createGraduatedPool)'
          )}
        </button>
      )}
      {disableReason && isIdle && <p className="disable-hint">{disableReason}</p>}
    </div>
  )
}
