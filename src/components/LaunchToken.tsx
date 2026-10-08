import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccount, usePublicClient, useWalletClient, useReadContract } from 'wagmi'
import { decodeEventLog, formatEther } from 'viem'
import { LAUNCH_FACTORY_ADDRESS } from '../lib/wagmi'
import { isUserRejected, parseContractError } from '../lib/utils'
import { useWalletNetwork } from '../hooks/useWalletNetwork'
import launchFactoryAbi from '../abi/LaunchFactory'
import TxStatusView, { type TxStatus } from './TxStatusView'

interface LaunchTokenProps {
  onLaunched?: () => void
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

function randomBytes32(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

export default function LaunchToken({ onLaunched }: LaunchTokenProps) {
  const { address, isConnected } = useAccount()
  const { isWrongNetwork } = useWalletNetwork()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [isOpen, setIsOpen] = useState(false)

  const [form, setForm] = useState({ name: '', symbol: 'TEST', description: '', logo: '' })
  const [txStatus, setTxStatus] = useState<TxStatus>({ type: 'idle' })
  const [launched, setLaunched] = useState<{ token: `0x${string}`; curve: `0x${string}` } | null>(null)

  const { data: launchFee } = useReadContract({
    address: LAUNCH_FACTORY_ADDRESS,
    abi: launchFactoryAbi,
    functionName: 'launchFee',
  })

  const { data: canLaunch } = useReadContract({
    address: LAUNCH_FACTORY_ADDRESS,
    abi: launchFactoryAbi,
    functionName: 'canLaunch',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Nilai yang benar-benar dikirim ke kontrak (sudah trim + uppercase).
  const nameValue = form.name.trim()
  const symbolValue = form.symbol.trim().toUpperCase()

  const logoInvalid = form.logo.trim() !== '' && !/^https?:\/\//i.test(form.logo.trim())
  const nameInvalid = nameValue.length > 64
  const symbolInvalid = symbolValue.length > 16

  /** Terkunci saat transaksi berjalan / menampilkan hasil sukses. */
  const isLocked =
    txStatus.type === 'signing' || txStatus.type === 'pending' || txStatus.type === 'success'
  const canSubmit =
    isConnected &&
    !isWrongNetwork &&
    launchFee !== undefined &&
    nameValue !== '' &&
    symbolValue !== '' &&
    !nameInvalid &&
    !symbolInvalid &&
    !logoInvalid &&
    canLaunch !== false

  const handleLaunch = async () => {
    if (!canSubmit || isLocked || !walletClient || !address || !publicClient || launchFee === undefined) return

    setTxStatus({ type: 'signing' })
    try {
      // Baca preview economics tepat sebelum kirim transaksi.
      const expectedEconomics = await publicClient.readContract({
        address: LAUNCH_FACTORY_ADDRESS,
        abi: launchFactoryAbi,
        functionName: 'previewLaunchEconomics',
        args: [1n, ZERO_ADDRESS],
      })

      const hash = await walletClient.writeContract({
        address: LAUNCH_FACTORY_ADDRESS,
        abi: launchFactoryAbi,
        functionName: 'launchToken',
        args: [
          {
            name: nameValue,
            symbol: symbolValue,
            logo: form.logo.trim(),
            description: form.description.trim(),
            socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
            creatorFeeRecipient: ZERO_ADDRESS,
            creatorTaxBps: 0,
            buybackEnabled: false,
            expectedEconomics,
            salt: randomBytes32(),
          },
          1n,
          ZERO_ADDRESS,
        ],
        value: launchFee,
      })

      setTxStatus({ type: 'pending', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'reverted') {
        setTxStatus({
          type: 'error',
          message: 'Transaksi launch gagal di jaringan (reverted). Silakan coba lagi.',
        })
        return
      }

      // Ambil alamat token & curve dari event TokenLaunched di LaunchFactory.
      let tokenAddr: `0x${string}` | null = null
      let curveAddr: `0x${string}` | null = null
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== LAUNCH_FACTORY_ADDRESS.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({
            abi: launchFactoryAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'TokenLaunched') {
            tokenAddr = decoded.args.token
            curveAddr = decoded.args.curve
          }
        } catch {
          // event lain dari factory — abaikan
        }
      }

      setTxStatus({ type: 'success', hash })
      setLaunched(tokenAddr && curveAddr ? { token: tokenAddr, curve: curveAddr } : null)
      onLaunched?.()
    } catch (e) {
      setTxStatus({ type: 'error', message: parseContractError(e), rejected: isUserRejected(e) })
    }
  }

  const resetModal = () => {
    setTxStatus({ type: 'idle' })
    setLaunched(null)
    setForm({ name: '', symbol: 'TEST', description: '', logo: '' })
    setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <button
        id="btn-open-launch"
        className="btn btn-outline btn-sm"
        onClick={() => setIsOpen(true)}
        title="Launch Token Baru (Bonus)"
      >
        🚀 <span className="label-lg">Launch Token</span>
        <span className="label-sm">Launch</span>
      </button>
    )
  }

  // Portal ke body: header punya backdrop-filter sehingga menjadi containing
  // block untuk elemen fixed — tanpa portal, overlay terkunci setinggi header.
  return createPortal(
    <div className="launch-modal-overlay" onClick={() => !isLocked && resetModal()}>
      <div className="launch-modal" onClick={e => e.stopPropagation()}>
        <div className="launch-modal__header">
          <h2>🚀 Launch Token Baru</h2>
          <button className="btn-close" onClick={resetModal} aria-label="Tutup" disabled={isLocked}>
            ✕
          </button>
        </div>

        {canLaunch === false && (
          <div className="tx-status tx-status--warning" role="alert">
            <span className="icon">⚠️</span>
            <div className="tx-status__body">
              Alamat wallet kamu belum diizinkan untuk launch token. Hubungi pengawas.
            </div>
          </div>
        )}

        {isWrongNetwork && (
          <div className="tx-status tx-status--warning" role="alert">
            <span className="icon">⚠️</span>
            <div className="tx-status__body">
              Network salah — pindah ke Robinhood Testnet dulu sebelum launch.
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="launch-name">
            Nama Token (maks. 64 karakter) *
          </label>
          <input
            id="launch-name"
            type="text"
            className="form-input"
            placeholder="Nama Token Kamu"
            value={form.name}
            maxLength={64}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            disabled={isLocked}
          />
          {nameInvalid && <span className="field-error">Nama maksimal 64 karakter.</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="launch-symbol">
            Simbol (maks. 16 karakter) *
          </label>
          <input
            id="launch-symbol"
            type="text"
            className="form-input"
            placeholder="TEST"
            value={form.symbol}
            maxLength={16}
            onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
            disabled={isLocked}
          />
          {symbolInvalid && (
            <span className="field-error">Simbol maksimal 16 karakter setelah diuppercase.</span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="launch-desc">
            Deskripsi (opsional)
          </label>
          <input
            id="launch-desc"
            type="text"
            className="form-input"
            placeholder="Token saya di Robinhood Testnet"
            value={form.description}
            maxLength={200}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            disabled={isLocked}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="launch-logo">
            Logo URL (opsional)
          </label>
          <input
            id="launch-logo"
            type="url"
            className="form-input"
            placeholder="https://…/logo.png"
            value={form.logo}
            onChange={e => setForm(f => ({ ...f, logo: e.target.value }))}
            disabled={isLocked}
          />
          {logoInvalid && <span className="field-error">URL harus diawali http:// atau https://</span>}
        </div>

        {launchFee !== undefined && (
          <div className="estimated-out">
            <span className="label">Biaya Launch</span>
            <span className="value">{formatEther(launchFee)} ETH</span>
          </div>
        )}

        <TxStatusView
          status={txStatus}
          pendingLabel="Transaksi terkirim, menunggu konfirmasi blok…"
          successTitle="Token berhasil di-launch!"
          successDetail={
            txStatus.type === 'success' ? (
              <div className="launch-success">
                {launched ? (
                  <>
                    <div>Token: {launched.token}</div>
                    <div>Curve: {launched.curve}</div>
                  </>
                ) : (
                  <div>Transaksi sudah dikonfirmasi — muat ulang daftar token.</div>
                )}
              </div>
            ) : null
          }
          onReset={txStatus.type === 'success' ? resetModal : undefined}
          resetLabel="Selesai"
        />

        {(txStatus.type === 'idle' || txStatus.type === 'signing' || txStatus.type === 'error') && (
          <button
            id="btn-launch-token"
            className="btn btn-primary btn-buy"
            onClick={handleLaunch}
            disabled={!canSubmit || isLocked}
          >
            {txStatus.type === 'signing' ? (
              <>
                <span className="spinner" /> Memproses…
              </>
            ) : (
              'Launch Token'
            )}
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
