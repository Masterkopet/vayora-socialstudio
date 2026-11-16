$ErrorActionPreference='Stop'
$studioRoot=[System.IO.Path]::GetFullPath($PSScriptRoot)
$studioPort=3210
$envFile=Join-Path $studioRoot '.env'
if (Test-Path -LiteralPath $envFile) { $portLine=Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^PORT=(\d+)$' } | Select-Object -First 1; if ($portLine -match '^PORT=(\d+)$') { $studioPort=[int]$Matches[1] } }
$address='http://localhost:'+$studioPort
$healthAddress='http://127.0.0.1:'+$studioPort+'/health'
try {
 $health=Invoke-RestMethod -Uri $healthAddress -TimeoutSec 3
 if (($health.application -eq 'vayora-social-studio' -and $health.framework -eq 'nextjs')) { Start-Process $address; exit 0 }
} catch {}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24 atau lebih baru diperlukan.' }
if (-not (Test-Path -LiteralPath (Join-Path $studioRoot 'node_modules'))) { throw 'Dependensi belum terpasang. Jalankan npm ci dari folder proyek.' }
$dataPath=Join-Path $studioRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$serverFile=Join-Path $studioRoot 'scripts\start-next.mjs'
if(-not (Test-Path -LiteralPath (Join-Path $studioRoot '.next\standalone\server.js'))){throw 'Build Next.js belum tersedia. Jalankan npm run build dari folder proyek.'}
$studioProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--env-file-if-exists=.env',('"'+$serverFile+'"'),'--local') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $dataPath 'server.pid') -Value $studioProcess.Id
for ($attempt=0;$attempt -lt 30;$attempt++) {
 Start-Sleep -Milliseconds 400
 try { $health=Invoke-RestMethod -Uri $healthAddress -TimeoutSec 3; if (($health.application -eq 'vayora-social-studio' -and $health.framework -eq 'nextjs')) { Start-Process $address; exit 0 } } catch {}
}
throw 'Aplikasi belum siap. Periksa data\server-error.log.'
