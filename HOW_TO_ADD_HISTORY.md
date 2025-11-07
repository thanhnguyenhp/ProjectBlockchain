
# Thêm mục **Lịch sử giao dịch** vào dự án

Đã tạo sẵn 2 file trong `client/src/`:
- `TxHistory.jsx` — component lấy event on-chain và hiển thị lịch sử
- `App.with-history.jsx` — ví dụ cách import & render component

## Cách tích hợp vào App.jsx hiện tại

1. Mở `client/src/App.jsx`
2. Ở đầu file, thêm:
   ```js
   import TxHistory from "./TxHistory.jsx";
   ```
3. Ở phần JSX (ví dụ sau “Tài liệu của tôi”), thêm:
   ```jsx
   <TxHistory web3={web3} contract={contract} account={account} />
   ```
   (Component cần 3 prop có sẵn trong App: `web3`, `contract`, `account`)

4. Chạy lại client:
   ```bash
   cd client
   npm run dev
   ```

## Ghi chú
- Component đọc event `DocumentAdded` và `DocumentRevoked` bằng `contract.getPastEvents(...)`.
- Tự lấy `timestamp` từ `web3.eth.getBlock(blockNumber)` -> hiển thị ngày giờ.
- Có nút **Làm mới** để load lại lịch sử.
- Đã xử lý chuỗi dài (CID/Tx) bằng `wordBreak`/`overflowWrap` để không tràn bố cục.

Nếu cần bản nâng cao (lưu lịch sử lên server để không mất khi Hardhat reset), hãy nói “làm bản server”.
