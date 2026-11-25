$ErrorActionPreference='Stop'
$studioRoot=[System.IO.Path]::GetFullPath($PSScriptRoot)
$pidFile=Join-Path $studioRoot 'data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No process was started by the launcher. If it was opened from a terminal, press Ctrl+C in that terminal.'; exit 0 }
$studioPid=[int](Get-Content -LiteralPath $pidFile -Raw)
$studioProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$studioPid"
$expectedServer=Join-Path $studioRoot 'scripts\start-next.mjs'
if ($null -ne $studioProcess -and $studioProcess.CommandLine.Contains($expectedServer)) { Stop-Process -Id $studioPid; Write-Output 'Vayora Social Studio stopped.' } else { Write-Output 'The process does not match this project; no process was stopped.' }
