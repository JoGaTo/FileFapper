$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$msi=Join-Path $root 'release\FileFapper-1.0.0-Windows-x64.msi'
$payload=Join-Path $root 'release\win-unpacked'
$extract=Join-Path $root 'qa-msi-admin-extract'
$log=Join-Path $root 'qa-msi-admin-extract.log'
if (-not (Test-Path -LiteralPath $msi -PathType Leaf)) { throw 'MSI not found.' }
if (Test-Path -LiteralPath $extract) { throw 'Verification destination already exists; it will not be overwritten.' }
New-Item -ItemType Directory -Path $extract | Out-Null
$installer=New-Object -ComObject WindowsInstaller.Installer
$db=$installer.OpenDatabase($msi,0)
$properties=@{}
foreach($key in @('ProductName','ProductVersion','ProductCode','UpgradeCode','Manufacturer','ALLUSERS','MSIINSTALLPERUSER')) {
  $view=$db.OpenView("SELECT Value FROM Property WHERE Property='$key'");$view.Execute();$row=$view.Fetch();if($null -ne $row){$properties[$key]=$row.StringData(1)};$view.Close()
}
$template=$db.SummaryInformation(0).Property(7)
if($properties.ProductName -ne 'FileFapper' -or $properties.ProductVersion -notmatch '^1\.0\.0(\.0)?$' -or $properties.UpgradeCode -ne '{829A36EE-3DD5-5BD9-97D4-16834034BE7F}' -or $template -notmatch 'x64'){throw 'Unexpected MSI identity, version, upgrade code or architecture.'}
$view=$db.OpenView('SELECT `File` FROM `File`');$view.Execute();$count=0;while($null -ne $view.Fetch()){$count++};$view.Close()
$arguments=@('/a',('"'+$msi+'"'),'/qn','/norestart',('TARGETDIR="'+$extract+'"'),'/l*v',('"'+$log+'"'))
$process=Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
if($process.ExitCode -ne 0){throw "MSI administrative extraction failed with code $($process.ExitCode)."}
$apps=@(Get-ChildItem -LiteralPath $extract -Filter 'FileFapper.exe' -File -Recurse)
if($apps.Count -ne 1){throw "Expected one extracted app, found $($apps.Count)."}
$appDir=$apps[0].Directory.FullName;$files=@(Get-ChildItem -LiteralPath $payload -File -Recurse);$extracted=@(Get-ChildItem -LiteralPath $appDir -File -Recurse)
if($files.Count -ne $count -or $extracted.Count -ne $files.Count){throw 'The MSI and extracted payload file counts differ.'}
$matched=0;foreach($file in $files){$relative=$file.FullName.Substring($payload.Length).TrimStart('\','/');$copy=Join-Path $appDir $relative;if(-not(Test-Path -LiteralPath $copy -PathType Leaf)){throw "Missing extracted file: $relative"};if((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash){throw "Extracted file differs: $relative"};$matched++}
$report=[ordered]@{passed=$true;version='1.0.0';msi=$msi;sha256=(Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant();signature=[string](Get-AuthenticodeSignature -LiteralPath $msi).Status;properties=$properties;platform=$template;files=$count;matched=$matched;extractedApp=$apps[0].FullName;scope='Read-only MSI inspection and administrative extraction into a fresh test directory; no normal install or uninstall.'}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'msi-verification.json') -Encoding UTF8
$report | ConvertTo-Json -Depth 6
