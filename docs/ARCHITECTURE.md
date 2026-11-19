# โครงสร้าง KRABAK Remote Manager

```text
Admin / Teacher browser
  ├─ Password + mandatory TOTP MFA / one-time teacher activation
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

Windows Agent (แยกติดตั้งบนเครื่องผู้ใช้; production signing pending)
  ├─ .NET 10 user-mode tray process; DPAPI device token
  ├─ native consent dialog for cross-account pairing + visible Stop window
  ├─ bounded JPEG frames over authenticated WSS
  └─ allowlisted mouse/keyboard events through Win32 SendInput
```

Host อยู่ในระบบและเชื่อม WebSocket ขณะรอคำขอได้ แม้ผู้ใช้กำลังดูหน้าอื่นของเว็บแอป เมื่อคำขอเข้ามา UI แสดงกล่องอนุญาตกลางหน้าจอ ปุ่มอนุญาตต้องมาจากการกดของผู้ใช้และจึงเรียก `getDisplayMedia()` เพื่อเปิด Browser picker การอนุญาตเว็บครั้งก่อนจะไม่ถูกใช้แทนการยืนยันนี้

## Windows Agent

Source ปัจจุบันอยู่ใน `agent/windows/`; CI compile unsigned development build เพื่อตรวจโค้ดแต่ไม่เผยแพร่ artifact ส่วน signed release ต้องผ่าน test และ Authenticode verification ก่อน การควบคุม Windows จริงต้องติดตั้ง Agent บนทุกเครื่องเป้าหมาย:

1. .NET 10 WinForms user-mode Agent เลือกจอหนึ่งจอและส่ง JPEG ผ่าน WSS; ใช้ Win32 SendInput สำหรับเมาส์/คีย์บอร์ด allowlist
2. Same-account direct access ต้องเลือก trusted access บน Agent และเปิด server flag `KRABAK_AGENT_TRUSTED_ACCESS_ENABLED=1`; flag ถูกปิดเป็นค่าเริ่มต้นและห้ามเปิดก่อน MFA/security review. Cross-account pairing แสดงหน้าต่าง native ขออนุญาต และมี Stop window ระหว่างเซสชัน
3. Agent token ใช้ DPAPI ของบัญชี Windows ปัจจุบัน; ไม่ยกระดับสิทธิ์, ไม่สร้าง auto-start, ไม่เข้าถึง UAC/secure desktop
4. เว็บบังคับ TOTP MFA แล้ว; ยังต้องตั้งค่า code-signing certificate, ตรวจ signature และทำ security review ก่อนแจกจ่าย production
5. Window capture, หลายจอพร้อมกัน, native touchscreen, clipboard, file transfer, updater และ service mode ยังเป็นงานระยะถัดไป

**ห้ามอ้างว่า Browser Share ควบคุมเมาส์หรือคีย์บอร์ด Windows ได้** Browser API อนุญาตเฉพาะการ capture ที่ผู้ใช้เลือก

## Production และ deployment

- GitHub Actions ทดสอบและ build เว็บ; Windows Agent production release ทำงานจาก version tag และจะไม่เผยแพร่ถ้า Authenticode verification ไม่ผ่าน
- Deploy เข้า Serva อัตโนมัติเมื่อ push `main` ผ่าน CI และใช้ dedicated SSH receiver/key
- ควรตรวจ URL `remote.krabak.ac.th`, TLS, Nginx, UFW และ systemd ด้วย health check ก่อนอ้างว่า deploy สำเร็จ
- พอร์ต 8787 ต้องรับเฉพาะ localhost; SSH host key ต้องเทียบกับ fingerprint ที่ pin ไว้
