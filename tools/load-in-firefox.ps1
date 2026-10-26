# Loads the modified Alternate Player into Firefox as a temporary add-on.
#
# Firefox only lets the user pick a temporary add-on, so this opens the "This Firefox" debugging page
# and puts the path of extension\manifest.json on the clipboard. Then: click "Load Temporary Add-on..."
# ("Tijdelijke add-on laden..." in Dutch), press Ctrl+V and Enter. Because the ID matches the original add-on, the original is replaced until
# Firefox is closed completely; after a restart, run this again.
$ErrorActionPreference = 'Stop'

$manifest = (Resolve-Path (Join-Path $PSScriptRoot '..\extension\manifest.json')).Path
$firefox = @(
	(Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe' -ErrorAction SilentlyContinue).'(default)'
	(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe' -ErrorAction SilentlyContinue).'(default)'
	"$env:ProgramFiles\Mozilla Firefox\firefox.exe"
	"${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $firefox) {
	Write-Host 'Firefox was not found. Open about:debugging#/runtime/this-firefox yourself and load:'
	Write-Host "  $manifest"
	Read-Host 'Press Enter to close'
	exit 1
}

Set-Clipboard -Value $manifest
Start-Process -FilePath $firefox -ArgumentList 'about:debugging#/runtime/this-firefox'

Write-Host ''
Write-Host '  Alternate Player (fMP4 mod)'
Write-Host '  ---------------------------'
Write-Host '  Firefox is opening the "This Firefox" page. There:'
Write-Host ''
Write-Host '    1. Click "Load Temporary Add-on..." (Dutch: "Tijdelijke add-on laden...")'
Write-Host '    2. Press Ctrl+V, then Enter (the file path is already on your clipboard)'
Write-Host ''
Write-Host '  It stays loaded until Firefox is closed completely. Reload open Twitch tabs.'
Write-Host ''
Read-Host '  Press Enter to close this window'
