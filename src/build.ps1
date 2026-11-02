# Build: music_presence_host.exe -> dist\MusicPresence-Setup.exe + SHA256
#   powershell -ExecutionPolicy Bypass -File src\build.ps1
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$root = Split-Path $src
$work = Join-Path $env:TEMP 'music-presence-build'
$version = (Get-Content "$root\extension\manifest.json" -Raw | ConvertFrom-Json).version

python -m PyInstaller --noconfirm --clean --onedir --console --name music_presence_host --icon "$src\icon.ico" `
    --distpath $work --workpath "$work\build" --specpath $work "$src\host.py"
if ($LASTEXITCODE) { throw 'PyInstaller failed' }

$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 not found: winget install JRSoftware.InnoSetup' }
& $iscc /Q "/DAppDir=$work\music_presence_host" "/DAppVer=$version" "$src\setup.iss"
if ($LASTEXITCODE) { throw 'Inno Setup failed' }

$exe = "$root\dist\MusicPresence-Setup.exe"
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
"$hash  MusicPresence-Setup.exe" | Set-Content "$root\dist\SHA256SUMS.txt" -Encoding ascii
Write-Host "OK: $exe  v$version  sha256 $hash"
