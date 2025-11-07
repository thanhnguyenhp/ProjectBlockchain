import express from "express";
import cors from "cors";
import "dotenv/config";
import multer from "multer";
import { create as createIpfs } from "ipfs-http-client";

const app=express();app.use(cors());app.use(express.json({limit:"20mb"}));
const upload=multer({storage:multer.memoryStorage()});
const ipfs=createIpfs({url:process.env.IPFS_URL||"http://127.0.0.1:5001"});
app.get("/",(_req,res)=>res.json({ok:true,name:"id-docs-server"}));
app.post("/ipfs/add", upload.single("file"), async (req,res)=>{ try{ if(!req.file) return res.status(400).json({error:"file required"}); const added=await ipfs.add(req.file.buffer); res.json({cid:added.cid.toString()}); }catch(e){ res.status(500).json({error:e.message}); }});
app.get("/ipfs/cat/:cid", async (req,res)=>{ try{ const {cid}=req.params; const chunks=[]; for await (const c of ipfs.cat(cid)) chunks.push(c); const buf=Buffer.concat(chunks); res.setHeader("Content-Type","application/json"); res.send(buf);} catch(e){ res.status(500).json({error:e.message}); }});
const port=process.env.PORT||4000;app.listen(port,()=>console.log("API running on",port));