# ตารางความสามารถ KRABAK Remote Manager 0.1.0

| ฟีเจอร์ | Demo UI | Live Browser Share MVP | Windows Agent (อนาคต) |
|---|---|---|---|
| Dashboard / ค้นหาเครื่อง / สถานะ | ✅ ข้อมูลตัวอย่าง | ⚠️ ยังไม่ sync อุปกรณ์ถาวร | จำเป็นสำหรับรายการเครื่องจริง |
| แอป Windows ที่เปิดอยู่ | ✅ ตัวอย่าง | ✅ เจ้าของเครื่องเลือกจาก browser picker | จำเป็นสำหรับ inventory app จริง |
| เลือกเฉพาะ Window | ✅ จำลอง | ✅ Host เลือกเอง แล้ว Viewer เห็นสตรีม | จำเป็นสำหรับการควบคุม Windows Window จริง |
| หลายจอ | ✅ 1–3 จอ + มุมมองรวม | ⚠️ Host เลือกได้ทีละจอ | จำเป็นสำหรับจอแยก/พร้อมกันจริง |
| ดูภาพผ่านอินเทอร์เน็ต | ✅ จำลอง | ✅ WebRTC (STUN; อาจต้อง TURN) | เพิ่ม native capture stream ได้ |
| ควบคุมเมาส์/คีย์บอร์ดของ Windows | ❌ | ❌ View-only | จำเป็น |
| Unattended access | ❌ | ❌ ต้องกดยอมรับ | ต้องออกแบบอนุญาตล่วงหน้าแบบจำกัดสิทธิ์ |
| คัดลอกข้อความ | ✅ ผ่าน UI | ✅ ส่งข้อความให้เลือกคัดลอก | ต้องมี native OS clipboard sync |
| ส่งไฟล์ | ✅ จำลอง | ✅ WebRTC DataChannel สูงสุด 8 MB | เพิ่ม File Manager ของ Windows |
| แชต | ✅ | ✅ WebSocket | ใช้ร่วมกับ Agent ได้ |
| เลือกคุณภาพ / zoom / full screen | ✅ (คุณภาพยังจำลอง) | Zoom/Fullscreen; คุณภาพยังเป็น UI | ต้องเพิ่ม adaptive bitrate |
| การบันทึกวิดีโอ | ❌ | ❌ | ออกแบบ consent และ retention ก่อน |
| การป้องกันข้อมูล | ข้อความเตือน | Login, pairing, consent, HTTPS/WebRTC | เสริม MFA/RBAC/approval/audit/policy |
| PWA Desktop / Mobile | ✅ | ✅ Viewer บางเบราว์เซอร์ | Mobile OS input มีข้อจำกัด |
| เรียลไทม์ | จำลอง | ✅ Live WebRTC | เพิ่ม telemetry จริง |
| VPS aaPanel Free + reverse proxy | ไฟล์พร้อม | ✅ มี Backend และตัวอย่าง deploy | ลง backend/Agent ตามเฟส |

**หมายเหตุ:** Demo ไม่ใช่หลักฐานว่า Windows ถูกควบคุมจริง ให้ทดสอบ Host/Viewer โดยมีผู้ยินยอมจริงก่อนเริ่มงาน Production
