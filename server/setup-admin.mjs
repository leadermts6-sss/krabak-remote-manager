import readline from 'node:readline';
import {ADMIN_FILE,writeAdmin,readAdmin} from './auth.mjs';
if(readAdmin()){console.error('Admin already configured at '+ADMIN_FILE+'; exiting without changes.');process.exit(1)}
if(!process.stdin.isTTY){console.error('Run interactively on the VPS terminal. Password input must not be passed by arguments.');process.exit(1)}
const ask=(question,hidden=false)=>new Promise((resolve,reject)=>{
 if(!hidden){const rl=readline.createInterface({input:process.stdin,output:process.stdout});rl.question(question,val=>{rl.close();resolve(val)});return;}
 process.stdout.write(question);let text='';process.stdin.setRawMode(true);process.stdin.resume();const listener=chunk=>{for(const c of chunk.toString('utf8')){
 if(c==='\r'||c==='\n'){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdout.write('\n');resolve(text);return;}
 if(c==='\u0003'){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdout.write('\n');reject(new Error('Interrupted'));return;}
 if(c==='\u007f'){text=text.slice(0,-1);continue;}text+=c;
 }};process.stdin.on('data',listener);
});
try{const email=(await ask('Admin email: ')).trim();const pass=await ask('New password (min 12 chars, hidden): ',true);const confirm=await ask('Confirm password (hidden): ',true);if(pass!==confirm)throw new Error('Passwords do not match');writeAdmin(email,pass);console.log('Admin credential created at '+ADMIN_FILE+'. Do not upload this file or commit it to Git.');}catch(err){console.error(err.message);process.exitCode=1;}
