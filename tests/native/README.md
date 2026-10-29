# Native Edge test parent

EdgeQaParent.cs is a QA-only WinForms window in a separate process. It is not
packaged with D&F and does not load application profiles or any website.

Compile on Windows with the existing .NET Framework compiler:

    C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /platform:x64 /out:qa-tools\EdgeQaParent.exe /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll tests\native\EdgeQaParent.cs

Start EdgeQaParent.exe --stdio with redirected standard input/output. Its first
JSON line is {parentWindow:"<decimal HWND>",pid,width,height,visible}. Commands
are JSON lines of the form {id:1,method:"resize",params:{width:1080,height:720}}.
Replies are {id,result} or {id,error:{message}}. Supported commands: resize,
show, hide, position, state, close. Resize sets the native client area, and
position moves the top-level window. EOF closes only this QA window.
