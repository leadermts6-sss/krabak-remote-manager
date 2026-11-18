# คำสั่งสำหรับ Codex — Deploy KRABAK Remote Manager บน Serva VPS

คุณคือ Senior Full-stack Developer, Linux DevOps และ Security Engineer

ผมแนบไฟล์ ZIP โครงการ `KRABAK Remote Manager 0.1.0` ซึ่งมี frontend Vite/Vanilla JS/PWA, Node backend, WebSocket signaling, WebRTC screen share (view-only), audit/session และไฟล์ deployment

**ข้อมูล VPS:**
- Serva VPS, Ubuntu 24.04, 2 vCPU / 4 GB RAM
- SSH user `serva`, IP `168.199.21.38`
- aaPanel Free บนเครื่องอยู่แล้ว (เคยพบพอร์ตแผงควบคุม `21537`)
- เว็บไซต์เดิม `krabak.ac.th`, `school.krabak.ac.th`, `student.krabak.ac.th` ต้องไม่ถูกกระทบ

## งานที่สั่ง

1. แตก ZIP และอ่าน `README_TH.md`, `docs/FEATURE_MATRIX.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md` และ `deploy/` ก่อนแก้หรือ Deploy
2. ตรวจสอบ VPS ผ่าน `ssh krabak-vps` หากตั้ง Host alias แล้ว หรือบัญชีเดิมที่ผู้ใช้อนุญาตเท่านั้น ห้ามแอบใช้ Key/Password จากโปรเจกต์ ห้ามถามรหัสผ่านในแชต
3. ตรวจสอบ aaPanel, Nginx, UFW, systemd, disk/CPU/RAM, port conflicts และบริการที่มีอยู่ ห้ามติดตั้งแพ็กเกจทับโดยไม่ประเมิน
4. เลือกโดเมนย่อยสำหรับเว็บรีโมต (เช่น `remote.krabak.ac.th` เป็นชื่อเสนอ **ยังไม่ใช่โดเมนที่ยืนยัน**) และให้ผู้ใช้อนุมัติก่อนเปลี่ยน DNS/เปิดเว็บไซต์
5. ตรวจสอบ source, ติดตั้ง Node.js LTS และ dependencies ที่จำเป็นจากแหล่งเชื่อถือได้, Build Vite และรัน lint/tests เพิ่มเติมตามความเหมาะสม
6. สร้างบัญชี Linux `krabak-remote` แบบ unprivileged, โฟลเดอร์รัน, data directory และ systemd service โดยไม่เปิด Backend port 8787 ต่อสาธารณะ
7. สร้าง admin credential ผ่านคำสั่ง interactive ใน Terminal ไม่ใส่ plaintext password ในคำสั่ง shell/log/chat/repo และไม่ตั้งรหัสผ่านเริ่มต้น
8. กำหนด HTTPS/TLS ผ่าน aaPanel, Nginx reverse proxy to localhost port 8787 และ WebSocket `/ws` อย่างถูกต้อง
9. ทดสอบ Login, PWA, Host 8-digit pairing code, viewer request, Host consent, browser window/screen chooser, WebRTC video, chat, upload/download และหยุดแชร์โดยฝั่ง Host
10. หากทดสอบต่างเครือข่ายไม่ผ่าน ให้ติดตั้ง/วางแผน coturn ตามความจำเป็น ไม่อ้างว่า STUN เพียงอย่างเดียวรองรับ NAT ได้ทุกแบบ
11. ให้ระบบเริ่มอัตโนมัติหลัง reboot ด้วย systemd และทดสอบ health checks โดยไม่ reboot VPS โดยพลการ
12. อธิบายชัดเจนว่าการแสดงผล Window/Monitor จริงผ่าน browser API เป็น **view-only**; อย่าอ้างว่าควบคุมโปรแกรม Windows จริงได้จนกว่าจะพัฒนา Windows Agent

## เรื่องการเข้าถึงรายแอปและหลายจอในเฟสถัดไป

ให้จัดทำ Roadmap Windows Agent (.NET 8/Windows Graphics Capture หรือเทียบเท่า) ที่ต้องมี
- เลือกหน้าต่างแอปจริงแยกจากการเลือกจอ
- สลับจอจริงและแสดงหลายจอพร้อมกัน
- ส่งเมาส์/คีย์บอร์ดไปยัง OS โดยมี consent และ policy แบบจำกัดสิทธิ์
- Clipboard sync สองทิศทางแบบ opt-in
- File transfer แบบมี permission, auto-start Windows ที่ผู้ใช้ตั้งค่าเอง
- ติดตั้ง EXE signed, device identity, revocation, remote stop, audit, MFA/RBAC

## ความปลอดภัย

- ไม่แตะ GitHub repo หรือ Production ของเว็บโรงเรียนอื่นโดยไม่ได้รับคำสั่ง
- ห้ามเปิด aaPanel หรือ Backend ออกอินเทอร์เน็ตโดยไม่จำเป็น
- ห้ามใช้ root เป็น application service account
- ห้ามปิด UFW / Fail2ban / SSH เดิมก่อนทดสอบช่องทางใหม่
- ห้ามแก้ privacy/permission เพื่อหลบ browser screen-sharing prompt
- ห้ามอ้างว่าติดตั้งเสร็จหากยังไม่ได้รันคำสั่งและทดสอบจริง

## รายงานผลเป็นภาษาไทย

สรุปแยก 4 กลุ่ม: (1) ติดตั้งสำเร็จจริง (2) ทดสอบแล้วจริง (3) ข้อจำกัดที่เหลืออยู่ (4) งานสำหรับ Windows Agent ในระยะถัดไป พร้อมคำสั่งตรวจสอบ systemd/Nginx และ URL ที่ใช้เข้าเว็บโดยไม่เปิดเผยข้อมูลลับ
