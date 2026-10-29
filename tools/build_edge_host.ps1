$ErrorActionPreference = 'Stop'
$dfProject = Split-Path -Parent $PSScriptRoot
$dfSdkVersion = '1.0.4258.31'
$dfSdkSha256 = '56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9'
$dfVendor = Join-Path $dfProject 'vendor\webview2'
$dfPackage = Join-Path $dfVendor "microsoft.web.webview2.$dfSdkVersion.nupkg"
$dfSdk = Join-Path $dfVendor $dfSdkVersion
$dfOutput = Join-Path $dfProject 'browser-dist\edge-host'
$dfSource = Join-Path $dfProject 'native\edge-host\DandF.EdgeHost.cs'
New-Item -ItemType Directory -Path $dfVendor,$dfOutput -Force | Out-Null
if (-not (Test-Path -LiteralPath $dfPackage)) {
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$dfSdkVersion/microsoft.web.webview2.$dfSdkVersion.nupkg" -OutFile $dfPackage
}
if ((Get-FileHash -LiteralPath $dfPackage -Algorithm SHA256).Hash.ToLowerInvariant() -ne $dfSdkSha256) { throw 'The Microsoft WebView2 SDK package does not match its pinned SHA-256.' }
if (-not (Test-Path -LiteralPath (Join-Path $dfSdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($dfPackage,$dfSdk)
}
$dfCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $dfCompiler)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
$dfCore = Join-Path $dfSdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$dfExecutable = Join-Path $dfOutput 'DandF.EdgeHost.exe'
& $dfCompiler /nologo /target:exe /platform:x64 /optimize+ "/out:$dfExecutable" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/reference:$dfCore" $dfSource
if ($LASTEXITCODE -ne 0) { throw 'The D&F Edge browser helper did not compile.' }
Copy-Item -LiteralPath $dfCore -Destination $dfOutput -Force
Copy-Item -LiteralPath (Join-Path $dfSdk 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $dfOutput -Force
Copy-Item -LiteralPath (Join-Path $dfSdk 'LICENSE.txt') -Destination (Join-Path $dfOutput 'Microsoft-WebView2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $dfSdk 'NOTICE.txt') -Destination (Join-Path $dfOutput 'Microsoft-WebView2-NOTICE.txt') -Force
$dfManifest = [ordered]@{ sdkVersion=$dfSdkVersion; packageSha256=$dfSdkSha256; packageUrl="https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$dfSdkVersion/microsoft.web.webview2.$dfSdkVersion.nupkg"; engine='Microsoft Edge WebView2'; runtime='Installed Evergreen runtime; updated by Microsoft'; files=@() }
foreach ($dfFile in Get-ChildItem -LiteralPath $dfOutput -File) {
    if ($dfFile.Name -ne 'manifest.json') { $dfManifest.files += [ordered]@{name=$dfFile.Name;bytes=$dfFile.Length;sha256=(Get-FileHash -LiteralPath $dfFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} }
}
$dfManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dfOutput 'manifest.json') -Encoding utf8
Write-Output "Built Edge browser helper: $dfExecutable"
