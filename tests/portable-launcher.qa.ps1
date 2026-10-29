[CmdletBinding()] param()
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$qa=Join-Path $root ('qa-tools\portable-qa-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $qa 'app\resources') | Out-Null
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8=[Text.UTF8Encoding]::new($false)
$results=[Collections.Generic.List[object]]::new()
function Assert([bool]$condition,[string]$name){if(-not $condition){throw "Portable fixture failed: $name"};$results.Add([ordered]@{name=$name;passed=$true})}
function Run([string]$exe,[string]$arguments){$p=[Diagnostics.ProcessStartInfo]::new($exe,$arguments);$p.UseShellExecute=$false;$p.CreateNoWindow=$true;$p.RedirectStandardOutput=$true;$p.RedirectStandardError=$true;$child=[Diagnostics.Process]::Start($p);$stdout=$child.StandardOutput.ReadToEnd();$stderr=$child.StandardError.ReadToEnd();$child.WaitForExit();return @{code=$child.ExitCode;stdout=$stdout;stderr=$stderr}}
function Compile([string]$exe,[string]$config,[string]$zip,[string]$manifest){$cmd=@('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:'+$exe),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Web.Extensions.dll','/reference:System.Windows.Forms.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',('/resource:'+$zip+',DandF.Portable.payload.zip'),('/resource:'+$manifest+',DandF.Portable.manifest.json'),(Join-Path $root 'native\portable-launcher\DandF.Portable.cs'),$config);& $csc @cmd;if($LASTEXITCODE){throw 'Fixture compile failed.'}}
$fixtureSource='using System;using System.IO;using System.Web.Script.Serialization;class Fixture{static int Main(string[] args){if(args.Length==0)return 91;File.WriteAllText(args[0],new JavaScriptSerializer().Serialize(new{args=args,directory=Environment.CurrentDirectory,portable=Environment.GetEnvironmentVariable("PORTABLE_EXECUTABLE_PATH"),portableDirectory=Environment.GetEnvironmentVariable("PORTABLE_EXECUTABLE_DIR")}));return 37;}}'
[IO.File]::WriteAllText((Join-Path $qa 'Fixture.cs'),$fixtureSource,$utf8)
& $csc /nologo /target:winexe /platform:x64 ('/out:'+(Join-Path $qa 'app\D&F.exe')) /reference:System.Web.Extensions.dll (Join-Path $qa 'Fixture.cs')
if($LASTEXITCODE){throw 'Harmless fixture compilation failed.'}
[IO.File]::WriteAllText((Join-Path $qa 'app\resources\payload.txt'),'portable é 世界',$utf8)
$exe=Join-Path $qa 'DandF-fixture.exe';$verifyReport=Join-Path $qa 'verify.json'
& (Join-Path $root 'tools\build_portable_launcher.ps1') -InputDirectory (Join-Path $qa 'app') -OutputExe $exe -VerifyReport $verifyReport | Out-Null
$verify=Get-Content -LiteralPath $verifyReport -Raw | ConvertFrom-Json
Assert ($verify.verified -and $verify.extracted -and -not $verify.launched -and $verify.cleanup -eq 'removed' -and $verify.architecture -eq 'x64') 'Full extraction, per-file hashes and owned cleanup; verify-only never launches child'
$inspect=Run $exe '--df-portable-inspect';$inspection=$inspect.stdout|ConvertFrom-Json
Assert ($inspect.code -eq 0 -and $inspection.verified -and -not $inspection.extracted -and -not $inspection.launched -and $inspection.fileProductVersion -eq '1.1.0-Alpha') 'Inspect verifies compiled version and embedded hashes without extraction or launch'
$childReport=Join-Path $qa 'child-report.json'
# This command line exercises empty, spaced, Unicode, embedded quote and terminal backslash arguments.
$arguments='"'+$childReport+'" "" "two words" "世界 é" "a\"b" "C:\trailing\\"'
$launched=Run $exe $arguments;$childResult=Get-Content -LiteralPath $childReport -Raw | ConvertFrom-Json
Assert ($launched.code -eq 37) 'Normal launch returns exact child exit code'
Assert (($childResult.args | ConvertTo-Json -Compress) -eq (@($childReport,'','two words','世界 é','a"b','C:\trailing\')|ConvertTo-Json -Compress)) 'Windows arguments round-trip exactly'
Assert ($childResult.portable -eq $exe -and $childResult.portableDirectory -eq $qa -and -not (Test-Path -LiteralPath $childResult.directory)) 'Portable path environment preserved; extraction removed after child exit'
$baseManifest=Get-Content -LiteralPath ($exe+'.payload-manifest.json') -Raw | ConvertFrom-Json
function BadPayload([string]$name,[string[]]$entries,[string[]]$contents,[string[]]$manifestNames,[bool]$wrongFileHash=$false,[bool]$wrongArchiveHash=$false,[bool]$symlink=$false){
 $dir=Join-Path $qa $name;New-Item -ItemType Directory -Force -Path $dir | Out-Null
 $zipPath=Join-Path $dir 'payload.zip';$zip=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
 try{for($i=0;$i -lt $entries.Length;$i++){$entry=$zip.CreateEntry($entries[$i]);if($symlink){$entry.ExternalAttributes=([int]0xA000 -shl 16)};$stream=$entry.Open();try{$bytes=$utf8.GetBytes($contents[$i]);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}}finally{$zip.Dispose()}
 $rows=for($i=0;$i -lt $manifestNames.Length;$i++){ $bytes=$utf8.GetBytes($contents[$i]);$sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};if($wrongFileHash){$hash='0'*64};[ordered]@{path=$manifestNames[$i];length=$bytes.Length;sha256=$hash} }
 $manifestPath=Join-Path $dir 'manifest.json';[IO.File]::WriteAllText($manifestPath,([ordered]@{version=1;productVersion='1.1.0-Alpha';appExe='D&F.exe';files=@($rows)}|ConvertTo-Json -Depth 6 -Compress),$utf8)
 $zh=(Get-FileHash -LiteralPath $zipPath).Hash.ToLowerInvariant();if($wrongArchiveHash){$zh='0'*64};$mh=(Get-FileHash -LiteralPath $manifestPath).Hash.ToLowerInvariant();$len=(Get-Item -LiteralPath $zipPath).Length
 $config=Join-Path $dir 'Build.cs';[IO.File]::WriteAllText($config,('internal static class PortableBuild {public const string ProductVersion="1.1.0-Alpha",AppExe="D&F.exe",PayloadSha256="'+$zh+'",ManifestSha256="'+$mh+'";public const long PayloadBytes='+$len+'L;}'),$utf8)
 $output=Join-Path $dir 'Bad.exe';Compile $output $config $zipPath $manifestPath;$result=Run $output '--df-portable-verify-only';$data=$result.stdout|ConvertFrom-Json;Assert ($result.code -ne 0 -and -not $data.verified -and -not $data.launched) $name
}
BadPayload 'Reject parent traversal in manifest' @('D&F.exe','../escape.txt') @('exe','escape') @('D&F.exe','../escape.txt')
BadPayload 'Reject extra traversal ZIP entry' @('D&F.exe','../escape.txt') @('exe','escape') @('D&F.exe')
BadPayload 'Reject drive or ADS path' @('D&F.exe','C:escape.txt') @('exe','escape') @('D&F.exe','C:escape.txt')
BadPayload 'Reject absolute path' @('D&F.exe','/escape.txt') @('exe','escape') @('D&F.exe','/escape.txt')
BadPayload 'Reject backslash path' @('D&F.exe','dir\escape.txt') @('exe','escape') @('D&F.exe','dir\escape.txt')
BadPayload 'Reject reserved Windows filename' @('D&F.exe','NUL.txt') @('exe','escape') @('D&F.exe','NUL.txt')
BadPayload 'Reject ZIP case collision' @('D&F.exe','d&f.exe') @('exe','exe') @('D&F.exe')
BadPayload 'Reject altered file bytes' @('D&F.exe') @('exe') @('D&F.exe') $true
BadPayload 'Reject altered embedded archive hash' @('D&F.exe') @('exe') @('D&F.exe') $false $true
BadPayload 'Reject symlink ZIP entry' @('D&F.exe') @('exe') @('D&F.exe') $false $false $true
$report=[ordered]@{version=1;fixtureDirectory=$qa;checks=$results.Count;passed=$results.Count;applicationUiTested=$false;results=@($results.ToArray())}
[IO.File]::WriteAllText((Join-Path $root 'qa-tools\portable-fixtures-report.json'),($report|ConvertTo-Json -Depth 6),$utf8)
$report | ConvertTo-Json -Depth 6
