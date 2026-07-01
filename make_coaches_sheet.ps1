# יצירת Google Sheet עם רשימת המאמנים דרך ה-Chrome האמיתי (המחובר).
# כפיית חלון ה-Google Sheets לחזית עם AttachThreadInput (עוקף נעילת פוקוס של Windows),
# ואז הדבקה. בלי playwright / CDP.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    public static void Force(IntPtr h) {
        uint fgTid = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint myTid = GetCurrentThreadId();
        AttachThreadInput(fgTid, myTid, true);
        ShowWindow(h, 3);        // SW_MAXIMIZE
        BringWindowToTop(h);
        SetForegroundWindow(h);
        AttachThreadInput(fgTid, myTid, false);
    }
}
"@

# --- TSV: כותרות + 23 מאמנים ---
$tsv = @"
#	שם המאמן	מוקד	טלפון	סטטוס
1	קרן דבוש			פעיל
2	טל וזגיאל			פעיל
3	דוד אשורי			פעיל
4	דין שויקה			פעיל
5	נועם כהן			פעיל
6	תום בריאולובסקי			פעיל
7	ליאור מרגוליס			פעיל
8	שלו אהרוני			פעיל
9	דניאל לנדאו			פעיל
10	סיון טפירו			פעיל
11	אריק מונטבילסקי			פעיל
12	אופק סגל			פעיל
13	אסף זוהר			פעיל
14	ליז אפרגן			פעיל
15	פיקאדו ינאו			פעיל
16	תמיר חלף			פעיל
17	דובי מילר			פעיל
18	וליד אבו חמוד			פעיל
19	סהר ליכטנפלד			פעיל
20	גילי ששון			פעיל
21	אייל רותם			פעיל
22	יובל גורפיין			פעיל
23	עידן אדלר			פעיל
"@

[System.Windows.Forms.Clipboard]::SetText($tsv)
Write-Host "TSV הועתק ללוח"

# 1. פתח חלון Chrome חדש לגיליון חדש בפרופיל המחובר
Write-Host "פותח חלון Chrome חדש -> sheets.new..."
Start-Process "chrome" "--new-window https://sheets.new"
Start-Sleep -Seconds 14

# 2. מצא את חלון ה-Google Sheets וכפה אותו לחזית
$w = Get-Process chrome -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowTitle -match "Sheets|Spreadsheet|גיליון" } |
     Select-Object -First 1
if (-not $w) {
    Write-Host "לא נמצא חלון Sheets לפי כותרת. חלונות Chrome קיימים:"
    Get-Process chrome | Where-Object { $_.MainWindowTitle } | ForEach-Object { Write-Host " - $($_.MainWindowTitle)" }
} else {
    Write-Host "חלון Sheets: $($w.MainWindowTitle)"
    [FG]::Force($w.MainWindowHandle)
    Start-Sleep -Milliseconds 1500

    # 3. עבור ל-A1 והדבק
    [System.Windows.Forms.SendKeys]::SendWait("^{HOME}")
    Start-Sleep -Milliseconds 700
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Seconds 3
    Write-Host "הודבק."
}

# 4. צילום מסך לאימות
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$out = "c:\Users\דין\Desktop\ANTIGRAVITY\המוח השני\coaches_sheet_verify.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "SHOT: $out"
