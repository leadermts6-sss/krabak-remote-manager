import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const DATA_DIR=path.resolve(process.env.KRABAK_DATA_DIR||path.join(process.cwd(),'.local-data'));
export const ADMIN_FILE=path.join(DATA_DIR,'admin.json');
export function ensureDataDir(){fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});try{fs.chmodSync(DATA_DIR,0o700)}catch{}}
export function hashPassword(password,salt=crypto.randomBytes(24).toString('hex')){const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');return {salt,hash};}
export function verifyPassword(candidate,record){if(typeof candidate!=='string'||!record?.salt||!record?.hash)return false;try{const hash=hashPassword(candidate,record.salt).hash;return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(record.hash,'hex'));}catch{return false;}}
export function readAdmin(){try{return JSON.parse(fs.readFileSync(ADMIN_FILE,'utf8'))}catch{return null}}
function persistAdmin(record){
 ensureDataDir();
 const temporaryFile=path.join(DATA_DIR,'.admin-'+process.pid+'-'+crypto.randomBytes(8).toString('hex')+'.tmp');
 let descriptor;
 try{
  descriptor=fs.openSync(temporaryFile,'wx',0o600);
  fs.writeFileSync(descriptor,JSON.stringify(record,null,2)+'\n','utf8');
  fs.fsyncSync(descriptor);fs.closeSync(descriptor);descriptor=undefined;
  fs.renameSync(temporaryFile,ADMIN_FILE);try{fs.chmodSync(ADMIN_FILE,0o600)}catch{}
 }catch(error){if(descriptor!==undefined)fs.closeSync(descriptor);try{fs.unlinkSync(temporaryFile)}catch{}throw error;}
}
export function setAdminMfa(email,encryptedSecret,recoveryCodeHashes,usedTotpCounter){
 const record=readAdmin();if(!record||record.email!==String(email).trim().toLowerCase())return false;
 record.mfaSecretEnc=encryptedSecret;record.recoveryCodeHashes=[...recoveryCodeHashes];record.mfaEnrolledAt=new Date().toISOString();record.usedTotpCounters=[usedTotpCounter];persistAdmin(record);return true;
}
export function consumeAdminTotpCounter(email,counter,currentCounter){
 const record=readAdmin();if(!record||record.email!==String(email).trim().toLowerCase())return false;
 const used=Array.isArray(record.usedTotpCounters)?record.usedTotpCounters:[];if(used.includes(counter))return false;
 record.usedTotpCounters=used.filter(value=>Number.isSafeInteger(value)&&value>=currentCounter-6);record.usedTotpCounters.push(counter);persistAdmin(record);return true;
}
export function consumeAdminRecoveryCode(email,suppliedHash){
 const record=readAdmin();if(!record||record.email!==String(email).trim().toLowerCase()||!Array.isArray(record.recoveryCodeHashes))return false;
 const supplied=Buffer.from(String(suppliedHash),'hex');
 const index=record.recoveryCodeHashes.findIndex(hash=>{try{const stored=Buffer.from(hash,'hex');return stored.length===supplied.length&&crypto.timingSafeEqual(stored,supplied)}catch{return false}});
 if(index<0)return false;record.recoveryCodeHashes.splice(index,1);persistAdmin(record);return true;
}
export function replaceAdminRecoveryCodes(email,recoveryCodeHashes){
 const record=readAdmin();if(!record||record.email!==String(email).trim().toLowerCase()||!record.mfaSecretEnc)return false;
 record.recoveryCodeHashes=[...recoveryCodeHashes];persistAdmin(record);return true;
}
export function resetAdminMfa(email){
 const record=readAdmin();if(!record||record.email!==String(email).trim().toLowerCase())return false;
 record.mfaSecretEnc=null;record.recoveryCodeHashes=[];record.mfaEnrolledAt=null;record.usedTotpCounters=[];persistAdmin(record);return true;
}
export function writeAdmin(email,password){if(password.length<12||password.length>256)throw new Error('Password must be 12–256 characters');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('Invalid email');ensureDataDir();if(fs.existsSync(ADMIN_FILE))throw new Error('Admin already exists: refusing to overwrite');const record={email:email.trim().toLowerCase(),...hashPassword(password),createdAt:new Date().toISOString()};fs.writeFileSync(ADMIN_FILE,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return record;}
export const makeToken=()=>crypto.randomBytes(32).toString('base64url');
export function parseCookies(str=''){return Object.fromEntries(str.split(';').map(x=>x.trim()).filter(x=>x.includes('=')).map(x=>{const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1)]}));}
