using System.Drawing.Imaging;
using System.Windows.Forms;

namespace KRABAK.RemoteAgent;

internal sealed record CapturedFrame(byte[] Bytes, int Width, int Height);

internal static class ScreenCapture
{
    public static Screen[] Monitors() => Screen.AllScreens;

    public static Screen SelectMonitor(string deviceName)
    {
        var screens = Screen.AllScreens;
        return screens.FirstOrDefault(screen => screen.DeviceName == deviceName) ?? Screen.PrimaryScreen ?? screens[0];
    }

    public static CapturedFrame Capture(Screen screen)
    {
        var bounds = screen.Bounds;
        using var source = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(source))
            graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);

        var scale = Math.Min(1d, Math.Min(1280d / source.Width, 720d / source.Height));
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var output = new Bitmap(width, height, PixelFormat.Format24bppRgb);
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                graphics.DrawImage(source, new Rectangle(0, 0, width, height));
            }
            using var stream = new MemoryStream();
            var codec = ImageCodecInfo.GetImageEncoders().First(item => item.MimeType == "image/jpeg");
            using var parameters = new EncoderParameters(1);
            parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 48L - attempt * 8L);
            output.Save(stream, codec, parameters);
            if (stream.Length <= 650_000 || attempt == 2)
                return new CapturedFrame(stream.ToArray(), width, height);
            width = Math.Max(640, width * 3 / 4);
            height = Math.Max(360, height * 3 / 4);
        }
        throw new InvalidOperationException("Screen frame could not be encoded.");
    }
}
