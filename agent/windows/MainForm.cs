using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace KRABAK.RemoteAgent;

internal sealed class MainForm : Form
{
    private readonly AgentSettings _settings = AgentSettings.Load();
    private readonly TextBox _server = new();
    private readonly TextBox _deviceName = new();
    private readonly TextBox _enrollmentCode = new();
    private readonly CheckBox _controlConsent = new();
    private readonly CheckBox _trustedAccess = new();
    private readonly ComboBox _monitor = new();
    private readonly Label _status = new();
    private readonly Label _pairingCode = new();
    private readonly Button _enroll = new();
    private readonly Button _revoke = new();
    private readonly NotifyIcon _tray = new();
    private readonly AgentClient _client;
    private ActiveSessionForm? _activeSession;
    private bool _allowExit;

    public MainForm()
    {
        Text = "KRABAK Windows Agent";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = true;
        MaximizeBox = false;
        ClientSize = new Size(560, 640);
        Font = new Font("Segoe UI", 9);
        _client = new AgentClient(_settings, SelectedMonitorName);
        BuildLayout();
        WireEvents();
        LoadMonitors();

        var token = LocalTokenStore.Load();
        if (!string.IsNullOrWhiteSpace(token))
        {
            _controlConsent.Checked = true;
            _trustedAccess.Checked = _settings.TrustedAccess;
            SetEnrolledState(true);
            _client.Start();
        }
        else { _trustedAccess.Checked = _settings.TrustedAccess; SetEnrolledState(false); }
    }

    private void BuildLayout()
    {
        var heading = new Label { Text = "KRABAK Windows Agent", Font = new Font("Segoe UI", 18, FontStyle.Bold), AutoSize = true, Location = new Point(24, 20) };
        var intro = new Label { Text = "โปรแกรมนี้แชร์ภาพและส่งเมาส์/คีย์บอร์ดจริงเมื่อเซสชันได้รับอนุญาต · ทำงานในบัญชี Windows ปัจจุบันโดยไม่ใช้สิทธิ์ Administrator", AutoSize = false, Location = new Point(26, 62), Size = new Size(510, 50) };
        Controls.AddRange([heading, intro]);

        AddLabel("Server URL", 26, 128); _server.SetBounds(26, 151, 508, 30); _server.Text = _settings.ServerUrl; Controls.Add(_server);
        AddLabel("ชื่ออุปกรณ์", 26, 191); _deviceName.SetBounds(26, 214, 508, 30); _deviceName.Text = _settings.DeviceName; Controls.Add(_deviceName);
        AddLabel("จอที่แชร์", 26, 254); _monitor.SetBounds(26, 277, 508, 32); _monitor.DropDownStyle = ComboBoxStyle.DropDownList; Controls.Add(_monitor);
        AddLabel("รหัสลงทะเบียนครั้งเดียวจากหน้า “อุปกรณ์ของฉัน”", 26, 319); _enrollmentCode.SetBounds(26, 342, 508, 30); _enrollmentCode.PlaceholderText = "วางรหัสลงทะเบียนที่คัดลอกจากเว็บ"; Controls.Add(_enrollmentCode);

        _controlConsent.Text = "ฉันยินยอมให้ Agent แชร์ภาพจอและรับคำสั่งเมาส์/คีย์บอร์ด หลังเซสชันผ่านนโยบายอนุญาต";
        _controlConsent.SetBounds(26, 386, 510, 42);
        _controlConsent.AutoSize = false;
        Controls.Add(_controlConsent);
        _trustedAccess.Text = "เชื่อถือบัญชีนี้: อนุญาตเซสชันจากบัญชีเดียวกันโดยไม่ถามซ้ำ (ปิดไว้เป็นค่าเริ่มต้น)";
        _trustedAccess.SetBounds(26, 431, 510, 44);
        _trustedAccess.AutoSize = false;
        Controls.Add(_trustedAccess);

        _enroll.Text = "ลงทะเบียน Agent"; _enroll.SetBounds(26, 483, 170, 42); _enroll.UseVisualStyleBackColor = true; Controls.Add(_enroll);
        _revoke.Text = "เพิกถอนและลบข้อมูลเครื่องนี้"; _revoke.SetBounds(204, 483, 220, 42); Controls.Add(_revoke);
        _status.SetBounds(26, 536, 508, 24); _status.AutoEllipsis = true; _status.Text = "ยังไม่ได้ลงทะเบียน"; Controls.Add(_status);
        _pairingCode.SetBounds(26, 561, 508, 28); _pairingCode.Font = new Font("Segoe UI", 11, FontStyle.Bold); _pairingCode.Text = "รหัสจับคู่: —"; Controls.Add(_pairingCode);
        var note = new Label { Text = "รุ่นทดลอง unsigned และยังไม่มี MFA · ใช้ทดสอบกับเครื่องส่วนตัวเท่านั้น · ไม่มีการเพิ่ม auto-start · ปิดหน้าต่างเพื่อซ่อนไปที่ system tray", AutoSize = false, Location = new Point(26, 590), Size = new Size(510, 32), ForeColor = Color.DimGray };
        Controls.Add(note);

        var menu = new ContextMenuStrip();
        menu.Items.Add("เปิด KRABAK Windows Agent", null, (_, _) => ShowFromTray());
        menu.Items.Add("ออกจาก Agent", null, (_, _) => QuitAgent());
        _tray.Icon = SystemIcons.Application;
        _tray.Text = "KRABAK Windows Agent";
        _tray.ContextMenuStrip = menu;
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowFromTray();
    }

    private void AddLabel(string text, int x, int y)
    {
        Controls.Add(new Label { Text = text, AutoSize = true, Location = new Point(x, y) });
    }

    private void LoadMonitors()
    {
        _monitor.Items.Clear();
        foreach (var screen in ScreenCapture.Monitors())
            _monitor.Items.Add(new MonitorChoice(screen.DeviceName, $"{screen.DeviceName} · {screen.Bounds.Width}×{screen.Bounds.Height}"));
        var selected = Enumerable.Range(0, _monitor.Items.Count)
            .FirstOrDefault(index => ((MonitorChoice)_monitor.Items[index]!).DeviceName == _settings.MonitorDeviceName, -1);
        _monitor.SelectedIndex = selected >= 0 ? selected : Math.Max(0, Array.FindIndex(ScreenCapture.Monitors(), screen => screen.Primary));
    }

    private string SelectedMonitorName() => _monitor.SelectedItem is MonitorChoice choice ? choice.DeviceName : Screen.PrimaryScreen?.DeviceName ?? string.Empty;

    private void WireEvents()
    {
        _enroll.Click += async (_, _) => await Enroll();
        _revoke.Click += async (_, _) => await RevokeAgent();
        _monitor.SelectedIndexChanged += (_, _) => SaveSettings();
        _client.StatusChanged += text => OnUi(() => _status.Text = text);
        _client.PairingCodeChanged += (code, expiresAt) => OnUi(() =>
        {
            _pairingCode.Text = $"รหัสจับคู่สำหรับผู้ใช้อื่น: {code} · หมดอายุ {expiresAt}";
            _tray.Text = "KRABAK Agent ออนไลน์: " + code;
        });
        _client.ConsentRequested += request => OnUi(() => ShowConsent(request));
        _client.SessionChanged += session => OnUi(() => ShowSessionStatus(session));
        FormClosing += OnFormClosing;
    }

    private async Task Enroll()
    {
        if (!_controlConsent.Checked)
        {
            MessageBox.Show(this, "โปรดยืนยันว่าคุณยินยอมให้ Agent แชร์ภาพและรับคำสั่งควบคุม", "ต้องยืนยันความยินยอม", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        _settings.ServerUrl = _server.Text.Trim();
        _settings.DeviceName = _deviceName.Text.Trim();
        _settings.MonitorDeviceName = SelectedMonitorName();
        _settings.TrustedAccess = _trustedAccess.Checked;
        if (_settings.DeviceName.Length < 2 || _settings.DeviceName.Length > 80)
        {
            MessageBox.Show(this, "ชื่ออุปกรณ์ต้องมี 2–80 ตัวอักษร", "ข้อมูลไม่ถูกต้อง", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (string.IsNullOrWhiteSpace(_enrollmentCode.Text))
        {
            MessageBox.Show(this, "วางรหัสลงทะเบียนจากหน้าอุปกรณ์ของฉันก่อน", "ยังไม่มีรหัสลงทะเบียน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        _enroll.Enabled = false;
        try
        {
            await AgentClient.EnrollAsync(_settings.ServerUrl, _enrollmentCode.Text.Trim(), _settings.DeviceName, _trustedAccess.Checked);
            _settings.Save();
            _enrollmentCode.Clear();
            SetEnrolledState(true);
            _client.Start();
            _status.Text = "ลงทะเบียนแล้ว กำลังเชื่อมต่อ…";
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "ลงทะเบียน Agent ไม่สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            _enroll.Enabled = true;
        }
    }

    private async Task RevokeAgent()
    {
        if (MessageBox.Show(this, "เพิกถอน Agent บนเซิร์ฟเวอร์และลบ token ใน Windows เครื่องนี้หรือไม่?", "ยืนยันการเพิกถอน", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        _revoke.Enabled = false;
        try
        {
            await _client.UnregisterAsync();
            SetEnrolledState(false);
            _status.Text = "เพิกถอน Agent แล้ว";
            _pairingCode.Text = "รหัสจับคู่: —";
        }
        catch (Exception error)
        {
            var forget = MessageBox.Show(this,
                error.Message + "\n\nลบ token ที่ป้องกันไว้ใน Windows เครื่องนี้หรือไม่? หากเซิร์ฟเวอร์ยังไม่ได้เพิกถอน อุปกรณ์จะยังคงอยู่ในบัญชีจนกว่าจะสั่งเพิกถอนจากหน้าเว็บเมื่อเครื่องออนไลน์",
                "เซิร์ฟเวอร์ไม่ตอบรับการเพิกถอน", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (forget == DialogResult.Yes)
            {
                await _client.ForgetLocallyAsync();
                SetEnrolledState(false);
                _status.Text = "ลบ token ในเครื่องนี้แล้ว";
                _pairingCode.Text = "รหัสจับคู่: —";
            }
        }
        finally { _revoke.Enabled = true; }
    }

    private void ShowConsent(AgentConsentRequest request)
    {
        using var dialog = new ConsentDialog(request.Requester);
        var allowed = dialog.ShowDialog() == DialogResult.Yes;
        _ = allowed ? _client.AcceptAsync(request.SessionId) : _client.RejectAsync(request.SessionId);
    }

    private void ShowSessionStatus(AgentSessionStatus status)
    {
        if (!status.Active)
        {
            if (_activeSession is not null) { _activeSession.Close(); _activeSession.Dispose(); _activeSession = null; }
            return;
        }
        _activeSession?.Close();
        _activeSession?.Dispose();
        _activeSession = new ActiveSessionForm(status.Requester ?? "ผู้ใช้ที่ได้รับอนุญาต", ScreenCapture.SelectMonitor(SelectedMonitorName()));
        _activeSession.StopRequested += async () => await _client.StopActiveSessionAsync();
        _activeSession.Show();
        _activeSession.TopMost = true;
        _activeSession.BringToFront();
    }

    private void SetEnrolledState(bool enrolled)
    {
        _server.Enabled = !enrolled;
        _deviceName.Enabled = !enrolled;
        _enrollmentCode.Enabled = !enrolled;
        _monitor.Enabled = true;
        _controlConsent.Enabled = !enrolled;
        _trustedAccess.Enabled = !enrolled;
        _enroll.Enabled = !enrolled;
        _revoke.Enabled = enrolled;
        if (!enrolled) _pairingCode.Text = "รหัสจับคู่: —";
    }

    private void SaveSettings()
    {
        if (_monitor.SelectedItem is MonitorChoice choice) _settings.MonitorDeviceName = choice.DeviceName;
        if (_server.Text.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) _settings.ServerUrl = _server.Text.Trim();
        _settings.DeviceName = _deviceName.Text.Trim();
        try { _settings.Save(); } catch { }
    }

    private void ShowFromTray()
    {
        Show(); WindowState = FormWindowState.Normal; Activate();
    }

    private void QuitAgent()
    {
        _allowExit = true;
        _tray.Visible = false;
        _ = _client.StopActiveSessionAsync();
        _ = _client.StopAsync();
        Application.Exit();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_allowExit) return;
        e.Cancel = true;
        Hide();
        _tray.ShowBalloonTip(1500, "KRABAK Windows Agent ยังทำงานอยู่", "เปิดเมนูไอคอนใกล้นาฬิกาเพื่อดูรหัสจับคู่หรือออกจาก Agent", ToolTipIcon.Info);
    }

    private void OnUi(Action action)
    {
        if (IsDisposed) return;
        if (InvokeRequired) BeginInvoke(action); else action();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _activeSession?.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _ = _client.DisposeAsync();
        }
        base.Dispose(disposing);
    }

    private sealed record MonitorChoice(string DeviceName, string Label)
    {
        public override string ToString() => Label;
    }
}
