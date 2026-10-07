# Launchpad Token — Robinhood Chain Testnet

Frontend untuk menampilkan dan membeli token dari bonding curve di Robinhood Chain Testnet.

## Demo

*(Screenshot akan ditambahkan setelah testing dengan MetaMask)*

> Jalankan app dan buka di browser, kemudian ambil screenshot secara manual.

---

## Cara Menjalankan

### Prasyarat
- Node.js ≥ 18
- npm ≥ 9
- MetaMask di Chrome/Chromium

### Langkah

```bash
# Clone dan masuk ke folder
git clone <repo-url>
cd technical-brief-final

# Install dependencies
npm install

# Jalankan dev server
npm run dev
```

Buka `http://localhost:5173` di browser.

### Network Configuration
Robinhood Chain Testnet akan otomatis ditambahkan ke MetaMask saat kamu menekan tombol "Switch ke Robinhood Testnet". Atau tambahkan secara manual:

- **Network Name:** Robinhood Chain Testnet
- **Chain ID:** 46630 (0xB656)
- **RPC URL:** https://robinhood-sepolia-rpc.publicnode.com
- **Currency:** ETH
- **Explorer:** https://explorer.testnet.chain.robinhood.com

---

## Fitur yang Sudah Diimplementasi

| Langkah | Fitur | Status |
|---------|-------|--------|
| 1 | Setup project + baca launchFee() | ✅ |
| 2 | Connect/disconnect wallet, tampilkan saldo ETH, switch network | ✅ |
| 3 | Fetch token dari event TokenLaunched (chunked 49.999 blok) | ✅ |
| 4 | Enrich data via Multicall3 (nama, simbol, logo, reserves, phase) | ✅ |
| 5 | Tampilkan daftar token dengan card, progress bar, status phase | ✅ |
| 6 | Form beli dengan estimasi output, slippage, dan validasi | ✅ |
| 7 | Kirim transaksi buy(), tampilkan semua status | ✅ |
| 8 | Update data setelah transaksi berhasil tanpa reload | ✅ |
| 9 | README dan dokumentasi | ✅ |
| Bonus | Launch token baru (form launchToken) | ✅ |

---

## Keputusan Teknis

### Stack
- **React + Vite + TypeScript** — setup cepat, DX baik, sudah familiar
- **wagmi v2 + viem** — library Web3 standar industri, type-safe, composable
- **@tanstack/react-query** — diperlukan oleh wagmi untuk cache dan refetch

### Chunked Event Fetching (Langkah 3)
RPC membatasi `eth_getLogs` pada 50.000 blok per request. Implementasi:
- Mulai dari blok deploy factory (`129157568`)
- Ambil `BLOCK_CHUNK_SIZE = 49.999` blok per request
- Loop sampai `latestBlock`
- Saat ini butuh ~7 request (chain sudah ~350k blok melewati deploy)
- Polling otomatis setiap 30 detik untuk token baru

### Multicall3 (Langkah 4)
Semua data token diambil dalam satu batch lewat `Multicall3.aggregate3()` dengan `allowFailure: true`. Ini mengurangi jumlah RPC request dari `9 × N` menjadi `1` untuk N token.

Struktur: **9 call per token**:
1. `token.name()`
2. `token.symbol()`
3. `token.logo()`
4. `curve.getReserves()`
5. `curve.realQuoteReserve()`
6. `curve.graduationThreshold()`
7. `curve.feeBps()`
8. `curve.creatorTaxBps()`
9. `factory.getLaunchedToken(token)` → `.phase`

### Kalkulasi Harga dan Estimasi
Semua kalkulasi menggunakan **`bigint`** untuk menghindari floating point error:

```
price = quoteReserve × 10^18 / tokenReserve   (wei per token)
```

Format harga kecil: jika ada banyak leading zero, pakai notasi subscript (`0.0₅1234`).

```
fee = quoteIn × feeBps / 10000
creatorTax = quoteIn × creatorTaxBps / 10000
net = quoteIn - fee - creatorTax
tokensOut = net × tokenReserve / (quoteReserve + net)
minTokensOut = tokensOut × (10000 - slippageBps) / 10000
```

### Progress Graduation
Dihitung dalam basis poin untuk presisi bigint:
```
progressBps = realQuoteReserve × 10000 / graduationThreshold
```
Dikap di 100%.

### Token Non-ETH
Token dengan `pairToken != address(0)` ditampilkan dengan badge "Non-ETH". Fitur beli untuk token non-ETH tidak diimplementasi (saat ini semua token contoh menggunakan ETH).

### Error Handling
Contract errors yang diterjemahkan:
- `SlippageExceeded` → "Harga bergerak terlalu jauh..."
- `CurveGraduated` → "Token sudah graduate..."
- User rejection (kode 4001) → "Transaksi ditolak di wallet"
- Insufficient funds → "Saldo ETH tidak cukup"

---

## Yang Belum Selesai / Keterbatasan

1. **Sell:** belum diimplementasi (bonus B)
2. **Halaman detail token:** belum ada (bonus C)
3. **Riwayat transaksi:** belum ada (dari event CurveBuy/CurveSell)
4. **Token Non-ETH:** ditampilkan tapi tidak bisa dibeli
5. **Graduation di phase 1:** tombol `createGraduatedPool` belum ada (bonus D)

---

## Bagian yang Dibantu AI

- Kerangka awal komponen React (App.tsx, TokenCard, BuyForm, WalletButton)
- Struktur useTokenList hook dengan Multicall3
- CSS styling dan design system (dengan arahan spesifik tentang warna dan layout)
- Template README ini

Semua logika Web3 (kalkulasi bigint, chunked fetching, multicall encoding/decoding, tx flow) ditulis dan diverifikasi secara manual.

---

## Masalah yang Ditemukan

1. **RPC `eth_getLogs` limit:** Tidak didokumentasikan langsung di header; harus di-test manual. Sudah diantisipasi dengan chunk size 49.999.
2. **ABI tidak lengkap di transcript:** Folder `abi/` hilang saat `create-vite --overwrite` dijalankan. ABI direkonstruksi dari data yang sudah dibaca + referensi sourcify (gagal fetch, direkonstruksi dari memory).
3. **`pairToken` dan token non-ETH:** Brief tidak menjelaskan cara beli token non-ETH secara detail. Keputusan: tampilkan dengan badge, nonaktifkan form beli.

---

## Struktur Project

```
src/
├── abi/
│   ├── BondingCurve.json
│   ├── LaunchFactory.json
│   └── LauncherToken.json
├── components/
│   ├── BuyForm.tsx        — Form beli token
│   ├── LaunchToken.tsx    — Form launch token baru (bonus)
│   ├── TokenCard.tsx      — Kartu token di daftar
│   └── WalletButton.tsx   — Connect/disconnect/switch network
├── hooks/
│   └── useTokenList.ts    — Fetch + enrich token list
├── lib/
│   ├── utils.ts           — Kalkulasi, formatting, error parsing
│   └── wagmi.ts           — Config wagmi, chain definition, constants
├── App.tsx
├── index.css
└── main.tsx
```
