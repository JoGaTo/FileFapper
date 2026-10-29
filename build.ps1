$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the build environment.' }
}
$dfPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
& $dfPython -m pip install -r engine\requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed.' }
if (-not (Test-Path -LiteralPath "vendor\waifu2x\waifu2x-ncnn-vulkan.exe") -or -not (Test-Path -LiteralPath "vendor\waifu2x\cpu\waifu2x-ncnn-vulkan.exe")) {
    & $dfPython tools\fetch_upscaler.py
    if ($LASTEXITCODE -ne 0) { throw "Upscaler download failed." }
}
$env:DF_UPSCALER_DIR = Join-Path $PSScriptRoot "vendor\waifu2x"
npm test
if ($LASTEXITCODE -ne 0) { throw 'Core tests failed.' }
& $dfPython -m unittest discover -s tests -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) { throw 'Engine tests failed.' }
& $dfPython -m PyInstaller --noconfirm --name df-engine --onedir --console --collect-all gallery_dl --collect-all bs4 --distpath engine-dist --workpath build\engine --specpath build\engine engine\engine.py
if ($LASTEXITCODE -ne 0) { throw 'Worker build failed.' }
& $dfPython tools\collect_licenses.py
if ($LASTEXITCODE -ne 0) { throw 'License collection failed.' }
node tools\collect_node_licenses.cjs
if ($LASTEXITCODE -ne 0) { throw 'Node license collection failed.' }
& (Join-Path $PSScriptRoot 'tools\build_cef_host.ps1')
if ($LASTEXITCODE -ne 0) { throw 'CEF browser helper build failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed.' }
Write-Output 'Build ready: ..\release\win-unpacked\FileFapper.exe'
$dfVersion = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).version
Write-Output "Portable launcher: ..\release\FileFapper-$dfVersion-Windows-x64.exe"
