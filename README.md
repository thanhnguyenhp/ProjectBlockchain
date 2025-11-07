# Quản lý giấy tờ cá nhân (CMND, hộ chiếu) — React + Node + IPFS + Ethereum (Hardhat)
## Chạy miễn phí
1) IPFS local (Kubo): `ipfs init && ipfs daemon` (API http://127.0.0.1:5001)
2) Hardhat node + deploy:
   ```
   cd chain
   npm i
   npm run node    # để nguyên
   ##
   npm run compile
   npm run deploy:localhost
   ```
   Ghi lại địa chỉ DocumentRegistry.
3) Server:
   ```
   cd ../server
   cp .env.example .env
   npm i
   npm start
   ```
4) Client:
   ```
   cd ../client
   cp src/config.example.js src/config.js
   # dán REGISTRY_ADDRESS
   npm i
   npm run dev
   ```
5) Cần phải có IPFS, MetaMark
6) 
<img width="1270" height="883" alt="image" src="https://github.com/user-attachments/assets/18e307b7-e0f3-4406-85c0-36d1fea74a06" />

