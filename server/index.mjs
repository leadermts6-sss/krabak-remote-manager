import http from 'node:http';
import {isIP} from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readAdmin,verifyPassword,makeToken,parseCookies} from './auth.mjs';
import {createTeacher,activateTeacher,listTeachers,getTeacherForAuth,verifyTeacherPassword,disableTeacher,reissueActivation} from './accounts.mjs';
import {canManageUsers,visibleHosts,visibleAudit} from './authorization.mjs';
import {AGENT_APPROVAL_TTL,createAgentStore,isAgentApprovalExpired,trustedAgentAccessEnabled,validateAgentFrame,validateAgentInput} from './agents.mjs';
import {isMobileRequest} from './mobile-policy.mjs';
import {wsUpgrade} from './ws.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST=path.join(ROOT,'dist');const PORT=Number(process.env.PORT||8787);const HOST=process.env.HOST||'127.0.0.1';
const ORIGIN=process.env.KRABAK_PUBLIC_ORIGIN||'';const DEV_ORIGIN=process.env.KRABAK_DEV_ORIGIN||'';
const sessions=new Map();const hosts=new Map();const agentsOnline=new Map();const agentStore=createAgentStore();const connections=new Map();const logins=new Map();const registrations=new Map();const sessionRequestsByAccount=new Map();const sessionRequestsByIP=new Map();const agentEnrollments=new Map();const agentActivations=new Map();const activationAttempts=new Map();const userSockets=new Map();const audit=[];
const LIMIT=12_000;const SESS_TTL=8*3600_000;const CODE_TTL=15*60_000;
const now=()=>Date.now();const clean=x=>String(x??'').trim().slice(0,160);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.ico':'image/x-icon'};
const randomCode=()=>crypto.randomBytes(5).toString('hex').slice(0,8).toUpperCase();
function addAudit(type,title,detail='',actorEmail=null,scopeEmails=[]){const visibleTo=[...new Set([actorEmail,...scopeEmails].filter(x=>typeof x==='string'&&x))];audit.unshift({type,title:clean(title),detail:clean(detail),at:new Date().toISOString(),actorEmail:actorEmail||null,visibleTo});if(audit.length>100)audit.pop();}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return false;try{const parsed=new URL(origin);const allowed=new Set([`http://${req.headers.host}`,`https://${req.headers.host}`,ORIGIN,DEV_ORIGIN].filter(Boolean));return allowed.has(parsed.origin);}catch{return false;}}
function headers(res,code=200,more={}){res.writeHead(code,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store',...more});}
function json(res,status,data,more={}){headers(res,status,{'Content-Type':'application/json; charset=utf-8',...more});res.end(JSON.stringify(data));}
function reject(res,status=400,message='Invalid request'){json(res,status,{error:message});}
function getIP(req){
 const remote=req.socket.remoteAddress||'unknown';
 if(process.env.KRABAK_TRUST_PROXY!=='1')return remote;
 const forwarded=req.headers['x-real-ip'];
 if(typeof forwarded==='string'){
  const ip=forwarded.trim();
  if(isIP(ip))return ip;
 }
 return remote;
}
function rate(map,key,max,ms){let r=map.get(key);if(!r||now()-r.start>ms){r={start:now(),count:0};map.set(key,r);}r.count++;if(map.size>10_000)for(const [entry,value] of map)if(now()-value.start>ms)map.delete(entry);return r.count<=max;}
function getUser(req){const token=parseCookies(req.headers.cookie).krabak_session;const s=sessions.get(token);if(!s)return null;if(s.expires<now()){sessions.delete(token);return null;}s.expires=now()+SESS_TTL;return s;}
function sessionCookie(req,token,age){const proto=(process.env.KRABAK_TRUST_PROXY==='1'?req.headers['x-forwarded-proto']:null)||(req.socket.encrypted?'https':'http');return `krabak_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}; ${proto==='https'?'Secure; ':''}`;}
async function readBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',buf=>{data+=buf;if(data.length>LIMIT){reject(new Error('Body too large'));req.destroy()}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});}
function getHostByToken(token){for(const h of hosts.values())if(h.token===token&&h.expires>now())return h;return null;}
function accountIsActive(email){const normalized=String(email||'').toLowerCase();const admin=readAdmin();return admin?.email?.toLowerCase()===normalized||!!getTeacherForAuth(normalized);}
function rotateAgentPairingCode(host){if(host.code)hosts.delete(host.code);let code;do{code=randomCode()}while(hosts.has(code));host.code=code;host.expires=now()+CODE_TTL;hosts.set(code,host);send(host.ws,{type:'pairing-code',code,expiresAt:new Date(host.expires).toISOString()});}
function cleanup(){for(const [k,v] of sessions)if(v.expires<now())sessions.delete(k);for(const host of agentsOnline.values())if(host.expires<now()&&host.ws&&!host.ws.closed)rotateAgentPairingCode(host);for(const [k,v] of hosts)if(v.expires<now()&&!v.activeSession&&!v.agent)hosts.delete(k);for(const [k,v] of connections){if(v.expires<now())endSession(k,'Expired session');else if(isAgentApprovalExpired(v,now()))endSession(k,'Approval expired');}}
function send(conn,message){if(conn&&!conn.closed)conn.send(message);}
function endSession(id,reason='Ended by participant',actorEmail=null){const s=connections.get(id);if(!s)return;connections.delete(id);send(s.host.ws,{type:'ended',sessionId:id,reason});send(s.viewerWS,{type:'ended',sessionId:id,reason});s.host.activeSession=null;addAudit('session','ปิดการเชื่อมต่อ',s.host.name,actorEmail,[s.host.ownerEmail,s.viewer]);}
function revokeHost(h){if(h.activeSession)endSession(h.activeSession,'Host revoked',h.ownerEmail);hosts.delete(h.code);if(h.agent)agentsOnline.delete(h.id);if(h.ws){send(h.ws,{type:'ended',reason:'Host revoked'});h.ws.close();}addAudit('host','ยกเลิกการแชร์',h.name,h.ownerEmail,[h.ownerEmail]);}
function revokeUserAccess(email){for(const [token,session] of sessions)if(session.email===email)sessions.delete(token);for(const [id,session] of connections)if(session.viewer===email||session.host.ownerEmail===email)endSession(id,'Account access revoked',email);for(const host of [...hosts.values()])if(host.ownerEmail===email)revokeHost(host);for(const host of [...agentsOnline.values()])if(host.ownerEmail===email)revokeHost(host);agentStore.revokeOwner(email);for(const ws of userSockets.get(email)||[])try{ws.close()}catch{}userSockets.delete(email);}
const stunOnly=()=>({iceServers:[{urls:(process.env.KRABAK_STUN_URL||'stun:stun.l.google.com:19302').split(',').map(x=>x.trim()).filter(Boolean)}]});
function sessionIceConfig(){const config=stunOnly();if(process.env.KRABAK_TURN_URL&&process.env.KRABAK_TURN_SECRET){const username=`${Math.floor(now()/1000)+3600}:krabak`;const credential=crypto.createHmac('sha1',process.env.KRABAK_TURN_SECRET).update(username).digest('base64');config.iceServers.push({urls:process.env.KRABAK_TURN_URL.split(',').map(x=>x.trim()),username,credential});}return config;}
async function handleApi(req,res,pathname){
 const method=req.method;let body={};
 if(method!=='GET'){if(!originAllowed(req))return reject(res,403,'Origin not allowed');if(req.headers['content-type']?.split(';')[0]!=='application/json')return reject(res,415,'JSON body required');try{body=await readBody(req)}catch(err){return reject(res,400,err.message)}if(!body||typeof body!=='object'||Array.isArray(body))return reject(res,400,'JSON object required')}
 if(pathname==='/api/agents/enroll'&&method==='POST'){
  if(isMobileRequest(req))return reject(res,403,'อุปกรณ์มือถือใช้เป็นผู้ควบคุมได้เท่านั้น ไม่สามารถลงทะเบียนเป็นเครื่องปลายทางได้');
  const ip=getIP(req);if(!rate(agentActivations,ip,8,15*60_000))return reject(res,429,'Too many Agent activation attempts');
  if(body.trustedAccess===true&&!trustedAgentAccessEnabled())return reject(res,403,'Trusted same-account control is disabled until MFA and security review are complete');
  const activated=agentStore.activateEnrollment(body.code,body.name,body.trustedAccess);if(!activated)return reject(res,400,'Invalid or expired Agent enrollment code');
  if(!accountIsActive(activated.device.ownerEmail)){agentStore.revoke(activated.device.id,activated.device.ownerEmail);return reject(res,400,'Invalid or expired Agent enrollment code');}
  addAudit('agent','ลงทะเบียน Windows Agent',activated.device.name,activated.device.ownerEmail,[activated.device.ownerEmail]);
  return json(res,201,{device:activated.device,token:activated.token});
 }
 if(pathname==='/api/status'&&method==='GET'){const current=getUser(req);return json(res,200,{ok:true,name:'KRABAK Remote Manager',initialised:!!readAdmin(),rtcConfig:stunOnly(),user:current?{email:current.email,role:current.role}:null});}
 if(pathname==='/api/login'&&method==='POST'){
  const ip=getIP(req);if(!rate(logins,ip,7,15*60_000))return reject(res,429,'Too many login attempts');
  const email=clean(body.email).toLowerCase();const admin=readAdmin();let user=null;
  if(admin&&email===admin.email&&verifyPassword(body.password,admin))user={email:admin.email,role:'admin'};
  else{const teacher=getTeacherForAuth(email);if(teacher&&verifyTeacherPassword(body.password,teacher))user={email:teacher.email,role:'teacher'};}
  if(!user)return reject(res,401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  const token=makeToken();sessions.set(token,{email:user.email,role:user.role,expires:now()+SESS_TTL});addAudit('login','เข้าสู่ระบบสำเร็จ',user.email,user.email,[user.email]);return json(res,200,{user},{'Set-Cookie':sessionCookie(req,token,8*3600)});
 }
 if(pathname==='/api/activate'&&method==='POST'){
  const ip=getIP(req);if(!rate(activationAttempts,ip,12,15*60_000))return reject(res,429,'Too many activation attempts');
  try{activateTeacher(body.email,body.activationCode,body.password);return json(res,200,{ok:true});}
  catch(err){if(err.message.startsWith('Teacher password must'))return reject(res,400,'รหัสผ่านต้องมี 12-128 ตัวอักษรและตัวเลข โดยต้องมีทั้งสองชนิด');return reject(res,400,'Invalid or expired activation code');}
 }
 if(pathname==='/api/host/revoke'&&method==='POST'){const h=getHostByToken(body.token);if(h)revokeHost(h);return json(res,200,{ok:true});}
 const user=getUser(req);if(!user)return reject(res,401,'Please sign in');
 if(pathname==='/api/logout'&&method==='POST'){
  const token=parseCookies(req.headers.cookie).krabak_session;sessions.delete(token);
  for(const ws of userSockets.get(user.email)||[])if(ws.sessionToken===token)try{ws.close()}catch{}
  return json(res,200,{ok:true},{'Set-Cookie':sessionCookie(req,'',0)});
 }
 if(pathname==='/api/me'&&method==='GET')return json(res,200,{user:{email:user.email,role:user.role}});
  if(pathname==='/api/agents/enrollment'&&method==='POST'){
   const ip=getIP(req);if(!rate(agentEnrollments,ip,10,60*60_000))return reject(res,429,'Too many Agent enrollment codes');
   try{return json(res,201,agentStore.createEnrollment(user.email));}catch{return reject(res,500,'Could not create Agent enrollment code');}
  }
  const agentRevokeMatch=pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/revoke$/i);
  if(agentRevokeMatch&&method==='POST'){
   const id=agentRevokeMatch[1];const device=agentStore.findById(id);if(!device)return reject(res,404,'Agent not found');
   const isAdmin=canManageUsers(user);if(!agentStore.revoke(id,user.email,isAdmin))return reject(res,403,'Agent access denied');
   const host=agentsOnline.get(id);if(host)revokeHost(host);addAudit('agent','เพิกถอน Windows Agent',device.name,user.email,[device.ownerEmail,user.email]);return json(res,200,{ok:true});
  }
 if(pathname==='/api/users'&&method==='GET'){if(!canManageUsers(user))return reject(res,403,'Administrator access required');return json(res,200,{users:listTeachers()});}
 if(pathname==='/api/users'&&method==='POST'){
  if(!canManageUsers(user))return reject(res,403,'Administrator access required');
  try{const created=createTeacher(body.email);addAudit('account','สร้างบัญชีครู',created.user.email,user.email,[user.email,created.user.email]);return json(res,201,{user:created.user,activationCode:created.activationCode,expiresAt:created.expiresAt});}
  catch(err){if(err.message==='Invalid email')return reject(res,400,'Invalid email');if(err.message.includes('already exists'))return reject(res,409,'Account email already exists');throw err;}
 }
 const disableMatch=pathname.match(/^\/api\/users\/([a-f0-9-]+)\/disable$/i);
 if(disableMatch&&method==='POST'){
  if(!canManageUsers(user))return reject(res,403,'Administrator access required');
  const teacher=listTeachers().find(item=>item.id===disableMatch[1]);if(!teacher)return reject(res,404,'Teacher not found');
  if(!disableTeacher(teacher.id))return reject(res,404,'Teacher not found');revokeUserAccess(teacher.email);addAudit('account','ปิดบัญชีครู',teacher.email,user.email,[teacher.email,user.email]);return json(res,200,{ok:true});
 }
 const activationMatch=pathname.match(/^\/api\/users\/([a-f0-9-]+)\/activation$/i);
 if(activationMatch&&method==='POST'){
  if(!canManageUsers(user))return reject(res,403,'Administrator access required');
  const teacher=listTeachers().find(item=>item.id===activationMatch[1]);if(!teacher)return reject(res,404,'Teacher not found');
  try{const issued=reissueActivation(teacher.id);revokeUserAccess(teacher.email);addAudit('account','ออกโค้ดเปิดใช้ใหม่',teacher.email,user.email,[teacher.email,user.email]);return json(res,200,{user:{id:teacher.id,email:teacher.email,status:'pending'},activationCode:issued.activationCode,expiresAt:issued.expiresAt});}
  catch(err){return reject(res,409,'Teacher account cannot be reissued');}
 }
 if(pathname==='/api/host/register'&&method==='POST'){
  if(isMobileRequest(req))return reject(res,403,'อุปกรณ์มือถือใช้เป็นผู้ควบคุมได้เท่านั้น ไม่อนุญาตแชร์หน้าจอจากมือถือ');
  const ip=getIP(req);if(!rate(registrations,ip,16,60*60_000))return reject(res,429,'Too many host registrations');const name=clean(body.name);if(name.length<2||name.length>80)return reject(res,400,'Host name must be 2-80 chars');let code;do{code=randomCode()}while(hosts.has(code));const token=makeToken();const host={id:crypto.randomUUID(),code,token,name,ownerEmail:user.email,expires:now()+CODE_TTL,ws:null,activeSession:null,ip};hosts.set(code,host);addAudit('host','สร้างรหัสจับคู่',name,user.email,[user.email]);return json(res,201,{code,token,expiresAt:new Date(host.expires).toISOString(),rtcConfig:sessionIceConfig()});
 }
 if(pathname==='/api/hosts'&&method==='GET'){
   const current=[...hosts.values()].filter(host=>!host.agent&&host.expires>now()&&host.ws&&!host.ws.closed).map(host=>({id:host.id,name:host.name,ownerEmail:host.ownerEmail,online:true,sessionActive:!!host.activeSession,type:'browser'}));
   const devices=agentStore.list(user.email,canManageUsers(user)).map(device=>{const online=agentsOnline.get(device.id);return {...device,trustedAccess:trustedAgentAccessEnabled()&&device.trustedAccess,type:'agent',online:!!online,sessionActive:!!online?.activeSession};});
   return json(res,200,{hosts:visibleHosts([...current,...devices],user)});
 }
 if(pathname==='/api/audit'&&method==='GET')return json(res,200,{events:visibleAudit(audit,user).slice(0,60)});
 if(pathname==='/api/sessions'&&method==='POST'){
   if(typeof body.code==='string'){
    const ip=getIP(req);if(!rate(sessionRequestsByAccount,user.email,12,15*60_000)||!rate(sessionRequestsByIP,ip,100,15*60_000))return reject(res,429,'Too many connection requests; try again later');
   }
   let h=null;let directAgent=false;
   if(typeof body.deviceId==='string'){
    const device=agentStore.findById(body.deviceId);if(!device)return reject(res,404,'Agent not found');if(device.ownerEmail!==user.email||!device.trustedAccess||!trustedAgentAccessEnabled())return reject(res,403,'Agent access requires the device owner and trusted access');
    h=agentsOnline.get(device.id)||null;directAgent=true;
   }else h=hosts.get(clean(body.code).toUpperCase());
   if(!h||(!directAgent&&h.expires<now())||!h.ws||h.ws.closed)return reject(res,404,'รหัสไม่ถูกต้อง หมดอายุ หรือเครื่องปลายทางออฟไลน์');if(h.activeSession)return reject(res,409,'This host is in a session');if(h.paired&&!h.agent)return reject(res,409,'Pairing code already used; register a new code');
   const approved=!!(directAgent&&h.agent&&h.ownerEmail===user.email&&h.trustedAccess);const id=crypto.randomUUID();const session={id,host:h,viewer:user.email,viewerWS:null,approved,approvalExpires:h.agent&&!approved?now()+AGENT_APPROVAL_TTL:null,created:now(),expires:now()+2*3600_000,pendingViewerSignals:[],frameWindowStart:0,frameCount:0,inputWindowStart:0,inputCount:0};connections.set(id,session);h.activeSession=id;if(!h.agent)h.paired=true;
   if(approved)send(h.ws,{type:'agent-session-start',sessionId:id,requester:user.email});else send(h.ws,{type:'invite',sessionId:id,requester:user.email});
   addAudit('session',approved?'เริ่มเซสชันอุปกรณ์ที่เชื่อถือ':'ร้องขอการเชื่อมต่อ',h.name,user.email,[user.email,h.ownerEmail]);return json(res,201,{id,hostName:h.name,status:approved?'approved':'pending',agent:!!h.agent,rtcConfig:sessionIceConfig()});
 }
 if(pathname==='/api/sessions'&&method==='GET')return json(res,200,{sessions:[...connections.values()].filter(item=>item.viewer===user.email).map(item=>({id:item.id,hostName:item.host.name,approved:item.approved}))});
 return reject(res,404,'Not found');
}
function handleWebSocket(req,socket,head){
 const pathName=new URL(req.url||'/','http://'+req.headers.host).pathname;if(pathName!=='/ws'){socket.destroy();return;}const ws=wsUpgrade(req,socket,head,originAllowed);if(!ws)return;
 let viewer=null,viewerToken=null,role=null,host=null,lastAt=now();const timer=setInterval(()=>{if(now()-lastAt>5*60_000)ws.close()},45_000);timer.unref();
 ws.on('message',msg=>{lastAt=now();const type=msg?.type;
  if(type==='agent-hello'&&!role){
   if(isMobileRequest(req)){send(ws,{type:'error',error:'อุปกรณ์มือถือใช้เป็นผู้ควบคุมได้เท่านั้น ไม่สามารถเป็นเครื่องปลายทางได้'});ws.close();return;}
   const device=agentStore.authenticate(msg.token);if(!device||!accountIsActive(device.ownerEmail)){send(ws,{type:'error',error:'Agent was revoked or account disabled'});ws.close();return;}if(agentsOnline.get(device.id)?.ws&&!agentsOnline.get(device.id).ws.closed){send(ws,{type:'error',error:'Agent is already connected'});ws.close();return;}
   host={id:device.id,deviceId:device.id,agent:true,name:device.name,ownerEmail:device.ownerEmail,trustedAccess:trustedAgentAccessEnabled()&&device.trustedAccess,code:'',expires:0,ws,activeSession:null,paired:false};role='agent';agentsOnline.set(device.id,host);rotateAgentPairingCode(host);send(ws,{type:'agent-hello-ok',deviceId:device.id,pairingCode:host.code,expiresAt:new Date(host.expires).toISOString()});return;
  }
  if(type==='host-hello'&&!role){if(isMobileRequest(req)){send(ws,{type:'error',error:'อุปกรณ์มือถือใช้เป็นผู้ควบคุมได้เท่านั้น ไม่สามารถเป็นเครื่องปลายทางได้'});ws.close();return;}host=getHostByToken(msg.token);if(!host||host.ws&&!host.ws.closed){ws.send({type:'error',error:'Invalid or already connected host'});ws.close();return;}role='host';host.ws=ws;send(ws,{type:'host-hello-ok'});return;}
  if(type==='viewer-hello'&&!role){viewer=getUser(req);viewerToken=parseCookies(req.headers.cookie).krabak_session;if(!viewer){send(ws,{type:'error',error:'Login required'});ws.close();return;}role='viewer';ws.sessionToken=viewerToken;let owned=userSockets.get(viewer.email);if(!owned){owned=new Set();userSockets.set(viewer.email,owned);}owned.add(ws);send(ws,{type:'viewer-hello-ok'});return;}
  if(!role){send(ws,{type:'error',error:'Authenticate first'});return;}
  if(type==='agent-unregister'&&role==='agent'){agentStore.revoke(host.id,host.ownerEmail);send(ws,{type:'agent-unregistered'});revokeHost(host);return;}
  if(type==='agent-ping'&&role==='agent'){send(ws,{type:'agent-pong'});return;}
  const id=clean(msg.sessionId);const session=connections.get(id);
  if(type==='watch'&&role==='viewer'){if(!session||session.viewer!==viewer.email){send(ws,{type:'error',error:'Session not found'});return;}session.viewerWS=ws;if(session.approved)send(ws,{type:'accepted',sessionId:id});for(const signal of session.pendingViewerSignals.splice(0))send(ws,signal);return;}
  if(!session)return;
  const isHost=(role==='host'||role==='agent')&&session.host===host;
  const isViewer=role==='viewer'&&session.viewer===viewer.email&&session.viewerWS===ws;
  if(!isHost&&!isViewer)return;
  if(type==='accept'&&isHost&&!session.approved){if(isAgentApprovalExpired(session,now())){endSession(id,'Approval expired',host.ownerEmail);return;}session.approved=true;send(session.viewerWS,{type:'accepted',sessionId:id});if(role==='agent')send(ws,{type:'agent-session-approved',sessionId:id});addAudit('session','อนุมัติการแชร์ภาพ',host.name,host.ownerEmail,[host.ownerEmail,session.viewer]);return;}
  if(type==='reject'&&isHost&&!session.approved){endSession(id,'Host rejected',host.ownerEmail);return;}
  if(type==='end'){endSession(id,'Participant ended',isHost?host.ownerEmail:viewer.email);return;}
  if(!session.approved)return;
  if(type==='signal'&&msg.payload&&JSON.stringify(msg.payload).length<100_000){if(isHost&&!session.viewerWS){if(session.pendingViewerSignals.length<100)session.pendingViewerSignals.push({type:'signal',sessionId:id,payload:msg.payload});}else send(isHost?session.viewerWS:session.host.ws,{type:'signal',sessionId:id,payload:msg.payload});return;}
  if(type==='screen-frame'&&isHost&&role==='agent'&&validateAgentFrame(msg.frame,msg.width,msg.height)){
   if(now()-session.frameWindowStart>=1000){session.frameWindowStart=now();session.frameCount=0;}if(++session.frameCount>8)return;
   send(session.viewerWS,{type:'screen-frame',sessionId:id,frame:msg.frame,width:msg.width,height:msg.height});return;
  }
  if(type==='input'&&isViewer&&session.host.agent){
   if(now()-session.inputWindowStart>=1000){session.inputWindowStart=now();session.inputCount=0;}if(++session.inputCount>120)return;
   const input=validateAgentInput(msg.input);if(input)send(session.host.ws,{type:'input',sessionId:id,input});return;
  }
  if(type==='chat'&&typeof msg.text==='string'){send(isHost?session.viewerWS:session.host.ws,{type:'chat',sessionId:id,text:msg.text.slice(0,2000)});return;}
  if(type==='change-request'&&isViewer){send(session.host.ws,{type:'change-request',sessionId:id});return;}
 });
 ws.on('close',()=>{clearInterval(timer);if((role==='host'||role==='agent')&&host?.ws===ws){host.ws=null;if(host.activeSession)endSession(host.activeSession,'Host disconnected',host.ownerEmail);hosts.delete(host.code);if(role==='agent'&&agentsOnline.get(host.id)===host)agentsOnline.delete(host.id);}if(role==='viewer'){const owned=userSockets.get(viewer.email);owned?.delete(ws);if(owned&&!owned.size)userSockets.delete(viewer.email);for(const session of connections.values())if(session.viewerWS===ws)endSession(session.id,'Viewer disconnected',viewer.email);}});
}
function staticFile(req,res,pathname){let file;try{file=decodeURIComponent(pathname)}catch{return reject(res,400,'Bad path')}if(file==='/'||!path.extname(file))file='/index.html';const candidate=path.resolve(DIST,'.'+file);if(!candidate.startsWith(DIST+path.sep))return reject(res,403,'Forbidden');fs.stat(candidate,(err,stat)=>{if(err||!stat.isFile())return reject(res,404,'File not found. Run npm run build first.');headers(res,200,{'Content-Type':mime[path.extname(candidate)]||'application/octet-stream','Cache-Control':file==='/sw.js'||file==='/index.html'?'no-cache':'public, max-age=86400','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin'});fs.createReadStream(candidate).pipe(res);});}
const server=http.createServer((req,res)=>{if(!['GET','POST'].includes(req.method))return reject(res,405,'Not allowed');let pathname;try{pathname=new URL(req.url||'/',`http://${req.headers.host}`).pathname}catch{return reject(res,400,'Invalid URL')};if(pathname.startsWith('/api/'))return handleApi(req,res,pathname).catch(err=>{console.error('API error:',err.message);if(!res.headersSent)reject(res,500,'Internal server error')});if(req.method!=='GET')return reject(res,405,'Not allowed');staticFile(req,res,pathname);});
server.on('upgrade',handleWebSocket);
setInterval(cleanup,60_000).unref();
server.listen(PORT,HOST,()=>console.log(`KRABAK Remote Manager on http://${HOST}:${PORT} (admin configured: ${!!readAdmin()})`));
