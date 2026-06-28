param([string]$Path,[string]$TextPath)
Add-Type -AssemblyName System.Windows.Forms
$html = Get-Content -Path $Path -Raw -Encoding UTF8
$plain = ""
if ($TextPath -and (Test-Path $TextPath)) { $plain = Get-Content -Path $TextPath -Raw -Encoding UTF8 }
$dobj = New-Object System.Windows.Forms.DataObject
if ($plain -ne "") { $dobj.SetText($plain, [System.Windows.Forms.TextDataFormat]::UnicodeText) }
$dobj.SetText($html, [System.Windows.Forms.TextDataFormat]::Html)
[System.Windows.Forms.Clipboard]::SetDataObject($dobj, $true)
Start-Sleep -Milliseconds 300
# verify
$check = [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::Html)
Write-Output ("clip-set len=" + $check.Length)