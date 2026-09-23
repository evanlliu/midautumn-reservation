const cfg = window.APP_CONFIG?.github || {};

function need(name, value) {
  const v = String(value || "").trim();
  if (!v || /^YOUR_|^PASTE_|^CHANGE_THIS_/i.test(v)) throw new Error(`config.js 未配置 ${name}`);
  return v;
}

function b64ToBytes(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function bytesToB64(bytes) {
  let s = "";
  for (let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function utf8ToB64(value) { return bytesToB64(new TextEncoder().encode(value)); }
function b64ToUtf8(value) { return new TextDecoder().decode(b64ToBytes(value)); }

async function deriveObfuscationKey(material) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, {name:"AES-GCM"}, false, ["decrypt"]);
}

async function resolveToken() {
  const cipher = need("github.tokenCiphertext", cfg.tokenCiphertext);
  const material = need("github.keyMaterial", cfg.keyMaterial);
  const packed = b64ToBytes(cipher);
  if (packed.length < 29) throw new Error("Token 密文无效");
  const iv = packed.subarray(0, 12);
  const encrypted = packed.subarray(12);
  const key = await deriveObfuscationKey(material);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, encrypted);
  } catch {
    throw new Error("Token 解密失败：请检查 tokenCiphertext / keyMaterial");
  }
  const token = new TextDecoder().decode(plain).trim();
  if (!token) throw new Error("Token 为空");
  return token;
}

function apiUrl() {
  const owner=need("github.owner",cfg.owner), repo=need("github.repo",cfg.repo), path=need("github.path",cfg.path);
  const p=path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${p}`;
}

let tokenPromise;
async function headers() {
  if (!tokenPromise) tokenPromise=resolveToken();
  const token=await tokenPromise;
  return {
    "Accept":"application/vnd.github+json",
    "Authorization":`Bearer ${token}`,
    "X-GitHub-Api-Version":"2022-11-28"
  };
}

async function readRemoteData() {
  const branch=need("github.branch",cfg.branch);
  const url=new URL(apiUrl()); url.searchParams.set("ref",branch); url.searchParams.set("_",Date.now());
  const r=await fetch(url,{headers:await headers(),cache:"no-store"});
  const p=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(p.message || `GitHub 读取失败 HTTP ${r.status}`);
  if(p.type!=="file" || !p.sha) throw new Error("data.json 不是有效 GitHub 文件");
  let text="";
  if(p.content && p.encoding==="base64") text=b64ToUtf8(p.content);
  else {
    const rr=await fetch(url,{headers:{...(await headers()),Accept:"application/vnd.github.raw+json"},cache:"no-store"});
    if(!rr.ok) throw new Error(`GitHub raw 读取失败 HTTP ${rr.status}`);
    text=await rr.text();
  }
  let data; try { data=JSON.parse(text); } catch { throw new Error("data.json JSON 格式损坏"); }
  return {data,sha:p.sha};
}

async function putRemoteData(data, sha, message) {
  const body={
    message,
    content:utf8ToB64(JSON.stringify(data,null,2)+"\n"),
    sha,
    branch:need("github.branch",cfg.branch)
  };
  const r=await fetch(apiUrl(),{
    method:"PUT",
    headers:{...(await headers()),"Content-Type":"application/json;charset=utf-8"},
    body:JSON.stringify(body),cache:"no-store"
  });
  const p=await r.json().catch(()=>({}));
  if(!r.ok){
    const e=new Error(p.message || `GitHub 写入失败 HTTP ${r.status}`); e.status=r.status; throw e;
  }
  return p;
}

export function normalizeName(value){return String(value||"").replace(/\s+/g,"").toLowerCase()}
export function countsFrom(data){
  const out={}; for(const a of data.activities||[]) out[a.id]=0;
  for(const r of data.reservations||[]) if(Object.prototype.hasOwnProperty.call(out,r.activityId)) out[r.activityId]++;
  return out;
}

export async function getState(){
  const {data}=await readRemoteData();
  return {data,activities:data.activities||[],reservations:data.reservations||[],counts:countsFrom(data)};
}

function reservationId(){
  if(crypto.randomUUID) return crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
  const b=new Uint8Array(4); crypto.getRandomValues(b); return [...b].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function clone(x){return JSON.parse(JSON.stringify(x))}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

export async function reserve(activityId, rawName){
  const name=String(rawName||"").trim();
  if(!name) throw new Error("请输入姓名 / Escribe tu nombre");
  if(name.length>60) throw new Error("姓名过长");
  const norm=normalizeName(name);

  for(let attempt=0;attempt<5;attempt++){
    const {data,sha}=await readRemoteData();
    const next=clone(data);
    next.activities=Array.isArray(next.activities)?next.activities:[];
    next.reservations=Array.isArray(next.reservations)?next.reservations:[];
    const activity=next.activities.find(a=>a.id===activityId);
    if(!activity) throw new Error("活动不存在");
    if(next.reservations.some(r=>normalizeName(r.name)===norm)) throw new Error("您已经预约过一个游戏，每人只能参加一个游戏。 / Ya tienes una reserva.");
    const used=next.reservations.filter(r=>r.activityId===activityId).length;
    if(used>=Number(activity.capacity||0)) throw new Error("该活动已满 / Actividad agotada");

    const id=reservationId();
    next.reservations.push({time:new Date().toISOString(),activityId,activity:activity.nameZh,name,id});
    next.updatedAt=new Date().toISOString();
    try {
      await putRemoteData(next,sha,`midautumn: reserve ${id}`);
      return {ok:true,id,data:next,counts:countsFrom(next)};
    } catch(e) {
      if(e.status===409 && attempt<4){await sleep(120*(attempt+1));continue}
      throw e;
    }
  }
  throw new Error("预约冲突，请重试");
}

export async function deleteReservation(rawId){
  const id=String(rawId||"").trim().toUpperCase();
  if(!id) throw new Error("预约编号不能为空");

  for(let attempt=0;attempt<5;attempt++){
    const {data,sha}=await readRemoteData();
    const next=clone(data);
    next.activities=Array.isArray(next.activities)?next.activities:[];
    next.reservations=Array.isArray(next.reservations)?next.reservations:[];

    const index=next.reservations.findIndex(r=>String(r.id||"").trim().toUpperCase()===id);
    if(index<0) throw new Error("该预约已不存在，可能已被其他管理员删除");

    const [removed]=next.reservations.splice(index,1);
    next.updatedAt=new Date().toISOString();
    try {
      await putRemoteData(next,sha,`midautumn: delete reservation ${id}`);
      return {ok:true,removed,data:next,counts:countsFrom(next)};
    } catch(e) {
      if(e.status===409 && attempt<4){await sleep(120*(attempt+1));continue}
      throw e;
    }
  }
  throw new Error("删除冲突，请刷新后重试");
}
