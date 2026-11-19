using System.Runtime.InteropServices;
using System.Text;

namespace KRABAK.RemoteAgent;

internal static class LocalTokenStore
{
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KRABAK", "RemoteAgent");
    private static readonly string TokenPath = Path.Combine(DirectoryPath, "device-token.dpapi");

    public static void Save(string token)
    {
        Directory.CreateDirectory(DirectoryPath);
        var input = Encoding.UTF8.GetBytes(token);
        var protectedBytes = Protect(input);
        File.WriteAllBytes(TokenPath, protectedBytes);
        Array.Clear(input);
        Array.Clear(protectedBytes);
    }

    public static string? Load()
    {
        if (!File.Exists(TokenPath)) return null;
        var encrypted = File.ReadAllBytes(TokenPath);
        var plaintext = Unprotect(encrypted);
        try { return Encoding.UTF8.GetString(plaintext); }
        finally { Array.Clear(encrypted); Array.Clear(plaintext); }
    }

    public static void Delete()
    {
        if (File.Exists(TokenPath)) File.Delete(TokenPath);
    }

    private static byte[] Protect(byte[] bytes) => Transform(bytes, protect: true);
    private static byte[] Unprotect(byte[] bytes) => Transform(bytes, protect: false);

    private static byte[] Transform(byte[] bytes, bool protect)
    {
        var inputPointer = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, inputPointer, bytes.Length);
            var input = new DataBlob { Size = bytes.Length, Data = inputPointer };
            DataBlob output;
            var ok = protect
                ? CryptProtectData(ref input, "KRABAK Remote Agent", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out output);
            if (!ok) throw new InvalidOperationException("Windows could not protect or unlock the Agent token.");
            try
            {
                var result = new byte[output.Size];
                Marshal.Copy(output.Data, result, 0, output.Size);
                return result;
            }
            finally { LocalFree(output.Data); }
        }
        finally { Marshal.FreeHGlobal(inputPointer); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int Size;
        public IntPtr Data;
    }

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref DataBlob input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out DataBlob output);

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, uint flags, out DataBlob output);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);
}
