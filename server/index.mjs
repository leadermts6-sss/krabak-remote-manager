import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readAdmin,verifyPassword,makeToken,parseCookies} from './auth.mjs';
import {wsUpgrade} from './ws.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST=path.join(ROOT,'dist');const PORT=Number(process.env.PORT||8787);const HOST=process.env.HOST||'127.0.0.1';
const ORIGIN=process.env.KRABAK_PUBLIC_ORIGIN||'';const DEV_ORIGIN=process.env.KRABAK_DEV_ORIGIN||'';
const sessions=new Map();const hosts=new Map();const connections=new Map();const logins=new Map();const registrations=new Map();const audit=[];
const LIMIT=12_000;const SESS_TTL=8*3600_000;const CODE_TTL=15*60_000;
const now=()=>Date.now();const clean=x=>String(x??'').trim().slice(0,160);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.ico':'image/x-icon'};
const randomCode=()=>crypto.randomBytes(5).toString('hex').slice(0,8).toUpperCase();
function addAudit(type,title,detail=''){audit.unshift({type,title:clean(title),detail:clean(detail),at:new Date().toISOString()});if(audit.length>100)audit.pop();}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return false;try{const parsed=new URL(origin);const allowed=new Set([`http://${req.headers.host}`,`https://${req.headers.host}`,ORIGIN,DEV_ORIGIN].filter(Boolean));return allowed.has(parsed.origin);}catch{return false;}}
function headers(res,code=200,more={}){res.writeHead(code,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store',...more});}
function json(res,status,data,more={}){headers(res,status,{'Content-Type':'application/json; charset=utf-8',...more});res.end(JSON.stringify(data));}
function reject(res,status=400,message='Invalid request'){json(res,status,{error:message});}
function getIP(req){return req.socket.remoteAddress||'unknown';}
function rate(map,key,max,ms){let r=map.get(key);if(!r||now()-r.start>ms){r={start:now(),count:0};map.set(key,r);}r.count++;return r.count<=max;}
function getUser(req){const token=parseCookies(req.headers.cookie).krabak_session;const s=sessions.get(token);if(!s)return null;if(s.expires<now()){sessions.delete(token);return null;}s.expires=now()+SESS_TTL;return s;}
function sessionCookie(req,token,age){const proto=(process.env.KRABAK_TRUST_PROXY==='1'?req.headers['x-forwarded-proto']:null)||(req.socket.encrypted?'https':'http');return `krabak_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}; ${proto==='https'?'Secure; ':''}`;}
async function readBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',buf=>{data+=buf;if(data.length>LIMIT){reject(new Error('Body too large'));req.destroy()}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});}
function getHostByToken(token){for(const h of hosts.values())if(h.token===token&&h.expires>now())return h;return null;}
function cleanup(){for(const [k,v] of sessions)if(v.expires<now())sessions.delete(k);for(const [k,v] of hosts)if(v.expires<now()&&!v.activeSession)hosts.delete(k);for(const [k,v] of connections)if(v.expires<now())endSession(k,'Expired session');}
function send(conn,message){if(conn&&!conn.closed)conn.send(message);}
function endSession(id,reason='Ended by participant'){const s=connections.get(id);if(!s)return;connections.delete(id);send(s.host.ws,{type:'ended',sessionId:id,reason});send(s.viewerWS,{type:'ended',sessionId:id,reason});s.host.activeSession=null;addAudit('session','ปิดการเชื่อมต่อ',s.host.name);}
function revokeHost(h){if(h.activeSession)endSession(h.activeSession,'Host revoked');hosts.delete(h.code);if(h.ws){send(h.ws,{type:'ended',reason:'Host revoked'});h.ws.close();}addAudit('host','ยกเลิกการแชร์',h.name);}
const stunOnly=()=>({iceServers:[{urls:(process.env.KRABAK_STUN_URL||'stun:stun.l.google.com:19302').split(',').map(x=>x.trim()).filter(Boolean)}]});
function sessionIceConfig(){const config=stunOnly();if(process.env.KRABAK_TURN_URL&&process.env.KRABAK_TURN_SECRET){const username=`${Math.floor(now()/1000)+3600}:krabak`;const credential=crypto.createHmac('sha1',process.env.KRABAK_TURN_SECRET).update(username).digest('base64');config.iceServers.push({urls:process.env.KRABAK_TURN_URL.split(',').map(x=>x.trim()),username,credential});}return config;}
async function handleApi(req,res,pathname){const method=req.method;let body={};if(method!=='GET'){if(!originAllowed(req))return reject(res,403,'Origin not allowed');if(req.headers['content-type']?.split(';')[0]!=='application/json')return reject(res,415,'JSON body required');try{body=await readBody(req)}catch(err){return reject(res,400,err.message)}}
 if(pathname==='/api/status'&&method==='GET')return json(res,200,{ok:true,name:'KRABAK Remote Manager',initialised:!!readAdmin(),rtcConfig:stunOnly()});
 if(pathname==='/api/login'&&method==='POST'){
  const ip=getIP(req);if(!rate(logins,ip,7,15*60_000))return reject(res,429,'Too many login attempts');const admin=readAdmin();if(!admin||clean(body.email).toLowerCase()!==admin.email||!verifyPassword(body.password,admin))return reject(res,401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');const token=makeToken();sessions.set(token,{email:admin.email,expires:now()+SESS_TTL});addAudit('login','เข้าสู่ระบบสำเร็จ',admin.email);return json(res,200,{user:{email:admin.email}},{'Set-Cookie':sessionCookie(req,token,8*3600)});
 }
 if(pathname==='/api/host/register'&&method==='POST'){
  const ip=getIP(req);if(!rate(registrations,ip,16,60*60_000))return reject(res,429,'Too many host registrations');const name=clean(body.name);if(name.length<2||name.length>80)return reject(res,400,'Host name must be 2-80 chars');let code;do{code=randomCode()}while(hosts.has(code));const token=makeToken();const host={code,token,name,expires:now()+CODE_TTL,ws:null,activeSession:null,ip};hosts.set(code,host);addAudit('host','สร้างรหัสจับคู่',name);return json(res,201,{code,token,expiresAt:new Date(host.expires).toISOString(),rtcConfig:sessionIceConfig()});
 }
 if(pathname==='/api/host/revoke'&&method==='POST'){const h=getHostByToken(body.token);if(h)revokeHost(h);return json(res,200,{ok:true});}
 const user=getUser(req);if(!user)return reject(res,401,'Please sign in as administrator');
 if(pathname==='/api/me'&&method==='GET')return json(res,200,{user:{email:user.email}});
 if(pathname==='/api/logout'&&method==='POST'){const t=parseCookies(req.headers.cookie).krabak_session;sessions.delete(t);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie(req,'',0)});}
 if(pathname==='/api/audit'&&method==='GET')return json(res,200,{events:audit.slice(0,60)});
 if(pathname==='/api/sessions'&&method==='POST'){
  const code=clean(body.code).toUpperCase();const h=hosts.get(code);if(!h||h.expires<now()||!h.ws||h.ws.closed)return reject(res,404,'รหัสไม่ถูกต้อง หมดอายุ หรือเครื่องปลายทางออฟไลน์');if(h.activeSession)return reject(res,409,'This host is in a session');if(h.paired)return reject(res,409,'Pairing code already used; register a new code');
  const id=crypto.randomUUID();const s={id,host:h,viewer:user.email,viewerWS:null,approved:false,created:now(),expires:now()+2*3600_000,pendingViewerSignals:[]};connections.set(id,s);h.activeSession=id;h.paired=true;send(h.ws,{type:'invite',sessionId:id,requester:user.email});addAudit('session','ร้องขอการเชื่อมต่อ',h.name);return json(res,201,{id,hostName:h.name,status:'pending',rtcConfig:sessionIceConfig()});
 }
 if(pathname==='/api/sessions'&&method==='GET')return json(res,200,{sessions:[...connections.values()].filter(x=>x.viewer===user.email).map(x=>({id:x.id,hostName:x.host.name,approved:x.approved}))});
 return reject(res,404,'Not found');
}
function handleWebSocket(req,socket,head){const pathName=new URL(req.url||'/',`http://${req.headers.host}`).pathname;if(pathName!=='/ws'){socket.destroy();return;}const ws=wsUpgrade(req,socket,head,originAllowed);if(!ws)return;
 const viewer=getUser(req);let role=null,host=null;let lastAt=now();const t=setInterval(()=>{if(now()-lastAt>5*60_000)ws.close()},45_000);t.unref();
 ws.on('message',msg=>{lastAt=now();const type=msg?.type;
  if(type==='host-hello'&&!role){host=getHostByToken(msg.token);if(!host||host.ws&&!host.ws.closed){ws.send({type:'error',error:'Invalid or already connected host'});ws.close();return;}role='host';host.ws=ws;send(ws,{type:'host-hello-ok'});return;}
  if(type==='viewer-hello'&&!role){if(!viewer){send(ws,{type:'error',error:'Login required'});ws.close();return;}role='viewer';send(ws,{type:'viewer-hello-ok'});return;}
  if(!role){send(ws,{type:'error',error:'Authenticate first'});return;}
  const id=clean(msg.sessionId);const s=connections.get(id);
  if(type==='watch'&&role==='viewer'){if(!s||s.viewer!==viewer.email){send(ws,{type:'error',error:'Session not found'});return;}s.viewerWS=ws;if(s.approved)send(ws,{type:'accepted',sessionId:id});for(const signal of s.pendingViewerSignals.splice(0))send(ws,signal);return;}
  if(!s)return;
  const isHost=role==='host'&&s.host===host;
  const isViewer=role==='viewer'&&s.viewer===viewer.email&&s.viewerWS===ws;
  if(!isHost&&!isViewer)return;
  if(type==='accept'&&isHost&&!s.approved){s.approved=true;send(s.viewerWS,{type:'accepted',sessionId:id});addAudit('session','อนุมัติการแชร์ภาพ',host.name);return;}
  if(type==='reject'&&isHost&&!s.approved){endSession(id,'Host rejected');return;}
  if(type==='end'){endSession(id,'Participant ended');return;}
  if(!s.approved)return;
  if(type==='signal'&&msg.payload&&JSON.stringify(msg.payload).length<100_000){if(isHost&&!s.viewerWS){if(s.pendingViewerSignals.length<100)s.pendingViewerSignals.push({type:'signal',sessionId:id,payload:msg.payload});}else send(isHost?s.viewerWS:s.host.ws,{type:'signal',sessionId:id,payload:msg.payload});return;}
  if(type==='chat'&&typeof msg.text==='string'){send(isHost?s.viewerWS:s.host.ws,{type:'chat',sessionId:id,text:msg.text.slice(0,2000)});return;}
  if(type==='change-request'&&isViewer){send(s.host.ws,{type:'change-request',sessionId:id});return;}
 });
 ws.on('close',()=>{clearInterval(t);if(role==='host'&&host?.ws===ws){host.ws=null;if(host.activeSession)endSession(host.activeSession,'Host disconnected');hosts.delete(host.code);}if(role==='viewer'){for(const s of connections.values())if(s.viewerWS===ws)endSession(s.id,'Viewer disconnected');}});
}
function staticFile(req,res,pathname){let file;try{file=decodeURIComponent(pathname)}catch{return reject(res,400,'Bad path')}if(file==='/'||!path.extname(file))file='/index.html';const candidate=path.resolve(DIST,'.'+file);if(!candidate.startsWith(DIST+path.sep))return reject(res,403,'Forbidden');fs.stat(candidate,(err,stat)=>{if(err||!stat.isFile())return reject(res,404,'File not found. Run npm run build first.');headers(res,200,{'Content-Type':mime[path.extname(candidate)]||'application/octet-stream','Cache-Control':file==='/sw.js'||file==='/index.html'?'no-cache':'public, max-age=86400','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin'});fs.createReadStream(candidate).pipe(res);});}
const server=http.createServer((req,res)=>{if(!['GET','POST'].includes(req.method))return reject(res,405,'Not allowed');let pathname;try{pathname=new URL(req.url||'/',`http://${req.headers.host}`).pathname}catch{return reject(res,400,'Invalid URL')};if(pathname.startsWith('/api/'))return handleApi(req,res,pathname).catch(err=>{console.error('API error:',err.message);if(!res.headersSent)reject(res,500,'Internal server error')});if(req.method!=='GET')return reject(res,405,'Not allowed');staticFile(req,res,pathname);});
server.on('upgrade',handleWebSocket);
setInterval(cleanup,60_000).unref();
server.listen(PORT,HOST,()=>console.log(`KRABAK Remote Manager on http://${HOST}:${PORT} (admin configured: ${!!readAdmin()})`));
