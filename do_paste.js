const { execSync, spawn } = require('child_process');
const fs = require('fs');

// שמור TSV לקובץ
const tsv = [
  ['מאמן','3.6 (ד\')','4.6 (ה\')','7.6 (א\')','8.6 (ב\')','10.6 (ד\')','11.6 (ה\')','14.6 (א\')','15.6 (ב\')'],
  ['וואליד','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['שמעון','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['פיקאדו','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['תמיר חלף','❌','❌','✅','✅','✅','✅','✅','✅'],
  ['קרן','❌','❌','✅','✅','✅','✅','✅','✅'],
  ['טל וזגיאל','✅','✅','❌','✅','❌','❌','❌','❌'],
  ['עידן','✅','❌','❌','✅','✅','❌','❌','✅'],
  ['דובי','❌','❌','✅','❌','✅','❌','✅','✅'],
  ['להט מעיין','✅','✅','❌','❌','❌','✅','❌','❌'],
  ['סה"כ זמינים','6','5','6','7','7','6','6','7'],
].map(r => r.join('\t')).join('\n');

fs.writeFileSync('C:/Temp/table.tsv', '\uFEFF' + tsv, 'utf16le');
console.log('TSV נשמר');

// PowerShell script שפותח Chrome + מדביק
const ps = `
Add-Type -AssemblyName System.Windows.Forms
$content = [System.IO.File]::ReadAllText('C:/Temp/table.tsv', [System.Text.Encoding]::Unicode)
[System.Windows.Forms.Clipboard]::SetText($content)
Write-Host "Clipboard set"

Start-Process "chrome.exe" "https://docs.google.com/spreadsheets/d/1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg/edit"
Start-Sleep -Seconds 5

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$proc = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
if ($proc) {
    [Win32]::ShowWindow($proc.MainWindowHandle, 3)
    [Win32]::SetForegroundWindow($proc.MainWindowHandle)
    Start-Sleep -Milliseconds 1500
}

[System.Windows.Forms.SendKeys]::SendWait("^{HOME}")
Start-Sleep -Milliseconds 800
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 500
Write-Host "Done"
`;

fs.writeFileSync('C:/Temp/paste.ps1', ps, 'utf8');
console.log('פותח Chrome ומדביק...');

const proc = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', 'C:/Temp/paste.ps1'], {
  stdio: 'inherit'
});

proc.on('close', code => {
  console.log(code === 0 ? '✅ הושלם!' : '❌ שגיאה קוד ' + code);
});
