# D&F x64 portable launcher

This fallback packages the complete `release/win-unpacked` folder into a single x64 managed executable. It needs the .NET Framework already present on supported Windows installations and does not install anything or request elevation. It is used when the NSIS compiler cannot run on the build PC.

Build from the project root:

```powershell
./tools/build_portable_launcher.ps1 -InputDirectory ./release/win-unpacked -OutputExe ./release/DandF-1.1.0-Alpha-Windows-x64.exe -VerifyReport ../edge110-portable-verify.json
```

An optional `-PayloadZip` reuses an existing ZIP with application files directly at its root. The compiled launcher verifies that the complete ZIP matches the actual input tree. An optional `-Icon` selects the app icon; the build defaults to `assets/icon.ico` when present.

The build creates the executable, adjacent `.build.json` evidence and `.payload-manifest.json`, and a GUID build directory under `.portable-build`. It does not delete or move the input tree. The evidence records x64 architecture, product version, launcher/archive/manifest/source hashes and complete file counts. It explicitly records `applicationLaunched:false`.

The launcher checks the embedded archive and manifest SHA-256 before extraction, validates every file path and ZIP entry, then checks every extracted file's exact length and SHA-256. Absolute/drive/parent/ADS paths, backslashes, Windows reserved filenames, duplicate paths (including case collisions), links and extra/missing archive files are rejected. All files extract into a fresh GUID directory under `%TEMP%/DandF-Portable`.

Normal launch forwards Windows arguments, sets `PORTABLE_EXECUTABLE_DIR`, `PORTABLE_EXECUTABLE_FILE` and `PORTABLE_EXECUTABLE_PATH`, and starts the packaged `D&F.exe` with its extracted directory as the working directory. The normal D&F preferences/cookies profile is preserved. The launcher waits and returns the actual application's exit code. No other executable can be chosen through command-line flags.

Cleanup is bounded, checks the exact GUID directory, marker and ancestor chain, and does not follow junctions/symlinks. It runs after application exit. If files remain busy, the owned temporary directory is retained; the launcher does not remove a running child's files.

For verification without launching D&F, run the portable with exactly one reserved argument:

- `--df-portable-inspect`: verify archive/manifest structure and hashes; no extraction.
- `--df-portable-verify-only`: extract and verify the complete tree, then clean up; no application execution.

Both return a single JSON result to redirected standard output. `verified:true`, `extracted:true`, `launched:false` and `cleanup:"removed"` indicate successful extraction verification, not a successful app UI launch. Product version comes from the compiled executable's Windows version resource as well as the embedded manifest. Use a process with redirected stdout when invoking these checks from PowerShell because the launcher uses the Windows GUI subsystem.

The build script performs `--df-portable-verify-only` automatically and stops if any integrity or cleanup check fails. Optional `-VerifyReport` saves that exact stdout JSON to the selected report file.
