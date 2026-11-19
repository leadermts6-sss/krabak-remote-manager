# KRABAK Windows Agent

Agent เป็นโปรแกรม Windows แยกจากเว็บ ต้องติดตั้งและเปิดทำงานบนเครื่องที่ต้องการควบคุม เว็บอย่างเดียวส่งเมาส์/คีย์บอร์ดเข้า Windows ไม่ได้

## สถานะและข้อจำกัด

- เว็บไซต์บังคับ TOTP MFA ให้บัญชีทุกบัญชีก่อนใช้งาน; Agent ยังคงขอ consent บนเครื่องสำหรับคำขอข้ามบัญชี
- CI compile x64 self-contained development build เพื่อตรวจโค้ด แต่ไม่เผยแพร่ artifact; ยังไม่มี signed production release หรือ installer จนกว่าจะมี certificate ที่ Windows เชื่อถือ
- อย่าติดตั้ง development build บนเครื่องโรงเรียนหรือเครื่องที่มีข้อมูลจริง
- Agent ทำงานในบัญชี Windows ปัจจุบัน ไม่ใช้ Administrator และไม่เพิ่ม auto-start
- แชร์จอที่เลือกหนึ่งจอ, ส่งภาพ JPEG สูงสุด 1280×720 ที่ประมาณ 4 fps, และรับเมาส์/คีย์บอร์ดจริงผ่าน allowlist
- Windows อาจแสดงคำเตือนเพราะไฟล์ไม่มีลายเซ็น; ห้ามปิด SmartScreen หรือ Endpoint Protection เพื่อใช้รุ่นนี้
- ไม่ควบคุม UAC/secure desktop หรือโปรแกรมที่รันด้วยสิทธิ์สูงกว่า; ไม่มี native touchscreen, clipboard, file transfer, window picker หรือหลายจอพร้อมกัน

## วิธีสร้าง development build

บน Windows ที่ติดตั้ง .NET 10 SDK:

```powershell
dotnet publish agent/windows/KrabakRemoteAgent.csproj --configuration Release --runtime win-x64 --self-contained true --output artifacts/krabak-agent -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

## Signed production release

การเผยแพร่ production ทำงานจาก tag stable รูปแบบ `vX.Y.Z` เท่านั้น; workflow ทดสอบ source ก่อน build, ลงนาม SHA-256 ผ่าน Microsoft Artifact Signing ด้วย GitHub OIDC, ตรวจ Authenticode chain กับ RFC 3161 timestamp แล้วจึงเผยแพร่ GitHub Release แบบ draft-to-publish หากการตั้งค่าหรือลายเซ็นไม่ผ่านจะไม่มีไฟล์เผยแพร่

ต้องสร้าง GitHub Environment ชื่อ `code-signing` และกำหนด protected secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; กำหนด Environment variables `AZURE_ARTIFACT_SIGNING_ENDPOINT`, `AZURE_ARTIFACT_SIGNING_ACCOUNT`, `AZURE_ARTIFACT_SIGNING_PROFILE`; ตั้ง Entra federated credential ให้ตรง subject `repo:leadermts6-sss/krabak-remote-manager:environment:code-signing` และให้แอปมี role `Artifact Signing Certificate Profile Signer` สำหรับ Public Trust profile

การสร้าง Azure Artifact Signing resource ต้องยืนยันตัวตนและอาจมีค่าใช้จ่าย; ยังไม่ได้สร้าง resource หรือเปิดบริการใดใน Azure

การลงนามใช้กุญแจที่บริการ Artifact Signing ปกป้อง ไม่อัปโหลด PFX หรือ private key เข้า GitHub; ห้ามใช้ self-signed certificate เพื่ออ้างว่าเป็นรุ่น production

## ลงทะเบียนอุปกรณ์สำหรับการทดสอบที่ได้รับอนุญาต

1. ลงชื่อเข้า KRABAK Remote Manager แล้วเปิด **อุปกรณ์ของฉัน → เพิ่ม Windows Agent**; เว็บออก enrollment code ใช้ครั้งเดียว อายุ 10 นาทีและผูกกับบัญชีที่ลงชื่อเข้า
2. เปิด `KRABAK.RemoteAgent.exe` บน Windows เป้าหมาย เลือกจอและใส่ URL `https://remote.krabak.ac.th`, ชื่อเครื่อง และ enrollment code; URL อื่นถูกปฏิเสธ ยกเว้น localhost สำหรับทดสอบในเครื่อง
3. เลือกยืนยันความยินยอมก่อนกด **ลงทะเบียน Agent**; token ระยะยาวถูกปกป้องด้วย DPAPI ของบัญชี Windows ปัจจุบัน
4. ตัวเลือก **เชื่อถือบัญชีนี้** ปิดไว้เป็นค่าเริ่มต้น; server ปฏิเสธตัวเลือกนี้ เว้นแต่ผู้ดูแลเปิด `KRABAK_AGENT_TRUSTED_ACCESS_ENABLED=1` หลังเพิ่ม MFA และผ่าน security review. ขณะปิดอยู่ ทุกคำขอใช้รหัสจับคู่และต้องกดยอมรับจาก popup ของ Windows Agent
5. ระหว่างเซสชันมีหน้าต่างสถานะอยู่ด้านบนพร้อมปุ่ม **หยุดเซสชัน**; ไอคอนถาดระบบมีคำสั่งออกจาก Agent
6. ถอนเครื่องจากหน้าอุปกรณ์เพื่อเพิกถอน token ฝั่ง server; หากเครื่องออฟไลน์ การเชื่อมต่อครั้งถัดไปจะถูกปฏิเสธและ Agent จะลบ token ที่ป้องกันด้วย DPAPI ในเครื่องนั้น

การสร้าง signed artifact ยังขึ้นกับการตั้งค่า certificate secrets และการทดสอบยอมรับบน Windows เป้าหมาย; Agent ไม่มี auto-start และทำงานเฉพาะ session ผู้ใช้ที่เปิดโปรแกรม
