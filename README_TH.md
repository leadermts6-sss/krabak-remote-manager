# KRABAK Remote Manager

**ชุดต้นแบบเว็บแอป/PWA + Backend สำหรับ Serva VPS และ aaPanel Free**

เวอร์ชัน: **0.1.0 (Prototype / Browser Screen Share MVP)**
สถานะ: มีหน้าเว็บใช้งานจริง, โหมด Demo, Server สำหรับล็อกอิน+รหัสจับคู่+ส่งสัญญาณ WebRTC, แชร์จอ/หน้าต่างโดยเจ้าของเครื่องยินยอม; **ยังไม่ใช่โปรแกรมรีโมต Windows แบบควบคุมเมาส์และคีย์บอร์ดจริง**

## ขอบเขตสำคัญ

ระบบที่ให้มามีสองระดับ:

1. **Interactive Demo (ใช้งานได้ทันที):** รายชื่ออุปกรณ์ตัวอย่าง 7 เครื่อง, หน้าจอ 1–3 จอ, เลือกแต่ละจอ, ดูรวมหลายจอ, เลือกแอปที่เปิดอยู่ในข้อมูลตัวอย่าง, แชตจำลอง, ส่งไฟล์จำลอง, ปรับธีม/คุณภาพ/UI, Responsive Mobile, PWA ติดตั้งหน้าจอหลัก
2. **Live Browser Screen Sharing (ต้องรัน Backend + HTTPS):** ลงชื่อเข้าใช้ผู้ดูแล, เปิด Host บน Windows ผ่าน Chrome/Edge, สร้างรหัสจับคู่ 8 ตัว, ฝั่งผู้ดูแลขอเชื่อมต่อ, ฝั่ง Host ยอมรับและ *เลือกเอง* ว่าจะแชร์จอ/หน้าต่างแอป/แท็บ, ส่งภาพ WebRTC ไปยัง Viewer, แชต WebSocket, ส่งไฟล์ขนาดไม่เกิน 8 MB ด้วย WebRTC DataChannel, หยุดแชร์ได้ทันที และมี Audit สำหรับกิจกรรมระบบบางรายการ

**ไม่มีการควบคุม OS จากเว็บเพียงอย่างเดียว**: ยังไม่สามารถบังคับคลิก/พิมพ์ Windows, แยกรายชื่อแอปจริงจากเครื่องอื่นโดยไม่เปิด Host, สลับจอจริงจากฝั่ง Viewer โดยไม่ให้ Host ยืนยันใหม่, รีโมตแบบไม่มีคนกดยอมรับ, ใช้ Host ผ่านมือถือได้ทุกเบราว์เซอร์, ซิงก์คลิปบอร์ด OS หรือเข้าถึง Windows File System ได้โดยตรง ต้องพัฒนา Windows Agent และระบบสิทธิ์เพิ่มเติมก่อน

## โครงสร้างไฟล์

```text
krabak-remote-manager/
├── index.html                  หน้าเว็บ Vite
├── src/
│   ├── main.js                 Dashboard, Device list, Remote UI, WebRTC/PWA controls
│   ├── data.js                 เครื่องและแอปจำลอง
│   ├── icons.js                SVG icon renderer
│   └── styles.css              Responsive desktop/mobile
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                   PWA service worker
│   ├── favicon.svg
│   └── icons/
├── server/
│   ├── index.mjs               Node.js HTTP API + WebSocket signaling + static server
│   ├── auth.mjs                scrypt password hash + session cookies
│   ├── setup-admin.mjs         interactive first admin setup
│   └── ws.mjs                  WebSocket TEXT server (RFC6455 subset)
├── deploy/
│   ├── nginx-reverse-proxy.conf
│   ├── krabak-remote.service
│   └── deploy-checklist.md
├── docs/
│   ├── FEATURE_MATRIX.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── CODEX_DEPLOY_PROMPT.md
├── dist/                       Self-contained preview; already included in ZIP
├── .env.example
├── package.json
└── vite.config.js
```

## เปิดทดลองหน้าเว็บทันที ไม่ต้องติดตั้ง Node package

จากโฟลเดอร์ที่แตก ZIP แล้ว:

```bash
python -m http.server 8080 -d dist
```

เปิด `http://localhost:8080` บนคอมพิวเตอร์เพื่อดู Interactive Demo ทั้งหมดได้ทันที

> หากเปิดจากเครือข่ายอื่น ให้ใช้ HTTPS สำหรับ PWA และการแชร์หน้าจอ ตัว Demo ไม่จำเป็นต้องมี Backend แต่เมนูแชร์ภาพจริงจะเตือนให้ติดตั้ง Backend

## เปิดแบบ Vite (สำหรับ Codex พัฒนาต่อ)

ต้องมี Node.js 20.19+ (แนะนำ Node.js 22 LTS)

```bash
npm install
npm run dev
```

เปิด `http://localhost:5173` แล้วใช้ HMR พัฒนาได้, Vite จะ proxy `/api` และ `/ws` ไป backend port 8787

```bash
npm run build
```

Vite จะสร้าง `dist/` ใหม่จาก `src/` และ `public/`

## เปิด Backend บน VPS

1. เปิดพอร์ต Backend **เฉพาะ localhost** (`HOST=127.0.0.1`, `PORT=8787`)
2. รัน `npm run setup:admin` **ใน Terminal ที่เชื่อถือได้** เพื่อตั้ง Email + Password ยาวอย่างน้อย 12 ตัว ตัวโปรแกรมจะไม่แสดง Password ขณะพิมพ์
3. ตั้ง environment ตาม `.env.example` ผ่าน systemd (หรือ aaPanel หากรองรับอย่างปลอดภัย) โดยเฉพาะ `KRABAK_PUBLIC_ORIGIN=https://ชื่อโดเมนรีโมตที่เลือก`
4. รัน `npm run build`, `npm run server`; แนะนำให้ใช้ systemd ตามตัวอย่างใน `deploy/`
5. ให้ aaPanel Nginx ทำ HTTPS reverse proxy ไป `http://127.0.0.1:8787` รวม WebSocket Upgrade
6. เปิดเว็บไซต์ผ่าน HTTPS, เข้าสู่ระบบ, ทดสอบ Host + Viewer สองเครื่อง

**ไม่มีรหัสผ่านเริ่มต้น** และ ZIP ไม่ได้แนบไฟล์บัญชีผู้ดูแล ไม่ต้องส่ง Password ให้ Codex หรือแชต

## ทดสอบแชร์จอหรือหน้าต่างจริง (View-only)

- **เครื่องต้นทาง (Host)**: เปิดหน้าเว็บ `https://<remote-domain>/#/host` บน **Chrome/Edge Desktop (Windows)** → กำหนดชื่อ → สร้างรหัสจับคู่ → รอคำขอ → ตรวจสอบชื่อผู้ขอ → กด **อนุญาตและเลือกแหล่งแชร์** → เลือกหน้าต่างแอป/จอ/แท็บจากหน้าต่างของเบราว์เซอร์
- **เครื่องควบคุม (Viewer)**: เปิดหน้าเว็บแล้วล็อกอินผู้ดูแล → กด **เชื่อมต่อเครื่องใหม่** → กรอกรหัสจับคู่ → รอ Host อนุญาต → เห็นภาพที่ Host แชร์
- ใช้แชตในหน้าจอรีโมต และแท็บไฟล์ในเซสชัน เมื่อ RTC DataChannel Connected
- Host สามารถกด **หยุดแชร์ทันที** หรือกด Stop sharing จาก Chrome/Edge ได้ทุกเมื่อ
- ไฟล์รับเข้าต้องกดปุ่ม **บันทึก** เอง เพื่อไม่ดาวน์โหลดโดยพลการ

## หลายจอ/รายแอปในเวอร์ชันนี้

- Demo: เลือกจอ 1/2/3, แสดงจอพร้อมกัน, เปลี่ยนแอป Chrome/Excel/VS Code/Explorer ได้ทันที
- Live: Host เลือก Window หรือ Screen ที่ต้องการแชร์ด้วย Screen Capture API; **เลือกทีละแหล่ง** และผู้ดูต้องขอให้ Host เลือกใหม่เพื่อสลับจอจริง
- การแสดงหลายจอจริงพร้อมกัน หรือควบคุมเฉพาะแอป/จอแยกหลายหน้าต่างโดยไม่แชร์ทั้งเดสก์ท็อปต้องพัฒนา Windows Agent ต่อ

## ข้อจำกัดก่อน Production

- WebRTC มี STUN เป็นค่าเริ่มต้น; คู่เครื่องที่อยู่หลัง NAT เข้มงวดอาจเชื่อมไม่ได้ ต้องมี TURN (เช่น coturn) พร้อม ephemeral credentials
- ระบบใช้บัญชี Administrator เดียว, session cookie in-memory และ audit บางส่วน in-memory; ต้องเพิ่ม RBAC, MFA, DB persistence และ security hardening ก่อนใช้งานกับบุคลากรจำนวนมาก
- ไม่รองรับ unattended access และ remote OS input
- Host ใช้ `getDisplayMedia()` ต้องเป็น HTTPS/localhost และผู้ใช้ต้องเลือกแหล่งแชร์เองทุกครั้ง
- ยังไม่มี Window Agent EXE; README และ docs ระบุสัญญาการพัฒนาต่อ

**อ่านต่อ:** `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/FEATURE_MATRIX.md`, `docs/CODEX_DEPLOY_PROMPT.md`
