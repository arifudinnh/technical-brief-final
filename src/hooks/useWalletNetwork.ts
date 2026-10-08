import { useAccount, useSwitchChain } from 'wagmi'
import { numberToHex } from 'viem'
import { EXPLORER_URL, RPC_URL, robinhoodTestnet } from '../lib/wagmi'
import { isUserRejected } from '../lib/utils'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getInjectedProvider(): Eip1193Provider | undefined {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum
}

/**
 * Status network wallet + aksi pindah ke Robinhood Chain Testnet.
 *
 * `chainId` diambil dari koneksi wallet (`useAccount` → `getConnection`),
 * bukan dari config wagmi. Config hanya punya satu chain sehingga
 * `useChainId()` selalu mengembalikan 46630 dan tidak pernah mendeteksi
 * wallet yang berada di network lain.
 */
export function useWalletNetwork() {
  const { isConnected, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const isWrongNetwork = isConnected && chainId !== undefined && chainId !== robinhoodTestnet.id

  /** Pindah ke Robinhood Testnet; kalau wallet belum mengenal chain-nya, daftarkan dulu. */
  const switchToRobinhood = async () => {
    try {
      await switchChainAsync({ chainId: robinhoodTestnet.id })
    } catch (err) {
      if (isUserRejected(err)) return
      // Wallet tidak mengenal chain ini (bukan penolakan user) → tambahkan manual.
      try {
        await getInjectedProvider()?.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: numberToHex(robinhoodTestnet.id),
              chainName: robinhoodTestnet.name,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER_URL],
            },
          ],
        })
      } catch (addErr) {
        console.error('Gagal menambahkan jaringan ke wallet:', addErr)
      }
    }
  }

  return { isWrongNetwork, switchToRobinhood, walletChainId: chainId }
}
