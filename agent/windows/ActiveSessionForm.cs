namespace KRABAK.RemoteAgent;

internal sealed class ActiveSessionForm : Form
{
    public event Action? StopRequested;

    public ActiveSessionForm(string requester, Screen selectedScreen)
    {
        Text = "KRABAK Remote Agent — กำลังควบคุม";
        FormBorderStyle = FormBorderStyle.FixedToolWindow;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        ShowInTaskbar = true;
        ClientSize = new Size(430, 78);
        BackColor = Color.FromArgb(38, 23, 37);
        var work = selectedScreen.WorkingArea;
        Location = new Point(work.Right - Width - 18, work.Top + 18);

        var label = new Label
        {
            Text = $"กำลังแชร์และควบคุมกับ {requester} · หยุดได้ทันที",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            AutoEllipsis = true,
            Location = new Point(12, 9),
            Size = new Size(405, 26),
        };
        var stop = new Button { Text = "หยุดเซสชัน", Location = new Point(284, 39), Size = new Size(130, 32), BackColor = Color.FromArgb(175, 42, 64), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
        stop.Click += (_, _) => StopRequested?.Invoke();
        Controls.AddRange([label, stop]);
    }
}
