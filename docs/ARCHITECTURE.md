# โครงสร้างระบบ KRABAK Remote Manager

## MVP ที่อยู่ใน ZIP

```text
Windows / Chrome-Edge Host (ผู้แชร์)
  └─ getDisplayMedia() (หน้าต่าง/จอ/แท็บที่ผู้ใช้กดยอมรับ)
     └── WebRTC SRTP video ────────────────> Viewer Web / PWA
        │                                    ▲
        └── WebRTC DataChannel (files) ──────┘

          │           REST + WSS            ▲
          ▼                                 │
   Nginx HTTPS (aaPanel)                    │
          │                                 │
          ▼                                 │
  Serva VPS / Node Backend (:8787 localhost)
   - Admin login/session cookie
   - Host pairing code (8 hex chars, 15 min)
   - Consent-based session request
   - WebRTC SDP/ICE signaling via WS
   - Message relay / limited audit
   - Serve dist/ built PWA

STUN (public test) / TURN (recommended for production)
```

Host รับคำขอผ่าน WebSocket, คนที่อยู่หน้าเครื่อง Host ต้องกดอนุญาตและเลือกแหล่งแชร์ด้วยตัวเอง เว็บจะไม่มีสิทธิ์เลือกหน้าต่างล่วงหน้าหรือส่งคลิกเมาส์เข้า OS

## ขั้นขยายเพื่อควบคุม Windows จริง

ต้องพัฒนา **Windows Agent ที่ติดตั้งและได้รับสิทธิ์โดยเจ้าของเครื่อง** (แยก process/service ตามหลัก Windows privilege)

1. **Discovery:** `EnumDisplayMonitors`, `EnumWindows`, process list แบบ allowlist; ส่ง metadata ของจอและแอปที่ผู้ใช้อนุญาตเท่านั้น หลีกเลี่ยงการแสดงชื่อหน้าต่างที่อาจมีข้อมูลส่วนบุคคลแก่คนที่ไม่ได้รับสิทธิ์
2. **Capture:** Windows Graphics Capture (`GraphicsCaptureItem`) / DXGI Desktop Duplication / Media Foundation encode; ภาพเฉพาะ window, เฉพาะ monitor และหลาย track ที่สลับได้ แยกคิวบัฟเฟอร์/บิทเรต และรองรับ GPU encoding ถ้ามี
3. **Transport:** WebRTC (DTLS-SRTP) + STUN/TURN; per-session authorization; use TLS WSS signaling; ไม่ส่ง raw framebuffer ผ่าน HTTP public
4. **Input:** คำสั่งเมาส์/คีย์บอร์ดเข้ารหัส ตรวจสิทธิ์ **per app/per monitor** และสิทธิ์ window focus; Windows `SendInput`/native APIs ทำได้เฉพาะตามสิทธิ์ OS, UAC Secure Desktop และ protected app ไม่ควรถูกข้ามหรือหลบเลี่ยง
5. **Permissions:** ผู้ใช้กด consent / optional unattended ที่ตั้งค่าไว้ล่วงหน้าแบบจำกัดเครื่อง บทบาท ช่วงเวลา พร้อมปุ่ม Pause/Stop ที่แสดงบนจอและ kill switch
6. **Clipboard:** ส่งข้อความสองทิศทางโดยต้องมี opt-in; จำกัดประเภทและขนาดข้อมูล; บน mobile การอ่านคลิปบอร์ดอัตโนมัติไม่ได้เสมอไป
7. **File transfer:** ตั้ง directory allowlist, ตรวจชื่อไฟล์/ขนาด และรับไฟล์พร้อมอนุญาตก่อนบันทึก
8. **Multi-monitor UX:** แสดงหน้าจอแบบ tabs/tiles/แยกหน้าต่าง browser (เมื่อรองรับ), สลับ monitor ในเซสชันเดียว, เฉพาะหน้าต่างแอปโดยมี overlay ตำแหน่งและสัดส่วนที่ถูกต้อง
9. **Operations:** ติดตั้ง EXE/installer Windows ที่ signed, auto-start ที่ผู้ใช้เลือก, auto-update ที่ตรวจลายเซ็น, การถอนติดตั้งและเพิกถอน device key

## ข้อจำกัดสำคัญที่ต้องแจ้ง Codex

- `getDisplayMedia()` ไม่อนุญาตให้เว็บไซต์บังคับเลือกหน้าต่างแทนผู้ใช้ ต้องมี browser picker ทุกครั้ง
- Browser PWA โดยลำพังไม่มี native remote-input/OS-inventory APIs
- aaPanel เป็นเครื่องมือจัดการ VPS ไม่ใช่ remote desktop engine
- Vite ใช้สร้าง frontend; Node backend แยกบริการ แม้เสิร์ฟไฟล์ dist จาก Node ตัวเดียวกันในการทดลอง
- TLS, TURN, device identity, consent, RBAC, key lifecycle ต้องผ่าน security review ก่อนใช้งานจริง

## โดเมน

ตัวอย่าง `remote.krabak.ac.th` เป็น **ข้อเสนอชื่อโดเมน ยังไม่ได้ตั้ง DNS จริง**. ให้ Codex ตรวจสอบโครงสร้าง DNS / aaPanel ก่อนเปลี่ยนแปลง โดยไม่กระทบ `krabak.ac.th`, `school.krabak.ac.th`, `student.krabak.ac.th`
