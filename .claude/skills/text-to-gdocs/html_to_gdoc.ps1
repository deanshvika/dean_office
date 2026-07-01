# html_to_gdoc.ps1 -- Convert an HTML file to a Word .docx and upload it to Google Drive as a Google Doc.
# NOTE: kept ASCII-only on purpose. PowerShell 5.1 reads .ps1 as ANSI, so Hebrew in the script body breaks the parser.
# Usage:
#   powershell -File html_to_gdoc.ps1 -Step convert -Html "<path.html>" -Docx "<out.docx>"
#   powershell -File html_to_gdoc.ps1 -Step upload  -Docx "<out.docx>" -Shot "<verify.png>"
#   powershell -File html_to_gdoc.ps1 -Step shot    -Shot "<verify.png>"
param(
  [string]$Html,
  [string]$Docx,
  [string]$Shot = "$env:TEMP\_gdoc_verify.png",
  [ValidateSet('convert','upload','shot')]
  [string]$Step = 'upload'
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class GD {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, int extra);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
function Click([int]$x,[int]$y){ [GD]::SetCursorPos($x,$y); Start-Sleep -Milliseconds 250; [GD]::mouse_event(0x02,0,0,0,0); [GD]::mouse_event(0x04,0,0,0,0) }
function CtrlV(){ [GD]::keybd_event(0x11,0,0,0); [GD]::keybd_event(0x56,0,0,0); Start-Sleep -Milliseconds 60; [GD]::keybd_event(0x56,0,2,0); [GD]::keybd_event(0x11,0,2,0) }
function EnterKey(){ [GD]::keybd_event(0x0D,0,0,0); Start-Sleep -Milliseconds 40; [GD]::keybd_event(0x0D,0,2,0) }
function TakeShot([string]$p){ $b=New-Object System.Drawing.Bitmap 1382,744; $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(-8,-8,0,0,$b.Size); $b.Save($p,[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose() }

if ($Step -eq 'convert') {
  if (-not $Html -or -not $Docx) { "ERROR: need -Html and -Docx"; exit 1 }
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $doc = $word.Documents.Open($Html)
  $doc.SaveAs2($Docx, 16)   # 16 = wdFormatXMLDocument (.docx)
  $doc.Close(); $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
  if (Test-Path $Docx) { "CONVERT_OK: $Docx size=$((Get-Item $Docx).Length)" } else { "CONVERT_FAIL" }
  return
}

if ($Step -eq 'shot') { TakeShot $Shot; "SHOT: $Shot"; return }

# Step = upload : atomic sequence -- new Chrome window -> New -> Upload -> BLIND paste path -> Enter
# CRITICAL LESSONS (do not "optimize" away):
#  * Must run as ONE script. VS Code is Electron (class Chrome_WidgetWin_1, same as Chrome) and steals
#    foreground between separate calls, so a split paste lands in VS Code and the modal dialog backgrounds.
#  * SetForegroundWindow from a background PowerShell is silently blocked by Windows -> use --new-window
#    (a fresh window foregrounds legitimately) and rely on the mouse CLICK to activate Chrome.
#  * FindWindow("#32770") did NOT reliably match Chrome's file dialog. Do NOT gate on it. Instead wait a
#    fixed time after the upload click (dialog is the active window) and paste BLIND.
if (-not $Docx) { "ERROR: need -Docx"; exit 1 }
[System.Windows.Forms.Clipboard]::SetText($Docx)
Start-Process "chrome.exe" "--new-window https://drive.google.com/drive/my-drive"
Start-Sleep -Seconds 10
$w = Get-Process chrome | Where-Object { $_.MainWindowTitle -match "Drive" } | Select-Object -First 1
if (-not $w) { $w = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1 }
[GD]::ShowWindow($w.MainWindowHandle,3) | Out-Null   # maximize
Start-Sleep -Milliseconds 800
$r = New-Object GD+RECT; [GD]::GetWindowRect($w.MainWindowHandle,[ref]$r) | Out-Null
$Wd = $r.Right - $r.Left; $Ht = $r.Bottom - $r.Top
# positions as fractions of a maximized Drive window (RTL layout: "New" is top-RIGHT). The click activates Chrome.
Click ([int]($r.Left + $Wd*0.945)) ([int]($r.Top + $Ht*0.306))   # "New +" button
Start-Sleep -Milliseconds 1400
Click ([int]($r.Left + $Wd*0.826)) ([int]($r.Top + $Ht*0.355))   # "File upload" menu item
Start-Sleep -Seconds 4                                            # fixed wait: dialog opens + is active
CtrlV; Start-Sleep -Milliseconds 1200                            # BLIND paste (no FindWindow)
EnterKey; Start-Sleep -Seconds 7
TakeShot $Shot
"UPLOAD_DONE (verify $Shot). After the 'upload complete' toast (bottom-left), click the file name at ~(0.145,0.954) of the window to open it as a Google Doc."
