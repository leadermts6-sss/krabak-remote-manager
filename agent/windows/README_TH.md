# KRABAK Windows Agent (รุ่นทดลอง)

Agent เป็นโปรแกรม Windows แยกจากเว็บ ต้องติดตั้งและเปิดทำงานบนเครื่องที่ต้องการควบคุม เว็บอย่างเดียวส่งเมาส์/คีย์บอร์ดเข้า Windows ไม่ได้

## สถานะและข้อจำกัด

- build ปัจจุบันเป็น x64 self-contained development artifact ที่ยัง **ไม่ได้ลงลายเซ็น** และยังไม่มี installer
- อย่าแจกจ่ายหรือติดตั้งบนเครื่องโรงเรียนหรือเครื่องที่มีข้อมูลจริงจนกว่าจะมี MFA, code-signing, security review และทดสอบยอมรับครบ
- Agent ทำงานในบัญชี Windows ปัจจุบัน ไม่ใช้ Administrator และไม่เพิ่ม auto-start
- แชร์จอที่เลือกหนึ่งจอ, ส่งภาพ JPEG สูงสุด 1280×720 ที่ประมาณ 4 fps, และรับเมาส์/คีย์บอร์ดจริงผ่าน allowlist
- Windows อาจแสดงคำเตือนเพราะไฟล์ไม่มีลายเซ็น; ห้ามปิด SmartScreen หรือ Endpoint Protection เพื่อใช้รุ่นนี้
- ไม่ควบคุม UAC/secure desktop หรือโปรแกรมที่รันด้วยสิทธิ์สูงกว่า; ไม่มี native touchscreen, clipboard, file transfer, window picker หรือหลายจอพร้อมกัน

## วิธีสร้าง development build

บน Windows ที่ติดตั้ง .NET 10 SDK:

```powershell
dotnet publish agent/windows/KrabakRemoteAgent.csproj --configuration Release --runtime win-x64 --self-contained true --output artifacts/krabak-agent -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

หรือดาวน์โหลด artifact `KRABAK-Agent-unsigned-development` จาก workflow [Windows Agent development build](https://github.com/leadermts6-sss/krabak-remote-manager/actions/workflows/windows-agent-build.yml) ซึ่งเก็บ 7 วันและต้องมีสิทธิ์เข้าถึง repository

## ลงทะเบียนอุปกรณ์สำหรับการทดสอบที่ได้รับอนุญาต

1. ลงชื่อเข้า KRABAK Remote Manager แล้วเปิด **อุปกรณ์ของฉัน → เพิ่ม Windows Agent**; เว็บออก enrollment code ใช้ครั้งเดียว อายุ 10 นาทีและผูกกับบัญชีที่ลงชื่อเข้า
2. เปิด `KRABAK.RemoteAgent.exe` บน Windows เป้าหมาย เลือกจอและใส่ URL `https://remote.krabak.ac.th`, ชื่อเครื่อง และ enrollment code
3. เลือกยืนยันความยินยอมก่อนกด **ลงทะเบียน Agent**; token ระยะยาวถูกปกป้องด้วย DPAPI ของบัญชี Windows ปัจจุบัน
4. ตัวเลือก **เชื่อถือบัญชีนี้** ปิดไว้เป็นค่าเริ่มต้น หากเปิด เจ้าของบัญชีเดียวกันจะเริ่มควบคุมได้โดยไม่ถามซ้ำ; คำขอจากบัญชีอื่นยังต้องกดยอมรับจาก popup ของ Windows Agent
5. ระหว่างเซสชันมีหน้าต่างสถานะอยู่ด้านบนพร้อมปุ่ม **หยุดเซสชัน**; ไอคอนถาดระบบมีคำสั่งออกจาก Agent
6. ถอนเครื่องจากหน้าอุปกรณ์เพื่อเพิกถอน token ฝั่ง server; หากเครื่องออฟไลน์ การเชื่อมต่อครั้งถัดไปจะถูกปฏิเสธและ Agent จะลบ token ที่ป้องกันด้วย DPAPI ในเครื่องนั้น

รุ่นทดลองนี้ยังไม่ใช่ช่องทางติดตั้ง production ที่ตรวจลายเซ็นได้ การควบคุมจริงบนเครื่องเป้าหมายต้องทดสอบด้วย Agent ที่ติดตั้งแล้วและสองบัญชี/สองเครื่องที่ผู้ใช้ควบคุมเอง
