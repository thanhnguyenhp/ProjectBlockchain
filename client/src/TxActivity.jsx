// client/src/TxActivity.jsx
import { useEffect, useMemo, useState } from "react";

export default function TxActivity({ web3, contract, account }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [type, setType] = useState("ALL"); // ALL | ADD | REVOKE
  const [q, setQ] = useState("");          // search by cid/tx/id
  const [ownerOnly, setOwnerOnly] = useState(true);

  // topic hashes (fallback khi ABI không expose tên event)
  const sigAdd = web3?.utils.keccak256("DocumentAdded(bytes32,address,uint8,string,bytes32)");
  const sigRev = web3?.utils.keccak256("DocumentRevoked(bytes32,address)");

  const getBlockTime = async (bn) => {
    const b = await web3.eth.getBlock(bn);
    return Number(b.timestamp) * 1000;
  };

  const pullEvents = async (opts) => {
    // thử gọi theo tên trước
    let added = [], revoked = [];
    try { added = await contract.getPastEvents("DocumentAdded", opts); }
    catch {
      const all = await contract.getPastEvents("allEvents", opts);
      added = all.filter(e => e.event === "DocumentAdded" || e.raw?.topics?.[0] === sigAdd);
    }
    try { revoked = await contract.getPastEvents("DocumentRevoked", opts); }
    catch {
      const all = await contract.getPastEvents("allEvents", opts);
      revoked = all.filter(e => e.event === "DocumentRevoked" || e.raw?.topics?.[0] === sigRev);
    }
    return { added, revoked };
  };

  const load = async () => {
    if (!web3 || !contract) return;
    setLoading(true); setErr("");
    try {
      const latest = await web3.eth.getBlockNumber();
      const from = 0; // có thể đổi sang block deploy để nhanh hơn
      const base = ownerOnly && account ? { filter: { owner: account } } : {};
      const ev = await pullEvents({ ...base, fromBlock: from, toBlock: "latest" });

      const a = await Promise.all(ev.added.map(async (e) => {
        const t = await getBlockTime(e.blockNumber);
        const { id, owner, docType, cid, fileHash } = e.returnValues;
        return { kind:"ADD", id, owner, docType:Number(docType), cid, fileHash,
                 tx:e.transactionHash, block:e.blockNumber, time:t };
      }));
      const r = await Promise.all(ev.revoked.map(async (e) => {
        const t = await getBlockTime(e.blockNumber);
        const { id, owner } = e.returnValues;
        return { kind:"REVOKE", id, owner,
                 tx:e.transactionHash, block:e.blockNumber, time:t };
      }));

      const arr = [...a, ...r].sort((x,y)=> y.time - x.time);
      setItems(arr);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, [web3, contract, account, ownerOnly]);

  const filtered = useMemo(() => {
    let rows = items;
    if (type !== "ALL") rows = rows.filter(x => x.kind === type);
    if (q.trim()) {
      const t = q.toLowerCase();
      rows = rows.filter(x =>
        (x.cid||"").toLowerCase().includes(t) ||
        (x.tx||"").toLowerCase().includes(t) ||
        (x.id||"").toLowerCase().includes(t)
      );
    }
    return rows;
  }, [items, type, q]);

  return (
    <section style={{ background:"#0f172a", border:"1px solid #1f2a44", borderRadius:16, padding:16, marginTop:16 }}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap"}}>
        <h3 style={{margin:0}}>Lịch sử hoạt động</h3>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <select value={type} onChange={e=>setType(e.target.value)}
            style={{padding:"8px 10px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}>
            <option value="ALL">Tất cả</option>
            <option value="ADD">Đăng ký</option>
            <option value="REVOKE">Vô hiệu</option>
          </select>
          <label style={{display:"flex", gap:6, alignItems:"center"}}>
            <input type="checkbox" checked={ownerOnly} onChange={e=>setOwnerOnly(e.target.checked)}/> Chỉ của tôi
          </label>
          <input placeholder="Tìm theo CID / Tx / ID..." value={q} onChange={e=>setQ(e.target.value)}
            style={{padding:"8px 10px", borderRadius:10, border:"1px solid #334155", background:"#0b1220", color:"#e5e7eb"}}/>
          <button onClick={load} style={{background:"#111827", color:"#e5e7eb", border:"1px solid #334155", padding:"8px 12px", borderRadius:10}}>
            Làm mới
          </button>
        </div>
      </div>

      {err && <div style={{marginTop:10, color:"#fecaca", background:"#7f1d1d", border:"1px solid #b91c1c", padding:8, borderRadius:8}}>Lỗi: {err}</div>}
      {loading && <div style={{opacity:.85, marginTop:8}}>⏳ Đang tải...</div>}

      {!loading && filtered.length === 0 && <div style={{opacity:.85, marginTop:8}}>Chưa có hoạt động.</div>}

      {!loading && filtered.length > 0 && (
        <ul style={{ listStyle:"none", padding:0, marginTop:12, display:"grid", gap:10 }}>
          {filtered.map((it, i) => (
            <li key={i} style={{background:"#0b1220", border:"1px solid #334155", borderRadius:12, padding:12}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <strong>{it.kind === "ADD" ? "Đăng ký tài liệu" : "Vô hiệu tài liệu"}</strong>
                <span style={{fontSize:12, opacity:.9}}>{new Date(it.time).toLocaleString()}</span>
              </div>
              <div style={{marginTop:8, fontSize:13, lineHeight:"1.4em", wordBreak:"break-all", overflowWrap:"anywhere"}}>
                <div><b>ID:</b> {it.id}</div>
                {it.cid && <div><b>CID:</b> {it.cid}</div>}
                {"docType" in it && <div><b>Loại:</b> {["CMND","Hộ chiếu","Khác"][it.docType] || it.docType}</div>}
                <div><b>Block:</b> {it.block}</div>
                <div><b>Tx:</b> {it.tx}</div>
                <div><b>Owner:</b> {it.owner}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
