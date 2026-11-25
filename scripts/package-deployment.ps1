$ErrorActionPreference='Stop'
$studioRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageRoot=Join-Path $studioRoot 'deployment-packages'
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$archive=Join-Path $packageRoot ('vayora-social-studio-source-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.tgz')
$files=@('Dockerfile','.dockerignore','next.config.mjs','compose.production.yml','package.json','package-lock.json','public','src','knowledge/vayora-brand.json','deploy/Caddyfile','deploy/production.env.example','scripts','tests','README.md','docs')
foreach($item in $files){if(-not (Test-Path -LiteralPath (Join-Path $studioRoot $item))){throw ('Deployment files are incomplete:'+$item)}}
& tar -czf $archive -C $studioRoot @files
if($LASTEXITCODE -ne 0){throw 'The source package could not be created.'}
Write-Output $archive
Write-Output 'This package does not contain accounts, private media, the database, .env, or encryption keys. Data is moved separately over a private connection.'
