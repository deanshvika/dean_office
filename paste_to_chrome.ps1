
# TSV של הטבלה
$tsv = @"
מאמן	3.6 (ד')	4.6 (ה')	7.6 (א')	8.6 (ב')	10.6 (ד')	11.6 (ה')	14.6 (א')	15.6 (ב')
וואליד	✅	✅	✅	✅	✅	✅	✅	✅
שמעון	✅	✅	✅	✅	✅	✅	✅	✅
פיקאדו	✅	✅	✅	✅	✅	✅	✅	✅
תמיר חלף	❌	❌	✅	✅	✅	✅	✅	✅
קרן	❌	❌	✅	✅	✅	✅	✅	✅
טל וזגיאל	✅	✅	❌	✅	❌	❌	❌	❌
עידן	✅	❌	❌	✅	✅	❌	❌	✅
דובי	❌	❌	✅	❌	✅	❌	✅	✅
להט מעיין	✅	✅	❌	❌	❌	✅	❌	❌
סה"כ זמינים	6	5	6	7	7	6	6	7
"@

Add-Type -AssemblyName System.Windows.Forms

# שים TSV בלוח הגזירים
[System.Windows.Forms.Clipboard]::SetText($tsv)
Write-Host "✅ TSV הועתק ללוח"

# חפש חלון Chrome שמכיל "גליון לקלוד" או "Google Sheets"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
}
"@

# מצא את חלון Chrome
$chrome = Get-Process chrome -ErrorAction SilentlyContinue | 
    Where-Object { $_.MainWindowTitle -match "גליון לקלוד|Google Sheets|לקלוד" } |
    Select-Object -First 1

if ($chrome) {
    Write-Host "נמצא חלון Chrome: $($chrome.MainWindowTitle)"
    [WinAPI]::ShowWindow($chrome.MainWindowHandle, 3) | Out-Null
    [WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 1000
} else {
    Write-Host "לא נמצא חלון ספציפי, מביא Chrome לפני..."
    $chrome = Get-Process chrome -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($chrome) {
        [WinAPI]::SetForegroundWindow($chrome.MainWindowHandle) | Out-Null
        Start-Sleep -Milliseconds 800
    }
}

# שלח מקשים לגוגל שיטס:
# Ctrl+Home — עבור לתחילת הגיליון (תא A1)
[System.Windows.Forms.SendKeys]::SendWait("^{HOME}")
Start-Sleep -Milliseconds 500

# Ctrl+V — הדבק
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 1000

Write-Host "✅ הפעולה הושלמה! הטבלה הודבקה ב'גליון לקלוד'"
