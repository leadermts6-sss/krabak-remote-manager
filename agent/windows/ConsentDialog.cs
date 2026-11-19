namespace KRABAK.RemoteAgent;

internal sealed class ConsentDialog : Form
{
    public ConsentDialog(string requester)
    {
        Text = "KRABAK Remote Manager — คำขอควบคุม Windows";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = true;
        TopMost = true;
        ClientSize = new Size(440, 235);

        var title = new Label
        {
            Text = "มีคำขอควบคุมเครื่องนี้",
            Font = new Font("Segoe UI", 16, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 20),
        };
        var details = new Label
        {
            Text = $"บัญชี {requester} ขอภาพหน้าจอและสิทธิ์เมาส์/แป้นพิมพ์ Windows\n\nอนุญาตเฉพาะเมื่อคุณรู้จักผู้ใช้รายนี้ การอนุญาตจะเริ่มแชร์จอที่เลือกไว้ทันที",
            Font = new Font("Segoe UI", 10),
            AutoSize = false,
            Location = new Point(24, 66),
            Size = new Size(390, 92),
        };
        var deny = new Button { Text = "ปฏิเสธ", DialogResult = DialogResult.No, Size = new Size(120, 42), Location = new Point(162, 170) };
        var allow = new Button { Text = "อนุญาตควบคุม", DialogResult = DialogResult.Yes, Size = new Size(150, 42), Location = new Point(288, 170) };
        Controls.AddRange([title, details, deny, allow]);
        AcceptButton = allow;
        CancelButton = deny;
    }
}
