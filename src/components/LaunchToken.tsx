import { useState } from 'react'
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContract } from 'wagmi'
import { decodeEventLog } from 'viem'
import { LAUNCH_FACTORY_ADDRESS, robinhoodTestnet } from '../lib/wagmi'
import { isUserRejected, parseContractError } from '../lib/utils'
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
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [isOpen, setIsOpen] = useState(false)

  const [form, setForm] = useState({ name: '', symbol: 'TEST', description: '', logo: '' })
  const [txStatus, setTxStatus] = useState<TxStatus>({ type: 'idle' })
  const [launched, setLaunched] = useState<{ token: `0x${string}`; curve: `0x${string}` } | null>(null)

  const isWrongNetwork = isConnected && chainId !== robinhoodTestnet.id

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

  const logoInvalid = form.logo.trim() !== '' && !/^https?:\/\//i.test(form.logo.trim())
  const isIdle = txStatus.type === 'idle'
  const canSubmit =
    isConnected &&
    !isWrongNetwork &&
    launchFee !== undefined &&
    form.name.trim() !== '' &&
    form.symbol.trim() !== '' &&
    !logoInvalid &&
    isIdle &&
    canLaunch !== false

  const handleLaunch = async () => {
    if (!canSubmit || !walletClient || !address || !publicClient || launchFee === undefined) return

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
            name: form.name.trim(),
            symbol: form.symbol.trim().toUpperCase(),
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

      // Ambil alamat token & curve dari event TokenLaunched.
      let tokenAddr: `0x${string}` | null = null
      let curveAddr: `0x${string}` | null = null
      for (const log of receipt.logs) {
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
          // log dari kontrak lain — abaikan
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
        🚀 Launch Token
      </button>
    )
  }

  return (
    <div className="launch-modal-overlay" onClick={() => isIdle && resetModal()}>
      <div className="launch-modal" onClick={e => e.stopPropagation()}>
        <div className="launch-modal__header">
          <h2>🚀 Launch Token Baru</h2>
          <button className="btn-close" onClick={resetModal} aria-label="Tutup" disabled={!isIdle}>
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
            disabled={!isIdle}
          />
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
            disabled={!isIdle}
          />
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
            disabled={!isIdle}
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
            disabled={!isIdle}
          />
          {logoInvalid && <span className="field-error">URL harus diawali http:// atau https://</span>}
        </div>

        {launchFee !== undefined && (
          <div className="estimated-out">
            <span className="label">Biaya Launch</span>
            <span className="value">{(Number(launchFee) / 1e18).toFixed(6)} ETH</span>
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
          onReset={resetModal}
          resetLabel="Selesai"
        />

        {(txStatus.type === 'idle' || txStatus.type === 'signing') && (
          <button
            id="btn-launch-token"
            className="btn btn-primary btn-buy"
            onClick={handleLaunch}
            disabled={!canSubmit}
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
    </div>
  )
}
