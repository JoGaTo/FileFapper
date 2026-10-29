[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$InputDirectory,
  [Parameter(Mandatory=$true)][string]$OutputExe,
  [string]$ProductVersion='1.0.0',
  [string]$AppExe='FileFapper.exe',
  [string]$Icon,
  [string]$PayloadZip,
  [string]$VerifyReport
)
$ErrorActionPreference='Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = Join-Path $projectDirectory 'native\portable-launcher\DandF.Portable.cs'
$inputPath = [IO.Path]::GetFullPath($InputDirectory)
$outputPath = [IO.Path]::GetFullPath($OutputExe)
if (-not (Test-Path -LiteralPath $inputPath -PathType Container)) { throw 'The application input directory does not exist.' }
if ($outputPath.StartsWith($inputPath.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'The portable output must be outside the application input directory.' }
if (-not (Test-Path -LiteralPath (Join-Path $inputPath $AppExe) -PathType Leaf)) { throw 'The input tree is missing the FileFapper executable.' }
if ($ProductVersion -notmatch '^[0-9A-Za-z.+-]+$' -or $AppExe -match '[\\/:"\r\n]' -or $AppExe -ne [IO.Path]::GetFileName($AppExe)) { throw 'Invalid product version or executable filename.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The .NET Framework x64 C# compiler is unavailable.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
$workPath = Join-Path $projectDirectory ('.portable-build\'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $workPath | Out-Null
# Only regular files/directories are embedded; compatibility junctions outside this input are untouched.
$allItems = @(Get-ChildItem -LiteralPath $inputPath -Recurse -Force)
if (([IO.File]::GetAttributes($inputPath) -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or @($allItems | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count) { throw 'The application input must contain regular files, without junctions or symbolic links.' }
$files = @($allItems | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)
$prefix = $inputPath.TrimEnd('\')+'\'
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$rows = foreach ($file in $files) {
  $relative = $file.FullName.Substring($prefix.Length).Replace('\','/')
  if (-not $seen.Add($relative)) { throw "Duplicate portable filename: $relative" }
  [ordered]@{path=$relative;length=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$manifest = [ordered]@{version=1;productVersion=$ProductVersion;appExe=$AppExe;files=@($rows)}
$manifestPath = Join-Path $workPath 'payload-manifest.json'
[IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
if ($PayloadZip) { $zipPath=[IO.Path]::GetFullPath($PayloadZip); if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) { throw 'The supplied ZIP payload does not exist.' } }
else {
  $zipPath = Join-Path $workPath 'payload.zip'
  $zip = [IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
  try { foreach ($row in $rows) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $inputPath $row.path),$row.path,[IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $zip.Dispose() }
}
$payloadHash=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestHash=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$payloadBytes=(Get-Item -LiteralPath $zipPath).Length
$configPath=Join-Path $workPath 'PortableBuild.cs'
$config = 'internal static class PortableBuild { public const string ProductVersion="'+$ProductVersion+'",AppExe="'+$AppExe+'",PayloadSha256="'+$payloadHash+'",ManifestSha256="'+$manifestHash+'"; public const long PayloadBytes='+$payloadBytes+'L; }'
[IO.File]::WriteAllText($configPath,$config,[Text.UTF8Encoding]::new($false))
$compilerArguments = @('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:'+$outputPath),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Web.Extensions.dll','/reference:System.Windows.Forms.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',('/resource:'+$zipPath+',DandF.Portable.payload.zip'),('/resource:'+$manifestPath+',DandF.Portable.manifest.json'),$sourcePath,$configPath)
if (-not $Icon) { $defaultIcon=Join-Path $projectDirectory 'assets\icon.ico'; if (Test-Path -LiteralPath $defaultIcon) { $Icon=$defaultIcon } }
if ($Icon) { $compilerArguments += '/win32icon:'+[IO.Path]::GetFullPath($Icon) }
& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) { throw "Portable launcher compilation failed with code $LASTEXITCODE." }
# Verification uses the compiled launcher, never launches the payload, and checks the complete embedded tree.
$start = [Diagnostics.ProcessStartInfo]::new($outputPath,'--df-portable-verify-only')
$start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($start)
$stdout=$process.StandardOutput.ReadToEnd(); $stderr=$process.StandardError.ReadToEnd(); $process.WaitForExit()
if ($VerifyReport) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($VerifyReport),$stdout,[Text.UTF8Encoding]::new($false)) }
if ($process.ExitCode -ne 0) { throw "Portable extraction verification failed ($($process.ExitCode)): $stdout $stderr" }
$check=$stdout | ConvertFrom-Json
if (-not $check.verified -or -not $check.extracted -or $check.launched -or $check.architecture -ne 'x64' -or $check.cleanup -ne 'removed' -or $check.payloadSha256 -ne $payloadHash -or $check.manifestSha256 -ne $manifestHash) { throw 'The launcher did not report a complete, clean extraction verification.' }
[IO.File]::Copy($manifestPath,$outputPath+'.payload-manifest.json',$true)
$sourceHashes=[ordered]@{}
$sourceHashes['native/portable-launcher/DandF.Portable.cs']=(Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceHashes['tools/build_portable_launcher.ps1']=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$report=[ordered]@{version=$ProductVersion;architecture='x64';output=$outputPath;payloadSha256=$payloadHash;payloadBytes=$payloadBytes;manifestSha256=$manifestHash;fileCount=$rows.Count;launcherSha256=(Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant();fileProductVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($outputPath).ProductVersion;sourceSha256=$sourceHashes;extractionVerified=$true;applicationLaunched=$false;buildWorkDirectory=$workPath}
[IO.File]::WriteAllText($outputPath+'.build.json',($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$report | ConvertTo-Json -Depth 8
