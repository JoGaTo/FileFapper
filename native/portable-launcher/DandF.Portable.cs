using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("FileFapper Portable")]
[assembly: AssemblyProduct("FileFapper")]
[assembly: AssemblyDescription("FileFapper verified portable launcher")]
[assembly: AssemblyVersion("1.2.7.0")]
[assembly: AssemblyFileVersion("1.2.7.0")]
[assembly: AssemblyInformationalVersion("1.2.7-Alpha")]

internal sealed class PayloadFile { public string path {get;set;} public long length {get;set;} public string sha256 {get;set;} }
internal sealed class PayloadManifest { public int version {get;set;} public string productVersion {get;set;} public string appExe {get;set;} public List<PayloadFile> files {get;set;} }
internal static class Portable {
 const string ZipResource="DandF.Portable.payload.zip", ManifestResource="DandF.Portable.manifest.json", MarkerName=".dandf-portable-owner";
 static readonly StringComparison Ordinal=StringComparison.OrdinalIgnoreCase;
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=134217728, RecursionLimit=100};
 static string extraction, token, tempRoot; static Process child; static bool qa;
 static string Hex(byte[] bytes){return BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();}
 static string Hash(Stream stream){using(var sha=SHA256.Create())return Hex(sha.ComputeHash(stream));}
 static string HashFile(string path){using(var stream=File.OpenRead(path))return Hash(stream);}
 static Stream Resource(string name){var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(name);if(stream==null)throw new InvalidDataException("The portable package is incomplete. Download the complete FileFapper portable file again.");return stream;}
 static string SafeRelative(string path){
  if(String.IsNullOrEmpty(path)||path.Length>2000||path.IndexOf('\\')>=0||path.StartsWith("/")||path.EndsWith("/")||path.IndexOf(':')>=0||Path.IsPathRooted(path))throw new InvalidDataException("Unsafe path in portable payload.");
  foreach(string part in path.Split('/')){
   if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||part.IndexOfAny(Path.GetInvalidFileNameChars())>=0)throw new InvalidDataException("Unsafe filename in portable payload.");
   string stem=part.Split('.')[0];if(Regex.IsMatch(stem,@"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$",RegexOptions.IgnoreCase))throw new InvalidDataException("Reserved filename in portable payload.");
  }return path;
 }
 static string Inside(string root,string relative){string target=Path.GetFullPath(Path.Combine(root,SafeRelative(relative).Replace('/',Path.DirectorySeparatorChar)));if(!target.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,Ordinal))throw new InvalidDataException("Portable payload path escapes its folder.");return target;}
 static void NoReparse(string path){for(string current=Path.GetFullPath(path);!String.IsNullOrEmpty(current);current=Path.GetDirectoryName(current)){if((Directory.Exists(current)||File.Exists(current))&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("The portable temporary folder contains a link. Choose a normal Windows temporary folder.");}}
 static PayloadManifest ReadManifest(out string manifestHash){
  byte[] bytes;using(var stream=Resource(ManifestResource))using(var ms=new MemoryStream()){stream.CopyTo(ms);bytes=ms.ToArray();}using(var sha=SHA256.Create())manifestHash=Hex(sha.ComputeHash(bytes));
  if(manifestHash!=PortableBuild.ManifestSha256)throw new InvalidDataException("The portable file manifest failed its integrity check.");
  var manifest=Json.Deserialize<PayloadManifest>(Encoding.UTF8.GetString(bytes));
  if(manifest==null||manifest.version!=1||manifest.productVersion!=PortableBuild.ProductVersion||manifest.appExe!=PortableBuild.AppExe||manifest.files==null||manifest.files.Count==0)throw new InvalidDataException("The portable file manifest is invalid.");
  var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var file in manifest.files){if(file==null||!names.Add(SafeRelative(file.path))||file.length<0||!Regex.IsMatch(file.sha256??"",@"^[0-9a-f]{64}$"))throw new InvalidDataException("Invalid or duplicate file in portable manifest.");}
  if(!names.Contains(PortableBuild.AppExe)||names.Contains(MarkerName))throw new InvalidDataException("The portable application is missing or has an invalid marker.");return manifest;
 }
 static Dictionary<string,ZipArchiveEntry> ValidateEntries(ZipArchive zip,PayloadManifest manifest){
  var expected=new Dictionary<string,PayloadFile>(StringComparer.OrdinalIgnoreCase);foreach(var file in manifest.files)expected.Add(file.path,file);
  var entries=new Dictionary<string,ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
  foreach(var entry in zip.Entries){SafeRelative(entry.FullName);PayloadFile file;if(!expected.TryGetValue(entry.FullName,out file)||entries.ContainsKey(entry.FullName)||entry.Length!=file.length||((entry.ExternalAttributes>>16)&0xf000)==0xa000||(entry.ExternalAttributes&0x400)!=0)throw new InvalidDataException("The portable archive does not match its file manifest.");entries.Add(entry.FullName,entry);}
  if(entries.Count!=expected.Count)throw new InvalidDataException("The portable archive is missing required files.");return entries;
 }
 static void Extract(ZipArchive zip,PayloadManifest manifest){
  tempRoot=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"DandF-Portable"));NoReparse(tempRoot);Directory.CreateDirectory(tempRoot);NoReparse(tempRoot);
  token=Guid.NewGuid().ToString("N");extraction=Path.GetFullPath(Path.Combine(tempRoot,"df-"+token));if(Directory.Exists(extraction)||File.Exists(extraction))throw new IOException("A new temporary folder could not be created.");
  Directory.CreateDirectory(extraction);NoReparse(extraction);File.WriteAllText(Path.Combine(extraction,MarkerName),token,new UTF8Encoding(false));
  var entries=ValidateEntries(zip,manifest);
  foreach(var file in manifest.files){var entry=entries[file.path];string output=Inside(extraction,file.path);Directory.CreateDirectory(Path.GetDirectoryName(output));NoReparse(Path.GetDirectoryName(output));long copied=0;
   using(var source=entry.Open())using(var destination=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] buffer=new byte[131072];int read;while((read=source.Read(buffer,0,buffer.Length))>0){copied+=read;if(copied>file.length)throw new InvalidDataException("An extracted file exceeds its expected length.");destination.Write(buffer,0,read);}}
   if(copied!=file.length||HashFile(output)!=file.sha256)throw new InvalidDataException("An extracted FileFapper file failed its integrity check: "+file.path);
  }
 }
 static bool Owned(){try{if(extraction!=null)NoReparse(extraction);return extraction!=null&&token!=null&&tempRoot!=null&&String.Equals(Path.GetDirectoryName(Path.GetFullPath(extraction)),tempRoot,Ordinal)&&String.Equals(Path.GetFileName(extraction),"df-"+token,StringComparison.Ordinal)&&(File.GetAttributes(extraction)&FileAttributes.ReparsePoint)==0&&(File.GetAttributes(Path.Combine(extraction,MarkerName))&FileAttributes.ReparsePoint)==0&&File.ReadAllText(Path.Combine(extraction,MarkerName))==token;}catch{return false;}}
 static void DeleteOwnedContents(string directory){
  foreach(string file in Directory.GetFiles(directory)){if(directory==extraction&&Path.GetFileName(file)==MarkerName)continue;if((File.GetAttributes(file)&FileAttributes.ReparsePoint)==0)File.SetAttributes(file,FileAttributes.Normal);File.Delete(file);}
  foreach(string folder in Directory.GetDirectories(directory)){if((File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)Directory.Delete(folder,false);else {DeleteOwnedContents(folder);Directory.Delete(folder,false);}}
 }
 static bool Cleanup(){if(extraction==null||!Directory.Exists(extraction))return true;if(child!=null&&!child.HasExited)return false;for(int attempt=0;attempt<12;attempt++){if(!Owned())return false;try{DeleteOwnedContents(extraction);File.Delete(Path.Combine(extraction,MarkerName));try{Directory.Delete(extraction,false);}catch{NoReparse(extraction);if(Directory.Exists(extraction))using(var marker=new FileStream(Path.Combine(extraction,MarkerName),FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(marker,new UTF8Encoding(false)))writer.Write(token);throw;}return true;}catch{if(attempt<11)Thread.Sleep(400);}}return false;}
 internal static string Quote(string value){var result=new StringBuilder("\"");int slashes=0;foreach(char c in value??""){if(c=='\\'){slashes++;continue;}if(c=='\"'){result.Append('\\',slashes*2+1);result.Append(c);}else {result.Append('\\',slashes);result.Append(c);}slashes=0;}result.Append('\\',slashes*2);return result.Append('"').ToString();}
 static int Launch(string[] args){
  var arguments=new StringBuilder();foreach(string argument in args){if(arguments.Length>0)arguments.Append(' ');arguments.Append(Quote(argument));}
  string own=Path.GetFullPath(Assembly.GetExecutingAssembly().Location);var start=new ProcessStartInfo(Inside(extraction,PortableBuild.AppExe),arguments.ToString()){UseShellExecute=false,WorkingDirectory=extraction};
  start.EnvironmentVariables["PORTABLE_EXECUTABLE_DIR"]=Path.GetDirectoryName(own);start.EnvironmentVariables["PORTABLE_EXECUTABLE_FILE"]=Path.GetFileName(own);start.EnvironmentVariables["PORTABLE_EXECUTABLE_PATH"]=own;
  child=Process.Start(start);if(child==null)throw new IOException("FileFapper could not be started.");child.WaitForExit();return child.ExitCode;
 }
 [STAThread] static int Main(string[] args){
  string mode=args.Length==1&&args[0]=="--df-portable-inspect"?"inspect":args.Length==1&&args[0]=="--df-portable-verify-only"?"verify-only":"launch";qa=mode!="launch";var clock=Stopwatch.StartNew();
  try{
   string manifestHash;var manifest=ReadManifest(out manifestHash);string digest;long payloadBytes;using(var payload=Resource(ZipResource)){payloadBytes=payload.Length;digest=Hash(payload);if(payloadBytes!=PortableBuild.PayloadBytes||digest!=PortableBuild.PayloadSha256)throw new InvalidDataException("The embedded portable archive failed its integrity check. Download the complete FileFapper portable file again.");payload.Position=0;using(var archive=new ZipArchive(payload,ZipArchiveMode.Read,true)){ValidateEntries(archive,manifest);if(mode!="inspect")Extract(archive,manifest);}}
   if(qa){bool removed=Cleanup();Console.Out.WriteLine(Json.Serialize(new{mode=mode,verified=true,productVersion=PortableBuild.ProductVersion,architecture=Environment.Is64BitProcess?"x64":"x86",fileProductVersion=FileVersionInfo.GetVersionInfo(Assembly.GetExecutingAssembly().Location).ProductVersion,payloadSha256=digest,payloadBytes=payloadBytes,manifestSha256=manifestHash,fileCount=manifest.files.Count,extracted=mode=="verify-only",launched=false,cleanup=mode=="inspect"?"not-needed":removed?"removed":"retained",elapsedMs=clock.ElapsedMilliseconds}));return removed?0:2;}
   int code=Launch(args);Cleanup();return code;
  }catch(Exception error){Cleanup();string message="FileFapper portable could not start.\n\n"+error.Message;if(qa){Console.Out.WriteLine(Json.Serialize(new{mode=mode,verified=false,launched=false,error=error.Message}));Console.Error.WriteLine(message);}else MessageBox.Show(message,"FileFapper Portable",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
