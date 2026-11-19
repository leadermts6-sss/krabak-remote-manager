# KRABAK Remote Manager

KRABAK Remote Manager เป็นเว็บแอป/PWA สำหรับบัญชีผู้ดูแลและครู เชื่อมต่อ Host ที่กำลังออนไลน์ และดูภาพหน้าจอหรือหน้าต่างผ่าน Browser Share

## ขอบเขตการทำงาน

- ผู้ดูแลสร้างบัญชีครูด้วยอีเมลและส่งรหัสเปิดใช้ครั้งเดียว (อายุ 24 ชั่วโมง); ครูตั้งรหัสผ่านเองในหน้าล็อกอิน
- รหัสผ่านครูต้องมีตัวอักษรภาษาอังกฤษและตัวเลข ความยาว 12–128 ตัว
- ทุกบัญชีต้องตั้งค่า TOTP MFA ในการเข้าสู่ระบบครั้งแรก; การยืนยันรหัสผ่านอย่างเดียวไม่เปิด session
- ระบบออก recovery code ใช้ครั้งเดียว เก็บเป็น hash และให้เปลี่ยนชุดใหม่ได้หลังยืนยัน TOTP
- ผู้ใช้ตั้งค่า MFA ใหม่ได้เมื่อยืนยัน TOTP หรือ recovery code; การรีเซ็ตจะยกเลิก session ที่เปิดอยู่
- ผู้ดูแลเห็น Host และประวัติทั้งหมด; ครูเห็น Host และประวัติตามบัญชีของตัวเอง
- Browser Host ลงชื่อเข้าใช้และสร้างรหัสจับคู่ชั่วคราว ผู้ดูหรือครูส่งคำขอเชื่อมต่อได้
- Browser Host ต้องอนุญาตคำขอและเลือกหน้าต่าง จอ หรือแท็บผ่านหน้าต่างของเบราว์เซอร์
- Windows Agent รุ่น public v0.1.0 ใช้แชร์จอและส่งเมาส์/คีย์บอร์ด Windows จริงผ่าน allowlist; ดาวน์โหลด ZIP ได้จาก [GitHub Releases](https://github.com/leadermts6-sss/krabak-remote-manager/releases) โดยไฟล์รุ่นนี้ยังไม่มีลายเซ็น Authenticode
- บัญชีเดียวกันเริ่มเซสชันตรงได้เมื่อผู้ใช้เปิด “เชื่อถือบัญชีนี้” บน Agent; คำขอจากบัญชีอื่นยังต้องกดยอมรับบนเครื่อง Windows
- เมื่อคำขอมาถึง Host จะแสดงกล่องอนุญาตกลางหน้าจอ แม้กำลังใช้งานหน้าอื่นในแอป
- สตรีมภาพใช้ WebRTC; แชตและ signaling ใช้ WebSocket; ไฟล์ส่งผ่าน DataChannel ขนาดไม่เกิน 8 MB
- Host หยุดการแชร์ได้จากหน้าเว็บหรือจาก Chrome/Edge

Browser Share ยังคงเป็น view-only และไม่สามารถข้าม browser picker ได้ การควบคุม Windows จริงทำได้เฉพาะกับ Windows Agent ที่ติดตั้งและลงทะเบียนบนเครื่องนั้นแล้ว Agent v0.1.0 เป็น public production-channel build แต่ยังไม่ลงนาม Authenticode; Windows อาจแสดงผู้เผยแพร่ไม่ทราบชื่อ โปรดตรวจ SHA-256 และอย่าปิด SmartScreen หรือระบบป้องกันเครื่อง

### Windows Agent

- โค้ดอยู่ใน `agent/windows/` และ build ได้ด้วย .NET 10 SDK บน Windows:

  ```powershell
  dotnet publish agent/windows/KrabakRemoteAgent.csproj --configuration Release --runtime win-x64 --self-contained true --output artifacts/krabak-agent
  ```

- GitHub Actions เผยแพร่รุ่น production-channel เมื่ออัปเดต RELEASE_VERSION และ RELEASE_NOTES.md โดยสร้าง self-contained ZIP สำหรับ Windows x64 และไฟล์ SHA-256 จาก source บน main
- รุ่น v0.1.0 ยังไม่ลงนาม Authenticode และไม่มี installer หรือ auto-start; Windows อาจแจ้ง Unknown Publisher จนกว่าจะได้รับอนุมัติบริการ code signing
- หลังลงทะเบียนอุปกรณ์แล้ว หน้ารายการจะเห็นสถานะออนไลน์และปุ่ม “ควบคุม Windows”; ก่อนติดตั้ง Agent เว็บจะแจ้งว่าเครื่องยังต้องใช้ Agent เพราะยังไม่มี process บน Windows ที่ส่ง input จริงได้
- ใช้ได้เฉพาะบัญชี Windows ปัจจุบันและจอที่เลือก; ไม่รองรับหน้าต่าง UAC/secure desktop, การควบคุมโปรแกรมที่ยกระดับสิทธิ์, native touchscreen, หลายจอพร้อมกัน, clipboard หรือ file transfer

## Code signing policy and privacy

ดู [Code signing policy](CODE_SIGNING_POLICY.md) และ [Privacy notice](PRIVACY.md) สถานะปัจจุบันคือ Agent v0.1.0 ยังไม่ลงนาม Authenticode และยังไม่มี SignPath certificate ที่ใช้งานอยู่

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
- Windows Agent v0.1.0 ดาวน์โหลดได้จาก GitHub Releases แต่ยังไม่มีลายเซ็น Authenticode; การขอ SignPath และการลงนามในอนาคตยังไม่เสร็จ
- Agent token ถูกเก็บด้วย DPAPI ของบัญชี Windows ปัจจุบัน; การถอนอุปกรณ์ทำผ่านหน้าอุปกรณ์หรือใน Agent
- Browser capture ต้องมีกดอนุญาตและเลือกแหล่งแชร์โดยผู้ใช้บน Host ทุกครั้ง
- การทดสอบ UI ข้ามเครือข่ายต้องทำจาก Chrome/Edge สองเครื่องที่ผู้ใช้ควบคุมและยินยอม

**เอกสารประกอบ:** `docs/FEATURE_MATRIX.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `PRIVACY.md`, `CODE_SIGNING_POLICY.md`, `docs/CODEX_DEPLOY_PROMPT.md`

## ใบอนุญาตและบริการ

โค้ดในโปรเจ็กต์นี้กำหนดให้ใช้ GNU Affero General Public License รุ่น 3 (`AGPL-3.0-only`) อ่านข้อความใบอนุญาตฉบับเต็มได้ที่ [`LICENSE`](LICENSE) ผู้ใช้สามารถนำซอร์สโค้ดไปใช้ แก้ไข และแจกจ่ายได้ตามเงื่อนไขของใบอนุญาต รวมถึงข้อกำหนดการเสนอซอร์สโค้ดที่เกี่ยวข้องเมื่อให้บริการโปรแกรมที่แก้ไขแล้วผ่านเครือข่าย

บริการโฮสต์ KRABAK, ค่าโฮสต์หรือโครงสร้างพื้นฐาน, การสนับสนุน และบริการประกอบอื่นเป็นบริการแยกจากใบอนุญาตซอฟต์แวร์ การเรียกเก็บค่าบริการเหล่านั้นไม่ได้จำกัดสิทธิที่ AGPL-3.0 ให้ไว้กับซอร์สโค้ด

repository นี้เปิดเป็น public แล้ว ซอร์สโค้ดและประวัติ commit เปิดเผยต่อสาธารณะตามการตั้งค่าของ GitHub
