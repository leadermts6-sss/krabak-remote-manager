# บันทึกความปลอดภัย — KRABAK Remote Manager

## สิ่งที่ทำงานใน source ปัจจุบัน

- บัญชี Admin เดิมใช้ scrypt, random salt และ session cookie HttpOnly/SameSite Strict; `Secure` ใช้เมื่อเชื่อถือ HTTPS proxy
- บัญชีครูถูกสร้างโดย Admin เท่านั้น ใช้ activation code สุ่มแบบใช้ครั้งเดียว อายุ 24 ชั่วโมง; เก็บ digest ของ code ไม่เก็บ code หลังส่งผลตอบกลับ
- Admin ออกรหัสใหม่ให้บัญชีที่ยังรอเปิดใช้หรือบัญชีที่เปิดใช้แล้วได้; รหัสเดิมใช้ไม่ได้และบัญชีที่ถูกรีเซ็ตต้องตั้งรหัสผ่านใหม่
- รหัสผ่านครูใช้ scrypt และต้องเป็นอักษรอังกฤษกับตัวเลข 12–128 ตัว
- ทุกบัญชีต้องยืนยัน TOTP MFA หลังตรวจรหัสผ่าน; password-only challenge ใช้ได้ 5 นาทีแต่เข้า API หรือ WebSocket ไม่ได้
- TOTP secret ถูกเข้ารหัสด้วย AES-256-GCM ใน data directory; recovery code สุ่มใช้ครั้งเดียวและจัดเก็บเป็น hash; TOTP time step ที่ใช้แล้วจะถูกปฏิเสธเพื่อกัน replay
- ผู้ใช้ตั้งค่า MFA ใหม่ได้หลังยืนยัน TOTP หรือ recovery code ซึ่งจะยกเลิก session ทุกอุปกรณ์และบังคับลงทะเบียน MFA ใหม่ในการเข้าสู่ระบบครั้งถัดไป
- `mfa.key` ต้องสำรองและกู้คืนร่วมกับ `admin.json` และ `users.json`; การสูญหายของกุญแจต้องทำ MFA enrollment ใหม่
- รายการบัญชีครูเก็บนอก web root ด้วย directory/file permissions `0700`/`0600`; ห้ามนำไฟล์ข้อมูลขึ้น repo หรือ artifact
- สิทธิ์ Admin/Teacher ตรวจที่ API; รายการ Host และ audit จำกัดตามเจ้าของบัญชี
- ปิด/ออก activation code ใหม่จะเพิกถอน session, WebSocket, Host และเซสชันที่เกี่ยวข้อง
- Browser Host ต้องอนุมัติคำขอและเลือกแหล่งแชร์จาก Browser picker ทุกครั้ง
- Windows Agent ใช้ token สุ่มที่เก็บเป็น digest ฝั่ง server; เครื่อง Windows เก็บ token ด้วย DPAPI, รับ input เฉพาะชนิดที่ allowlist, ทำงานเป็น user ปกติ และแสดงปุ่ม Stop ระหว่างเซสชัน
- คำขอข้ามบัญชีต้องอนุมัติในหน้าต่าง native บน Windows; same-account trusted access ต้องเลือกจาก Agent และยังถูกปิดกั้นฝั่ง server เว้นแต่ตั้ง `KRABAK_AGENT_TRUSTED_ACCESS_ENABLED=1` หลังเพิ่ม MFA และผ่าน security review
- WebRTC ใช้ DTLS-SRTP และ DataChannel; backend ไม่เก็บไฟล์หรือ media
- Backend ค่าเริ่มต้น bind `127.0.0.1:8787`; ห้ามเปิดพอร์ตนี้สู่สาธารณะ
- GitHub Actions ใช้ deploy-only key/receiver, pinned Serva host-key fingerprint และ SSH แบบ `BatchMode`/`StrictHostKeyChecking`

## ข้อจำกัด

- MFA ถูกบังคับใช้สำหรับบัญชีที่มีสิทธิ์; trusted same-account access ยังคงปิดไว้ใน server จนกว่าจะผ่าน security review และตั้งค่าโดยผู้ดูแล
- CI compile unsigned development build ไว้ตรวจโค้ดแต่ไม่เผยแพร่; ห้ามแจกจ่าย Agent จนกว่าจะมี code-signing certificate ที่ Windows เชื่อถือและ workflow ตรวจ Authenticode signature ผ่าน
- Agent registry คงอยู่ใน `KRABAK_DATA_DIR`; session, online status และ audit บางส่วนยังอยู่ในหน่วยความจำและหมดเมื่อ backend restart
- Sessions, Hosts ที่ออนไลน์ และ audit เก็บในหน่วยความจำ; restart ทำให้ข้อมูลชั่วคราวเหล่านี้หมดอายุ
- rate limiting เป็น in-memory; ควรจำกัดที่ reverse proxy และเฝ้าระวังความผิดปกติ
- Windows Agent ต้องติดตั้งแยกบน Windows เป้าหมายจึงควบคุม OS ได้ ไม่มี clipboard, file transfer, service mode หรือ unattended startup
- STUN-only อาจใช้ไม่ได้หลัง NAT บางชนิด; production อาจต้องมี coturn พร้อม ephemeral credentials
- Browser screen capture ต้องเกิดจาก gesture ของผู้ใช้และยืนยัน source ผ่าน Browser picker; ห้ามหลบ prompt

## ก่อนเพิ่มผู้ใช้หรือเปิดความสามารถใหม่

1. ทบทวน threat model และทำ security review / penetration test
2. ทำ security review/penetration test ของ MFA, policy ต่ออุปกรณ์, การเพิกถอนและ audit แบบเก็บถาวร
3. ตั้ง backup และทดสอบ restore สำหรับ `admin.json`, `users.json`, `mfa.key` และ credential โดยห้ามเก็บสำเนาใน web root
4. ตั้ง TURN ด้วย time-limited credentials, quotas และข้อจำกัด egress
5. ใช้ CSP เข้มงวดหลังนำ inline styles/scripts ออก
6. จำกัดหน้า admin ของระบบอื่นแยกจากเว็บแอป; ไม่เปิด aaPanel หรือ backend port โดยไม่จำเป็น
7. Windows Agent ต้องลงนาม binary, ตรวจ signature ใน updater, มี consent ที่เห็นชัด, allowlist, revocation และปุ่ม Stop

## Threat model

รหัสจับคู่ชั่วคราวเป็นคำเชิญ ไม่ใช่ identity ถาวร ผู้ใช้ที่ล็อกอินและรู้รหัสสามารถส่งคำขอได้ แต่ Host ยังต้องอนุญาตและเลือกแหล่งภาพเอง ทุกหน้าเว็บต้องเปิดเผยว่าการแชร์เกิดขึ้นอยู่ ห้ามอ้างว่าเว็บควบคุม Windows ได้ก่อนมี Agent ที่ผ่านการตรวจสอบ
