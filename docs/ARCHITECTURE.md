# โครงสร้าง KRABAK Remote Manager

```text
Admin / Teacher browser
  ├─ Login / one-time teacher activation
  ├─ Role-scoped active Host list and audit
  └─ Viewer: request by temporary pairing code
       │ REST + WSS over HTTPS
       ▼
Nginx reverse proxy
       │ localhost only
       ▼
Node Backend :8787
  ├─ Admin and teacher auth, role checks
  ├─ Teacher accounts file outside web root (0700/0600)
  ├─ Temporary Host registrations and pairing codes
  ├─ Session/consent and WebSocket signaling
  └─ Static PWA files
       │ WebRTC DTLS-SRTP
       ▼
Browser Host: visible request popup + user approval + browser source picker

Windows Agent (แยกติดตั้งบนเครื่องผู้ใช้; development/unsigned)
  ├─ .NET 10 user-mode tray process; DPAPI device token
  ├─ native consent dialog for cross-account pairing + visible Stop window
  ├─ bounded JPEG frames over authenticated WSS
  └─ allowlisted mouse/keyboard events through Win32 SendInput
```

Host อยู่ในระบบและเชื่อม WebSocket ขณะรอคำขอได้ แม้ผู้ใช้กำลังดูหน้าอื่นของเว็บแอป เมื่อคำขอเข้ามา UI แสดงกล่องอนุญาตกลางหน้าจอ ปุ่มอนุญาตต้องมาจากการกดของผู้ใช้และจึงเรียก `getDisplayMedia()` เพื่อเปิด Browser picker การอนุญาตเว็บครั้งก่อนจะไม่ถูกใช้แทนการยืนยันนี้

## Windows Agent รุ่นทดลอง

Source ปัจจุบันอยู่ใน `agent/windows/` และ CI สร้าง x64 development artifact แบบ unsigned แยกจาก web release การควบคุม Windows จริงต้องติดตั้ง Agent บนทุกเครื่องเป้าหมาย:

1. .NET 10 WinForms user-mode Agent เลือกจอหนึ่งจอและส่ง JPEG ผ่าน WSS; ใช้ Win32 SendInput สำหรับเมาส์/คีย์บอร์ด allowlist
2. Same-account direct access ต้องเปิด trusted access เองบน Agent; cross-account pairing แสดงหน้าต่าง native ขออนุญาต และมี Stop window ระหว่างเซสชัน
3. Agent token ใช้ DPAPI ของบัญชี Windows ปัจจุบัน; ไม่ยกระดับสิทธิ์, ไม่สร้าง auto-start, ไม่เข้าถึง UAC/secure desktop
4. ยังต้องทำ MFA, security review, code-signing และ signed installer ก่อน production
5. Window capture, หลายจอพร้อมกัน, native touchscreen, clipboard, file transfer, updater และ service mode ยังเป็นงานระยะถัดไป

**ห้ามอ้างว่า Browser Share ควบคุมเมาส์หรือคีย์บอร์ด Windows ได้** Browser API อนุญาตเฉพาะการ capture ที่ผู้ใช้เลือก

## Production และ deployment

- GitHub Actions ทดสอบและ build ก่อนสร้าง release artifact
- Deploy เข้า Serva อัตโนมัติเมื่อ push `main` ผ่าน CI และใช้ dedicated SSH receiver/key
- ควรตรวจ URL `remote.krabak.ac.th`, TLS, Nginx, UFW และ systemd ด้วย health check ก่อนอ้างว่า deploy สำเร็จ
- พอร์ต 8787 ต้องรับเฉพาะ localhost; SSH host key ต้องเทียบกับ fingerprint ที่ pin ไว้
