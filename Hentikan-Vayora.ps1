$ErrorActionPreference='Stop'
$studioRoot=[System.IO.Path]::GetFullPath($PSScriptRoot)
$pidFile=Join-Path $studioRoot 'data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'Tidak ada proses yang dimulai launcher. Jika dibuka dari terminal, gunakan Ctrl+C pada terminal tersebut.'; exit 0 }
$studioPid=[int](Get-Content -LiteralPath $pidFile -Raw)
$studioProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$studioPid"
$expectedServer=Join-Path $studioRoot 'scripts\start-next.mjs'
if ($null -ne $studioProcess -and $studioProcess.CommandLine.Contains($expectedServer)) { Stop-Process -Id $studioPid; Write-Output 'Vayora Social Studio dihentikan.' } else { Write-Output 'Proses tidak cocok dengan proyek ini; tidak ada proses yang dihentikan.' }
