import { useMemo, useState, useEffect } from "react";
import Web3 from "web3";
import axios from "axios";
import { registryAbi } from "./registryAbi";
import { REGISTRY_ADDRESS, API_BASE, CHAIN_ID } from "./config.js";

const DocType = { CMND: 0, PASSPORT: 1, OTHER: 2 };

async function sha256Hex(buf){
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function encryptFile(file){
  const raw = await file.arrayBuffer();
  const key = await crypto.subtle.generateKey({name:"AES-GCM", length:256}, true, ["encrypt","decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, raw);
  const keyRaw = await crypto.subtle.exportKey("raw", key);
  const keyB64 = u8ToB64(new Uint8Array(keyRaw));
  const ivB64 = u8ToB64(iv);
  const hashHex = await sha256Hex(cipher);
  const payload = JSON.stringify({
  iv: ivB64,
  data: u8ToB64(new Uint8Array(cipher)), });
  return { payload, keyB64, hashHex };
}
function u8ToB64(u8) {
  let bin = "";
  const CHUNK = 0x8000; // 32,768
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function hexToBytes32(hex){
  if (hex.startsWith("0x")) hex = hex.slice(2);
  return "0x" + hex.padStart(64,"0");
}

export default function App(){
  const [account, setAccount] = useState(null);
  const [docType, setDocType] = useState(DocType.CMND);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [myDocs, setMyDocs] = useState([]);

  const web3 = useMemo(()=> window.ethereum ? new Web3(window.ethereum) : null, []);
  const contract = useMemo(()=> web3 ? new web3.eth.Contract(registryAbi, REGISTRY_ADDRESS) : null, [web3]);

  const connect = async () => {
    if(!window.ethereum) return alert("Cài MetaMask");
    const accs = await window.ethereum.request({method:"eth_requestAccounts"});
    setAccount(accs[0]);
    const chain = parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
    if(chain !== CHAIN_ID) alert("Chọn mạng Hardhat Local (31337)");
  };

  const uploadAndRegister = async () => {
    if(!file) return alert("Chọn file CMND/hộ chiếu");
    if(!contract || !account) return alert("Kết nối ví trước");

    setStatus("Mã hoá...");
    const { payload, keyB64, hashHex } = await encryptFile(file);

    setStatus("Upload IPFS qua server...");
    const form = new FormData();
    form.append("file", new Blob([payload], { type: "application/json" }), file.name + ".cipher.json");
    const up = await axios.post(`${API_BASE}/ipfs/add`, form);
    const cid = up.data.cid;

    setStatus("Ghi on-chain...");
    const tx = await contract.methods.addDocument(docType, cid, hexToBytes32(hashHex)).send({ from: account });

    setStatus(`Hoàn tất! CID: ${cid}. KHÓA GIẢI MÃ (lưu ngay): ${keyB64}`);
    alert(`Lưu khóa bí mật để giải mã file sau này:\n${keyB64}`);
  };

  const refreshList = async ()=>{
    if(!contract || !account) return;
    const ids = await contract.methods.listIds(account).call();
    const rows = await Promise.all(ids.map(async(id)=>{
      const d = await contract.methods.get(id).call();
      return { id, ...d, docType: Number(d.docType) };
    }));
    setMyDocs(rows);
  };

  const revoke = async (id)=>{
    await contract.methods.revoke(id).send({ from: account });
    await refreshList();
  };

  const revokeAll = async () => {
    if (!myDocs.length) return;
    if (!window.confirm("Bạn có chắc muốn vô hiệu toàn bộ tài liệu?")) return;
    for (const d of myDocs) {
      if (d.active) {
        await contract.methods.revoke(d.id).send({ from: account });
      }
    }
    await refreshList();
  };

  const downloadAndDecrypt = async (cid)=>{
    const keyB64 = prompt("Dán khóa giải mã (đã lưu khi upload):");
    if(!keyB64) return;
    const keyRaw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyRaw, {name:"AES-GCM"}, true, ["decrypt"]);
    const { data } = await axios.get(`${API_BASE}/ipfs/cat/${cid}`);
    const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
    const cipher = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, cipher);
    const blob = new Blob([plain], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "decrypted.bin"; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (account) refreshList();
    // eslint-disable-next-line
  }, [account]);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "32px auto",
        fontFamily: "Segoe UI, system-ui, sans-serif",
        background: "#f8fafc",
        borderRadius: 16,
        boxShadow: "0 4px 24px #0001",
        padding: 32,
      }}
    >
      <h1 style={{ color: "#2563eb", fontWeight: 700, letterSpacing: 1 }}>
        Quản lý giấy tờ{" "}
        <span style={{ fontWeight: 400, color: "#64748b" }}>(CMND/Hộ chiếu)</span>
        <span style={{ fontSize: 18, color: "#94a3b8" }}> — IPFS + Ethereum</span>
      </h1>
      {account ? (
        <p style={{ color: "#059669", fontWeight: 500 }}>
          Đã kết nối: <b>{account}</b>
        </p>
      ) : (
        <button
          onClick={connect}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px #2563eb22",
          }}
        >
          Kết nối MetaMask
        </button>
      )}

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #e0e7ef",
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 2px 8px #0001",
        }}
      >
        <h2 style={{ color: "#0ea5e9", fontWeight: 600 }}>Tải lên & đăng ký</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
          <select
            value={docType}
            onChange={e => setDocType(Number(e.target.value))}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 15,
              background: "#f1f5f9",
            }}
          >
            <option value={0}>CMND</option>
            <option value={1}>Hộ chiếu</option>
            <option value={2}>Khác</option>
          </select>
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{
              padding: "8px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
            }}
          />
          <button
            onClick={uploadAndRegister}
            style={{
              background: "#0ea5e9",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            Mã hoá → IPFS → Ghi on-chain
          </button>
        </div>
        <p style={{ color: "#f59e42", marginTop: 8 }}>{status}</p>
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #e0e7ef",
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 2px 8px #0001",
        }}
      >
        <h2 style={{ color: "#0ea5e9", fontWeight: 600 }}>Tài liệu của tôi</h2>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            onClick={refreshList}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Làm mới danh sách
          </button>
          <button
            onClick={revokeAll}
            style={{
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 500,
              cursor: "pointer",
            }}
            disabled={!myDocs.some(d => d.active)}
          >
            Xóa toàn bộ
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {myDocs.map((d, i) => (
            <li
              key={i}
              style={{
                margin: "12px 0",
                padding: "14px 18px",
                borderRadius: 10,
                background: "#f1f5f9",
                boxShadow: "0 1px 4px #0001",
                border: d.active ? "2px solid #22c55e" : "2px solid #e5e7eb",
                transition: "border 0.2s",
              }}
            >
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                <code style={{ color: "#64748b" }}>{d.id}</code> — loại{" "}
                 <b>{(["CMND", "Hộ chiếu", "Khác"][Number(d.docType)] ?? "Khác")}</b>{" "}
                — CID{" "}
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${d.cid}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2563eb", textDecoration: "underline" }}
                >
                  {d.cid}
                </a>{" "}
                — trạng thái:{" "}
                <span style={{ color: d.active ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {d.active ? "Đang hoạt động" : "Đã vô hiệu"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  onClick={() => downloadAndDecrypt(d.cid)}
                  style={{
                    background: "#0ea5e9",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Tải & giải mã
                </button>
                {d.active && (
                  <button
                    onClick={() => revoke(d.id)}
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Vô hiệu
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
