// D&F private Edge WebView2 host. Website content cannot invoke this command pipe.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace DandF.EdgeHost {
internal sealed class Tab {
 internal string Id, NavigationId="0";
 internal IntPtr HostWindow;
 internal Rectangle? PlacedBounds;
 internal bool SurfaceVisible;
 internal int PlacementChanges,SizeChanges,VisibilityChanges;
 internal CoreWebView2Controller Controller;
 internal CoreWebView2 Core;
}
internal static class Program {
 const string SdkVersion="1.0.4258.31";
 static readonly Dictionary<string,Tab> Tabs=new Dictionary<string,Tab>();
 static readonly Dictionary<string,Task<Tab>> Creating=new Dictionary<string,Task<Tab>>();
 static readonly Dictionary<string,TaskCompletionSource<Dictionary<string,object>>> Requests=new Dictionary<string,TaskCompletionSource<Dictionary<string,object>>>();
 static readonly Dictionary<string,TaskCompletionSource<string>> DownloadChoices=new Dictionary<string,TaskCompletionSource<string>>();
 static readonly List<Dictionary<string,object>> Fixtures=new List<Dictionary<string,object>>();
 static readonly object OutputLock=new object();
 static Control Dispatcher;
 static CoreWebView2Environment Environment;
 static IntPtr ParentWindow;
 static System.Windows.Forms.Timer LifetimeTimer;
 static bool QaMode,BlockUnmatched,Closing,SelfTest;
 static string DownloadDirectory="";
 sealed class WindowOwner:IWin32Window { readonly IntPtr handle; internal WindowOwner(IntPtr value){handle=value;} public IntPtr Handle{get{return handle;}} }
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr GetFocus();
 [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateWindowEx(int extendedStyle,string className,string title,int style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
 [DllImport("user32.dll",SetLastError=true)] static extern bool DestroyWindow(IntPtr window);
 [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
 [DllImport("user32.dll")] static extern short GetKeyState(int key);
 static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=134217728,RecursionLimit=512};}
 static string Encode(object value){return Json().Serialize(value);}
 static Dictionary<string,object> Obj(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
 static object Get(Dictionary<string,object> p,string key,object fallback=null){object value;return p.TryGetValue(key,out value)?value:fallback;}
 static string Text(Dictionary<string,object> p,string key,string fallback=""){object value=Get(p,key);return value==null?fallback:Convert.ToString(value);}
 static bool Flag(Dictionary<string,object> p,string key,bool fallback=false){object value=Get(p,key);return value is bool?(bool)value:fallback;}
 static int Number(Dictionary<string,object> p,string key,int fallback=0){try{return Convert.ToInt32(Get(p,key,fallback));}catch{return fallback;}}
 static void Send(object value){lock(OutputLock){Console.Out.WriteLine(Encode(value));Console.Out.Flush();}}
 static void Event(string name,Tab tab,object data){if(!Closing&&!SelfTest)Send(new{@event=name,tabId=tab==null?"":tab.Id,@params=data});}
 static string ErrorText(Exception error){string text=error.Message??"The Edge browser operation failed.";text=text.Replace('\r',' ').Replace('\n',' ');return text.Substring(0,Math.Min(text.Length,700));}
 [STAThread] static void Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
  Console.OutputEncoding=new UTF8Encoding(false);
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  Dispatcher=new Control();IntPtr handle=Dispatcher.Handle;
  SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
  LifetimeTimer=new System.Windows.Forms.Timer{Interval=1000};
  LifetimeTimer.Tick+=delegate{if(ParentWindow!=IntPtr.Zero&&!IsWindow(ParentWindow))Shutdown();};
  LifetimeTimer.Start();
  if(args.Length>0&&args[0]=="--self-test"){
   SelfTest=true;
   Dispatcher.BeginInvoke(new Action(async delegate{
    try{
     string folder=args.Length>1?Path.GetFullPath(args[1]):Path.Combine(Path.GetTempPath(),"DandF-Edge-QA-"+Guid.NewGuid().ToString("N"));
     await Initialize(new Dictionary<string,object>{{"parentWindow",handle.ToInt64().ToString()},{"userDataDir",folder},{"qaMode",true}});
     Tab tab=await Create("__self_test");
     object evaluation=Json().DeserializeObject(await tab.Core.CallDevToolsProtocolMethodAsync("Runtime.evaluate",Encode(new{expression="({userAgent:navigator.userAgent,webview:typeof window.chrome?.webview?.postMessage==='function'})",returnByValue=true,awaitPromise=true})));
     Send(new{selfTest=true,passed=true,engine="Microsoft Edge WebView2",version=Environment.BrowserVersionString,sdkVersion=SdkVersion,evaluation=evaluation});
    }catch(Exception error){Send(new{selfTest=true,passed=false,error=ErrorText(error)});System.Environment.ExitCode=1;}
    finally{Shutdown();}
   }));
  }else{Thread reader=new Thread(ReadCommands){IsBackground=true,Name="D&F trusted browser command reader"};reader.Start();}
  Application.Run();Dispatcher.Dispose();
 }
 static void ReadCommands(){
  try{
   using(StreamReader input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false))){
    string line;
    while((line=input.ReadLine())!=null){
     if(line.Length>134217728){Send(new{id=(object)null,error=new{message="Browser command exceeds the message limit."}});continue;}
     Dictionary<string,object> request;
     try{request=Obj(Json().DeserializeObject(line));}catch{Send(new{id=(object)null,error=new{message="Invalid browser command JSON."}});continue;}
     Dispatcher.BeginInvoke(new Action(async delegate{
      object id=Get(request,"id");
      try{object result=await Dispatch(Text(request,"method"),Obj(Get(request,"params")));Send(new{id=id,result=result});}
      catch(Exception error){Send(new{id=id,error=new{message=ErrorText(error)}});}
     }));
    }
   }
  }catch{}
  finally{try{Dispatcher.BeginInvoke(new Action(Shutdown));}catch{}}
 }
 static async Task<object> Initialize(Dictionary<string,object> p){
  if(Environment!=null)return new{engine="Microsoft Edge WebView2",version=Environment.BrowserVersionString,sdkVersion=SdkVersion};
  long handle;
  if(!Int64.TryParse(Text(p,"parentWindow"),out handle)||handle==0||!IsWindow(new IntPtr(handle)))throw new InvalidOperationException("The D&F parent window is unavailable.");
  string folder=Text(p,"userDataDir");
  if(String.IsNullOrWhiteSpace(folder)||!Path.IsPathRooted(folder))throw new InvalidOperationException("A dedicated D&F browser profile directory is required.");
  ParentWindow=new IntPtr(handle);QaMode=Flag(p,"qaMode");DownloadDirectory=Text(p,"downloadDir");Directory.CreateDirectory(folder);
  Environment=await CoreWebView2Environment.CreateAsync(null,folder,new CoreWebView2EnvironmentOptions());
  return new{engine="Microsoft Edge WebView2",version=Environment.BrowserVersionString,sdkVersion=SdkVersion};
 }
 static async Task<Tab> Create(string id){
  Tab existing;if(Tabs.TryGetValue(id,out existing))return existing;
  Task<Tab> pending;if(Creating.TryGetValue(id,out pending))return await pending;
  Task<Tab> operation=CreateNew(id);Creating.Add(id,operation);
  try{return await operation;}finally{Creating.Remove(id);}
 }
 static async Task<Tab> CreateNew(string id){
  if(Environment==null)throw new InvalidOperationException("Initialize the Edge browser before creating a tab.");
  if(String.IsNullOrWhiteSpace(id)||id.Length>100)throw new InvalidOperationException("Invalid browser tab identifier.");
  Tab existing;if(Tabs.TryGetValue(id,out existing))return existing;
  // Give WebView2 its own native child. Sharing Electron's top-level HWND
  // lets Electron's compositor cover the web page even after navigation succeeds.
  IntPtr host=CreateWindowEx(0,"STATIC","D&F Edge tab",0x40000000|0x04000000|0x02000000,0,0,1,1,ParentWindow,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
  if(host==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"The Edge browser surface could not be created.");
  CoreWebView2Controller controller;
  try{
   controller=await Environment.CreateCoreWebView2ControllerAsync(host);
   if(Closing||!IsWindow(ParentWindow)){controller.Close();throw new InvalidOperationException("The D&F window closed while creating its browser surface.");}
  }catch{DestroyWindow(host);throw;}
  controller.IsVisible=false;controller.Bounds=new Rectangle(0,0,1,1);
  Tab tab=new Tab{Id=id,HostWindow=host,Controller=controller,Core=controller.CoreWebView2};Tabs.Add(id,tab);
  CoreWebView2 core=tab.Core;
  core.Settings.IsWebMessageEnabled=true;core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDefaultContextMenusEnabled=true;
  core.Profile.IsPasswordAutosaveEnabled=false;core.Profile.IsGeneralAutofillEnabled=false;
  core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){
   if(!AllowedNavigation(e.Uri)){e.Cancel=true;Event("navigation-blocked",tab,new{url=e.Uri});return;}
   tab.NavigationId=e.NavigationId.ToString();Event("navigation-starting",tab,new{url=e.Uri,main=true,navigationId=tab.NavigationId,redirected=e.IsRedirected});
  };
  core.NavigationCompleted+=delegate(object sender,CoreWebView2NavigationCompletedEventArgs e){
   if(Closing||!Tabs.ContainsKey(tab.Id))return;
   Event("navigation-completed",tab,new{url=core.Source,httpStatus=e.HttpStatusCode,errorCode=e.WebErrorStatus.ToString(),success=e.IsSuccess,navigationId=e.NavigationId.ToString()});
  };
  core.DOMContentLoaded+=delegate(object sender,CoreWebView2DOMContentLoadedEventArgs e){Event("dom-ready",tab,new{navigationId=e.NavigationId.ToString()});};
  core.SourceChanged+=delegate(object sender,CoreWebView2SourceChangedEventArgs e){if(Closing||!Tabs.ContainsKey(tab.Id))return;Event("source-changed",tab,new{url=core.Source,isNewDocument=e.IsNewDocument,navigationId=tab.NavigationId});};
  core.DocumentTitleChanged+=delegate{if(Closing||!Tabs.ContainsKey(tab.Id))return;Event("title-changed",tab,new{title=core.DocumentTitle});};
  core.HistoryChanged+=delegate{if(Closing||!Tabs.ContainsKey(tab.Id))return;Event("history-changed",tab,new{canBack=core.CanGoBack,canForward=core.CanGoForward});};
  core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){
   e.Handled=true;if(AllowedHttp(e.Uri))Event("new-window",tab,new{url=e.Uri,disposition=e.IsUserInitiated?"foreground-tab":"new-window",userInitiated=e.IsUserInitiated});
  };
  controller.AcceleratorKeyPressed+=delegate(object sender,CoreWebView2AcceleratorKeyPressedEventArgs e){
   bool control=(GetKeyState(0x11)&0x8000)!=0,shift=(GetKeyState(0x10)&0x8000)!=0;
   if(!control||(e.KeyEventKind!=CoreWebView2KeyEventKind.KeyDown&&e.KeyEventKind!=CoreWebView2KeyEventKind.SystemKeyDown))return;
   string key=e.VirtualKey==9?"tab":((char)e.VirtualKey).ToString().ToLowerInvariant();
   if(key=="t"||key=="w"||key=="l"||key=="tab"){e.Handled=true;Event("accelerator",tab,new{key=key,control=true,shift=shift});}
  };
  core.ProcessFailed+=delegate(object sender,CoreWebView2ProcessFailedEventArgs e){Event("process-gone",tab,new{kind=e.ProcessFailedKind.ToString(),reason=e.Reason.ToString()});};
  core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;e.Handled=true;};
  core.WebMessageReceived+=delegate(object sender,CoreWebView2WebMessageReceivedEventArgs e){ReceivePageMessage(tab,e);};
  core.ContextMenuRequested+=delegate(object sender,CoreWebView2ContextMenuRequestedEventArgs e){
   if(Closing||!Tabs.ContainsKey(tab.Id)||!AllowedHttp(core.Source))return;
   CoreWebView2ContextMenuItem separator=Environment.CreateContextMenuItem("",null,CoreWebView2ContextMenuItemKind.Separator);
   CoreWebView2ContextMenuItem translate=Environment.CreateContextMenuItem("Translate page",null,CoreWebView2ContextMenuItemKind.Command);
   translate.CustomItemSelected+=delegate{Event("request-translate",tab,new{url=core.Source});};
   e.MenuItems.Add(separator);e.MenuItems.Add(translate);
   CoreWebView2ContextMenuItem sorting=Environment.CreateContextMenuItem("Sort tabs",null,CoreWebView2ContextMenuItemKind.Submenu);
   foreach(var option in new[]{new{Label="A-Z",Action="sort-title"},new{Label="Domain",Action="sort-domain"},new{Label="Date accessed",Action="sort-accessed"}}){
    string action=option.Action;CoreWebView2ContextMenuItem item=Environment.CreateContextMenuItem(option.Label,null,CoreWebView2ContextMenuItemKind.Command);
    item.CustomItemSelected+=delegate{Event("tab-command",tab,new{action=action});};sorting.Children.Add(item);
   }
   e.MenuItems.Add(sorting);
   foreach(var option in new[]{new{Label="Close tabs to the left",Action="close-left"},new{Label="Close tabs to the right",Action="close-right"}}){
    string action=option.Action;CoreWebView2ContextMenuItem item=Environment.CreateContextMenuItem(option.Label,null,CoreWebView2ContextMenuItemKind.Command);
    item.CustomItemSelected+=delegate{Event("tab-command",tab,new{action=action});};e.MenuItems.Add(item);
   }
  };
  core.DownloadStarting+=async delegate(object sender,CoreWebView2DownloadStartingEventArgs e){
   string file=Path.GetFileName(e.ResultFilePath??"");
   bool allowed=Regex.IsMatch(file,@"\.(png|jpe?g|gif|webp|avif|bmp|mp4|webm|mkv|mov|m4v|avi|ogv|mp3|wav|ogg|opus|m4a|flac|aac|zip|cbz|cbr|7z|rar|tar|gz|bz2|xz|pdf|psd|clip|txt)$",RegexOptions.IgnoreCase);
   if(!allowed||tab.Id=="__service"){e.Cancel=true;Event("download-blocked",tab,new{message="Queue the gallery URL to manage its files in D&F."});return;}
   CoreWebView2Deferral deferral=e.GetDeferral();e.Handled=true;
   CoreWebView2DownloadOperation operation=e.DownloadOperation;string savedName=file;
   operation.StateChanged+=delegate{if(operation.State!=CoreWebView2DownloadState.InProgress)Event("download-completed",tab,new{fileName=savedName,state=operation.State.ToString(),reason=operation.InterruptReason.ToString()});};
   string downloadId=Guid.NewGuid().ToString("N");var choice=new TaskCompletionSource<string>();DownloadChoices.Add(downloadId,choice);
   try{
    // The main app owns its file picker, so its modal focus and window lifetime
    // follow D&F rather than a separate hidden helper process.
    Event("download-requested",tab,new{downloadId=downloadId,url=operation.Uri,suggestedFileName=file});
    Task completed=await Task.WhenAny(choice.Task,Task.Delay(120000));
    string selected=completed==choice.Task?choice.Task.Result:null;
    if(Closing||!Tabs.ContainsKey(tab.Id)||String.IsNullOrEmpty(selected)||!Path.IsPathRooted(selected))e.Cancel=true;
    else{e.ResultFilePath=Path.GetFullPath(selected);savedName=Path.GetFileName(e.ResultFilePath);Event("download-starting",tab,new{url=operation.Uri,suggestedFileName=savedName});}
   }catch{e.Cancel=true;}finally{DownloadChoices.Remove(downloadId);try{deferral.Complete();}catch{}}
  };
  core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.Document);
  core.WebResourceRequested+=async delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){await Resource(tab,e);};
  return tab;
 }
 static bool AllowedHttp(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&(uri.Scheme=="https"||uri.Scheme=="http")&&String.IsNullOrEmpty(uri.UserInfo);}
 static bool AllowedNavigation(string value){return value=="about:blank"||AllowedHttp(value);}
 static bool Pixiv(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.IsDefaultPort&&String.IsNullOrEmpty(uri.UserInfo)&&(uri.Host=="pixiv.net"||uri.Host=="www.pixiv.net");}
 static bool PixivMedia(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.IsDefaultPort&&String.IsNullOrEmpty(uri.UserInfo)&&(uri.Host=="i.pximg.net"||uri.Host=="i-cf.pximg.net");}
 static void ReceivePageMessage(Tab tab,CoreWebView2WebMessageReceivedEventArgs e){
  if(Closing||!Tabs.ContainsKey(tab.Id)||!Pixiv(e.Source)||!Pixiv(tab.Core.Source))return;
  Uri source=new Uri(e.Source),current=new Uri(tab.Core.Source);
  if(source.GetLeftPart(UriPartial.Authority)!=current.GetLeftPart(UriPartial.Authority))return;
  string raw=e.WebMessageAsJson;if(String.IsNullOrEmpty(raw)||raw.Length>65536)return;
  Dictionary<string,object> message;try{message=Obj(Json().DeserializeObject(raw));}catch{return;}
  if(Text(message,"kind")!="df-pixiv-fetch"||Text(message,"method","GET")!="GET"||!PixivMedia(Text(message,"url"))||Text(message,"id").Length>100)return;
  Event("web-message",tab,new{source=e.Source,message=message,navigationId=tab.NavigationId});
 }
 static Dictionary<string,object> Fixture(string value,string method){
  if(!QaMode)return null;Uri uri;if(!Uri.TryCreate(value,UriKind.Absolute,out uri))return null;
  foreach(Dictionary<string,object> route in Fixtures){
   string host=Text(route,"hostname","*");if(host!="*"&&!String.Equals(host,uri.Host,StringComparison.OrdinalIgnoreCase))continue;
   string url=Text(route,"url"),routePath=Text(route,"path"),routeMethod=Text(route,"method");
   if(url.Length>0&&url!=value||routePath.Length>0&&routePath!=uri.AbsolutePath||routeMethod.Length>0&&!String.Equals(routeMethod,method,StringComparison.OrdinalIgnoreCase))continue;
   return route;
  }return null;
 }
 static void Respond(CoreWebView2WebResourceRequestedEventArgs e,Dictionary<string,object> response){
  string encoded=Text(response,"bodyBase64");
  byte[] bytes=encoded.Length>0?Convert.FromBase64String(encoded):Encoding.UTF8.GetBytes(Text(response,"body"));
  if(bytes.Length>134217728)throw new InvalidOperationException("Fixture response exceeds the message limit.");
  StringBuilder headers=new StringBuilder();
  foreach(KeyValuePair<string,object> header in Obj(Get(response,"headers"))){
   if(!Regex.IsMatch(header.Key,@"^[A-Za-z0-9!#$%&'*+.^_|~-]+$"))continue;
   IEnumerable values=header.Value is string?new object[]{header.Value}:header.Value as IEnumerable??new object[]{header.Value};
   foreach(object value in values){string text=Convert.ToString(value);if(!text.Contains("\r")&&!text.Contains("\n"))headers.Append(header.Key).Append(": ").Append(text).Append("\r\n");}
  }
  int status=Math.Max(100,Math.Min(599,Number(response,"status",200)));
  e.Response=Environment.CreateWebResourceResponse(new MemoryStream(bytes),status,status>=400?"D&F response":"OK",headers.ToString());
 }
 static async Task Resource(Tab tab,CoreWebView2WebResourceRequestedEventArgs e){
  CoreWebView2Deferral deferral=e.GetDeferral();string id=Guid.NewGuid().ToString("N");
  try{
   if(PixivMedia(e.Request.Uri))e.Request.Headers.SetHeader("Referer","https://www.pixiv.net/");
   Dictionary<string,object> fixture=Fixture(e.Request.Uri,e.Request.Method);
   // Matched fixtures still pass the real app ad-filter decision before use.
   if(QaMode&&BlockUnmatched&&fixture==null&&AllowedHttp(e.Request.Uri)){Respond(e,new Dictionary<string,object>{{"status",403},{"body","No external network in this D&F test."}});return;}
   TaskCompletionSource<Dictionary<string,object>> completion=new TaskCompletionSource<Dictionary<string,object>>();Requests.Add(id,completion);
   Event("resource-request",tab,new{requestId=id,url=e.Request.Uri,method=e.Request.Method,type=e.ResourceContext.ToString(),source=tab.Core.Source,tabId=tab.Id});
   Task completed=await Task.WhenAny(completion.Task,Task.Delay(1500));
   Dictionary<string,object> decision=completed==completion.Task?completion.Task.Result:new Dictionary<string,object>();
   if(Flag(decision,"block"))Respond(e,new Dictionary<string,object>{{"status",403},{"body","Blocked by D&F filters."}});
   else if(QaMode&&Get(decision,"status")!=null)Respond(e,decision);
   else if(fixture!=null)Respond(e,fixture);
  }catch{}finally{Requests.Remove(id);try{deferral.Complete();}catch{}}
 }
 static Tab Find(Dictionary<string,object> p){Tab tab;if(!Tabs.TryGetValue(Text(p,"tabId"),out tab))throw new InvalidOperationException("The Edge browser tab is closed or not initialized.");return tab;}
 static async Task<object> Dispatch(string method,Dictionary<string,object> p){
  if(method=="init")return await Initialize(p);
  if(method=="create"){Tab created=await Create(Text(p,"tabId"));return new{id=created.Id,url=created.Core.Source,version=Environment.BrowserVersionString};}
  if(method=="shutdown"){Dispatcher.BeginInvoke(new Action(Shutdown));return true;}
  if(method=="resource-decision"){TaskCompletionSource<Dictionary<string,object>> pending;if(Requests.TryGetValue(Text(p,"requestId"),out pending))pending.TrySetResult(p);return true;}
  if(method=="set-fixtures"){
   if(!QaMode)throw new InvalidOperationException("Browser fixtures are available only in an isolated QA profile.");
   Fixtures.Clear();IEnumerable rows=Get(p,"routes")as IEnumerable;
   if(rows!=null)foreach(object row in rows){if(Fixtures.Count>=200)throw new InvalidOperationException("Too many browser fixtures.");Fixtures.Add(Obj(row));}
   BlockUnmatched=Flag(p,"blockUnmatched");return true;
  }
  if(method=="download-choice"){TaskCompletionSource<string> choice;if(DownloadChoices.TryGetValue(Text(p,"downloadId"),out choice))choice.TrySetResult(Flag(p,"canceled")?null:Text(p,"filePath"));return true;}
  if(method=="configure-downloads"){DownloadDirectory=Text(p,"directory");return true;}
  if(method=="clear-data"){
   Dictionary<string,object> options=Obj(Get(p,"options"));Tab service=await Create("__service");
   CoreWebView2BrowsingDataKinds kinds=(CoreWebView2BrowsingDataKinds)0;
   if(Flag(options,"cache"))kinds|=CoreWebView2BrowsingDataKinds.DiskCache;
   if(Flag(options,"cookies"))kinds|=CoreWebView2BrowsingDataKinds.Cookies;
   if(Flag(options,"storage"))kinds|=CoreWebView2BrowsingDataKinds.AllDomStorage;
   if(kinds!=0)await service.Core.Profile.ClearBrowsingDataAsync(kinds);return true;
  }
  if(method=="parent-foreground")return ParentWindow!=IntPtr.Zero&&GetForegroundWindow()==ParentWindow;
  if(method=="return-parent-focus"){
   bool foreground=ParentWindow!=IntPtr.Zero&&GetForegroundWindow()==ParentWindow;
   if(!foreground)return new{foreground=false,insideBrowser=false,moved=false};
   IntPtr focused=GetFocus();bool inside=focused!=IntPtr.Zero&&Tabs.Values.Any(t=>t.HostWindow==focused||IsChild(t.HostWindow,focused));
   if(inside)SetFocus(ParentWindow);
   return new{foreground=true,insideBrowser=inside,moved=inside&&GetFocus()!=focused};
  }
  Tab tab=Find(p);
  if(method=="navigate"){string url=Text(p,"url");if(!AllowedNavigation(url))throw new InvalidOperationException("Enter an HTTP or HTTPS address.");tab.Core.Navigate(url);return true;}
  if(method=="position"){
   double scale=1;try{scale=GetDpiForWindow(ParentWindow)/96.0;if(scale<=0)scale=1;}catch{}
   int x=(int)Math.Round(Number(p,"x")*scale),y=(int)Math.Round(Number(p,"y")*scale),width=Math.Max(1,(int)Math.Round(Number(p,"width",1)*scale)),height=Math.Max(1,(int)Math.Round(Number(p,"height",1)*scale));
   bool visible=Flag(p,"visible"),geometryChanged=!tab.PlacedBounds.HasValue||tab.PlacedBounds.Value!=new Rectangle(x,y,width,height),visibilityChanged=tab.SurfaceVisible!=visible;
   bool sizeChanged=!tab.PlacedBounds.HasValue||tab.PlacedBounds.Value.Size!=new Size(width,height);
   if(!geometryChanged&&!visibilityChanged){if(Flag(p,"notifyParentMoved"))tab.Controller.NotifyParentWindowPositionChanged();return true;}
   if(visibilityChanged&&!visible)tab.Controller.IsVisible=false;
   uint flags=0x0010u|((visibilityChanged&&visible)?0u:0x0004u)|(visibilityChanged?(visible?0x0040u:0x0080u):0u);
   if(!SetWindowPos(tab.HostWindow,IntPtr.Zero,x,y,width,height,flags))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"The Edge browser surface could not be positioned.");
   if(sizeChanged){tab.Controller.Bounds=new Rectangle(0,0,width,height);tab.SizeChanges++;}
   if(visibilityChanged){tab.Controller.IsVisible=visible;tab.VisibilityChanges++;}
   tab.PlacedBounds=new Rectangle(x,y,width,height);tab.SurfaceVisible=visible;tab.PlacementChanges++;tab.Controller.NotifyParentWindowPositionChanged();return true;
  }
  if(method=="surface-state"){if(!QaMode)throw new InvalidOperationException("Browser surface inspection requires an isolated QA profile.");return new{hostWindow=tab.HostWindow.ToInt64().ToString(),parentWindow=GetParent(tab.HostWindow).ToInt64().ToString(),controllerParent=tab.Controller.ParentWindow.ToInt64().ToString(),visible=IsWindowVisible(tab.HostWindow),controllerVisible=tab.Controller.IsVisible,placementChanges=tab.PlacementChanges,sizeChanges=tab.SizeChanges,visibilityChanges=tab.VisibilityChanges,x=tab.Controller.Bounds.X,y=tab.Controller.Bounds.Y,width=tab.Controller.Bounds.Width,height=tab.Controller.Bounds.Height};}
  if(method=="focus"){tab.Controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);return true;}
  if(method=="goBack"){if(tab.Core.CanGoBack)tab.Core.GoBack();return true;}
  if(method=="goForward"){if(tab.Core.CanGoForward)tab.Core.GoForward();return true;}
  if(method=="reload"){tab.Core.Reload();return true;}
  if(method=="stop"){tab.Core.Stop();return true;}
  if(method=="close"){Tabs.Remove(tab.Id);CloseTab(tab);return true;}
  if(method=="post-message"){tab.Core.PostWebMessageAsJson(Encode(Get(p,"message")));return true;}
  if(method=="cdp"){string result=await tab.Core.CallDevToolsProtocolMethodAsync(Text(p,"method"),Encode(Get(p,"args",new Dictionary<string,object>())));return Json().DeserializeObject(result);}
  throw new InvalidOperationException("Unknown Edge browser operation.");
 }
 static void CloseTab(Tab tab){try{tab.Controller.Close();}finally{if(tab.HostWindow!=IntPtr.Zero){DestroyWindow(tab.HostWindow);tab.HostWindow=IntPtr.Zero;}}}
 static void Shutdown(){
  if(Closing)return;Closing=true;LifetimeTimer.Stop();
  foreach(TaskCompletionSource<Dictionary<string,object>> pending in Requests.Values.ToArray())pending.TrySetResult(new Dictionary<string,object>());
  foreach(var choice in DownloadChoices.Values.ToArray())choice.TrySetResult(null);DownloadChoices.Clear();
  Requests.Clear();foreach(Tab tab in Tabs.Values.ToArray()){try{CloseTab(tab);}catch{}}
  Tabs.Clear();Environment=null;Application.ExitThread();
 }
}
}
