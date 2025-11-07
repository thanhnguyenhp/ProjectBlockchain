
import { useMemo, useState, useEffect, useRef } from "react";
import Web3 from "web3";
import axios from "axios";
import { registryAbi } from "./registryAbi";
import { REGISTRY_ADDRESS, API_BASE, CHAIN_ID } from "./config.js";
import TxActivity from "./TxActivity.jsx";
/** ===== UI Helpers ===== */
function cls(...xs){ return xs.filter(Boolean).join(" "); }
const chip = (label) => (
  <span style={{padding:"2px 8px", borderRadius:999, background:"#064e3b", fontSize:12, fontWeight:600}}>{label}</span>
);

/** ===== Domain ===== */
const DocType = { CMND: 0, PASSPORT: 1, OTHER: 2 };
const DocTypeLabel = ["CMND","Hộ chiếu","Khác"];

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
  const keyB64 = btoa(Array.from(new Uint8Array(keyRaw)).map(c=>String.fromCharCode(c)).join(""));
  const payload = JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) });
  const hashHex = await sha256Hex(raw);
  return { payload, keyB64, hashHex };
}

async function decryptToBlob(payloadJson, keyB64, name){
  const payload = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson;
  const iv = new Uint8Array(payload.iv);
  const keyRaw = new Uint8Array(atob(keyB64).split("").map(c=>c.charCodeAt(0)));
  const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, new Uint8Array(payload.data));
  return new Blob([plain], {type: "application/octet-stream"});
}

function hexToBytes32(hex){
  hex = hex.replace(/^0x/,"");
  if (hex.length > 64) throw new Error("hash too long");
  return "0x" + hex.padStart(64,"0");
}

/** ===== App ===== */
export default function App(){
  const [account, setAccount] = useState(null);
  const [docType, setDocType] = useState(DocType.CMND);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState(null);
  const [lastKeyB64, setLastKeyB64] = useState("");
  const [lastCid, setLastCid] = useState("");
  const [myDocs, setMyDocs] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState(-1);
  const [onlyActive, setOnlyActive] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const statusRef = useRef(null);
  useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(null), 4000); return ()=>clearTimeout(t);} }, [toast]);

  // ensure web3 and contract are created when window.ethereum becomes available
  const [web3, setWeb3] = useState(() => (window.ethereum ? new Web3(window.ethereum) : null));
  const [contract, setContract] = useState(() => (web3 ? new web3.eth.Contract(registryAbi, REGISTRY_ADDRESS) : null));

  useEffect(() => {
    // create web3/contract if injected after initial render (e.g., MetaMask installed/connected)
    if (window.ethereum && !web3) {
      const w = new Web3(window.ethereum);
      setWeb3(w);
      setContract(new w.eth.Contract(registryAbi, REGISTRY_ADDRESS));
    }

    // handle account / chain changes
    const handleAccounts = (accounts) => {
      if (accounts && accounts.length) setAccount(accounts[0]);
      else setAccount(null);
    };
    const handleChain = (chainIdHex) => {
      try {
        const chain = parseInt(chainIdHex, 16);
        if (chain !== CHAIN_ID) {
          setToast({type:"warn", msg:"Hãy chọn mạng Hardhat Local (31337) trong MetaMask."});
        }
      } catch {}
    };
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccounts);
      window.ethereum.on("chainChanged", handleChain);
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccounts);
        window.ethereum.removeListener("chainChanged", handleChain);
      }
    };
  }, [web3]);

  const connect = async () => {
    if (!window.ethereum) return alert("Cài MetaMask trước");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(accounts[0]);
    const chain = parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
    if(chain !== CHAIN_ID) setToast({type:"warn", msg:"Chọn mạng Hardhat Local (31337)."});
  };

  const uploadAndRegister = async () => {
    if(!file) return setToast({type:"error", msg:"Chọn file CMND/hộ chiếu"});
    if(!contract || !account) return setToast({type:"error", msg:"Kết nối ví trước"});

    setStatus("Mã hoá...");
    const { payload, keyB64, hashHex } = await encryptFile(file);

    setStatus("Upload IPFS qua server...");
    const form = new FormData();
    form.append("file", new Blob([payload], { type: "application/json" }), file.name + ".cipher.json");
    const up = await axios.post(`${API_BASE}/ipfs/add`, form);

    const cid = up.data.cid;

    setStatus("Ghi on-chain...");
    await contract.methods.addDocument(docType, cid, hexToBytes32(hashHex)).send({ from: account });

    setStatus("");
    setToast({type:"success", msg:"Tải lên thành công! ĐÃ TẠO TÀI LIỆU."});
    setLastKeyB64(keyB64);
    setLastCid(cid);
    await refreshList();
    setFile(null);
  };

  function promptCopy(title, text){
    const ok = confirm(`${title}\n\n${text}\n\nBấm OK để sao chép vào clipboard.`);
    if(ok){
      navigator.clipboard.writeText(text).then(()=>{
        setToast({type:"success", msg:"Đã sao chép khoá giải mã."});
      }).catch(()=>{});
    }
  }

  const refreshList = async ()=>{
    if(!contract || !account) return;
    const ids = await contract.methods.listIds(account).call();
    const rows = await Promise.all(ids.map(async(id)=>{
      const d = await contract.methods.get(id).call();
      return { id, ...d, docType: Number(d.docType) };
    }));
    rows.sort((a,b)=> Number(b.createdAt) - Number(a.createdAt));
    setMyDocs(rows);
  };

  const downloadAndDecrypt = async (cid) => {
    const keyB64 = prompt("Nhập KHÓA GIẢI MÃ đã lưu khi tải lên:");
    if(!keyB64) return;
    const res = await axios.get(`${API_BASE}/ipfs/cat/${cid}`);
    const blob = await decryptToBlob(res.data, keyB64, "document");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "document";
    a.click();
    URL.revokeObjectURL(url);
  };

const revoke = async (id) => {
  if (!confirm("Vô hiệu hoá tài liệu này?")) return;
  try {
    // bắt lỗi sớm
    await contract.methods.revoke(id).estimateGas({ from: account });

    const receipt = await contract.methods.revoke(id).send({ from: account });
    if (receipt.status) {
      setToast({ type:"success", msg:"Đã vô hiệu" });
      await refreshList();
    } else {
      setToast({ type:"error", msg:"Tx failed" });
    }
  } catch (e) {
    const msg = e?.data?.message || e?.error?.message || e?.message || "Tx failed";
    setToast({ type:"error", msg });
  }
};


  useEffect(()=>{ refreshList(); }, [contract, account]);

  const filtered = useMemo(()=>{
    let rows = myDocs;
    if(q.trim()){
      const t = q.toLowerCase();
      rows = rows.filter(r => r.cid.toLowerCase().includes(t) || (r.owner?.toLowerCase()?.includes(t)));
    }
    if(typeFilter !== -1) rows = rows.filter(r => r.docType === typeFilter);
    if(onlyActive) rows = rows.filter(r => r.active);
    return rows;
  }, [myDocs, q, typeFilter, onlyActive]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page-1)*pageSize, page*pageSize);

  return (
    <div style={{ fontFamily:"Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", background:"#0b1220", minHeight:"100vh", color:"#e2e8f0" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 16px" }}>
        {/* Header */}
        <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, margin:0, fontWeight:800, letterSpacing:0.3 }}>Quản lý giấy tờ cá nhân</h1>
            <div style={{opacity:0.8, marginTop:6}}>Lưu trữ an toàn: IPFS + mã hoá AES‑GCM + ghi nhận Ethereum.</div>
          </div>
          <div>
       {account ? (
              <div style={{display:"flex", gap:8, alignItems:"center"}}>
                <button
                  style={{background:"#1f2937", color:"#e5e7eb", border:"1px solid #334155", padding:"10px 14px", borderRadius:10}}
                  title={account}
                >
      {chip(account.slice(0,6)+"…"+account.slice(-4))}
    </button>
    <button
      onClick={()=>setShowActivity(v=>!v)}
      style={{
        background: showActivity ? "#2563eb" : "#111827",
        color:"#e5e7eb",
        border:"1px solid #334155",
        padding:"10px 12px",
        borderRadius:10,
        fontWeight:600,
        transition:"all .2s"
      }}
    >
      {showActivity ? "Ẩn lịch sử" : "Lịch sử hoạt động"}
    </button>
  </div>
) : (
       <button onClick={connect} style={{background:"#22c55e", color:"#08211b", border:"none", padding:"10px 16px", borderRadius:10, fontWeight:700, boxShadow:"0 2px 8px rgba(0,0,0,.3)"}}>
           Kết nối ví
      </button>
            )}
      </div>
      </header>

      {/* Upload Card */}
      <section style={{ background:"#0f172a", border:"1px solid #1f2a44", borderRadius:16, padding:16, marginBottom:20, boxShadow:"0 4px 20px rgba(0,0,0,.25)" }}>
        <h2 style={{ fontSize:20, margin:0, marginBottom:10, fontWeight:700, color:"#93c5fd" }}>Tải lên & đăng ký</h2>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, alignItems:"center" }}>
           <select value={docType} onChange={e=>setDocType(Number(e.target.value))}
              style={{padding:"10px 12px", borderRadius:10, border:"1px solid #334155", background:"#111827", color:"#e5e7eb"}}>
              <option value={0}>CMND</option>
              <option value={1}>Hộ chiếu</option>
              <option value={2}>Khác</option>
            </select>
            <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}
              style={{padding:"10px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}/>
            <button onClick={uploadAndRegister}
              style={{background:"#3b82f6", color:"#fff", border:"none", borderRadius:12, padding:"10px 16px", fontWeight:700}}>
              Tải lên
            </button>
          </div>
          {status && (
            <div ref={statusRef} style={{marginTop:12, fontSize:14, opacity:.9}}>
              ⏳ {status}
            </div>
          )}

          {lastKeyB64 && (
            <div style={{marginTop:12, border:"1px solid #f59e0b", background:"#1f2937", color:"#fde68a", padding:12, borderRadius:10}}>
              <div style={{fontWeight:800, marginBottom:6}}>KHÓA GIẢI MÃ (LƯU NGAY)</div>
              <div style={{fontSize:13, wordBreak:"break-all"}}>CID: {lastCid}</div>
              <div style={{fontSize:13, wordBreak:"break-all"}}>KEY: {lastKeyB64}</div>
              <div style={{display:"flex", gap:8, marginTop:10}}>
                <button onClick={()=>navigator.clipboard.writeText(lastKeyB64).then(()=>setToast({type:"success", msg:"Đã copy khoá"}))} style={{background:"#3b82f6", color:"#fff", border:"none", borderRadius:10, padding:"8px 12px", fontWeight:700}}>Copy khóa</button>
                <button onClick={()=>{setLastKeyB64(""); setLastCid("");}} style={{background:"#0b1220", color:"#e5e7eb", border:"1px solid #334155", borderRadius:10, padding:"8px 12px"}}>Đã lưu xong</button>
              </div>
              <div style={{opacity:.9, fontSize:12, marginTop:8}}>⚠️ Khóa KHÔNG được lưu lại trên server hay blockchain. Hãy cất giữ an toàn (password manager).</div>
            </div>
          )}
        </section>

        {/* Filters */}
        <section style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:10, alignItems:"center", marginBottom:10 }}>
          <input placeholder="Tìm theo CID hoặc Owner..." value={q} onChange={e=>{setPage(1); setQ(e.target.value);}}
            style={{padding:"10px 12px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}/>
          <select value={typeFilter} onChange={e=>{setPage(1); setTypeFilter(Number(e.target.value));}}
            style={{padding:"10px 12px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}>
            <option value={-1}>Tất cả loại</option>
            <option value={0}>CMND</option>
            <option value={1}>Hộ chiếu</option>
            <option value={2}>Khác</option>
          </select>
          <label style={{display:"flex", gap:8, alignItems:"center"}}>
            <input type="checkbox" checked={onlyActive} onChange={e=>{setPage(1); setOnlyActive(e.target.checked);}}/>
            Chỉ hiển thị đang hiệu lực
          </label>
          <button onClick={refreshList} style={{background:"#111827", color:"#e5e7eb", border:"1px solid #334155", padding:"10px 12px", borderRadius:10}}>Làm mới</button>
        </section>

        {/* List */}
        <section style={{ background:"#0f172a", border:"1px solid #1f2a44", borderRadius:16, padding:16 }}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
            <h3 style={{margin:0}}>Tài liệu của tôi ({filtered.length})</h3>
            <div>{chip("Trang "+page+" / "+totalPages)}</div>
          </div>

          <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:12 }}>
            {pageRows.map(d => (
              <li key={d.id} style={{background:"#0b1220", border:"1px solid #334155", borderRadius:14, padding:14}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  <strong style={{fontSize:16}}>{DocTypeLabel[d.docType]||"—"}</strong>
                  <span>{d.active ? chip("Active") : chip("Revoked")}</span>
                </div>
                <div
                    style={{
                      fontSize: 13,
                      opacity: 0.9,
                      display: "grid",
                      gap: 4,
                      wordBreak: "break-all",
                      lineHeight: "1.4em",
                      background: "#0b1220",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid #1e293b",
                    }}
              >
              <div><b style={{ color: "#93c5fd" }}>CID:</b> <span style={{ color: "#e2e8f0" }}>{d.cid}</span></div>
              <div><b style={{ color: "#93c5fd" }}>Owner:</b> <span style={{ color: "#e2e8f0" }}>{d.owner.slice(0, 10)}…</span></div>
              <div><b style={{ color: "#93c5fd" }}>Date:</b> <span style={{ color: "#e2e8f0" }}>{d.createdAt ? new Date(Number(d.createdAt) * 1000).toLocaleString() : "—"}</span></div>
            </div>

                <div style={{display:"flex", gap:8, marginTop:10}}>
                  <button onClick={()=>downloadAndDecrypt(d.cid)} style={{background:"#3b82f6", color:"#fff", border:"none", borderRadius:10, padding:"8px 12px", fontWeight:600}}>Tải & giải mã</button>
                  {d.active && (
                    <button onClick={()=>revoke(d.id)} style={{background:"#ef4444", color:"#fff", border:"none", borderRadius:10, padding:"8px 12px", fontWeight:600}}>Vô hiệu</button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          <div style={{display:"flex", justifyContent:"center", gap:8, marginTop:14}}>
            <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} style={{padding:"8px 12px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}>Trước</button>
            <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} style={{padding:"8px 12px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}>Sau</button>
          </div>
        </section>

        {/* Toast */}
        {toast && (
          <div style={{position:"fixed", right:16, bottom:16, background:"#111827", border:"1px solid #334155", color:"#e5e7eb", borderRadius:12, padding:"10px 14px", boxShadow:"0 8px 30px rgba(0,0,0,.4)"}}>
            {toast.msg}
          </div>
        )}
        { showActivity && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 1000,
              display: "flex",
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            <div
              style={{
                background: "#0f172a",
                border: "1px solid #1f2a44",
                borderRadius: 16,
                width: "min(900px, 95vw)",
                maxHeight: "85vh",
                overflowY: "auto",
                padding: 16,
                boxShadow: "0 8px 30px rgba(0,0,0,.5)"
              }}
            >
              <TxActivity web3={web3} contract={contract} account={account} />
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button
                  onClick={() => setShowActivity(false)}
                  style={{
                    background: "#111827",
                    color: "#e5e7eb",
                    border: "1px solid #334155",
                    padding: "8px 12px",
                    borderRadius: 10
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
