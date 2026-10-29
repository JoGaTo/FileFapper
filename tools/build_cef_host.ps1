$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localSdk = Join-Path $PSScriptRoot 'dotnet-sdk\dotnet.exe'
$dotnet = if ($env:DF_DOTNET) { $env:DF_DOTNET } elseif (Test-Path -LiteralPath $localSdk) { $localSdk } else { 'dotnet' }
& $dotnet restore (Join-Path $project 'native\cef-host\DandF.CefHost.csproj') --locked-mode
if ($LASTEXITCODE -ne 0) { throw 'CEF package restore failed.' }
& $dotnet build (Join-Path $project 'native\cef-host\DandF.CefHost.csproj') -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw 'CEF browser helper build failed.' }
$source = [IO.Path]::GetFullPath((Join-Path $project 'native\cef-host\bin\Release\net48\win-x64'))
$target = [IO.Path]::GetFullPath((Join-Path $project 'browser-dist\cef-host'))
if (-not $target.StartsWith($project + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'CEF output must be inside the project.' }
if (Test-Path -LiteralPath $target) {
  $item = Get-Item -LiteralPath $target -Force
  $resolved = (Resolve-Path -LiteralPath $target).Path
  if ($item.LinkType -or -not $resolved.StartsWith($project + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to replace a linked or external CEF output directory.' }
  Remove-Item -LiteralPath $target -Recurse -Force
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notmatch '\.(pdb|xml)$' } | Copy-Item -Destination $target -Recurse
if (-not (Test-Path -LiteralPath (Join-Path $target 'DandF.CefHost.exe')) -or -not (Test-Path -LiteralPath (Join-Path $target 'libcef.dll'))) { throw 'The CEF runtime output is incomplete.' }
Write-Output "CEF browser helper ready: $target"
