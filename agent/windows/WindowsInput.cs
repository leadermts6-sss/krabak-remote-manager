using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace KRABAK.RemoteAgent;

internal static class WindowsInput
{
    private const uint InputMouse = 0;
    private const uint InputKeyboard = 1;
    private const uint MouseMove = 0x0001;
    private const uint MouseLeftDown = 0x0002;
    private const uint MouseLeftUp = 0x0004;
    private const uint MouseRightDown = 0x0008;
    private const uint MouseRightUp = 0x0010;
    private const uint MouseMiddleDown = 0x0020;
    private const uint MouseMiddleUp = 0x0040;
    private const uint MouseWheel = 0x0800;
    private const uint MouseAbsolute = 0x8000;
    private const uint MouseVirtualDesk = 0x4000;
    private const uint KeyUp = 0x0002;
    private static readonly HashSet<ushort> HeldKeys = [];
    private static readonly HashSet<string> HeldButtons = [];
    private static readonly object Gate = new();

    public static bool Apply(JsonElement input, Rectangle monitor)
    {
        var kind = input.GetProperty("kind").GetString();
        lock (Gate)
        {
            return kind switch
            {
                "move" => Move(input.GetProperty("x").GetInt32(), input.GetProperty("y").GetInt32(), monitor),
                "button" => Button(input.GetProperty("button").GetString()!, input.GetProperty("down").GetBoolean(), input.GetProperty("x").GetInt32(), input.GetProperty("y").GetInt32(), monitor),
                "wheel" => Wheel(input.GetProperty("delta").GetInt32()),
                "key" => Key(input.GetProperty("virtualKey").GetUInt16(), input.GetProperty("down").GetBoolean()),
                _ => false,
            };
        }
    }

    public static void ReleaseAll()
    {
        lock (Gate)
        {
            foreach (var key in HeldKeys.ToArray()) SendKey(key, down: false);
            HeldKeys.Clear();
            foreach (var button in HeldButtons.ToArray()) SendButton(button, down: false);
            HeldButtons.Clear();
        }
    }

    private static bool Move(int x, int y, Rectangle monitor)
    {
        if (x is < 0 or > 65_535 || y is < 0 or > 65_535) return false;
        var virtualDesktop = SystemInformation.VirtualScreen;
        var px = monitor.Left + (long)x * Math.Max(0, monitor.Width - 1) / 65_535;
        var py = monitor.Top + (long)y * Math.Max(0, monitor.Height - 1) / 65_535;
        var absoluteX = (int)((px - virtualDesktop.Left) * 65_535 / Math.Max(1, virtualDesktop.Width - 1));
        var absoluteY = (int)((py - virtualDesktop.Top) * 65_535 / Math.Max(1, virtualDesktop.Height - 1));
        return SendMouse(absoluteX, absoluteY, 0, MouseMove | MouseAbsolute | MouseVirtualDesk);
    }

    private static bool Button(string button, bool down, int x, int y, Rectangle monitor)
    {
        if (!Move(x, y, monitor)) return false;
        var flags = (button, down) switch
        {
            ("left", true) => MouseLeftDown,
            ("left", false) => MouseLeftUp,
            ("right", true) => MouseRightDown,
            ("right", false) => MouseRightUp,
            ("middle", true) => MouseMiddleDown,
            ("middle", false) => MouseMiddleUp,
            _ => 0u,
        };
        if (flags == 0) return false;
        var success = SendMouse(0, 0, 0, flags);
        if (down) HeldButtons.Add(button); else HeldButtons.Remove(button);
        return success;
    }

    private static bool Wheel(int delta)
    {
        if (delta is < -1_200 or > 1_200) return false;
        return SendMouse(0, 0, unchecked((uint)delta), MouseWheel);
    }

    private static bool Key(ushort virtualKey, bool down)
    {
        if (!AllowedKey(virtualKey)) return false;
        var success = SendKey(virtualKey, down);
        if (down) HeldKeys.Add(virtualKey); else HeldKeys.Remove(virtualKey);
        return success;
    }

    private static bool AllowedKey(ushort key) => key is 0x08 or 0x09 or 0x0d or 0x10 or 0x11 or 0x12 or 0x1b or 0x20
        or >= 0x21 and <= 0x28 or 0x2d or 0x2e or >= 0x30 and <= 0x39 or >= 0x41 and <= 0x5a
        or >= 0x60 and <= 0x69 or >= 0x70 and <= 0x7b or >= 0xa0 and <= 0xa5;

    private static bool SendKey(ushort key, bool down) => Send(new NativeInput
    {
        Type = InputKeyboard,
        Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key, Flags = down ? 0u : KeyUp } },
    });

    private static bool SendButton(string button, bool down)
    {
        var flags = (button, down) switch
        {
            ("left", true) => MouseLeftDown,
            ("left", false) => MouseLeftUp,
            ("right", true) => MouseRightDown,
            ("right", false) => MouseRightUp,
            ("middle", true) => MouseMiddleDown,
            ("middle", false) => MouseMiddleUp,
            _ => 0u,
        };
        return flags != 0 && SendMouse(0, 0, 0, flags);
    }

    private static bool SendMouse(int x, int y, uint data, uint flags) => Send(new NativeInput
    {
        Type = InputMouse,
        Union = new InputUnion { Mouse = new MouseInput { X = x, Y = y, Data = data, Flags = flags } },
    });

    private static bool Send(NativeInput input)
    {
        var inputs = new[] { input };
        return SendInput(1, inputs, Marshal.SizeOf<NativeInput>()) == 1;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeInput
    {
        public uint Type;
        public InputUnion Union;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X;
        public int Y;
        public uint Data;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, NativeInput[] inputs, int size);
}
