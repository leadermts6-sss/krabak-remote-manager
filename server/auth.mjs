import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const DATA_DIR=path.resolve(process.env.KRABAK_DATA_DIR||path.join(process.cwd(),'.local-data'));
export const ADMIN_FILE=path.join(DATA_DIR,'admin.json');
export function ensureDataDir(){fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});try{fs.chmodSync(DATA_DIR,0o700)}catch{}}
export function hashPassword(password,salt=crypto.randomBytes(24).toString('hex')){const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');return {salt,hash};}
export function verifyPassword(candidate,record){if(typeof candidate!=='string'||!record?.salt||!record?.hash)return false;try{const hash=hashPassword(candidate,record.salt).hash;return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(record.hash,'hex'));}catch{return false;}}
export function readAdmin(){try{return JSON.parse(fs.readFileSync(ADMIN_FILE,'utf8'))}catch{return null}}
export function writeAdmin(email,password){if(password.length<12||password.length>256)throw new Error('Password must be 12–256 characters');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('Invalid email');ensureDataDir();if(fs.existsSync(ADMIN_FILE))throw new Error('Admin already exists: refusing to overwrite');const record={email:email.trim().toLowerCase(),...hashPassword(password),createdAt:new Date().toISOString()};fs.writeFileSync(ADMIN_FILE,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return record;}
export const makeToken=()=>crypto.randomBytes(32).toString('base64url');
export function parseCookies(str=''){return Object.fromEntries(str.split(';').map(x=>x.trim()).filter(x=>x.includes('=')).map(x=>{const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1)]}));}
