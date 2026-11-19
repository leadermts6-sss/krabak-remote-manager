# KRABAK Windows Agent

Agent เป็นโปรแกรม Windows แยกจากเว็บ ต้องติดตั้งและเปิดทำงานบนเครื่องที่ต้องการควบคุม เว็บอย่างเดียวส่งเมาส์หรือคีย์บอร์ดเข้า Windows ไม่ได้

## ดาวน์โหลดรุ่น public v0.1.0

- รุ่นนี้เป็น production-channel release สำหรับ Windows x64 สร้างจาก source ด้วย GitHub Actions และแจกเป็น self-contained ZIP โดยไม่มี installer และไม่ตั้ง auto-start
- ไฟล์ยังไม่มีลายเซ็น Authenticode; Windows อาจแสดง Unknown Publisher หรือคำเตือน SmartScreen โปรดตรวจ SHA-256 ที่แนบกับ release และห้ามปิด SmartScreen หรือ Endpoint Protection เพื่อเรียกใช้
- ดาวน์โหลดจาก [GitHub Releases](https://github.com/leadermts6-sss/krabak-remote-manager/releases) เท่านั้น; อ่าน [release notes](RELEASE_NOTES.md), [Code signing policy](../../CODE_SIGNING_POLICY.md) และ [Privacy notice](../../PRIVACY.md)
- ใช้ Agent เฉพาะกับคอมพิวเตอร์ของคุณหรือเครื่องที่คุณได้รับอนุญาตให้ดูและควบคุม

ตรวจ checksum ใน PowerShell:

    Get-FileHash .\KRABAK-Agent-0.1.0-win-x64.zip -Algorithm SHA256

เทียบค่า SHA-256 กับไฟล์ SHA256SUMS.txt ที่อยู่ในหน้า release ก่อนแตก ZIP

## ความสามารถและข้อจำกัด

- Agent ทำงานในบัญชี Windows ปัจจุบัน โดยไม่ใช้ Administrator และไม่เพิ่ม auto-start
- แชร์ภาพจากจอที่เลือกหนึ่งจอ สูงสุด 1280×720 ที่ประมาณ 4 fps และรับเมาส์/คีย์บอร์ดจริงผ่าน allowlist
- คำขอจากบัญชีอื่นต้องยอมรับจาก popup native บน Windows; same-account trusted access ยังปิดอยู่ฝั่ง server ตามค่าเริ่มต้น
- มีปุ่มหยุดเซสชันให้ผู้ใช้ที่เครื่อง Host; Agent ไม่มี service mode หรือ unattended startup
- ไม่ควบคุม UAC/secure desktop หรือโปรแกรมที่รันด้วยสิทธิ์สูงกว่า; ยังไม่มี native touchscreen, clipboard, file transfer, window picker หรือหลายจอพร้อมกัน

## สร้าง development build จาก source

บน Windows ที่ติดตั้ง .NET 10 SDK:

    dotnet publish agent/windows/KrabakRemoteAgent.csproj --configuration Release --runtime win-x64 --self-contained true --output artifacts/krabak-agent -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true

ไฟล์ที่สร้างในเครื่องเป็น development build ของคุณเอง ไม่ใช่ artifact จากหน้า Releases

## Code signing status

รุ่น v0.1.0 ยังไม่ลงนาม Authenticode และ SignPath Foundation ยังไม่ได้ออก certificate ให้โครงการ ดู [Code signing policy](../../CODE_SIGNING_POLICY.md) สำหรับสถานะและผู้รับผิดชอบ

## ลงทะเบียนอุปกรณ์สำหรับการทดสอบที่ได้รับอนุญาต

1. ลงชื่อเข้า KRABAK Remote Manager แล้วเปิด **อุปกรณ์ของฉัน → เพิ่ม Windows Agent**; เว็บออก enrollment code ใช้ครั้งเดียว อายุ 10 นาทีและผูกกับบัญชีที่ลงชื่อเข้า
2. เปิด `KRABAK.RemoteAgent.exe` บน Windows เป้าหมาย เลือกจอและใส่ URL `https://remote.krabak.ac.th`, ชื่อเครื่อง และ enrollment code; URL อื่นถูกปฏิเสธ ยกเว้น localhost สำหรับทดสอบในเครื่อง
3. เลือกยืนยันความยินยอมก่อนกด **ลงทะเบียน Agent**; token ระยะยาวถูกปกป้องด้วย DPAPI ของบัญชี Windows ปัจจุบัน
4. ตัวเลือก **เชื่อถือบัญชีนี้** ปิดไว้เป็นค่าเริ่มต้น; server ปฏิเสธตัวเลือกนี้ เว้นแต่ผู้ดูแลเปิด `KRABAK_AGENT_TRUSTED_ACCESS_ENABLED=1` หลังเพิ่ม MFA และผ่าน security review. ขณะปิดอยู่ ทุกคำขอใช้รหัสจับคู่และต้องกดยอมรับจาก popup ของ Windows Agent
5. ระหว่างเซสชันมีหน้าต่างสถานะอยู่ด้านบนพร้อมปุ่ม **หยุดเซสชัน**; ไอคอนถาดระบบมีคำสั่งออกจาก Agent
6. ถอนเครื่องจากหน้าอุปกรณ์เพื่อเพิกถอน token ฝั่ง server; หากเครื่องออฟไลน์ การเชื่อมต่อครั้งถัดไปจะถูกปฏิเสธและ Agent จะลบ token ที่ป้องกันด้วย DPAPI ในเครื่องนั้น

รุ่น public ปัจจุบันยังไม่มีลายเซ็น Authenticode; Agent ไม่มี auto-start และทำงานเฉพาะ session ผู้ใช้ที่เปิดโปรแกรม
