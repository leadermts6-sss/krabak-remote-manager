# KRABAK Remote Manager

KRABAK Remote Manager เป็นเว็บแอป/PWA สำหรับบัญชีผู้ดูแลและครู เชื่อมต่อ Host ที่กำลังออนไลน์ และดูภาพหน้าจอหรือหน้าต่างผ่าน Browser Share

## ขอบเขตการทำงาน

- ผู้ดูแลสร้างบัญชีครูด้วยอีเมลและส่งรหัสเปิดใช้ครั้งเดียว (อายุ 24 ชั่วโมง); ครูตั้งรหัสผ่านเองในหน้าล็อกอิน
- รหัสผ่านครูต้องมีตัวอักษรภาษาอังกฤษและตัวเลข ความยาว 12–128 ตัว
- ผู้ดูแลเห็น Host และประวัติทั้งหมด; ครูเห็น Host และประวัติตามบัญชีของตัวเอง
- Host ลงชื่อเข้าใช้และสร้างรหัสจับคู่ชั่วคราว ผู้ดูหรือครูส่งคำขอเชื่อมต่อได้
- Host ต้องอนุญาตทุกคำขอและเลือกหน้าต่าง จอ หรือแท็บผ่านหน้าต่างของเบราว์เซอร์
- เมื่อคำขอมาถึง Host จะแสดงกล่องอนุญาตกลางหน้าจอ แม้กำลังใช้งานหน้าอื่นในแอป
- สตรีมภาพใช้ WebRTC; แชตและ signaling ใช้ WebSocket; ไฟล์ส่งผ่าน DataChannel ขนาดไม่เกิน 8 MB
- Host หยุดการแชร์ได้จากหน้าเว็บหรือจาก Chrome/Edge

**ระบบเว็บนี้เป็น view-only** การควบคุมเมาส์และคีย์บอร์ดของ Windows จริงต้องพัฒนาและติดตั้ง Windows Agent ที่ได้รับอนุญาต ไม่สามารถข้ามหน้าต่างอนุญาตหรือหน้าต่างเลือกแหล่งแชร์ของเบราว์เซอร์ได้

## พัฒนาในเครื่อง

ต้องใช้ Node.js 20.19 ขึ้นไป

```powershell
npm ci
npm run dev
```

เปิด `http://localhost:5173` โดย Vite proxy จะส่ง `/api` และ `/ws` ไปยัง Backend พอร์ต 8787

```powershell
npm run build
npm test
```

## Backend และบัญชีผู้ดูแล

Backend รับการเชื่อมต่อบน `127.0.0.1:8787` หลัง Nginx reverse proxy เท่านั้น สร้างบัญชีผู้ดูแลครั้งแรกใน Terminal ที่เชื่อถือได้:

```powershell
npm run setup:admin
```

กรอกอีเมลและรหัสผ่านแบบ interactive รหัสผ่านไม่ถูกบันทึกใน shell history หรือแสดงบนหน้าจอ อย่าส่งไฟล์ credential หรือ `KRABAK_DATA_DIR` ขึ้น GitHub

สำหรับ production ให้กำหนด `KRABAK_PUBLIC_ORIGIN`, `KRABAK_TRUST_PROXY=1`, path ข้อมูลภายนอก web root และตั้งค่า systemd/Nginx ตามไฟล์ใน `deploy/` เท่านั้น

## การ Deploy

GitHub Actions ตรวจ dependency, ทดสอบ backend และ build frontend ก่อนสร้าง release artifact จากนั้น Deploy ไป Serva อัตโนมัติเมื่อ push ไป `main` และการตรวจผ่าน โดยใช้ environment secret `DEPLOY_SSH_KEY` และตรวจ Host Key Fingerprint ที่ pin ไว้ก่อนเรียก restricted deploy receiver

ห้ามใส่ private key, activation code, รหัสผ่าน, `admin.json` หรือข้อมูลผู้ใช้ใน repository, workflow log หรือ release artifact

## ข้อจำกัดก่อนขยายการใช้งาน

- Session, Host ที่ออนไลน์ และ audit ปัจจุบันเก็บในหน่วยความจำของ Node; restart ทำให้ session หาย
- STUN อย่างเดียวอาจเชื่อมต่อไม่ได้เมื่อ NAT เข้มงวด; อาจต้องตั้ง coturn พร้อม ephemeral credentials
- ยังไม่มี Windows Agent, OS input, clipboard sync, MFA หรือ per-device policy
- Browser capture ต้องมีกดอนุญาตและเลือกแหล่งแชร์โดยผู้ใช้บน Host ทุกครั้ง
- การทดสอบ UI ข้ามเครือข่ายต้องทำจาก Chrome/Edge สองเครื่องที่ผู้ใช้ควบคุมและยินยอม

**เอกสารประกอบ:** `docs/FEATURE_MATRIX.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CODEX_DEPLOY_PROMPT.md`
