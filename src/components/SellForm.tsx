import { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient, useReadContract } from 'wagmi'
import { decodeEventLog, formatEther, parseUnits } from 'viem'
import type { TokenInfo } from '../hooks/useTokenList'
import {
  applySlippage,
  calcSellQuoteOut,
  formatAmount,
  formatQuote,
  isUserRejected,
  parseContractError,
} from '../lib/utils'
import { useWalletNetwork } from '../hooks/useWalletNetwork'
import bondingCurveAbi from '../abi/BondingCurve'
import launcherTokenAbi from '../abi/LauncherToken'
import TxStatusView, { type TxStatus } from './TxStatusView'

interface SellFormProps {
  token: TokenInfo
  onSuccess: (tokenAddress: `0x${string}`) => void
}

const SLIPPAGE_OPTIONS = [0.5, 1, 2, 5]
const PERCENT_OPTIONS = [25, 50, 75, 100] as const

/** Alasan tombol jual dinonaktifkan ("" = boleh jual). */
function sellDisableReason(
  token: TokenInfo,
  isConnected: boolean,
  isWrongNetwork: boolean,
  amount: bigint,
  balance: bigint | undefined,
  quoteReserve: bigint
): string {
  if (!isConnected) return 'Connect wallet dulu'
  if (isWrongNetwork) return 'Switch ke Robinhood Testnet'
  if (!token.isEthPaired) return 'Token non-ETH belum didukung untuk dijual'
  if (token.phase !== 0) {
    if (token.phase === 1) return 'Token sudah mencapai threshold — penjualan menunggu graduation pool'
    if (token.phase === 2) return 'Token sudah graduate — jual di DEX terkait'
    return 'Token dibatalkan (cancelled)'
  }
  if (amount === 0n) return 'Masukkan jumlah token'
  if (balance === undefined || amount > balance) return 'Saldo token tidak cukup'
  if (quoteReserve === 0n || token.tokenReserve === 0n) return 'Likuiditas bonding curve tidak tersedia'
  return ''
}

export default function SellForm({ token, onSuccess }: SellFormProps) {
  const { address, isConnected } = useAccount()
  const { isWrongNetwork } = useWalletNetwork()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: token.address,
    abi: launcherTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token.address,
    abi: launcherTokenAbi,
    functionName: 'allowance',
    args: address ? [address, token.curveAddress] : undefined,
    query: { enabled: !!address },
  })

  const [amountInput, setAmountInput] = useState('')
  const [slippageBps, setSlippageBps] = useState(100) // 1%
  const [customSlippage, setCustomSlippage] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>({ type: 'idle' })
  const [pendingAction, setPendingAction] = useState<'approve' | 'sell'>('sell')
  const [approvedHint, setApprovedHint] = useState(false)
  const [soldEth, setSoldEth] = useState<bigint | null>(null)

  const balance = tokenBalance as bigint | undefined

  // Parse jumlah token (maksimal 18 desimal).
  let parsedAmount = 0n
  let parseError = ''
  if (amountInput) {
    const decimalPart = amountInput.split('.')[1]
    if (decimalPart && decimalPart.length > 18) {
      parseError = 'Maksimal 18 desimal'
    } else {
      try {
        parsedAmount = parseUnits(amountInput, 18)
      } catch {
        parseError = 'Jumlah token tidak valid'
      }
    }
  }

  // Estimasi ETH keluar (konservatif) + batas minimum setelah slippage.
  const estimatedQuote = calcSellQuoteOut(
    parsedAmount,
    token.quoteReserve,
    token.tokenReserve,
    token.feeBps,
    token.creatorTaxBps
  )
  const minQuoteOut = estimatedQuote > 0n ? applySlippage(estimatedQuote, slippageBps) : 0n

  const needsApproval = parsedAmount > 0n && (allowance === undefined || parsedAmount > (allowance as bigint))
  const disableReason = sellDisableReason(token, isConnected, isWrongNetwork, parsedAmount, balance, token.quoteReserve)
  /** Terkunci saat transaksi berjalan / menampilkan hasil sukses. */
  const isLocked =
    txStatus.type === 'signing' || txStatus.type === 'pending' || txStatus.type === 'success'
  /** Form bisa dipakai saat idle atau setelah error. */
  const isUsable = txStatus.type === 'idle' || txStatus.type === 'error'
  const canAct = !isLocked && disableReason === '' && !!walletClient && !!address && !!publicClient

  const setPercent = (pct: number) => {
    if (!balance) return
    setAmountInput(formatEther((balance * BigInt(pct)) / 100n))
    setApprovedHint(false)
  }

  const resetForm = () => {
    setTxStatus({ type: 'idle' })
    setAmountInput('')
    setSoldEth(null)
    setApprovedHint(false)
  }

  const handleApprove = async () => {
    if (!canAct || !walletClient || !address || !publicClient) return
    setPendingAction('approve')
    setTxStatus({ type: 'signing' })
    try {
      const hash = await walletClient.writeContract({
        address: token.address,
        abi: launcherTokenAbi,
        functionName: 'approve',
        args: [token.curveAddress, parsedAmount],
      })
      setTxStatus({ type: 'pending', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        setTxStatus({ type: 'error', message: 'Approve gagal di jaringan (reverted). Silakan coba lagi.' })
        return
      }
      await refetchAllowance()
      setTxStatus({ type: 'idle' })
      setApprovedHint(true)
    } catch (e) {
      setTxStatus({ type: 'error', message: parseContractError(e), rejected: isUserRejected(e) })
    }
  }

  const handleSell = async () => {
    if (!canAct || needsApproval || !walletClient || !address || !publicClient) return
    setPendingAction('sell')
    setTxStatus({ type: 'signing' })
    try {
      const hash = await walletClient.writeContract({
        address: token.curveAddress,
        abi: bondingCurveAbi,
        functionName: 'sell',
        args: [parsedAmount, minQuoteOut, address],
      })
      setTxStatus({ type: 'pending', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      // Transaksi masuk blok tapi di-revert → tampilkan sebagai gagal.
      if (receipt.status === 'reverted') {
        setTxStatus({
          type: 'error',
          message: 'Penjualan gagal di jaringan (reverted). Harga mungkin sudah berubah — silakan coba lagi.',
        })
        return
      }

      // Ambil jumlah quote sesungguhnya dari event CurveSell di curve ini.
      let quoteOut = estimatedQuote
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== token.curveAddress.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({
            abi: bondingCurveAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'CurveSell') quoteOut = decoded.args.quoteOut
        } catch {
          // event lain dari kontrak yang sama — abaikan
        }
      }

      setTxStatus({ type: 'success', hash })
      setSoldEth(quoteOut)
      setAmountInput('')
      setApprovedHint(false)

      await Promise.all([refetchTokenBalance(), refetchAllowance()])
      onSuccess(token.address)
    } catch (e) {
      setTxStatus({ type: 'error', message: parseContractError(e), rejected: isUserRejected(e) })
    }
  }

  const handleAction = () => (needsApproval ? handleApprove() : handleSell())

  return (
    <div className="buy-form">
      <div className="token-balance-row">
        <span className="label">Saldo {token.symbol}</span>
        <span className="value">
          {balance !== undefined ? formatAmount(balance) : '0'} {token.symbol}
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="token-input" className="form-label">Jumlah Token</label>
        <div className="input-wrapper">
          <input
            id="token-input"
            type="number"
            className="form-input"
            placeholder="1000"
            value={amountInput}
            onChange={e => {
              setAmountInput(e.target.value)
              setApprovedHint(false)
            }}
            min="0"
            step="any"
            disabled={isLocked}
          />
          <span className="input-suffix">{token.symbol}</span>
        </div>
        <div className="percent-options">
          {PERCENT_OPTIONS.map(pct => (
            <button
              key={pct}
              className="slippage-btn"
              onClick={() => setPercent(pct)}
              disabled={isLocked || !balance}
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>
        {parseError && <span className="field-error">{parseError}</span>}
      </div>

      <div className="estimated-out">
        <span className="label">Perkiraan {token.pairSymbol} diterima</span>
        <span className="value">
          {estimatedQuote > 0n ? formatQuote(estimatedQuote, token.pairDecimals, 6) : '0'} {token.pairSymbol}
        </span>
        <span className="estimated-out__sub">
          min. {minQuoteOut > 0n ? formatQuote(minQuoteOut, token.pairDecimals, 6) : '0'} {token.pairSymbol}{' '}
          (slippage {slippageBps / 100}%)
        </span>
      </div>

      <div className="form-group">
        <label className="form-label">Toleransi Slippage</label>
        <div className="slippage-options">
          {SLIPPAGE_OPTIONS.map(opt => (
            <button
              key={opt}
              className={`slippage-btn ${slippageBps === opt * 100 ? 'slippage-btn--active' : ''}`}
              onClick={() => {
                setSlippageBps(opt * 100)
                setCustomSlippage('')
              }}
              disabled={isLocked}
            >
              {opt}%
            </button>
          ))}
          <div className="slippage-custom">
            <input
              type="number"
              className="slippage-input"
              placeholder="Custom"
              value={customSlippage}
              onChange={e => {
                setCustomSlippage(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v > 0 && v <= 50) setSlippageBps(Math.round(v * 100))
              }}
              min="0.1"
              max="50"
              step="0.1"
              disabled={isLocked}
            />
            <span className="input-suffix">%</span>
          </div>
        </div>
      </div>

      {approvedHint && txStatus.type === 'idle' && !needsApproval && (
        <div className="tx-status tx-status--success" role="status">
          <span className="icon">✅</span>
          <div className="tx-status__body">Approve berhasil — klik tombol di bawah untuk menjual.</div>
        </div>
      )}

      <TxStatusView
        status={txStatus}
        pendingLabel={
          pendingAction === 'approve'
            ? 'Menunggu approve token di wallet…'
            : 'Transaksi terkirim, menunggu konfirmasi blok…'
        }
        successTitle="Penjualan berhasil!"
        successDetail={
          txStatus.type === 'success' && soldEth !== null ? (
            <div>
              Kamu menerima{' '}
              <strong>{formatQuote(soldEth, token.pairDecimals, 6)}</strong> {token.pairSymbol}
            </div>
          ) : null
        }
        onReset={txStatus.type === 'success' ? resetForm : undefined}
        resetLabel="Jual Lagi"
      />

      {(isUsable || txStatus.type === 'signing') && (
        <button
          id="btn-sell"
          className={`btn btn-buy ${needsApproval ? 'btn-approve' : 'btn-primary'}`}
          onClick={handleAction}
          disabled={!canAct}
          title={disableReason}
        >
          {txStatus.type === 'signing' ? (
            <>
              <span className="spinner" /> {pendingAction === 'approve' ? 'Memproses approve…' : 'Memproses…'}
            </>
          ) : needsApproval ? (
            `Approve ${token.symbol}`
          ) : (
            `Jual ${token.symbol}`
          )}
        </button>
      )}

      {disableReason && isUsable && <p className="disable-hint">{disableReason}</p>}
      {needsApproval && !disableReason && isUsable && (
        <p className="disable-hint">
          Contract butuh approve {token.symbol} sebelum dijual (sekali saja per jumlah).
        </p>
      )}
    </div>
  )
}
