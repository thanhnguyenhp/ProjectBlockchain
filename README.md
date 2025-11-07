# Quản lý giấy tờ cá nhân (CMND, hộ chiếu) — React + Node + IPFS + Ethereum (Hardhat)
## Chạy miễn phí
1) IPFS local (Kubo): `ipfs init && ipfs daemon` (API http://127.0.0.1:5001)
2) Hardhat node + deploy:
   ```
   cd chain
   npm i
   npm run node    # để nguyên
   ##
   cd chain
   npx hardhat compile
   npx hardhat run scripts/deploy.js --network localhost
   ```
   Ghi lại địa chỉ DocumentRegistry.
3) Server:
   ```
   cd server
   cp .env.example .env
   npm i
   npm start
   ```
4) Client:
   ```
   cd client
   npm i
   npm run dev
   ```
Dùng MetaMask (mạng 31337), chọn file → mã hoá → upload IPFS → ghi on-chain. Lưu **khóa giải mã** hiển thị sau khi upload.
