import { icon, escapeHtml as e } from './icons.js';

const root = document.getElementById('app');
const stored = (name, def) => { try { return JSON.parse(localStorage.getItem(name)) ?? def; } catch { return def; } };
const state = {
  route: 'login', devices: [], events: [], users: [], deviceView: 'grid', search: '', modal: null, mobileMenu: false,
  settings: stored('krabak-prefs', { theme: 'dark', quality: 'balanced', clipboard: true, notifications: true, conserve: true, defaultMode: 'window' }),
  backend: false, initialised: false, appReady: false, account: null, apiError: '', authNotice: '', activationIssued: null, resourceError: '',
  authBusy: false, passwordVisible: false, activationEmail: '',
  ws: null, liveSession: null, remoteStream: null, localStream: null, pc: null, rtcChannel: null,
  hostToken: null, hostCode: null, hostName: '', hostRequests: [], hostStatus: 'idle', hostExpiry: null, activeSessionId: null, hostChat: [], sessionEnded: false, connection: 'idle',
  files: [], right: 'chat', quality: 'balanced', zoom: 100, fit: true,
};
const now = () => new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const hasLive = () => !!state.liveSession;
const route = () => decodeURI((location.hash || '#/login').replace(/^#\/?/, ''));
const navigate = target => { if (state.liveSession && state.route === 'remote' && !target.startsWith('remote') && target !== 'login') endLive(); location.hash = '#/' + target; state.mobileMenu = false; if (route() === target) render(); };
const btn = (label, action, style = 'btn', extra = '') => '<button class="' + style + '" data-act="' + action + '" ' + extra + '>' + label + '</button>';
const onlineStatus = () => '<span class="pill success"><i class="status-dot"></i> ออนไลน์</span>';

function nav(id, ico, text, count) {
  const active = state.route === id ? 'active' : '';
  return '<button class="nav-item ' + active + '" data-nav="' + id + '" aria-current="' + (active ? 'page' : 'false') + '">' +
    icon(ico, 18) + '<span>' + text + '</span>' + (count ? '<small class="nav-count">' + e(count) + '</small>' : '') + '</button>';
}

const sidebar = () => '<aside class="sidebar ' + (state.mobileMenu ? 'mobile-open' : '') + '" aria-label="เมนูหลัก">' +
  '<div class="brand"><div class="brand-logo">' + icon('monitor', 24) + '</div><div><div class="brand-head">KRABAK</div><div class="brand-sub">REMOTE MANAGER</div></div></div>' +
  '<div class="nav-label">WORKSPACE</div>' +
  nav('dashboard', 'grid', 'ภาพรวม') + nav('devices', 'monitor', 'อุปกรณ์ของฉัน', String(state.devices.length)) +
  nav('activity', 'activity', 'ประวัติการใช้งาน') + nav('files', 'files', 'ไฟล์และการถ่ายโอน') +
  '<div class="nav-label" style="margin-top:27px">CONNECT & MANAGE</div>' +
  nav('host', 'share', 'แชร์เครื่องนี้') + (state.account?.role === 'admin' ? nav('users', 'shield', 'บัญชีครู', String(state.users.length || '')) : '') +
  nav('settings', 'settings', 'ตั้งค่าการใช้งาน') +
  '<div class="sidebar-bottom"><div class="sidebar-status"><div class="server-tag"><i class="dot"></i> SERVER CONFIGURATION</div><div class="server-title">Serva VPS · Ubuntu</div><div class="server-sub">KRABAK Remote Manager</div></div>' +
  '<div class="profile"><div class="avatar">KB</div><div><strong>' + e(state.account?.email || '') + '</strong><small>' +
  (state.account?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'บัญชีครู') + '</small></div></div></div></aside>';

const topbar = () => '<header class="topbar"><div class="crumb"><button class="top-icon mobile-toggle" data-act="mobile-menu" aria-label="เปิดเมนู">' + icon('menu') + '</button>' +
  '<span class="crumb-pre">KRABAK Workspace</span><span class="crumb-pre">/</span><strong>' +
  e(({ dashboard: 'ภาพรวม', devices: 'อุปกรณ์', remote: 'รีโมตเดสก์ท็อป', activity: 'ประวัติ', files: 'ไฟล์', settings: 'ตั้งค่า', host: 'แชร์เครื่อง', users: 'บัญชีครู' })[state.route] || 'Workspace') +
  '</strong></div><div class="top-actions"><span class="pill ' + (state.backend ? 'success' : 'warning') + '" style="margin-right:8px">' +
  (state.backend ? 'เซิร์ฟเวอร์เชื่อมต่อแล้ว' : 'Backend ยังไม่พร้อม') + '</span><button class="top-icon" data-act="help" aria-label="ข้อมูลระบบ">' + icon('help', 17) +
  '</button><button class="top-icon" data-nav="activity" aria-label="ประวัติการใช้งาน">' + icon('bell', 17) + '</button><span class="top-divider"></span>' +
  '<div class="top-person"><div class="avatar">KB</div><span>' + e(state.account?.email || '') + '</span></div>' +
  '<button class="btn btn-danger btn-xs logout-button" data-act="logout">' + icon('lock', 13) + ' ออกจากระบบ</button></div></header>';

function loadingPage() {
  return '<main class="auth-state" role="status" aria-live="polite"><span class="spinner"></span><p>กำลังตรวจสอบบัญชี…</p></main>';
}

const header = (eyebrow, title, sub, actions = '') => '<div class="page-head"><div><div class="eyebrow">' + eyebrow +
  '</div><h1 class="heading">' + title + '</h1><div class="subtitle">' + sub +
  '</div></div><div class="head-buttons">' + actions + '</div></div>';

function render() {
  const requested = route().split('/')[0] || 'login';
  document.documentElement.classList.toggle('light-theme', state.settings.theme === 'light');
  if (!state.appReady) { root.innerHTML = loadingPage(); return; }
  if (!state.account && !['login', 'activate'].includes(requested)) {
    if (location.hash !== '#/login') location.hash = '#/login';
    state.route = 'login'; root.innerHTML = loginPage(); return;
  }
  if (state.account && ['login', 'activate'].includes(requested)) {
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
    state.route = 'dashboard';
  } else state.route = requested;
  if (state.route === 'login') { root.innerHTML = loginPage(); return; }
  if (state.route === 'activate') { root.innerHTML = activatePage(); return; }
  if (state.route === 'host') { root.innerHTML = '<div class="host-route-toolbar"><span>' + e(state.account?.email || '') + '</span>' + btn(icon('lock', 13) + ' ออกจากระบบ', 'logout', 'btn btn-danger btn-xs') + '</div>' + hostPage() + (state.modal ? modalHtml() : ''); attachHostVideo(); return; }
  if (state.route === 'users' && state.account?.role !== 'admin') { location.hash = '#/dashboard'; state.route = 'dashboard'; }
  let content = '';
  switch (state.route) {
    case 'devices': content = devicesPage(); break;
    case 'activity': content = activityPage(); break;
    case 'files': content = filesPage(); break;
    case 'settings': content = settingsPage(); break;
    case 'users': content = usersPage(); break;
    case 'remote': content = remotePage(); break;
    default: content = dashboardPage();
  }
  const dataNotice = state.resourceError ? '<div class="content"><div class="info-banner warning" role="status">' + e(state.resourceError) + ' ' + btn(icon('refresh', 14) + ' ลองใหม่', 'retry-data', 'btn btn-xs') + '</div></div>' : '';
  root.innerHTML = '<div class="app-shell">' + sidebar() + '<main class="main">' + topbar() + dataNotice + content + '</main></div>' + (state.modal ? modalHtml() : '');
  attachViewerVideo();
}
function emptyState(title, detail, actions = '') {
  return '<div class="empty-state"><div class="empty-state-icon">' + icon('monitor', 24) + '</div><h2>' + e(title) +
    '</h2><p>' + e(detail) + '</p>' + (actions ? '<div class="head-buttons">' + actions + '</div>' : '') + '</div>';
}

function hostRow(host) {
  return '<div class="device-row"><div class="dev-mark">' + icon('monitor', 19) + '</div><div class="device-row-meta">' +
    '<div class="device-row-title"><strong>' + e(host.name) + '</strong><i class="status-dot"></i></div>' +
    '<div class="dev-desc"><span>Browser Host</span><span>·</span><span>' + (host.sessionActive ? 'กำลังแชร์อยู่' : 'พร้อมรับคำขอ') + '</span></div></div>' +
    '<div class="device-row-extra">' + icon('shield', 14) + ' ต้องอนุญาตจาก Host</div></div>';
}

function hostCard(host) {
  return '<article class="panel device-card"><div class="device-head"><div class="dev-mark large">' + icon('monitor', 23) + '</div>' +
    onlineStatus() + '</div><h3>' + e(host.name) + '</h3><div class="alias">อุปกรณ์ที่กำลังเชื่อมต่อด้วยบัญชีนี้</div>' +
    '<div class="device-tags"><span class="pill">' + icon('shield', 12) + ' Browser Host</span><span class="pill">' +
    (host.sessionActive ? 'กำลังแชร์' : 'รอคำขอ') + '</span></div><div class="device-meta"><span>' + icon('globe', 13) +
    ' ' + (state.account?.role === 'admin' ? e(host.ownerEmail) : 'อุปกรณ์ของบัญชีนี้') + '</span><span>ออนไลน์</span></div></article>';
}

function activityRow(item) {
  const glyph = item.type === 'login' || item.type === 'shield' ? 'shield' : item.type === 'session' || item.type === 'connect' ? 'monitor' : 'activity';
  return '<div class="activity-row"><div class="activity-icon">' + icon(glyph, 16) + '</div><div class="activity-text"><strong>' +
    e(item.title) + '</strong><div>' + e(item.sub) + '</div></div><span class="activity-time">' + e(item.time) + '</span></div>';
}

function dashboardPage() {
  const actions = btn(icon('share') + ' แชร์เครื่องนี้', 'go-host') + btn(icon('plus') + ' เชื่อมต่อด้วยรหัส', 'connect-code', 'btn btn-primary');
  const deviceItems = state.devices.length ? state.devices.slice(0, 5).map(hostRow).join('') :
    emptyState('ยังไม่มีอุปกรณ์ออนไลน์', 'เมื่อเครื่องของคุณเปิดหน้าแชร์และเชื่อมต่อแล้ว รายการจริงจะแสดงที่นี่', btn(icon('share') + ' แชร์เครื่องนี้', 'go-host', 'btn btn-primary'));
  const recent = state.events.length ? state.events.slice(0, 4).map(activityRow).join('') :
    emptyState('ยังไม่มีประวัติกิจกรรม', 'เหตุการณ์จริงจะแสดงเมื่อมีการเข้าสู่ระบบหรือเริ่มเซสชัน');
  return '<div class="content">' + header('WORKSPACE', 'ภาพรวม', 'ดูอุปกรณ์ที่กำลังออนไลน์และกิจกรรมของบัญชีนี้', actions) +
    '<section class="hero"><div class="hero-copy"><span class="hero-badge">' + icon('shield', 14) +
    ' SECURE REMOTE WORKSPACE</span><h2>เชื่อมต่ออุปกรณ์ของคุณ</h2><p>เฉพาะ Host ที่ออนไลน์ด้วยบัญชีนี้จะแสดงในรายการ การแชร์ภาพยังต้องได้รับอนุญาตจากเจ้าของเครื่องทุกครั้ง</p>' +
    '<div class="head-buttons">' + btn(icon('share') + ' เริ่มแชร์หน้าจอ', 'go-host', 'btn btn-primary') +
    btn(icon('plus') + ' ใส่รหัสจับคู่', 'connect-code', 'btn') + '</div></div><div class="hero-graphic" aria-hidden="true"><div class="hg-monitor hg-main"><div class="hg-toolbar"><i></i><i></i><i></i></div><div class="hg-shapes"><div></div><div></div></div></div></div></section>' +
    '<section class="stats"><div class="stat"><div class="stat-top"><div class="stat-icon">' + icon('monitor') +
    '</div><span class="stat-trend">ออนไลน์</span></div><label>อุปกรณ์ที่มองเห็น</label><div class="stat-number">' +
    state.devices.length + '<small>เครื่อง</small></div></div><div class="stat"><div class="stat-top"><div class="stat-icon blue">' +
    icon('shield') + '</div><span class="stat-trend">View only</span></div><label>การควบคุม Windows</label><div class="stat-number" style="font-size:22px">ต้องใช้ Agent</div></div></section>' +
    '<section class="dashboard-cols"><div class="panel"><div class="panel-pad panel-title"><div><h2>อุปกรณ์ออนไลน์</h2><p>รายการ Host จริงของบัญชีที่เข้าสู่ระบบ</p></div><a class="text-link" href="#/devices">ดูทั้งหมด ' +
    icon('chevron', 13) + '</a></div><div class="device-list">' + deviceItems + '</div></div><div class="panel panel-pad"><div class="panel-title"><div><h2>กิจกรรมล่าสุด</h2><p>บันทึกเหตุการณ์ตามสิทธิ์ของบัญชี</p></div><a class="text-link" href="#/activity">ดูทั้งหมด ' +
    icon('chevron', 13) + '</a></div>' + recent + '<div class="help-wrap"><h4>' + icon('shield', 15) +
    ' การแชร์อย่างปลอดภัย</h4><p>Host ต้องอนุมัติคำขอ และเลือกหน้าต่างหรือจอผ่านตัวเลือกของเบราว์เซอร์ทุกครั้ง</p></div></div></section></div>';
}

function devicesPage() {
  const query = state.search.trim().toLowerCase();
  const hosts = state.devices.filter(host => (host.name + ' ' + host.ownerEmail).toLowerCase().includes(query));
  const actions = btn(icon('share') + ' แชร์เครื่องนี้', 'go-host') + btn(icon('plus') + ' เชื่อมต่อด้วยรหัส', 'connect-code', 'btn btn-primary');
  const list = hosts.length ? (state.deviceView === 'grid'
    ? '<div class="device-grid">' + hosts.map(hostCard).join('') + '</div>'
    : '<div class="panel">' + hosts.map(hostRow).join('') + '</div>')
    : emptyState('ยังไม่มีอุปกรณ์ออนไลน์', 'เครื่องที่ไม่ได้เปิด Host จะแสดงเมื่อเชื่อมต่อบัญชีนี้', btn(icon('share') + ' แชร์เครื่องนี้', 'go-host', 'btn btn-primary'));
  return '<div class="content">' + header('DEVICE MANAGER', 'อุปกรณ์ของฉัน', 'แสดงเฉพาะ Host ที่เชื่อมต่ออยู่และบัญชีนี้มีสิทธิ์มองเห็น', actions) +
    '<div class="controls-row"><div class="search-box">' + icon('search', 16) + '<input id="device-search" aria-label="ค้นหาอุปกรณ์" placeholder="ค้นหาชื่ออุปกรณ์…" value="' +
    e(state.search) + '"/></div><div class="segmented"><button data-act="grid-view" class="' + (state.deviceView === 'grid' ? 'active' : '') + '">' +
    icon('grid2', 14) + ' การ์ด</button><button data-act="list-view" class="' + (state.deviceView === 'list' ? 'active' : '') + '">' +
    icon('list', 14) + ' รายการ</button></div></div>' + list + '</div>';
}

function remotePage() {
  if (!state.liveSession) return '<div class="content"><div class="panel remote-missing"><h1>ไม่มีเซสชันที่กำลังทำงาน</h1><p>เริ่มคำขอด้วยรหัสจับคู่จากเครื่อง Host แล้วรอให้เจ้าของเครื่องอนุญาต</p>' +
    btn(icon('plus') + ' เชื่อมต่อด้วยรหัส', 'connect-code', 'btn btn-primary') + '</div></div>';
  const chat = state.hostChat.map(message => '<div class="chat-bubble ' + (message.mine ? 'mine' : '') + '">' +
    e(message.text) + '<div class="chat-time">' + e(message.time) + '</div></div>').join('');
  const files = state.files.length ? state.files.map(file => '<div class="file-item">' + icon('file', 18) + '<div><strong>' +
    e(file.name) + '</strong><small>' + e(file.status) + '</small></div>' + (file.url ? btn('บันทึก', 'download-file', 'btn btn-xs', 'data-file-id="' + e(file.id) + '"') : '') + '</div>').join('') :
    '<div class="no-results" style="padding:23px 4px">ยังไม่มีไฟล์ในเซสชันนี้</div>';
  let panel = '';
  if (state.right === 'chat') panel = '<div class="right-body"><div class="remote-help">ข้อความในเซสชันนี้จะเห็นได้เฉพาะผู้เข้าร่วม</div><div id="chat-messages" class="chat-messages">' + chat + '</div></div>' +
    '<form id="chat-form" class="chat-compose"><input id="chat-input" name="message" aria-label="ข้อความ" placeholder="พิมพ์ข้อความ…" autocomplete="off"/><button aria-label="ส่งข้อความ" type="submit">' + icon('arrow', 15) + '</button></form>';
  else if (state.right === 'files') panel = '<div class="right-body"><button class="file-zone" data-act="send-file">' + icon('upload', 24) +
    '<strong>ส่งไฟล์ไปยังอีกฝั่ง</strong><small>WebRTC DataChannel · สูงสุด 8 MB</small></button><input type="file" id="remote-file" class="hidden"/><div class="section-kicker mt-16">ไฟล์ในเซสชัน</div>' + files + '</div>';
  else panel = '<div class="right-body"><h3>ข้อมูลการเชื่อมต่อ</h3><div class="detail-row"><span>เครื่อง Host</span><strong>' +
    e(state.liveSession.hostName) + '</strong></div><div class="detail-row"><span>สถานะ</span><strong>' + e(state.connection) +
    '</strong></div><div class="remote-help">โหมดดูภาพเท่านั้น การควบคุมเมาส์และคีย์บอร์ด Windows ต้องมี Windows Agent ที่ติดตั้งและได้รับอนุญาต</div></div>';
  return '<div class="remote-content"><div class="page-head remote-head"><div><div class="eyebrow">BROWSER SHARE SESSION</div><h1 class="heading">' +
    e(state.liveSession.hostName) + '</h1><div class="subtitle device-topline"><span class="pill warning">' + icon('lock', 13) +
    ' ดูภาพเท่านั้น</span><span class="pill info">' + e(state.connection) + '</span></div></div><div class="head-buttons">' +
    btn(icon('back', 14) + ' กลับอุปกรณ์', 'go-devices') + btn(icon('power', 14) + ' จบการเชื่อมต่อ', 'end-live', 'btn btn-danger') + '</div></div>' +
    '<div class="remote-layout"><section class="remote-stage" id="remote-stage"><div class="stage-top"><div class="stage-title">' +
    icon('monitor', 14) + ' LIVE · ' + e(state.liveSession.hostName) + '</div><div class="stage-control">' +
    btn(icon('sliders', 14), 'quality', 'tool-button', 'aria-label="คุณภาพภาพ"') + btn(icon('expand', 14), 'fullscreen', 'tool-button', 'aria-label="เต็มหน้าจอ"') + '</div></div>' +
    '<div class="stage-body" id="remote-stage-body"><div class="capture-frame" id="live-placeholder">' + icon('video', 40) +
    '<div>กำลังรอภาพจาก Host<br/><small>Host ต้องอนุมัติและเลือกแหล่งแชร์</small></div></div><video id="live-video" class="fit-video hidden" autoplay playsinline></video></div>' +
    '<div class="stage-bottom"><span>' + icon('wifi', 12) + ' WebRTC</span><span>ดูภาพเท่านั้น · ' + state.zoom + '%</span><span>' + icon('shield', 12) + ' ต้องได้รับอนุญาต</span></div>' +
    '<div class="stage-tools">' + btn(icon('expand', 14) + ' พอดีหน้าจอ', 'fit', 'tool-button') + btn('−', 'zoom-out', 'tool-button', 'aria-label="ย่อภาพ"') +
    btn('+', 'zoom-in', 'tool-button', 'aria-label="ขยายภาพ"') + btn(icon('chat', 14) + ' แชต', 'tab-chat', 'tool-button') +
    btn(icon('files', 14) + ' ไฟล์', 'tab-files', 'tool-button') + '</div></section><aside class="panel right-panel"><div class="right-tab">' +
    '<button class="' + (state.right === 'chat' ? 'active' : '') + '" data-act="tab-chat">' + icon('chat', 13) + ' แชต</button>' +
    '<button class="' + (state.right === 'files' ? 'active' : '') + '" data-act="tab-files">' + icon('files', 13) + ' ไฟล์</button>' +
    '<button class="' + (state.right === 'info' ? 'active' : '') + '" data-act="tab-info">' + icon('info', 13) + ' รายละเอียด</button></div>' + panel + '</aside></div></div>';
}
function activityPage() {
  const rows = state.events.length ? state.events.map(activityRow).join('') : emptyState('ยังไม่มีประวัติกิจกรรม', 'ระบบจะแสดงเฉพาะเหตุการณ์จริงที่บัญชีนี้มีสิทธิ์ดู');
  return '<div class="content">' + header('AUDIT & ACTIVITY', 'ประวัติการใช้งาน', 'เหตุการณ์จริงที่เกี่ยวข้องกับบัญชีของคุณ', btn(icon('refresh') + ' รีเฟรช', 'refresh-audit')) +
    '<div class="panel panel-pad"><div class="panel-title mb-20"><h2>บันทึกเหตุการณ์</h2><span class="pill">ล่าสุดก่อน</span></div>' + rows + '</div></div>';
}

function filesPage() {
  return '<div class="content">' + header('FILE WORKSPACE', 'ไฟล์และการถ่ายโอน', 'ส่งไฟล์ได้เมื่อมีเซสชัน Browser Share ที่ได้รับอนุญาต', '') +
    '<div class="info-banner">' + icon('shield', 16) + ' ไฟล์จะส่งผ่าน WebRTC ระหว่างผู้เข้าร่วม ไม่มีการจัดเก็บไฟล์ไว้บนเซิร์ฟเวอร์</div>' +
    '<div class="panel panel-pad">' + (state.liveSession
      ? '<p>กำลังเชื่อมต่อกับ ' + e(state.liveSession.hostName) + '</p>' + btn(icon('files', 14) + ' เปิดแท็บไฟล์ในเซสชัน', 'tab-files', 'btn btn-primary')
      : emptyState('ยังไม่มีเซสชันไฟล์', 'เชื่อมต่อด้วยรหัสจับคู่ แล้วรอ Host อนุญาตก่อนส่งไฟล์', btn(icon('plus') + ' เชื่อมต่อด้วยรหัส', 'connect-code', 'btn btn-primary'))) + '</div></div>';
}
function settingsPage() {
  const role = state.account?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'บัญชีครู';
  return '<div class="content">' + header('PREFERENCES & SECURITY', 'ตั้งค่าการใช้งาน', 'กำหนดค่าหน้าตาและตรวจสอบสิทธิ์บัญชีนี้',
    btn(icon('refresh') + ' คืนค่าเริ่มต้น', 'reset-settings')) +
    '<div class="settings-grid"><div class="panel panel-pad"><div class="panel-title"><div><h2>การแสดงผล</h2><p>บันทึกเฉพาะในเบราว์เซอร์นี้</p></div>' +
    icon('settings', 20) + '</div><div class="field"><label for="setting-theme">ธีมหน้าเว็บ</label><select id="setting-theme" data-setting="theme">' +
    '<option value="dark" ' + (state.settings.theme === 'dark' ? 'selected' : '') + '>Dark — Midnight</option>' +
    '<option value="light" ' + (state.settings.theme === 'light' ? 'selected' : '') + '>Light — Daylight</option></select></div>' +
    '<div class="field"><label for="setting-quality">คุณภาพเริ่มต้น</label><select id="setting-quality" data-setting="quality">' +
    '<option value="speed" ' + (state.settings.quality === 'speed' ? 'selected' : '') + '>เน้นความเร็ว</option>' +
    '<option value="balanced" ' + (state.settings.quality === 'balanced' ? 'selected' : '') + '>สมดุล</option>' +
    '<option value="quality" ' + (state.settings.quality === 'quality' ? 'selected' : '') + '>เน้นความคมชัด</option></select>' +
    '<small>ตัวเลือกนี้ยังไม่เปลี่ยนการเข้ารหัสของแหล่งภาพ</small></div>' +
    settingSwitch('notifications', 'การแจ้งเตือน', 'แสดงข้อความเมื่อมีคำขอเชื่อมต่อหรือไฟล์เข้า') +
    '<div class="mt-20">' + btn(icon('phone', 16) + ' วิธีติดตั้ง PWA', 'install-pwa', 'btn w-full') + '</div></div>' +
    '<div class="panel panel-pad"><div class="panel-title"><div><h2>บัญชีและความปลอดภัย</h2><p>สิทธิ์ของเซสชันปัจจุบัน</p></div>' + icon('shield', 20) + '</div>' +
    '<div class="detail-row"><span>บัญชี</span><strong>' + e(state.account?.email || '') + '</strong></div>' +
    '<div class="detail-row"><span>บทบาท</span><strong>' + role + '</strong></div>' +
    '<div class="detail-row"><span>การแชร์ภาพ</span><strong>ต้องได้รับอนุญาตจาก Host</strong></div>' +
    '<div class="detail-row"><span>ควบคุมเมาส์/คีย์บอร์ด Windows</span><strong>ต้องใช้ Agent</strong></div>' +
    (state.account?.role === 'admin' ? '<div class="mt-20">' + btn(icon('shield', 15) + ' จัดการบัญชีครู', 'go-users', 'btn btn-primary w-full') + '</div>' : '') +
    '<div class="help-wrap"><h4>' + icon('info', 14) + ' ข้อจำกัดการแชร์</h4><p>เบราว์เซอร์ให้ Host เลือกหน้าต่างหรือจอและอนุมัติทุกครั้ง ระบบนี้ยังเป็น view-only</p></div></div></div></div>';
}

function settingSwitch(key, title, desc) {
  return '<div class="switch-row"><div><strong>' + e(title) + '</strong><p>' + e(desc) + '</p></div><button class="switch ' +
    (state.settings[key] ? 'on' : '') + '" data-act="toggle-setting" data-key="' + e(key) + '" role="switch" aria-checked="' +
    String(!!state.settings[key]) + '" aria-label="' + e(title) + '"></button></div>';
}

function hostPage(){return `<div class="host-wrapper"><div class="host-header"><div class="brand-logo">${icon('monitor',30)}</div><div class="eyebrow">SECURE SCREEN SHARING</div><h1>แชร์หน้าจอหรือแอปพลิเคชัน</h1><p>เครื่องปลายทางเลือกแชร์เฉพาะหน้าต่างแอป จอภาพ หรือแท็บเบราว์เซอร์ได้ด้วยตนเอง<br/>ข้อมูลภาพส่งผ่านการเชื่อมต่อ WebRTC หลังอนุมัติเท่านั้น</p><a href="#/dashboard" class="text-link">${icon('back',14)} กลับไปแดชบอร์ด</a></div>
 <div class="panel host-card"><div class="panel-title"><div><h2>เครื่องที่กำลังแชร์</h2><p>ไม่ต้องติดตั้งโปรแกรมสำหรับการดูภาพผ่านเบราว์เซอร์</p></div><span class="pill ${state.hostCode?'success':'purple'}">${state.hostCode?'รอผู้เข้าร่วม':'ไม่ได้เริ่มแชร์'}</span></div>
 <div class="host-step"><div class="host-step-index">1</div><div style="flex:1"><strong>ตั้งชื่ออุปกรณ์</strong><p>ตั้งชื่อที่ผู้เชื่อมต่อจดจำได้ง่าย</p><div class="field"><input id="host-name" value="${e(state.hostName||'Windows ของฉัน')}" placeholder="เช่น คอมพิวเตอร์ห้องธุรการ" ${state.hostCode?'disabled':''}/></div></div></div>
 <div class="host-step"><div class="host-step-index">2</div><div style="flex:1"><strong>สร้างรหัสจับคู่ชั่วคราว</strong><p>ให้ผู้ดูแลระบบเปิดเมนู “เชื่อมต่อเครื่องใหม่” และกรอกรหัสนี้ รหัสจะหมดอายุอัตโนมัติ</p>${state.hostCode?`<div class="pair-code">${e(state.hostCode)}</div><div style="text-align:center;font-size:11px;color:#8999b2;margin-bottom:10px">ใช้ครั้งเดียว · หมดอายุประมาณ 15 นาที</div><div style="text-align:center">${btn(`${icon('copy',14)} คัดลอกรหัส`,'copy-host-code','btn btn-xs')}${btn(`${icon('refresh',14)} รหัสใหม่`,'regenerate-host','btn btn-xs')}${btn(`${icon('close',14)} ยกเลิก`,'stop-host','btn btn-xs btn-danger')}</div>`:btn(`${icon('plus',15)} สร้างรหัสสำหรับแชร์เครื่องนี้`,'start-host','btn btn-primary w-full mt-16')}
 </div></div>
 <div class="host-step"><div class="host-step-index">3</div><div style="flex:1"><strong>อนุมัติคำขอและเลือกหน้าต่าง</strong><p>เมื่อผู้ดูแลขอเชื่อมต่อ ให้คลิก “อนุญาตและเลือกหน้าต่าง” เบราว์เซอร์จะเปิดหน้าต่างเลือกแชร์ โดยคุณเป็นผู้ตัดสินใจทุกครั้ง</p><div class="host-requests">${state.hostRequests.length?state.hostRequests.map(r=>`<div class="request-card"><strong>${icon('shield',15)} คำขอจาก ${e(r.requester||'ผู้ดูแลระบบ')}</strong><p>ขอดูภาพหน้าจอ/หน้าต่างของคุณ (ดูอย่างเดียว)</p><div style="display:flex;gap:7px">${btn(`${icon('check',14)} อนุญาตและเลือกแหล่งแชร์`,'accept-host','btn btn-primary','data-session="'+e(r.sessionId)+'"')}${btn('ปฏิเสธ','reject-host','btn btn-danger','data-session="'+e(r.sessionId)+'"')}</div></div>`).join(''):`<div class="help-wrap"><h4>${icon('lock',14)} ยังไม่มีคำขอเชื่อมต่อ</h4><p>${state.hostCode?'รอให้ผู้ดูแลใส่รหัสจับคู่ แล้วกดยอมรับที่เครื่องนี้':'สร้างรหัสจับคู่ก่อน เพื่อให้ผู้ดูแลส่งคำขอเข้ามาได้'}</p></div>`}</div></div></div>
 <div class="host-step"><div class="host-step-index">4</div><div style="flex:1"><strong>ภาพที่กำลังแชร์</strong><p>ภาพจากแหล่งแชร์ปัจจุบัน</p><div class="host-preview"><video id="host-video" autoplay muted playsinline ${state.localStream?'':'class="hidden"'}></video>${state.localStream?'':`<div class="capture-frame">${icon('monitor',34)}<span>ยังไม่มีหน้าต่างที่กำลังแชร์</span></div>`}</div>${state.localStream?`<div class="mt-16">${btn(`${icon('power',14)} หยุดแชร์ทันที`,'stop-stream','btn btn-danger w-full')}</div>`:''}</div></div>
 </div><div class="info-banner warning mt-20" style="max-width:590px;margin-left:auto;margin-right:auto">${icon('alert',17)} เว็บเบราว์เซอร์ส่งภาพจากแอปหรือจอที่คุณเลือกได้ แต่ไม่สามารถรับคำสั่งเมาส์/คีย์บอร์ดเพื่อควบคุมโปรแกรม Windows จริงได้หากไม่มี Windows Agent</div>
 ${state.localStream?`<div class="panel host-card mt-16"><div class="panel-title"><h2>การสื่อสารกับผู้ดูแล</h2><span class="pill success">Session live</span></div><div style="max-height:220px;overflow:auto;margin-top:15px">${state.hostChat.map(c=>`<div class="chat-bubble ${c.mine?'mine':''}">${e(c.text)}</div>`).join('')}</div><form id="host-chat-form" class="chat-compose"><input id="host-chat-input" placeholder="ส่งข้อความกลับผู้ดูแล"/><button aria-label="ส่งข้อความ">${icon('arrow',14)}</button></form><input class="hidden" type="file" id="host-file"/>${state.files.length?`<div style="margin-top:10px">${state.files.map(f=>`<div class="file-item">${icon('file',16)}<div style="flex:1"><strong>${e(f.name)}</strong><small>${e(f.status)}</small></div>${f.url?`<button class="btn btn-xs" data-act="download-file" data-file-id="${e(f.id)}">บันทึก</button>`:''}</div>`).join('')}</div>`:''}${btn(`${icon('upload',14)} ส่งไฟล์ให้ผู้ดูแล`,'host-send-file','btn w-full mt-16')}</div>`:''}
 </div>`}
function authFrame(content) {
  return '<div class="login-screen"><section class="login-visual"><div class="brand"><div class="brand-logo">' + icon('monitor', 24) +
    '</div><div><div class="brand-head">KRABAK</div><div class="brand-sub">REMOTE MANAGER</div></div></div><div>' +
    '<div class="eyebrow">SECURE REMOTE WORKSPACE</div><h1>จัดการการเชื่อมต่อ<br/>อย่างปลอดภัย</h1>' +
    '<p>บัญชีครูออกโดยผู้ดูแลระบบ แต่ละบัญชีมีสิทธิ์และประวัติการใช้งานของตนเอง</p><div class="hero-graphic" aria-hidden="true"><div class="hg-monitor hg-main"><div class="hg-toolbar"><i></i><i></i><i></i></div><div class="hg-shapes"><div></div><div></div></div></div></div></div>' +
    '<span class="auth-brand-foot">KRABAK Remote Manager · Serva VPS</span></section><section class="login-form"><div class="login-form-inner">' + content + '</div></section></div>';
}

function loginPage() {
  const status = !state.backend ? '<div class="info-banner warning" role="status">เชื่อมต่อ Backend ไม่ได้ ตรวจสอบเครือข่ายหรือแจ้งผู้ดูแลระบบ</div>' :
    (!state.initialised ? '<div class="info-banner warning" role="status">ระบบยังไม่ได้ตั้งค่าบัญชีผู้ดูแล โปรดติดต่อผู้ดูแลระบบ</div>' : '');
  return authFrame('<div class="eyebrow">SIGN IN</div><h2>เข้าสู่ระบบ</h2><p>ใช้บัญชีอีเมลที่ผู้ดูแลระบบสร้างให้</p>' + status +
    (state.authNotice ? '<div class="auth-message success" role="status">' + e(state.authNotice) + '</div>' : '') +
    '<form id="login-form" class="auth-form"><div class="field"><label for="login-email">อีเมล</label><input required type="email" id="login-email" name="email" autocomplete="username" spellcheck="false" placeholder="name@school.ac.th…" value="' + e(state.activationEmail) + '"/></div>' +
    '<div class="field"><label for="login-password">รหัสผ่าน</label><div class="password-control"><input required type="' + (state.passwordVisible ? 'text' : 'password') +
    '" id="login-password" name="password" autocomplete="current-password" placeholder="กรอกรหัสผ่าน"/><button type="button" class="password-toggle" data-act="toggle-password" data-input="login-password" aria-label="' +
    (state.passwordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน') + '" aria-pressed="' + String(!!state.passwordVisible) + '">' + icon('eye', 16) + '</button></div></div>' +
    '<div id="login-error" class="auth-message error" role="alert" aria-live="polite">' + e(state.apiError) + '</div>' +
    '<button class="btn btn-primary w-full mt-16" type="submit" ' + (state.authBusy ? 'disabled' : '') + '>' + (state.authBusy ? '<span class="spinner"></span> กำลังเข้าสู่ระบบ…' : icon('lock', 15) + ' เข้าสู่ระบบ') + '</button></form>' +
    '<div class="auth-links"><span>มีรหัสเปิดใช้จากผู้ดูแล?</span><a href="#/activate">เปิดใช้บัญชีครู</a></div>' +
    '<p class="auth-security">' + icon('shield', 14) + ' การแชร์ภาพต้องได้รับอนุญาตจาก Host ทุกครั้ง</p>');
}

function activatePage() {
  return authFrame('<div class="eyebrow">ACCOUNT ACTIVATION</div><h2>เปิดใช้บัญชีครู</h2><p>กรอกอีเมลและรหัสเปิดใช้ครั้งเดียวที่ได้รับจากผู้ดูแล</p>' +
    '<form id="activate-form" class="auth-form"><div class="field"><label for="activation-email">อีเมล</label><input required type="email" id="activation-email" name="email" autocomplete="username" spellcheck="false" placeholder="name@school.ac.th…" value="' + e(state.activationEmail) + '"/></div>' +
    '<div class="field"><label for="activation-code">รหัสเปิดใช้</label><input required type="text" id="activation-code" name="activationCode" autocomplete="one-time-code" spellcheck="false" autocapitalize="none" placeholder="วางรหัสที่ได้รับ" /></div>' +
    '<div class="field"><label for="activation-password">ตั้งรหัสผ่าน</label><div class="password-control"><input required type="' + (state.passwordVisible ? 'text' : 'password') +
    '" id="activation-password" name="password" autocomplete="new-password" minlength="12" maxlength="128" pattern="(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{12,128}" placeholder="ตัวอักษรและตัวเลข 12–128 ตัว"/>' +
    '<button type="button" class="password-toggle" data-act="toggle-password" data-input="activation-password" aria-label="' + (state.passwordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน') +
    '" aria-pressed="' + String(!!state.passwordVisible) + '">' + icon('eye', 16) + '</button></div><small>ใช้เฉพาะ A–Z, a–z และ 0–9 โดยต้องมีทั้งตัวอักษรและตัวเลข</small></div>' +
    '<div class="field"><label for="activation-confirm">ยืนยันรหัสผ่าน</label><input required type="' + (state.passwordVisible ? 'text' : 'password') +
    '" id="activation-confirm" name="confirmPassword" autocomplete="new-password" minlength="12" maxlength="128" placeholder="กรอกรหัสผ่านเดิมอีกครั้ง"/></div>' +
    '<div id="activation-error" class="auth-message error" role="alert" aria-live="polite">' + e(state.apiError) + '</div>' +
    '<button class="btn btn-primary w-full mt-16" type="submit" ' + (state.authBusy ? 'disabled' : '') + '>' + (state.authBusy ? '<span class="spinner"></span> กำลังเปิดใช้บัญชี…' : 'ตั้งรหัสผ่านและเปิดใช้บัญชี') + '</button></form>' +
    '<div class="auth-links"><a href="#/login">กลับไปเข้าสู่ระบบ</a></div>');
}

function usersPage() {
  const rows = state.users.length ? state.users.map(user => '<article class="account-row"><div class="account-identity"><div class="avatar">' + icon('shield', 17) +
    '</div><div><strong>' + e(user.email) + '</strong><small>ครู · เพิ่มเมื่อ ' + e(new Date(user.createdAt).toLocaleDateString('th-TH')) + '</small></div></div>' +
    '<span class="pill ' + (user.status === 'active' ? 'success' : user.status === 'disabled' ? 'warning' : '') + '">' +
    (user.status === 'active' ? 'ใช้งานได้' : user.status === 'disabled' ? 'ปิดบัญชี' : 'รอเปิดใช้') + '</span><div class="account-actions">' +
    (user.status === 'active' || user.status === 'pending' ? btn('ออกโค้ดใหม่', 'reissue-activation', 'btn btn-xs', 'data-user-id="' + e(user.id) + '"') : '') +
    (user.status !== 'disabled' ? btn('ปิดบัญชี', 'disable-user', 'btn btn-xs btn-danger', 'data-user-id="' + e(user.id) + '"') : '') + '</div></article>').join('') :
    emptyState('ยังไม่มีบัญชีครู', 'สร้างบัญชีครูแล้วส่งรหัสเปิดใช้ให้เจ้าของอีเมล');
  const issued = state.activationIssued ? '<section class="activation-issued" aria-live="polite"><div class="eyebrow">ONE-TIME ACTIVATION CODE</div><h2>ส่งรหัสนี้ให้ ' +
    e(state.activationIssued.email) + '</h2><p>รหัสแสดงครั้งเดียว หมดอายุ ' + e(new Date(state.activationIssued.expiresAt).toLocaleString('th-TH')) +
    ' และจะใช้ได้เพียงครั้งเดียว</p><div class="issued-code"><code>' + e(state.activationIssued.activationCode) + '</code>' +
    btn(icon('copy', 14) + ' คัดลอกรหัส', 'copy-activation-code', 'btn btn-primary', 'aria-label="คัดลอกรหัสเปิดใช้"') + '</div>' +
    '<button class="text-link issued-dismiss" data-act="dismiss-activation">ซ่อนรหัสหลังส่งแล้ว</button></section>' : '';
  return '<div class="content">' + header('ACCOUNT MANAGEMENT', 'บัญชีครู', 'ผู้ดูแลสร้างบัญชีและออกโค้ดเปิดใช้ครั้งเดียว', '') +
    '<div class="account-layout"><section class="panel panel-pad"><div class="panel-title"><div><h2>สร้างบัญชีครู</h2><p>ผู้ใช้ตั้งรหัสผ่านเองหลังรับโค้ด</p></div>' + icon('plus', 20) + '</div>' +
    '<form id="create-user-form" class="auth-form"><div class="field"><label for="new-user-email">อีเมลครู</label><input required type="email" id="new-user-email" name="email" autocomplete="email" spellcheck="false" placeholder="teacher@school.ac.th…"/></div>' +
    '<div id="create-user-error" class="auth-message error" role="alert" aria-live="polite"></div>' +
    '<button class="btn btn-primary" type="submit" ' + (state.authBusy ? 'disabled' : '') + '>' + (state.authBusy ? '<span class="spinner"></span> กำลังสร้าง…' : icon('plus', 15) + ' สร้างบัญชีและออกโค้ด') + '</button></form>' + issued + '</section>' +
    '<section class="panel panel-pad"><div class="panel-title"><div><h2>บัญชีที่สร้างแล้ว</h2><p>รหัสผ่านและรหัสเปิดใช้จะไม่แสดงในรายการนี้</p></div><button class="btn btn-xs" data-act="refresh-users">' + icon('refresh', 14) + ' รีเฟรช</button></div>' +
    (state.users.length ? '<div class="account-list">' + rows + '</div>' : rows) + '</section></div></div>';
}

function modalHtml() {
  if (!state.modal) return '';
  const m = state.modal;
  let title = 'ข้อมูลเพิ่มเติม', body = '';
  if (m.type === 'connect') {
    title = 'เชื่อมต่อด้วยรหัสจับคู่';
    body = '<p>กรอกรหัสชั่วคราวที่แสดงบนเครื่อง Host ผู้ใช้เครื่องนั้นต้องตรวจสอบและอนุญาตคำขอ</p>' +
      '<form id="pair-form"><div class="field"><label for="pair-code">รหัสจับคู่</label><input id="pair-code" name="code" class="code-input" placeholder="XXXXXXXX" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" required pattern="[a-zA-Z0-9]{8}"/>' +
      '<small>รหัสใช้ได้ครั้งเดียว และมีอายุประมาณ 15 นาที</small></div><div class="modal-actions"><button type="button" class="btn" data-act="close-modal">ยกเลิก</button>' +
      '<button type="submit" class="btn btn-primary">' + icon('arrow', 15) + ' ขออนุญาตเชื่อมต่อ</button></div></form>';
  } else if (m.type === 'clipboard') {
    title = 'ส่งข้อความในเซสชัน';
    body = '<p>ข้อความจะถูกส่งให้อีกฝั่งเลือกคัดลอกเอง ระบบไม่อ่านคลิปบอร์ดของ Windows</p><form id="clipboard-form"><div class="field"><label for="clipboard-text">ข้อความ</label>' +
      '<textarea id="clipboard-text" name="message" rows="5" placeholder="วางข้อความที่ต้องการส่ง…" required></textarea></div>' +
      '<div class="modal-actions">' + btn('ยกเลิก', 'close-modal') + '<button type="submit" class="btn btn-primary">' + icon('arrow', 14) + ' ส่งข้อความ</button></div></form>';
  } else if (m.type === 'quality') {
    title = 'คุณภาพภาพและการซูม';
    body = '<div class="field"><label for="quality-input">โหมดคุณภาพ</label><select id="quality-input"><option value="speed" ' +
      (state.quality === 'speed' ? 'selected' : '') + '>เน้นความเร็ว</option><option value="balanced" ' + (state.quality === 'balanced' ? 'selected' : '') +
      '>สมดุล</option><option value="quality" ' + (state.quality === 'quality' ? 'selected' : '') + '>เน้นความคมชัด</option></select><small>ค่าคุณภาพเป็นตัวเลือก UI ในเวอร์ชันนี้</small></div>' +
      '<div class="field"><label for="zoom-range">ระดับซูม</label><input id="zoom-range" type="range" min="50" max="150" step="10" value="' + state.zoom + '"/><small>' + state.zoom + '%</small></div>' +
      '<div class="modal-actions">' + btn('บันทึกการตั้งค่า', 'save-quality', 'btn btn-primary') + '</div>';
  } else if (m.type === 'help') {
    title = 'เกี่ยวกับ KRABAK Remote Manager';
    body = '<div class="info-banner mint">' + icon('check', 16) + ' แชร์ภาพจากเบราว์เซอร์ผ่าน WebRTC หลังจาก Host อนุญาต</div>' +
      '<p><strong>การควบคุม Windows</strong><br/>เว็บแอปเป็น view-only ไม่ส่งคลิกหรือแป้นพิมพ์เข้าระบบปฏิบัติการ</p>' +
      '<p><strong>การอนุญาต</strong><br/>Host ต้องเลือกหน้าต่างหรือจอจากตัวเลือกของเบราว์เซอร์ทุกครั้ง</p>' +
      '<div class="modal-actions">' + btn('ปิด', 'close-modal', 'btn btn-primary') + '</div>';
  } else if (m.type === 'pwa') {
    title = 'ติดตั้งแอป PWA';
    body = '<p><strong>Chrome / Edge บน Windows</strong><br/>เปิดเว็บผ่าน HTTPS แล้วเลือก “ติดตั้งแอป” จากเมนูเบราว์เซอร์</p>' +
      '<p><strong>มือถือ</strong><br/>ใช้เมนูแชร์หรือเมนูเบราว์เซอร์เพื่อเพิ่มไปยังหน้าจอหลัก</p>' +
      '<div class="modal-actions">' + btn('ปิด', 'close-modal', 'btn btn-primary') + '</div>';
  } else if (m.type === 'confirm-reset') {
    title = 'คืนค่าการตั้งค่า';
    body = '<p>คืนค่าธีมและตัวเลือกในเบราว์เซอร์นี้ โดยไม่เปลี่ยนข้อมูลบัญชีหรือเซิร์ฟเวอร์</p><div class="modal-actions">' +
      btn('ยกเลิก', 'close-modal') + btn('คืนค่าเริ่มต้น', 'confirm-reset', 'btn btn-danger') + '</div>';
  } else if (m.type === 'host-consent') {
    title = 'อนุญาตให้แชร์หน้าจอหรือไม่';
    body = '<div class="host-consent-body"><div class="consent-icon">' + icon('monitor', 28) + '</div><p><strong>' +
      e(m.requester || 'ผู้ใช้ที่เข้าสู่ระบบ') + '</strong> ขอเข้าดูภาพจากเครื่องนี้</p><p>การแชร์เป็นแบบดูภาพเท่านั้น เบราว์เซอร์จะให้คุณเลือกหน้าต่างหรือจอหลังจากอนุญาต</p>' +
      '<div class="modal-actions">' + btn('ปฏิเสธ', 'reject-host', 'btn btn-danger', 'data-session="' + e(m.sessionId) + '"') +
      btn(icon('check', 15) + ' อนุญาตและเลือกหน้าต่าง', 'accept-host', 'btn btn-primary', 'data-session="' + e(m.sessionId) + '"') + '</div></div>';
  } else {
    body = '<p>รายการนี้ยังไม่พร้อมใช้งาน</p>' + btn('ปิด', 'close-modal');
  }
  return '<div class="modal-cover" ' + (m.type === 'host-consent' ? '' : 'data-overlay="close"') + '><div class="modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="modal-heading"><div class="modal-title"><h3 id="modal-heading">' +
    title + '</h3>' + (m.type === 'host-consent' ? '' : '<button class="top-icon" data-act="close-modal" aria-label="ปิดหน้าต่าง">' + icon('close', 17) + '</button>') + '</div>' + body + '</div></div>';
}
function showModal(type,extra={}){state.modal={type,...extra};render();document.querySelector('.modal')?.focus();}
function toast(text,kind='ok'){let holder=document.getElementById('toasts');if(!holder){holder=document.createElement('div');holder.id='toasts';holder.className='toast-stack';holder.setAttribute('role','status');holder.setAttribute('aria-live','polite');holder.setAttribute('aria-atomic','true');document.body.append(holder);}const el=document.createElement('div');el.className='toast '+kind;el.innerHTML=`${icon(kind==='err'?'alert':'check',15)}<span>${e(text)}</span>`;holder.appendChild(el);setTimeout(()=>el.remove(),3900);}
const api = async (path, opts = {}) => {
  const response = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) { const error = new Error(body.error || 'คำขอไม่สำเร็จ'); error.status = response.status; throw error; }
  return body;
};

async function checkBackend() {
  try {
    const status = await api('/status');
    state.backend = true;
    state.initialised = !!status.initialised;
    state.rtcConfig = status.rtcConfig || null;
    state.account = status.user || null;
  } catch {
    state.backend = false;
    state.initialised = false;
    state.account = null;
  }
  state.appReady = true;
  if (state.account) {
    location.hash = '#/dashboard';
    await loadAccountData();
  } else {
    state.apiError = state.backend ? '' : 'เชื่อมต่อ Backend ไม่ได้ โปรดตรวจสอบเครือข่ายหรือแจ้งผู้ดูแลระบบ';
    location.hash = '#/login';
  }
  render();
}

async function login(ev) {
  ev.preventDefault();
  if (state.authBusy) return;
  const email = document.getElementById('login-email')?.value.trim();
  const passwordInput = document.getElementById('login-password');
  const submit = ev.target.querySelector('[type="submit"]');
  state.authBusy = true; state.apiError = '';
  const message = document.getElementById('login-error'); if (message) message.textContent = '';
  if (submit) submit.disabled = true;
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ email, password: passwordInput?.value }) });
    state.account = data.user; state.authNotice = ''; state.authBusy = false;
    if (passwordInput) passwordInput.value = '';
    location.hash = '#/dashboard';
    await loadAccountData();
    render(); toast('เข้าสู่ระบบแล้ว');
  } catch (error) {
    state.apiError = error.message; state.authBusy = false;
    if (message) message.textContent = error.message;
    if (submit) submit.disabled = false;
  }
}

async function activateAccount(ev) {
  ev.preventDefault();
  if (state.authBusy) return;
  const form = ev.target;
  const email = form.elements.email.value.trim();
  const code = form.elements.activationCode.value.trim();
  const password = form.elements.password.value;
  const confirmation = form.elements.confirmPassword.value;
  const message = document.getElementById('activation-error');
  const submit = form.querySelector('[type="submit"]');
  if (password !== confirmation) { if (message) message.textContent = 'รหัสผ่านที่ยืนยันไม่ตรงกัน'; return; }
  state.authBusy = true; state.apiError = '';
  if (message) message.textContent = '';
  if (submit) submit.disabled = true;
  try {
    await api('/activate', { method: 'POST', body: JSON.stringify({ email, activationCode: code, password }) });
    state.authBusy = false; state.passwordVisible = false;
    state.authNotice = 'เปิดใช้บัญชีแล้ว เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้';
    state.apiError = ''; state.activationEmail = email; location.hash = '#/login'; render();
  } catch (error) {
    state.authBusy = false; state.apiError = error.message;
    if (message) message.textContent = error.message;
    if (submit) submit.disabled = false;
  }
}

async function createTeacherAccount(ev) {
  ev.preventDefault();
  if (state.authBusy) return;
  const email = ev.target.elements.email.value.trim();
  const submit = ev.target.querySelector('[type="submit"]');
  const message = document.getElementById('create-user-error');
  state.authBusy = true;
  if (message) message.textContent = '';
  if (submit) submit.disabled = true;
  try {
    const result = await api('/users', { method: 'POST', body: JSON.stringify({ email }) });
    state.activationIssued = { email: result.user.email, activationCode: result.activationCode, expiresAt: result.expiresAt };
    state.authBusy = false; render();
    try { await refreshUsers(); render(); }
    catch { toast('บัญชีสร้างแล้ว; เก็บรหัสเปิดใช้ที่แสดงไว้ แล้วลองรีเฟรชรายการภายหลัง', 'err'); }
  } catch (error) {
    state.authBusy = false; if (message) message.textContent = error.message;
    if (submit) submit.disabled = false;
  }
}

async function refreshHosts() {
  if (!state.account) return;
  const result = await api('/hosts');
  state.devices = result.hosts || [];
  if (state.route === 'dashboard' || state.route === 'devices') render();
}

async function refreshUsers() {
  if (!state.account || state.account.role !== 'admin') return;
  const result = await api('/users');
  state.users = result.users || [];
}

async function logout() {
  if (state.hostToken) {
    try { await api('/host/revoke', { method: 'POST', body: JSON.stringify({ token: state.hostToken }) }); } catch {}
  }
  try { await api('/logout', { method: 'POST', body: '{}' }); } catch {}
  if (state.ws) { try { state.ws.close(); } catch {} }
  closePeer(); stopStream();
  state.account = null; state.devices = []; state.events = []; state.users = []; state.activationIssued = null; state.resourceError = '';
  state.liveSession = null; state.ws = null; state.appReady = true; state.authNotice = '';
  state.hostToken = null; state.hostCode = null; state.hostRequests = []; state.activeSessionId = null; state.modal = null;
  location.hash = '#/login'; render(); toast('ออกจากระบบแล้ว');
}

async function refreshAudit() {
  if (!state.account) return;
  const result = await api('/audit');
  state.events = (result.events || []).map(row => ({
    type: row.type,
    title: row.title,
    sub: row.detail || row.actorEmail || 'เหตุการณ์ในระบบ',
    time: new Date(row.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  }));
  if (state.route === 'activity' || state.route === 'dashboard') render();
}

async function loadAccountData() {
  const results = await Promise.allSettled([
    refreshHosts(), refreshAudit(), state.account?.role === 'admin' ? refreshUsers() : Promise.resolve(),
  ]);
  state.resourceError = results.some(result => result.status === 'rejected')
    ? 'โหลดข้อมูลบางส่วนไม่สำเร็จ คุณยังเข้าสู่ระบบแล้ว ลองโหลดรายการอีกครั้ง'
    : '';
}

const wsUrl=()=>`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`;
function connectSocket(role,token){if(state.ws){try{state.ws.close()}catch{}}const ws=new WebSocket(wsUrl());state.ws=ws;ws.onopen=()=>{ws.send(JSON.stringify(role==='host'?{type:'host-hello',token}:{type:'viewer-hello'}));if(role==='viewer'&&state.liveSession)ws.send(JSON.stringify({type:'watch',sessionId:state.liveSession.id}));};ws.onmessage=async event=>{let data;try{data=JSON.parse(event.data)}catch{return}if(data.type==='error'){toast(data.error||'เซิร์ฟเวอร์ปฏิเสธคำขอ','err');return}
 if(data.type==='host-hello-ok'){state.hostStatus='waiting';render();return}
 if(data.type==='viewer-hello-ok'){if(state.liveSession)ws.send(JSON.stringify({type:'watch',sessionId:state.liveSession.id}));return}
 if(data.type==='invite'){state.hostRequests=[...state.hostRequests.filter(r=>r.sessionId!==data.sessionId),data];state.modal={type:'host-consent',sessionId:data.sessionId,requester:data.requester};render();document.querySelector('.modal')?.focus();toast('มีคำขอเข้ามา โปรดตรวจสอบก่อนอนุญาต');return}
 if(data.type==='accepted'){state.connection='กำลังเชื่อมต่อ WebRTC';render();return}
 if(data.type==='signal'){await handleSignal(data);return}
 if(data.type==='chat'){state.hostChat.push({mine:false,text:String(data.text||'').slice(0,2000),time:now()});if(state.route==='remote'||state.route==='host')render();toast('มีข้อความใหม่');return}
 if(data.type==='change-request'){toast('ผู้ดูแลขอเปลี่ยนแหล่งภาพ — กดหยุดแชร์แล้วอนุญาตใหม่','ok');return}
 if(data.type==='ended'){state.connection='สิ้นสุดแล้ว';state.sessionEnded=true;closePeer();if(role==='host'){stopStream();state.hostRequests=[];state.modal=null;render();}else{toast('เซสชันสิ้นสุดแล้ว');state.liveSession=null;navigate('devices');}return}
 };ws.onerror=()=>toast('ไม่สามารถเชื่อมต่อช่องสัญญาณได้','err');ws.onclose=()=>{if(state.ws!==ws)return;if(role==='host'&&state.hostCode){state.hostStatus='disconnected';toast('ช่องสัญญาณถูกตัด กรุณาสร้างรหัสจับคู่ใหม่','err');state.hostCode=null;state.hostRequests=[];state.modal=null;stopStream();render();}else if(role==='viewer'&&state.liveSession){state.connection='ช่องสัญญาณขัดข้อง';render();}};return ws;}
function socketSend(msg){if(state.ws?.readyState===WebSocket.OPEN){state.ws.send(JSON.stringify(msg));return true;}return false;}
async function startHost(){if(!state.backend){toast('ต้องเริ่ม Backend ก่อนจึงแชร์จริงได้ ดู README_TH.md','err');return;}const name=(document.getElementById('host-name')?.value||'Windows ของฉัน').trim().slice(0,80);try{const data=await api('/host/register',{method:'POST',body:JSON.stringify({name})});state.hostName=name;state.rtcConfig=data.rtcConfig||state.rtcConfig;state.hostToken=data.token;state.hostCode=data.code;state.hostRequests=[];state.hostStatus='connecting';state.hostExpiry=data.expiresAt;connectSocket('host',data.token);render();toast('สร้างรหัสจับคู่สำเร็จ');}catch(err){toast(err.message,'err');}}
async function stopHost(){if(state.hostToken){try{await api('/host/revoke',{method:'POST',body:JSON.stringify({token:state.hostToken})});}catch{}}closePeer();stopStream();try{state.ws?.close()}catch{}state.ws=null;state.hostToken=null;state.hostCode=null;state.hostRequests=[];state.modal=null;state.hostStatus='idle';render();toast('ยกเลิกการแชร์แล้ว');}
function stopStream(){if(state.localStream){state.localStream.getTracks().forEach(t=>t.stop());state.localStream=null;}state.activeSessionId=null;closePeer();}
async function acceptHost(sessionId){try{
 if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('ต้องใช้ Chrome/Edge ผ่าน HTTPS หรือ localhost');
 const captureRequest=navigator.mediaDevices.getDisplayMedia({video:{frameRate:15},audio:false,preferCurrentTab:false,selfBrowserSurface:'exclude'});
 state.modal=null;render();
 const stream=await captureRequest;
 stream.getVideoTracks()[0]?.addEventListener('ended',()=>{socketSend({type:'end',sessionId});stopStream();render();toast('เจ้าของเครื่องหยุดการแชร์ภาพแล้ว');},{once:true});
 state.localStream=stream;state.activeSessionId=sessionId;state.hostRequests=state.hostRequests.filter(r=>r.sessionId!==sessionId);
 socketSend({type:'accept',sessionId});render();attachHostVideo();await createHostPeer(sessionId,stream);toast('เริ่มแชร์ภาพอย่างปลอดภัยแล้ว');
  }catch(err){const pending=state.hostRequests.find(r=>r.sessionId===sessionId);if(pending)state.modal={type:'host-consent',sessionId,requester:pending.requester};render();document.querySelector('.modal')?.focus();toast('ไม่ได้เริ่มแชร์: '+err.message,'err');}}
async function createPeer(sessionId,asHost=false){closePeer();const pc=new RTCPeerConnection(state.rtcConfig||{iceServers:[{urls:'stun:stun.l.google.com:19302'}]});state.pc=pc;pc.onicecandidate=event=>{if(event.candidate)socketSend({type:'signal',sessionId,payload:{kind:'candidate',candidate:event.candidate}})};
 pc.onconnectionstatechange=()=>{state.connection=pc.connectionState;if(pc.connectionState==='connected')toast('WebRTC เชื่อมต่อแล้ว');if(pc.connectionState==='failed')toast('WebRTC เชื่อมต่อไม่ได้ อาจต้องมี TURN server','err');};
 pc.ontrack=ev=>{state.remoteStream=ev.streams[0]||new MediaStream([ev.track]);state.connection='connected';attachViewerVideo();};
 pc.ondatachannel=ev=>setupChannel(ev.channel);if(asHost){const channel=pc.createDataChannel('krabak-files',{ordered:true});setupChannel(channel);}return pc;}
async function createHostPeer(sessionId,stream){const pc=await createPeer(sessionId,true);for(const track of stream.getTracks())pc.addTrack(track,stream);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socketSend({type:'signal',sessionId,payload:{kind:'offer',sdp:pc.localDescription}});}
let pendingIce=[];
async function handleSignal(data){const {sessionId,payload}=data;if(!payload||!sessionId)return;try{
 if(payload.kind==='offer'){if(!state.liveSession||state.liveSession.id!==sessionId)return;const pc=await createPeer(sessionId,false);await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));for(const ice of pendingIce)await pc.addIceCandidate(ice).catch(()=>{});pendingIce=[];const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socketSend({type:'signal',sessionId,payload:{kind:'answer',sdp:pc.localDescription}});state.connection='กำลังรับภาพ';render();}
 else if(payload.kind==='answer'){if(state.pc)await state.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));}
 else if(payload.kind==='candidate'){if(state.pc?.remoteDescription)await state.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));else pendingIce.push(new RTCIceCandidate(payload.candidate));}
 }catch(err){console.error(err);toast('WebRTC signaling: '+err.message,'err');}}
function attachHostVideo(){const vid=document.getElementById('host-video');if(vid&&state.localStream){vid.srcObject=state.localStream;vid.classList.remove('hidden');vid.play().catch(()=>{});}}
function attachViewerVideo(){const vid=document.getElementById('live-video');if(vid&&state.remoteStream){vid.srcObject=state.remoteStream;vid.classList.remove('hidden');const placeholder=document.getElementById('live-placeholder');if(placeholder)placeholder.classList.add('hidden');vid.play().catch(()=>{});}const stage=document.querySelector('#remote-stage-body .monitor-preview, #remote-stage-body .isolated-app');if(stage)stage.style.transform=`scale(${state.zoom/100})`;}
function closePeer(){if(state.pc){try{state.pc.close()}catch{}state.pc=null}state.rtcChannel=null;state.remoteStream=null;pendingIce=[];}
async function requestSession(ev){ev.preventDefault();const code=document.getElementById('pair-code')?.value.trim().toUpperCase();if(!state.backend){toast('ต้อง Deploy Backend ก่อนจึงจับคู่ได้','err');return;}if(!state.account){toast('กรุณาเข้าสู่ระบบผู้ดูก่อนเชื่อมต่อ','err');state.modal=null;navigate('login');return;}try{const data=await api('/sessions',{method:'POST',body:JSON.stringify({code})});state.rtcConfig=data.rtcConfig||state.rtcConfig;state.liveSession={id:data.id,hostName:data.hostName};state.connection='รอเจ้าของเครื่องอนุญาต';state.hostChat=[];state.files=[];state.modal=null;state.right='chat';state.remoteStream=null;connectSocket('viewer');navigate('remote/live');toast('ส่งคำขอแล้ว กรุณารอให้เจ้าของเครื่องยืนยัน');}catch(err){toast(err.message,'err');}}
function endLive(){if(state.liveSession)socketSend({type:'end',sessionId:state.liveSession.id});closePeer();state.liveSession=null;state.hostChat=[];state.sessionEnded=true;try{state.ws?.close()}catch{}state.ws=null;navigate('devices');toast('สิ้นสุดเซสชันแล้ว');}
function sendChat(text){const safe=String(text||'').trim().slice(0,2000);if(!safe)return;const id=state.liveSession?.id||state.activeSessionId;if(!id){toast('เริ่มเซสชันที่ได้รับอนุญาตก่อนส่งข้อความ','err');return}if(!socketSend({type:'chat',sessionId:id,text:safe})){toast('ไม่ได้เชื่อมต่อช่องสัญญาณ','err');return}state.hostChat.push({mine:true,text:safe,time:now()});render();}
let receivedFile=null;
function setupChannel(channel){state.rtcChannel=channel;channel.binaryType='arraybuffer';channel.onopen=()=>toast('ช่องส่งไฟล์ WebRTC พร้อมใช้งาน');channel.onmessage=ev=>{
 if(typeof ev.data==='string'){let m;try{m=JSON.parse(ev.data)}catch{return};if(m.type==='file-meta'){if(m.size>8*1024*1024){receivedFile=null;return}receivedFile={name:String(m.name||'file.bin').slice(0,160),size:m.size,chunks:[],received:0};}
 else if(m.type==='file-end'&&receivedFile){const f=receivedFile;receivedFile=null;if(f.received!==f.size){toast('ไฟล์ที่ได้รับไม่ครบ','err');return;}const blob=new Blob(f.chunks);const url=URL.createObjectURL(blob);state.files.unshift({name:f.name,status:'รับแล้ว · คลิกบันทึกไฟล์',url,id:crypto.randomUUID()});toast('ได้รับไฟล์ '+f.name);render();}}
 else if(receivedFile&&ev.data instanceof ArrayBuffer){receivedFile.chunks.push(ev.data);receivedFile.received+=ev.data.byteLength;if(receivedFile.received>8*1024*1024)receivedFile=null;}
 };channel.onclose=()=>{if(state.rtcChannel===channel)state.rtcChannel=null;};}
async function sendFile(file){if(!file)return;if(file.size>8*1024*1024){toast('ไฟล์รองรับไม่เกิน 8 MB','err');return;}if(!state.liveSession&&!state.activeSessionId){toast('เริ่มเซสชันที่ได้รับอนุญาตก่อนส่งไฟล์','err');return;}const ch=state.rtcChannel;if(!ch||ch.readyState!=='open'){toast('ช่องส่งไฟล์ยังไม่พร้อม','err');return;}const id=crypto.randomUUID();state.files.unshift({id,name:file.name,status:'กำลังส่ง...'});render();try{ch.send(JSON.stringify({type:'file-meta',name:file.name,size:file.size}));for(let offset=0;offset<file.size;offset+=12000){const chunk=await file.slice(offset,offset+12000).arrayBuffer();while(ch.bufferedAmount>512*1024)await new Promise(r=>setTimeout(r,25));ch.send(chunk);}ch.send(JSON.stringify({type:'file-end'}));state.files.find(f=>f.id===id).status='ส่งแล้วผ่าน WebRTC';toast('ส่งไฟล์แล้ว ผู้รับต้องเลือกบันทึก');render();}catch(err){toast('ส่งไฟล์ไม่สำเร็จ: '+err.message,'err');}}
function sendClipboard(text){const safe=text.slice(0,2000);if(!safe.trim())return;sendChat('[ข้อความจากคลิปบอร์ด]\n'+safe);state.modal=null;render();}
async function onAction(act,el){switch(act){
 case 'mobile-menu':state.mobileMenu=!state.mobileMenu;render();break;
 case 'go-host':navigate('host');break;
 case 'go-devices':if(state.liveSession)endLive();else navigate('devices');break;
 case 'go-users':navigate('users');break;
 case 'connect-code':showModal('connect');break;
 case 'close-modal':if(state.modal?.type==='host-consent')break;state.modal=null;render();break;
 case 'toggle-password':{const input=document.getElementById(el.dataset.input);if(input){input.type=input.type==='password'?'text':'password';el.setAttribute('aria-label',input.type==='password'?'แสดงรหัสผ่าน':'ซ่อนรหัสผ่าน');el.setAttribute('aria-pressed',String(input.type==='text'));}break;}
 case 'copy-activation-code':try{await navigator.clipboard.writeText(state.activationIssued?.activationCode||'');toast('คัดลอกรหัสเปิดใช้แล้ว');}catch{toast('เบราว์เซอร์ไม่อนุญาตคลิปบอร์ด','err');}break;
 case 'dismiss-activation':state.activationIssued=null;render();break;
 case 'refresh-users':await refreshUsers().then(render).catch(err=>toast(err.message,'err'));break;
 case 'retry-data':await loadAccountData();render();break;
 case 'reissue-activation':{if(!window.confirm('ออกโค้ดเปิดใช้ใหม่หรือไม่? โค้ดเดิมจะใช้ไม่ได้'))break;try{const result=await api('/users/'+encodeURIComponent(el.dataset.userId)+'/activation',{method:'POST',body:'{}'});state.activationIssued={email:result.user.email,activationCode:result.activationCode,expiresAt:result.expiresAt};render();try{await refreshUsers();render();}catch{toast('โค้ดใหม่พร้อมใช้งาน; เก็บรหัสที่แสดงไว้ แล้วลองรีเฟรชรายการภายหลัง','err');}}catch(err){toast(err.message,'err');}break;}
 case 'disable-user':{if(!window.confirm('ปิดบัญชีครูนี้หรือไม่? เซสชันและอุปกรณ์ที่เชื่อมต่อจะถูกยกเลิก'))break;try{await api('/users/'+encodeURIComponent(el.dataset.userId)+'/disable',{method:'POST',body:'{}'});await refreshUsers();toast('ปิดบัญชีแล้ว');render();}catch(err){toast(err.message,'err');}break;}
 case 'grid-view':state.deviceView='grid';render();break;case 'list-view':state.deviceView='list';render();break;
 case 'tab-chat':state.right='chat';render();break;case 'tab-files':state.right='files';render();break;case 'tab-info':state.right='info';render();break;
 case 'end-live':endLive();break;
 case 'quality':showModal('quality');break;
 case 'fit':state.zoom=100;state.fit=true;render();break;
 case 'zoom-in':state.zoom=Math.min(150,state.zoom+10);render();break;case 'zoom-out':state.zoom=Math.max(50,state.zoom-10);render();break;
 case 'fullscreen':{const stage=document.getElementById('remote-stage');if(!document.fullscreenElement)await stage?.requestFullscreen?.().catch(()=>toast('เบราว์เซอร์ไม่อนุญาตโหมดเต็มจอ','err'));else await document.exitFullscreen?.();break;}
 case 'send-file':document.getElementById('remote-file')?.click();break;
 case 'host-send-file':document.getElementById('host-file')?.click();break;
 case 'download-file':{const file=state.files.find(x=>x.id===el.dataset.fileId);if(file?.url){const a=document.createElement('a');a.href=file.url;a.download=file.name;a.click();}break;}
 case 'start-host':await startHost();break;case 'regenerate-host':await stopHost();await startHost();break;case 'stop-host':await stopHost();break;
 case 'stop-stream':socketSend({type:'end',sessionId:state.activeSessionId});stopStream();state.activeSessionId=null;state.hostRequests=[];state.modal=null;render();toast('หยุดแชร์หน้าจอแล้ว');break;
 case 'accept-host':await acceptHost(el.dataset.session);break;
 case 'reject-host':socketSend({type:'reject',sessionId:el.dataset.session});state.hostRequests=state.hostRequests.filter(r=>r.sessionId!==el.dataset.session);state.modal=null;render();toast('ปฏิเสธคำขอแล้ว');break;
 case 'copy-host-code':await navigator.clipboard.writeText(state.hostCode||'').then(()=>toast('คัดลอกรหัสแล้ว')).catch(()=>toast('เบราว์เซอร์ไม่อนุญาตคลิปบอร์ด','err'));break;
 case 'request-change':socketSend({type:'change-request',sessionId:state.liveSession?.id});toast('ส่งคำขอแล้ว เจ้าของเครื่องต้องหยุดแชร์และเลือกใหม่');break;
 case 'toggle-setting':{const key=el.dataset.key;state.settings[key]=!state.settings[key];localStorage.setItem('krabak-prefs',JSON.stringify(state.settings));render();break;}
 case 'reset-settings':showModal('confirm-reset');break;
 case 'confirm-reset':{localStorage.removeItem('krabak-prefs');state.settings={theme:'dark',quality:'balanced',clipboard:true,notifications:true,conserve:true,defaultMode:'window'};state.modal=null;render();toast('คืนค่าการตั้งค่าแล้ว');break;}
 case 'save-quality':state.quality=document.getElementById('quality-input')?.value||'balanced';state.zoom=Number(document.getElementById('zoom-range')?.value||100);state.modal=null;render();toast('บันทึกการแสดงผลแล้ว');break;
 case 'help':showModal('help');break;
 case 'install-pwa':showModal('pwa');break;
 case 'refresh-audit':if(state.account)await refreshAudit().catch(err=>toast(err.message,'err'));break;
 case 'logout':await logout();break;
 default:break;
}}document.addEventListener('click',async ev=>{const nav=ev.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}const act=ev.target.closest('[data-act]');if(act){ev.preventDefault();await onAction(act.dataset.act,act);return;}if(ev.target.matches('[data-overlay]')&&state.modal?.type!=='host-consent'){state.modal=null;render();}});
document.addEventListener('submit',async ev=>{if(ev.target.matches('#login-form')){await login(ev);return}if(ev.target.matches('#activate-form')){await activateAccount(ev);return}if(ev.target.matches('#create-user-form')){await createTeacherAccount(ev);return}if(ev.target.matches('#pair-form')){await requestSession(ev);return}if(ev.target.matches('#chat-form')){ev.preventDefault();const input=document.getElementById('chat-input');const val=input?.value;input.value='';sendChat(val);return}if(ev.target.matches('#host-chat-form')){ev.preventDefault();const input=document.getElementById('host-chat-input');const val=input?.value;input.value='';sendChat(val);return}if(ev.target.matches('#clipboard-form')){ev.preventDefault();sendClipboard(document.getElementById('clipboard-text')?.value||'');return}});
document.addEventListener('change',ev=>{const t=ev.target;if(t.id==='device-filter'){state.filter=t.value;render();}else if(t.dataset.setting){state.settings[t.dataset.setting]=t.value;localStorage.setItem('krabak-prefs',JSON.stringify(state.settings));render();toast('บันทึกการตั้งค่าแล้ว');}else if(t.id==='remote-file'||t.id==='host-file'){const file=t.files?.[0];if(file)sendFile(file);}});
document.addEventListener('input',ev=>{if(ev.target.id==='device-search'){let pos=ev.target.selectionStart;state.search=ev.target.value;render();const inp=document.getElementById('device-search');inp?.focus();inp?.setSelectionRange(pos,pos);}if(ev.target.id==='zoom-range'){const small=ev.target.parentElement?.querySelector('small');if(small)small.textContent=ev.target.value+'%';}});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&state.modal&&state.modal.type!=='host-consent'){state.modal=null;render();}if((ev.ctrlKey||ev.metaKey)&&ev.key==='k'&&state.route==='devices'){ev.preventDefault();document.getElementById('device-search')?.focus();}});
window.addEventListener('hashchange',()=>{render();if(state.account){refreshHosts().catch(()=>{});refreshAudit().catch(()=>{});if(state.account.role==='admin')refreshUsers().catch(()=>{});}});
setInterval(()=>{if(state.account)refreshHosts().catch(()=>{});},15000);
window.addEventListener('pagehide',()=>{if(state.localStream){state.localStream.getTracks().forEach(t=>t.stop());}});
if('serviceWorker'in navigator&&location.protocol!=='file:'){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
render();checkBackend().catch(()=>{});
