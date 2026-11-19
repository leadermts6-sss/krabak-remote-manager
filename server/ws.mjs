import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
// A small dependency-free RFC6455 TEXT transport for same-origin WebSocket signaling.
// Frame payloads are capped and client masking is mandatory; screen media flows through WebRTC.
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_OUTGOING_FRAME_BYTES=1_000_000;
const MAX_SOCKET_QUEUED_BYTES=1_500_000;
const CLOSE_HANDSHAKE_TIMEOUT_MS=1_000;
const utf8Decoder=new TextDecoder('utf-8',{fatal:true});
const closeStatusPayload=code=>Buffer.from([code>>8,code&0xff]);
function closePayloadError(payload){
 if(payload.length===0)return null;
 if(payload.length===1||payload.length>125)return 1002;
 const code=payload.readUInt16BE(0);
 if(code<1000||code>=5000||[1004,1005,1006,1015].includes(code)||(code>=1016&&code<2000))return 1002;
 try{utf8Decoder.decode(payload.subarray(2));}catch{return 1007;}
 return null;
}
function controlFrame(op,payload){return Buffer.concat([Buffer.from([0x80|op,payload.length]),payload]);}
export function wsUpgrade(req,socket,head,originAllowed){
 const key=req.headers['sec-websocket-key'];
 if(!key||!originAllowed(req)||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'){
   socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return null;
 }
 const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
 socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
 const conn=new MiniWebSocket(socket);if(head?.length)conn.receive(head);return conn;
}
export class MiniWebSocket extends EventEmitter{
 constructor(socket){super();this.socket=socket;this.buffer=Buffer.alloc(0);this.closed=false;this.closeSent=false;this.awaitingCloseResponse=false;this.closeTimer=null;this.closeEventEmitted=false;
  socket.on('data',chunk=>this.receive(chunk));socket.on('error',()=>this.finishClose(false));socket.on('close',()=>this.finishClose(false));socket.setTimeout(0);}
 receive(chunk){if(this.closed&&!this.awaitingCloseResponse)return;this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>1_500_000)return this.protocolError(1009);
  while(this.buffer.length>=2){let first=this.buffer[0],op=first&15,fin=(first&128)!==0,second=this.buffer[1],masked=(second&128)!==0,len=second&127,pos=2;
   if(!masked||!fin)return this.protocolError(1002);if(len===126){if(this.buffer.length<4)return;len=this.buffer.readUInt16BE(2);pos=4;}
   else if(len===127){if(this.buffer.length<10)return;let big=this.buffer.readBigUInt64BE(2);if(big>BigInt(1_048_576))return this.protocolError(1009);len=Number(big);pos=10;}
   if(len>1_048_576)return this.protocolError(1009);if(this.buffer.length<pos+4+len)return;
   const mask=this.buffer.subarray(pos,pos+4);pos+=4;const payload=Buffer.from(this.buffer.subarray(pos,pos+len));this.buffer=this.buffer.subarray(pos+len);
   for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
   if(op>=0x8&&len>125)return this.protocolError(1002);
   if(op===0x8){if(this.awaitingCloseResponse){if(closePayloadError(payload))return this.terminate();return this.finishClose(true);}return this.replyToPeerClose(payload);}
   if(op===0x9){if(!this.closed)this.frame(0xa,payload);continue;}if(op===0xa)continue;
   if(this.closed)continue;
   if(op===0x2)return this.protocolError(1003);if(op!==0x1)return this.protocolError(1002);
   try{this.emit('message',JSON.parse(payload.toString('utf8')));}catch{this.send({type:'error',error:'Invalid JSON'});}
  }}
 frame(op,data,{dropOnBackpressure=false}={}){if(this.closed)return false;const n=data.length;const headerLength=n<126?2:n<65536?4:10;const queued=this.socket.writableLength||0;
  if(n>MAX_OUTGOING_FRAME_BYTES||queued+headerLength+n>MAX_SOCKET_QUEUED_BYTES){if(!dropOnBackpressure)this.close();return false;}
  const head=n<126?Buffer.from([0x80|op,n]):n<65536?Buffer.from([0x80|op,126,n>>8,n&255]):(()=>{const b=Buffer.alloc(10);b[0]=0x80|op;b[1]=127;b.writeBigUInt64BE(BigInt(n),2);return b;})();
  this.socket.write(Buffer.concat([head,data]));return true;}
 send(obj){try{return this.frame(1,Buffer.from(JSON.stringify(obj),'utf8'),{dropOnBackpressure:obj?.type==='screen-frame'})}catch{this.close();return false}}
 protocolError(code){if(this.awaitingCloseResponse)return this.terminate();return this.close(closeStatusPayload(code));}
 close(payload=Buffer.alloc(0)){if(this.closed)return;const source=Buffer.from(payload);const errorCode=closePayloadError(source);const data=errorCode?closeStatusPayload(errorCode):source;this.closed=true;this.closeSent=true;this.awaitingCloseResponse=true;
  try{if(this.socket.destroyed||!this.socket.writable)return this.finishClose(false);this.socket.write(controlFrame(0x8,data));}
  catch{this.finishClose(false);return;}
  this.emitCloseOnce();this.closeTimer=setTimeout(()=>this.finishClose(true),CLOSE_HANDSHAKE_TIMEOUT_MS);this.closeTimer.unref();}
 replyToPeerClose(payload){const errorCode=closePayloadError(payload);const data=errorCode?closeStatusPayload(errorCode):payload;this.closed=true;this.closeSent=true;
  try{if(this.socket.destroyed||!this.socket.writable)return this.finishClose(false);this.socket.end(controlFrame(0x8,data));}
  catch{try{this.socket.destroy()}catch{}}
  this.emitCloseOnce();this.awaitingCloseResponse=false;this.clearCloseTimer();}
 terminate(){this.closed=true;this.awaitingCloseResponse=false;this.clearCloseTimer();try{if(!this.socket.destroyed)this.socket.destroy()}catch{}this.emitCloseOnce();}
 finishClose(endTransport){this.closed=true;this.awaitingCloseResponse=false;this.clearCloseTimer();if(endTransport&&!this.socket.destroyed&&!this.socket.writableEnded){try{this.socket.end()}catch{try{this.socket.destroy()}catch{}}}this.emitCloseOnce();}
 emitCloseOnce(){if(this.closeEventEmitted)return;this.closeEventEmitted=true;this.emit('close');}
 clearCloseTimer(){if(this.closeTimer){clearTimeout(this.closeTimer);this.closeTimer=null;}}
}
