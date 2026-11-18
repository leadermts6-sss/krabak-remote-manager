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
Host browser: visible request popup + user approval + browser source picker
```

Host อยู่ในระบบและเชื่อม WebSocket ขณะรอคำขอได้ แม้ผู้ใช้กำลังดูหน้าอื่นของเว็บแอป เมื่อคำขอเข้ามา UI แสดงกล่องอนุญาตกลางหน้าจอ ปุ่มอนุญาตต้องมาจากการกดของผู้ใช้และจึงเรียก `getDisplayMedia()` เพื่อเปิด Browser picker การอนุญาตเว็บครั้งก่อนจะไม่ถูกใช้แทนการยืนยันนี้

## Windows Agent ระยะถัดไป

การควบคุม Windows จริงต้องพัฒนา Agent ที่ผู้ใช้ติดตั้งและอนุญาตโดยชัดเจน:

1. .NET 8 Windows Agent โดยใช้ Windows Graphics Capture สำหรับเลือก Window/Monitor จริง
2. ส่งภาพผ่าน WebRTC พร้อมสลับจอและหลาย track; จัดการ ICE/TURN สำหรับ NAT
3. input mouse/keyboard ผ่าน OS API โดย consent ต่อ session, policy แบบจำกัด และปุ่มหยุดบนเครื่อง
4. Clipboard แบบสองทิศทางที่ opt-in; file transfer ผ่าน directory allowlist และ confirmation
5. Device identity, revocation, audit, MFA/RBAC และ Windows auto-start ที่ผู้ใช้ตั้งค่าเอง
6. Installer/EXE signed และ updater ตรวจลายเซ็น พร้อม uninstall/revoke ที่ตรวจสอบได้

**ห้ามอ้างว่า Browser Share ควบคุมเมาส์หรือคีย์บอร์ด Windows ได้** Browser API อนุญาตเฉพาะการ capture ที่ผู้ใช้เลือก

## Production และ deployment

- GitHub Actions ทดสอบและ build ก่อนสร้าง release artifact
- Deploy เข้า Serva ผ่าน `main` เมื่อเปิด `PRODUCTION_DEPLOY_ENABLED` และใช้ dedicated SSH receiver/key
- ควรตรวจ URL `remote.krabak.ac.th`, TLS, Nginx, UFW และ systemd ด้วย health check ก่อนอ้างว่า deploy สำเร็จ
- พอร์ต 8787 ต้องรับเฉพาะ localhost; SSH host key ต้องเทียบกับ fingerprint ที่ pin ไว้