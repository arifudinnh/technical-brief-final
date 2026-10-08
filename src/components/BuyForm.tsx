import { useState } from 'react'
import { useAccount, useBalance, usePublicClient, useWalletClient, useReadContract } from 'wagmi'
import { parseEther, formatEther, decodeEventLog } from 'viem'
import type { TokenInfo } from '../hooks/useTokenList'
import { calcTokensOut, applySlippage, formatAmount, formatEth, isUserRejected, parseContractError } from '../lib/utils'
import { useWalletNetwork } from '../hooks/useWalletNetwork'
import bondingCurveAbi from '../abi/BondingCurve'
import launcherTokenAbi from '../abi/LauncherToken'
import TxStatusView, { type TxStatus } from './TxStatusView'

interface BuyFormProps {
  token: TokenInfo
  onSuccess: (tokenAddress: `0x${string}`) => void
}

const SLIPPAGE_OPTIONS = [0.5, 1, 2, 5]
/** Buffer gas supaya tombol MAX tidak membuat transaksi gagal (insufficient funds). */
const GAS_BUFFER_WEI = 500_000_000_000_000n // 0.0005 ETH

export default function BuyForm({ token, onSuccess }: BuyFormProps) {
  const { address, isConnected } = useAccount()
  const { isWrongNetwork } = useWalletNetwork()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    query: { enabled: !!address },
  })

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: token.address,
    abi: launcherTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const [ethInput, setEthInput] = useState('')
  const [slippageBps, setSlippageBps] = useState(100) // 1%
  const [customSlippage, setCustomSlippage] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus>({ type: 'idle' })
  const [boughtTokens, setBoughtTokens] = useState<bigint | null>(null)

  const isPhase0 = token.phase === 0
  const isEthPaired = token.isEthPaired

  // Hitung estimasi keluaran (semua bigint, tanpa floating point).
  let estimatedOut = 0n
  let parseError = ''
  let parsedEth = 0n

  if (ethInput) {
    const decimalPart = ethInput.split('.')[1]
    if (decimalPart && decimalPart.length > 18) {
      parseError = 'Maksimal 18 desimal'
    } else {
      try {
        parsedEth = parseEther(ethInput)
        estimatedOut = calcTokensOut(
          parsedEth,
          token.quoteReserve,
          token.tokenReserve,
          token.feeBps,
          token.creatorTaxBps
        )
      } catch {
        parseError = 'Jumlah ETH tidak valid'
      }
    }
  }

  const minTokensOut = estimatedOut > 0n ? applySlippage(estimatedOut, slippageBps) : 0n

  const hasSufficientBalance = parsedEth > 0n && ethBalance ? parsedEth <= ethBalance.value : false
  /** Terkunci saat transaksi berjalan / menampilkan hasil sukses. */
  const isLocked =
    txStatus.type === 'signing' || txStatus.type === 'pending' || txStatus.type === 'success'
  /** Form bisa dipakai saat idle atau setelah error (pesan error tampil singkat). */
  const isUsable = txStatus.type === 'idle' || txStatus.type === 'error'
  const noLiquidity = token.tokenReserve === 0n || token.quoteReserve === 0n

  const canBuy =
    isConnected && !isWrongNetwork && isPhase0 && isEthPaired && !noLiquidity &&
    parsedEth > 0n && estimatedOut > 0n && !parseError && hasSufficientBalance

  const disableReason = !isConnected
    ? 'Connect wallet dulu'
    : isWrongNetwork
    ? 'Switch ke Robinhood Testnet'
    : !isEthPaired
    ? 'Token non-ETH belum didukung untuk dibeli'
    : !isPhase0
    ? 'Token tidak bisa dibeli (bukan phase aktif)'
    : noLiquidity
    ? 'Likuiditas bonding curve tidak tersedia'
    : !ethInput || parsedEth === 0n
    ? 'Masukkan jumlah ETH'
    : parseError
    ? parseError
    : estimatedOut === 0n
    ? 'Jumlah ETH terlalu kecil untuk mendapat token'
    : !hasSufficientBalance
    ? 'Saldo ETH tidak cukup'
    : ''

  const handleBuy = async () => {
    if (!canBuy || !walletClient || !address || !publicClient) return

    setTxStatus({ type: 'signing' })

    try {
      const hash = await walletClient.writeContract({
        address: token.curveAddress,
        abi: bondingCurveAbi,
        functionName: 'buy',
        args: [parsedEth, minTokensOut, address],
        value: parsedEth,
      })

      setTxStatus({ type: 'pending', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      // Transaksi sudah masuk blok tapi di-revert → tampilkan sebagai gagal.
      if (receipt.status === 'reverted') {
        setTxStatus({
          type: 'error',
          message:
            'Transaksi gagal di jaringan (reverted). Harga mungkin sudah berubah — silakan coba lagi.',
        })
        return
      }

      // Ambil jumlah token sesungguhnya dari event CurveBuy di kontrak curve ini.
      let tokensOut = estimatedOut
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== token.curveAddress.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({
            abi: bondingCurveAbi,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'CurveBuy') tokensOut = decoded.args.tokensOut
        } catch {
          // event lain dari kontrak yang sama — abaikan
        }
      }

      setTxStatus({ type: 'success', hash })
      setBoughtTokens(tokensOut)
      setEthInput('')

      await Promise.all([refetchEthBalance(), refetchTokenBalance()])
      onSuccess(token.address)
    } catch (e) {
      setTxStatus({ type: 'error', message: parseContractError(e), rejected: isUserRejected(e) })
    }
  }

  const resetForm = () => {
    setTxStatus({ type: 'idle' })
    setEthInput('')
    setBoughtTokens(null)
  }

  const handleMax = () => {
    if (!ethBalance) return
    const spendable = ethBalance.value > GAS_BUFFER_WEI ? ethBalance.value - GAS_BUFFER_WEI : 0n
    setEthInput(formatEther(spendable))
  }

  return (
    <div className="buy-form">
      <div className="token-balance-row">
        <span className="label">Saldo {token.symbol}</span>
        <span className="value">
          {tokenBalance !== undefined ? formatAmount(tokenBalance as bigint) : '0'} {token.symbol}
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="eth-input" className="form-label">Jumlah ETH</label>
        <div className="input-wrapper">
          <input
            id="eth-input"
            type="number"
            className="form-input"
            placeholder="0.01"
            value={ethInput}
            onChange={e => setEthInput(e.target.value)}
            min="0"
            step="0.001"
            disabled={isLocked}
          />
          <span className="input-suffix">ETH</span>
        </div>
        {address && ethBalance && (
          <div className="balance-hint">
            <span>Saldo: {formatEth(ethBalance.value)} ETH</span>
            <button className="btn-max" onClick={handleMax} disabled={isLocked}>
              MAX
            </button>
          </div>
        )}
        {parseError && <span className="field-error">{parseError}</span>}
      </div>

      <div className="estimated-out">
        <span className="label">Perkiraan token didapat</span>
        <span className="value">
          {estimatedOut > 0n ? formatAmount(estimatedOut) : '0'} {token.symbol}
        </span>
      </div>

      <div className="form-group">
        <label className="form-label">Toleransi Slippage</label>
        <div className="slippage-options">
          {SLIPPAGE_OPTIONS.map(opt => (
            <button
              key={opt}
              id={`slippage-${opt}`}
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
              id="slippage-custom"
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
        <div className="slippage-detail">
          minTokensOut: {minTokensOut > 0n ? formatAmount(minTokensOut) : '0'} {token.symbol}
        </div>
      </div>

      <TxStatusView
        status={txStatus}
        pendingLabel="Transaksi dikirim, menunggu konfirmasi blok…"
        successTitle="Pembelian berhasil!"
        successDetail={
          txStatus.type === 'success' && boughtTokens !== null ? (
            <div>
              Kamu menerima <strong>{formatAmount(boughtTokens)}</strong> {token.symbol}
            </div>
          ) : null
        }
        onReset={txStatus.type === 'success' ? resetForm : undefined}
        resetLabel="Beli Lagi"
      />

      {(isUsable || txStatus.type === 'signing') && (
        <button
          id="btn-buy"
          className="btn btn-primary btn-buy"
          onClick={handleBuy}
          disabled={!canBuy || isLocked}
          title={disableReason}
        >
          {txStatus.type === 'signing' ? (
            <>
              <span className="spinner" /> Konfirmasi di wallet
            </>
          ) : (
            `Beli ${token.symbol}`
          )}
        </button>
      )}

      {disableReason && isUsable && <p className="disable-hint">{disableReason}</p>}
    </div>
  )
}
