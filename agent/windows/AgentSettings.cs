using System.Text.Json;

namespace KRABAK.RemoteAgent;

internal sealed class AgentSettings
{
    public string ServerUrl { get; set; } = "https://remote.krabak.ac.th";
    public string DeviceName { get; set; } = Environment.MachineName;
    public string MonitorDeviceName { get; set; } = string.Empty;
    public bool TrustedAccess { get; set; }

    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KRABAK", "RemoteAgent", "settings.json");

    public static AgentSettings Load()
    {
        try { return JsonSerializer.Deserialize<AgentSettings>(File.ReadAllText(SettingsPath)) ?? new AgentSettings(); }
        catch { return new AgentSettings(); }
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(this));
    }
}
