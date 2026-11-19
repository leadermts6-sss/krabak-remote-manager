using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace KRABAK.RemoteAgent;

internal sealed record AgentConsentRequest(string SessionId, string Requester);
internal sealed record AgentSessionStatus(bool Active, string? Requester);

internal sealed class AgentClient : IAsyncDisposable
{
    private readonly AgentSettings _settings;
    private readonly Func<string> _monitorDeviceName;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly object _sessionGate = new();
    private CancellationTokenSource? _lifetime;
    private CancellationTokenSource? _captureCancellation;
    private Task? _runTask;
    private ClientWebSocket? _socket;
    private string? _activeSessionId;
    private TaskCompletionSource<bool>? _unregisterCompletion;

    public event Action<string>? StatusChanged;
    public event Action<string, string>? PairingCodeChanged;
    public event Action<AgentConsentRequest>? ConsentRequested;
    public event Action<AgentSessionStatus>? SessionChanged;

    public AgentClient(AgentSettings settings, Func<string> monitorDeviceName)
    {
        _settings = settings;
        _monitorDeviceName = monitorDeviceName;
    }

    public static async Task EnrollAsync(string serverUrl, string code, string name, bool trustedAccess, CancellationToken cancellationToken = default)
    {
        var baseUri = ValidateServerUrl(serverUrl);
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/agents/enroll"));
        request.Headers.TryAddWithoutValidation("Origin", baseUri.GetLeftPart(UriPartial.Authority));
        request.Content = new StringContent(JsonSerializer.Serialize(new { code, name, trustedAccess }), Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var message = "ลงทะเบียนไม่สำเร็จ ตรวจรหัสและวันหมดอายุ แล้วลองอีกครั้ง";
            try
            {
                using var errorDocument = JsonDocument.Parse(body);
                message = errorDocument.RootElement.GetProperty("error").GetString() ?? message;
            }
            catch { }
            throw new InvalidOperationException(message);
        }
        string? token;
        using (var document = JsonDocument.Parse(body))
            token = document.RootElement.GetProperty("token").GetString();
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("เซิร์ฟเวอร์ไม่ได้ส่งข้อมูล Agent ที่จำเป็นกลับมา");
        LocalTokenStore.Save(token);
    }

    public void Start()
    {
        if (_runTask is { IsCompleted: false }) return;
        if (string.IsNullOrWhiteSpace(LocalTokenStore.Load()))
        {
            StatusChanged?.Invoke("ยังไม่ได้ลงทะเบียน Agent");
            return;
        }
        var lifetime = new CancellationTokenSource();
        _lifetime = lifetime;
        _runTask = Task.Run(() => ReconnectLoopAsync(lifetime.Token));
    }

    public async Task StopAsync()
    {
        if (_lifetime is null) return;
        _lifetime.Cancel();
        EndActiveSession();
        try { _socket?.Abort(); } catch { }
        if (_runTask is not null)
        {
            try { await _runTask.WaitAsync(TimeSpan.FromSeconds(3)); } catch { }
        }
        _socket?.Dispose();
        _socket = null;
        _lifetime.Dispose();
        _lifetime = null;
    }

    public async Task UnregisterAsync()
    {
        var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _unregisterCompletion = completion;
        if (!await SendAsync(new { type = "agent-unregister" })) throw new InvalidOperationException("Agent ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์");
        if (!await completion.Task.WaitAsync(TimeSpan.FromSeconds(5))) throw new InvalidOperationException("เซิร์ฟเวอร์ไม่ตอบรับการเพิกถอน Agent");
        await StopAsync();
        LocalTokenStore.Delete();
        StatusChanged?.Invoke("เพิกถอน Agent แล้ว");
    }

    public async Task ForgetLocallyAsync()
    {
        await StopAsync();
        LocalTokenStore.Delete();
        StatusChanged?.Invoke("ลบ token ในเครื่องนี้แล้ว");
    }

    public async Task AcceptAsync(string sessionId)
    {
        await SendAsync(new { type = "accept", sessionId });
    }

    public async Task RejectAsync(string sessionId) => await SendAsync(new { type = "reject", sessionId });

    public async Task StopActiveSessionAsync()
    {
        string? sessionId;
        lock (_sessionGate) sessionId = _activeSessionId;
        if (sessionId is null) return;
        await SendAsync(new { type = "end", sessionId });
        EndActiveSession();
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _sendLock.Dispose();
    }

    private async Task ReconnectLoopAsync(CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromSeconds(2);
        while (!cancellationToken.IsCancellationRequested)
        {
            try { await ConnectOnceAsync(cancellationToken); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { break; }
            catch (Exception error) { StatusChanged?.Invoke("เซิร์ฟเวอร์ขัดข้อง: " + error.Message); }
            EndActiveSession();
            if (cancellationToken.IsCancellationRequested) break;
            try { await Task.Delay(delay, cancellationToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task ConnectOnceAsync(CancellationToken cancellationToken)
    {
        var baseUri = ValidateServerUrl(_settings.ServerUrl);
        var socketUri = new UriBuilder(baseUri) { Scheme = baseUri.Scheme == "https" ? "wss" : "ws", Path = "/ws", Query = "", Fragment = "" }.Uri;
        using var socket = new ClientWebSocket();
        socket.Options.SetRequestHeader("Origin", baseUri.GetLeftPart(UriPartial.Authority));
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
        _socket = socket;
        StatusChanged?.Invoke("กำลังเชื่อมต่อ KRABAK Remote Manager…");
        await socket.ConnectAsync(socketUri, cancellationToken);
        var token = LocalTokenStore.Load() ?? throw new InvalidOperationException("ไม่พบ Agent token ที่ป้องกันไว้ในเครื่องนี้");
        await SendOnSocketAsync(socket, new { type = "agent-hello", token }, cancellationToken);
        Array.Clear(Encoding.UTF8.GetBytes(token));
        using var connectionCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var heartbeat = Task.Run(() => HeartbeatAsync(connectionCancellation.Token), connectionCancellation.Token);
        StatusChanged?.Invoke("เชื่อมต่อแล้ว กำลังยืนยันอุปกรณ์…");
        try { await ReceiveLoopAsync(socket, connectionCancellation.Token); }
        finally
        {
            connectionCancellation.Cancel();
            try { await heartbeat; } catch { }
        }
        EndActiveSession();
        if (!cancellationToken.IsCancellationRequested) StatusChanged?.Invoke("การเชื่อมต่อถูกตัด กำลังลองใหม่…");
    }

    private async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(25));
        while (await timer.WaitForNextTickAsync(cancellationToken))
            if (!await SendAsync(new { type = "agent-ping" })) return;
    }

    private async Task ReceiveLoopAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        using var message = new MemoryStream();
        while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            var result = await socket.ReceiveAsync(buffer.AsMemory(), cancellationToken);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                if (socket.State == WebSocketState.CloseReceived)
                {
                    await socket.CloseOutputAsync(
                        result.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                        result.CloseStatusDescription ?? string.Empty,
                        CancellationToken.None);
                }
                return;
            }
            if (result.MessageType != WebSocketMessageType.Text) continue;
            message.Write(buffer, 0, result.Count);
            if (message.Length > 1_000_000) { socket.Abort(); return; }
            if (!result.EndOfMessage) continue;
            try
            {
                using var document = JsonDocument.Parse(message.ToArray());
                HandleMessage(document.RootElement);
            }
            catch (JsonException)
            {
                socket.Abort();
                return;
            }
            message.SetLength(0);
        }
    }

    private void HandleMessage(JsonElement message)
    {
        var type = message.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
        switch (type)
        {
            case "agent-hello-ok":
                StatusChanged?.Invoke("ออนไลน์กับ KRABAK Remote Manager");
                if (message.TryGetProperty("pairingCode", out var code)) UpdatePairingCode(code.GetString() ?? "", message.GetProperty("expiresAt").GetString() ?? "");
                break;
            case "pairing-code":
                UpdatePairingCode(message.GetProperty("code").GetString() ?? "", message.GetProperty("expiresAt").GetString() ?? "");
                break;
            case "invite":
                ConsentRequested?.Invoke(new AgentConsentRequest(message.GetProperty("sessionId").GetString() ?? "", message.GetProperty("requester").GetString() ?? "บัญชีผู้ใช้"));
                break;
            case "agent-session-start":
            case "agent-session-approved":
                BeginSession(message.GetProperty("sessionId").GetString() ?? "", type == "agent-session-start" ? message.GetProperty("requester").GetString() : null);
                break;
            case "input":
                ApplyInput(message);
                break;
            case "ended":
                EndActiveSession();
                break;
            case "agent-unregistered":
                _unregisterCompletion?.TrySetResult(true);
                break;
            case "error":
                var errorText = message.TryGetProperty("error", out var error) ? error.GetString() ?? "เซิร์ฟเวอร์ปฏิเสธคำขอ" : "เซิร์ฟเวอร์ปฏิเสธคำขอ";
                StatusChanged?.Invoke(errorText);
                if (errorText == "Agent was revoked or account disabled")
                {
                    LocalTokenStore.Delete();
                    _lifetime?.Cancel();
                    StatusChanged?.Invoke("Agent ถูกเพิกถอนหรือบัญชีถูกปิด · ลบ token ในเครื่องแล้ว");
                }
                break;
        }
    }

    private void ApplyInput(JsonElement message)
    {
        string? active;
        lock (_sessionGate) active = _activeSessionId;
        if (active is null || !message.TryGetProperty("sessionId", out var id) || id.GetString() != active || !message.TryGetProperty("input", out var input)) return;
        try
        {
            var screen = ScreenCapture.SelectMonitor(_monitorDeviceName());
            if (!WindowsInput.Apply(input, screen.Bounds)) StatusChanged?.Invoke("Windows ปฏิเสธคำสั่งควบคุมนี้");
        }
        catch { StatusChanged?.Invoke("รับคำสั่งควบคุมไม่ได้"); }
    }

    private void BeginSession(string sessionId, string? requester)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return;
        lock (_sessionGate) _activeSessionId = sessionId;
        StartCapture(sessionId);
        SessionChanged?.Invoke(new AgentSessionStatus(true, requester));
    }

    private void StartCapture(string sessionId)
    {
        _captureCancellation?.Cancel();
        _captureCancellation?.Dispose();
        _captureCancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetime?.Token ?? CancellationToken.None);
        var token = _captureCancellation.Token;
        _ = Task.Run(async () =>
        {
            try
            {
                while (!token.IsCancellationRequested)
                {
                    var screen = ScreenCapture.SelectMonitor(_monitorDeviceName());
                    var frame = await Task.Run(() => ScreenCapture.Capture(screen), token);
                    if (frame.Bytes.Length <= 650_000)
                    {
                        var message = new { type = "screen-frame", sessionId, frame = Convert.ToBase64String(frame.Bytes), width = frame.Width, height = frame.Height };
                        await SendAsync(message, token);
                    }
                    await Task.Delay(250, token);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                StatusChanged?.Invoke("จับภาพหน้าจอไม่ได้: " + error.Message);
                await SendAsync(new { type = "end", sessionId });
                EndActiveSession();
            }
        }, token);
    }

    private void EndActiveSession()
    {
        _captureCancellation?.Cancel();
        _captureCancellation?.Dispose();
        _captureCancellation = null;
        lock (_sessionGate) _activeSessionId = null;
        WindowsInput.ReleaseAll();
        SessionChanged?.Invoke(new AgentSessionStatus(false, null));
    }

    private void UpdatePairingCode(string code, string expiresAt)
    {
        PairingCodeChanged?.Invoke(code, expiresAt);
    }

    private Task<bool> SendAsync(object value, CancellationToken cancellationToken = default)
    {
        var socket = _socket;
        if (socket is null) return Task.FromResult(false);
        return SendOnSocketAsync(socket, value, cancellationToken);
    }

    private async Task<bool> SendOnSocketAsync(ClientWebSocket socket, object value, CancellationToken cancellationToken)
    {
        if (socket.State != WebSocketState.Open) return false;
        var payload = JsonSerializer.SerializeToUtf8Bytes(value);
        if (payload.Length > 900_000) return false;
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            if (socket.State != WebSocketState.Open) return false;
            await socket.SendAsync(payload.AsMemory(), WebSocketMessageType.Text, true, cancellationToken);
            return true;
        }
        finally { _sendLock.Release(); Array.Clear(payload); }
    }

    private static Uri ValidateServerUrl(string value)
    {
        if (!Uri.TryCreate(value.Trim().TrimEnd('/'), UriKind.Absolute, out var uri)) throw new InvalidOperationException("กรุณากรอก URL เซิร์ฟเวอร์ให้ถูกต้อง");
        if (!string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/")
            throw new InvalidOperationException("กรุณากรอกเฉพาะ URL หลักของเซิร์ฟเวอร์ โดยไม่มี path หรือข้อมูลต่อท้าย");
        var production = uri.Scheme == "https"
            && uri.IdnHost.Equals("remote.krabak.ac.th", StringComparison.OrdinalIgnoreCase)
            && uri.Port == 443;
        var localDevelopment = uri.IsLoopback && (uri.Scheme == "http" || uri.Scheme == "https");
        if (!production && !localDevelopment)
            throw new InvalidOperationException("Agent อนุญาตเฉพาะ https://remote.krabak.ac.th หรือ localhost สำหรับทดสอบ เพื่อป้องกันการส่งรหัสลงทะเบียนไปยังเซิร์ฟเวอร์อื่น");
        return new Uri(uri.GetLeftPart(UriPartial.Authority));
    }
}
