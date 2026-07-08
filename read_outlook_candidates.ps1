# read_outlook_candidates.ps1
# Reads the classic Outlook inbox via COM (no password needed) and writes matching
# candidate emails as UTF-8 JSON. Called by outlook_candidates_to_sheet.js.
#
# ASCII-only on purpose: the Hebrew subject marker is passed base64-encoded and decoded
# here, to avoid PowerShell 5.1 source-file encoding problems with Hebrew literals.
param(
  [Parameter(Mandatory=$true)][string]$MarkerB64,
  [Parameter(Mandatory=$true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'
try {
  $marker = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($MarkerB64))

  $ol = New-Object -ComObject Outlook.Application
  $ns = $ol.GetNamespace('MAPI')
  $inbox = $ns.GetDefaultFolder(6)  # olFolderInbox

  $res = @()
  foreach ($m in $inbox.Items) {
    try {
      if ($m.Class -ne 43) { continue }  # olMail only (IPM.Note)
      $subj = [string]$m.Subject
      if ($subj -and $subj.Contains($marker)) {
        $received = ''
        try { $received = $m.ReceivedTime.ToString('yyyy-MM-ddTHH:mm:ss') } catch {}
        $res += [PSCustomObject]@{
          Subject     = $subj
          Body        = [string]$m.Body
          SenderName  = [string]$m.SenderName
          SenderEmail = [string]$m.SenderEmailAddress
          Received    = $received
          EntryID     = [string]$m.EntryID
        }
      }
    } catch {}
  }

  # Force an array wrapper so single/zero results still parse as a JSON array in Node.
  $payload = [PSCustomObject]@{ ok = $true; count = $res.Count; items = @($res) }
  $json = $payload | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("OK count=" + $res.Count)
}
catch {
  $err = [PSCustomObject]@{ ok = $false; error = $_.Exception.Message; items = @() }
  try { [System.IO.File]::WriteAllText($OutFile, ($err | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false))) } catch {}
  Write-Output ("ERROR " + $_.Exception.Message)
  exit 1
}
