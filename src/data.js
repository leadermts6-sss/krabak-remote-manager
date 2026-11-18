export const demoDevices = [
  {id:'krb-office-01', name:'KRABAK-OFFICE-01',alias:'คอมพิวเตอร์งานธุรการ',location:'อาคารสำนักงาน',os:'Windows 11 Pro',status:'online',latency:18,monitors:[{name:'จอหลัก',res:'1920 × 1080'},{name:'จอที่ 2',res:'2560 × 1440'}],apps:['Chrome','Excel','File Explorer','VS Code','PowerShell'],last:'ขณะนี้',owner:'ฝ่ายธุรการ',icon:'monitor',cpu:24,ram:48},
  {id:'krb-teacher-02',name:'KRABAK-TEACHER-02',alias:'คอมพิวเตอร์ห้องพักครู',location:'ห้องพักครู',os:'Windows 11',status:'online',latency:27,monitors:[{name:'จอหลัก',res:'1920 × 1080'}],apps:['Chrome','Word','PowerPoint','Excel'],last:'ขณะนี้',owner:'ฝ่ายวิชาการ',icon:'laptop',cpu:17,ram:56},
  {id:'krb-lab-03',name:'KRABAK-LAB-03',alias:'ห้องคอมพิวเตอร์',location:'ห้องปฏิบัติการคอมพิวเตอร์',os:'Windows 10 Pro',status:'online',latency:34,monitors:[{name:'จอหลัก',res:'1920 × 1080'},{name:'จอที่ 2',res:'1920 × 1080'},{name:'จอที่ 3',res:'1280 × 1024'}],apps:['Chrome','VS Code','File Explorer','PowerShell'],last:'ขณะนี้',owner:'กลุ่มสาระเทคโนโลยี',icon:'monitor',cpu:41,ram:61},
  {id:'krb-admin-04',name:'KRABAK-ADMIN-04',alias:'เครื่องเซิร์ฟเวอร์จำลอง',location:'ห้องระบบเครือข่าย',os:'Windows Server 2022',status:'online',latency:22,monitors:[{name:'จอหลัก',res:'1920 × 1080'}],apps:['File Explorer','PowerShell','Chrome'],last:'ขณะนี้',owner:'ผู้ดูแลระบบ',icon:'monitor',cpu:9,ram:38},
  {id:'krb-home-05',name:'KRABAK-HOME-05',alias:'คอมพิวเตอร์ส่วนตัว',location:'ทำงานนอกสถานที่',os:'Windows 11 Home',status:'online',latency:45,monitors:[{name:'จอหลัก',res:'2560 × 1440'},{name:'จอเสริม',res:'1920 × 1080'}],apps:['Chrome','VS Code','Excel','File Explorer'],last:'ขณะนี้',owner:'ส่วนตัว',icon:'laptop',cpu:26,ram:42},
  {id:'krb-lib-06',name:'KRABAK-LIBRARY-06',alias:'ห้องสมุด',location:'ห้องสมุด',os:'Windows 10',status:'offline',latency:null,monitors:[{name:'จอหลัก',res:'1920 × 1080'}],apps:['Chrome','Word'],last:'2 ชั่วโมงก่อน',owner:'ห้องสมุด',icon:'monitor',cpu:0,ram:0},
  {id:'krb-media-07',name:'KRABAK-MEDIA-07',alias:'ห้องโสตทัศนศึกษา',location:'ห้องโสตฯ',os:'Windows 11',status:'offline',latency:null,monitors:[{name:'จอหลัก',res:'1920 × 1080'}],apps:['PowerPoint','Chrome'],last:'เมื่อวาน',owner:'งานประชาสัมพันธ์',icon:'monitor',cpu:0,ram:0}
];
export const activity = [
 {type:'connect',title:'เชื่อมต่อ KRABAK-OFFICE-01',sub:'โหมดเฉพาะหน้าต่าง · Excel',time:'10:42',ago:'3 นาทีที่แล้ว'},
 {type:'shield',title:'ตรวจสอบสิทธิ์สำเร็จ',sub:'การเข้าสู่ระบบพร้อมการยืนยันตัวตน',time:'10:39',ago:'6 นาทีที่แล้ว'},
 {type:'files',title:'ส่งไฟล์งานเรียบร้อย',sub:'รายงานผลการเรียน.xlsx · 2.4 MB',time:'09:28',ago:'1 ชั่วโมงก่อน'},
 {type:'monitor',title:'KRABAK-LAB-03 ออนไลน์',sub:'พร้อมเชื่อมต่อ · 3 จอภาพ',time:'08:15',ago:'2 ชั่วโมงก่อน'},
 {type:'alert',title:'KRABAK-LIBRARY-06 ออฟไลน์',sub:'รอเครื่องปลายทางกลับมาออนไลน์',time:'07:50',ago:'3 ชั่วโมงก่อน'}
];
export const appMeta = {
 'Chrome':{icon:'chrome',color:'#f8bf64',title:'Google Chrome'},
 'Excel':{icon:'excel',color:'#49c79a',title:'Microsoft Excel'},
 'Word':{icon:'file',color:'#77adff',title:'Microsoft Word'},
 'PowerPoint':{icon:'file',color:'#ef9a6b',title:'PowerPoint'},
 'VS Code':{icon:'code',color:'#65b7fa',title:'Visual Studio Code'},
 'File Explorer':{icon:'folder',color:'#f6d174',title:'File Explorer'},
 'PowerShell':{icon:'terminal',color:'#8ab1f9',title:'Windows PowerShell'}
};
