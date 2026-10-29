// Native CEF host for FileFapper's embedded browser.
using System;
using System.Collections.Generic;
using System.Collections;
using System.Collections.Concurrent;
using System.Linq;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using CefSharp;
using CefSharp.Callback;
using CefSharp.Handler;
using CefSharp.WinForms;

namespace DandF.CefHost {
sealed class DevToolsObserver : IDevToolsMessageObserver {
 readonly ConcurrentDictionary<int,TaskCompletionSource<object>> pending=new ConcurrentDictionary<int,TaskCompletionSource<object>>();
 readonly Action<string,object> eventHandler;
 public DevToolsObserver(Action<string,object> eventHandler){this.eventHandler=eventHandler;}
 static object Decode(Stream stream){using(var reader=new StreamReader(stream,Encoding.UTF8,false,4096,true)){var json=reader.ReadToEnd();return String.IsNullOrEmpty(json)?new Dictionary<string,object>():Program.Json().DeserializeObject(json);}}
 public Task<object> Execute(IBrowser browser,string method,string parameters){
  var completion=new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
  Cef.UIThreadTaskFactory.StartNew(()=>{int id=0;try{var host=browser.GetHost();id=host.GetNextDevToolsMessageId();pending[id]=completion;if(host.ExecuteDevToolsMethod(id,method,parameters)==0)throw new InvalidOperationException("CEF did not accept the browser command.");}catch(Exception e){TaskCompletionSource<object> item;if(id!=0)pending.TryRemove(id,out item);completion.TrySetException(e);}});
  return completion.Task;
 }
 public bool OnDevToolsMessage(IBrowser browser,Stream message){return false;}
 public void OnDevToolsMethodResult(IBrowser browser,int id,bool success,Stream result){TaskCompletionSource<object> item;if(!pending.TryRemove(id,out item))return;try{object data=Decode(result);if(success)item.TrySetResult(data);else item.TrySetException(new InvalidOperationException(Program.Encode(data)));}catch(Exception e){item.TrySetException(e);}}
 public void OnDevToolsEvent(IBrowser browser,string method,Stream parameters){try{eventHandler?.Invoke(method,Decode(parameters));}catch{}}
 public void OnDevToolsAgentAttached(IBrowser browser){}
 public void OnDevToolsAgentDetached(IBrowser browser){foreach(var entry in pending){TaskCompletionSource<object> item;if(pending.TryRemove(entry.Key,out item))item.TrySetException(new InvalidOperationException("CEF developer tools disconnected."));}}
 public void Dispose(){OnDevToolsAgentDetached(null);}
}
sealed class Tab {
 public string Id,PendingUrl,LastAddress="about:blank";public ChromiumWebBrowser Browser;public DevToolsObserver Observer;public IDisposable Registration;public int Navigation;
 public Rectangle? Bounds;public bool SurfaceVisible;public int PlacementChanges,SizeChanges,VisibilityChanges;
 public readonly TaskCompletionSource<bool> NativeClosed=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
 public readonly TaskCompletionSource<bool> NativeClosing=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
 public readonly ConcurrentDictionary<int,Dictionary<string,object>> Contexts=new ConcurrentDictionary<int,Dictionary<string,object>>();
}
sealed class NavigationHandler : RequestHandler {
 readonly Tab tab;public NavigationHandler(Tab tab){this.tab=tab;}
 protected override bool OnBeforeBrowse(IWebBrowser chromiumWebBrowser,IBrowser browser,IFrame frame,IRequest request,bool userGesture,bool isRedirect){
  if(!Program.AllowedTab(tab,request.Url)){Program.Event("navigation-blocked",tab,new{url=request.Url});return true;}
  if(frame.IsMain){tab.PendingUrl=request.Url;var navigation=Interlocked.Increment(ref tab.Navigation);Program.Event("navigation-starting",tab,new{url=request.Url,navigationId=navigation.ToString(),redirected=isRedirect});}
  return false;
 }
 protected override void OnRenderProcessTerminated(IWebBrowser chromiumWebBrowser,IBrowser browser,CefTerminationStatus status,int errorCode,string errorMessage){Program.Event("process-gone",tab,new{kind=status.ToString(),reason=errorMessage??"Browser process stopped."});}
}
sealed class PopupHandler : LifeSpanHandler {
 readonly Tab tab;public PopupHandler(Tab tab){this.tab=tab;}
 // We own the containing window and close the native child on CEF's UI thread.
 protected override bool DoClose(IWebBrowser chromiumWebBrowser,IBrowser browser){tab.NativeClosing.TrySetResult(true);return true;}
 protected override void OnBeforeClose(IWebBrowser chromiumWebBrowser,IBrowser browser){tab.NativeClosed.TrySetResult(true);}
 protected override bool OnBeforePopup(IWebBrowser chromiumWebBrowser,IBrowser browser,IFrame frame,string targetUrl,string targetFrameName,WindowOpenDisposition targetDisposition,bool userGesture,IPopupFeatures popupFeatures,IWindowInfo windowInfo,IBrowserSettings browserSettings,ref bool noJavascriptAccess,out IWebBrowser newBrowser){
  newBrowser=null;if(Program.Allowed(targetUrl)&&targetUrl!="about:blank")Program.Event("new-window",tab,new{url=targetUrl,disposition=userGesture?"foreground-tab":"new-window",userInitiated=userGesture});return true;
 }
}
sealed class DownloadHandler : CefSharp.Handler.DownloadHandler {
 readonly Tab tab;public DownloadHandler(Tab tab){this.tab=tab;}
 protected override bool CanDownload(IWebBrowser chromiumWebBrowser,IBrowser browser,string url,string requestMethod){return tab.Id!="__service"&&Program.AllowedDownload(url,tab.Browser.Address);}
 protected override bool OnBeforeDownload(IWebBrowser chromiumWebBrowser,IBrowser browser,DownloadItem item,IBeforeDownloadCallback callback){
  string filename=Path.GetFileName(item.SuggestedFileName??"");
  if(!Regex.IsMatch(filename,@"\.(png|jpe?g|gif|webp|avif|bmp|mp4|webm|mkv|mov|m4v|avi|ogv|mp3|wav|ogg|opus|m4a|flac|aac|zip|cbz|cbr|7z|rar|tar|gz|bz2|xz|pdf|psd|clip|txt)$",RegexOptions.IgnoreCase)){callback.Dispose();Program.Event("download-blocked",tab,new{message="Queue the gallery URL to manage its files in FileFapper."});return true;}
  Program.RequestDownload(tab,item.Url,filename,callback);return true;
 }
 protected override void OnDownloadUpdated(IWebBrowser chromiumWebBrowser,IBrowser browser,DownloadItem item,IDownloadItemCallback callback){
  if(item.IsComplete||item.IsCancelled)Program.Event("download-completed",tab,new{fileName=Path.GetFileName(item.FullPath??""),state=item.IsComplete?"Completed":"Canceled"});
 }
}
sealed class MenuHandler : ContextMenuHandler {
 readonly Tab tab;public MenuHandler(Tab tab){this.tab=tab;}
 static CefMenuCommand Id(int offset){return (CefMenuCommand)((int)CefMenuCommand.UserFirst+offset);}
 protected override void OnBeforeContextMenu(IWebBrowser chromiumWebBrowser,IBrowser browser,IFrame frame,IContextMenuParams parameters,IMenuModel model){
  model.AddSeparator();model.AddItem(Id(1),"Translate page");var sort=model.AddSubMenu(Id(2),"Sort tabs");sort.AddItem(Id(3),"A-Z");sort.AddItem(Id(4),"Domain");sort.AddItem(Id(5),"Date accessed");model.AddItem(Id(6),"Close tabs to the left");model.AddItem(Id(7),"Close tabs to the right");
 }
 protected override bool OnContextMenuCommand(IWebBrowser chromiumWebBrowser,IBrowser browser,IFrame frame,IContextMenuParams parameters,CefMenuCommand commandId,CefEventFlags eventFlags){
  if(commandId==Id(1)){Program.Event("request-translate",tab,new{url=tab.Browser.Address});return true;}
  string action=commandId==Id(3)?"sort-title":commandId==Id(4)?"sort-domain":commandId==Id(5)?"sort-accessed":commandId==Id(6)?"close-left":commandId==Id(7)?"close-right":null;
  if(action==null)return false;Program.Event("tab-command",tab,new{action});return true;
 }
}
sealed class ShortcutHandler : KeyboardHandler {
 readonly Tab tab;public ShortcutHandler(Tab tab){this.tab=tab;}
 protected override bool OnPreKeyEvent(IWebBrowser chromiumWebBrowser,IBrowser browser,KeyType type,int windowsKeyCode,int nativeKeyCode,CefEventFlags modifiers,bool isSystemKey,ref bool isKeyboardShortcut){
  if((modifiers&CefEventFlags.ControlDown)==0||type!=KeyType.RawKeyDown)return false;
  string key=windowsKeyCode==9?"tab":((char)windowsKeyCode).ToString().ToLowerInvariant();
  if(key!="t"&&key!="w"&&key!="l"&&key!="tab")return false;
  Program.Event("accelerator",tab,new{key,control=true,shift=(modifiers&CefEventFlags.ShiftDown)!=0});return true;
 }
}
static class Program {
 static readonly object OutputLock=new object();static readonly Dictionary<string,Tab> Tabs=new Dictionary<string,Tab>();
 static readonly HashSet<Task> CreatingTabs=new HashSet<Task>(),ClosingTabs=new HashSet<Task>();
 static readonly ConcurrentDictionary<string,TaskCompletionSource<Dictionary<string,object>>> Requests=new ConcurrentDictionary<string,TaskCompletionSource<Dictionary<string,object>>>();
 static readonly ConcurrentDictionary<string,IBeforeDownloadCallback> Downloads=new ConcurrentDictionary<string,IBeforeDownloadCallback>();
 static readonly HashSet<string> Origins=new HashSet<string>(StringComparer.OrdinalIgnoreCase);static string OriginFile;static bool OriginSavePending;
 static readonly List<Dictionary<string,object>> Fixtures=new List<Dictionary<string,object>>();static bool QaMode,BlockUnmatched;
 static Control Dispatcher;static IntPtr Parent;static bool Initialized,Closing;static System.Windows.Forms.Timer Timer;
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr GetFocus();
 [DllImport("user32.dll")]static extern IntPtr SetFocus(IntPtr window);
 [DllImport("user32.dll")]static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")]static extern IntPtr GetParent(IntPtr child);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
 [StructLayout(LayoutKind.Sequential)]struct RECT{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr window,out RECT rect);
 [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetParent(IntPtr child,IntPtr parent);
 [DllImport("user32.dll",SetLastError=true)]static extern bool DestroyWindow(IntPtr window);
 [DllImport("user32.dll",SetLastError=true)]static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")]static extern uint GetDpiForWindow(IntPtr window);
 internal static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=134217728,RecursionLimit=512};}
 internal static string Encode(object value){return Json().Serialize(value);}
 static Dictionary<string,object> Obj(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
 static object Get(Dictionary<string,object> p,string key,object fallback=null){object value;return p.TryGetValue(key,out value)?value:fallback;}
 static string Text(Dictionary<string,object> p,string key,string fallback=""){object v=Get(p,key);return v==null?fallback:Convert.ToString(v);}
 static int Number(Dictionary<string,object> p,string key,int fallback=0){try{return Convert.ToInt32(Get(p,key,fallback));}catch{return fallback;}}
 static bool Flag(Dictionary<string,object> p,string key){object v=Get(p,key);return v is bool&&(bool)v;}
 static void Send(object v){lock(OutputLock){Console.Out.WriteLine(Encode(v));Console.Out.Flush();}}
 internal static void Event(string name,Tab t,object data){if(!Closing)Send(new{@event=name,tabId=t.Id,@params=data});}
 [STAThread]static void Main(){
  Console.OutputEncoding=new UTF8Encoding(false);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  Dispatcher=new Control();var unused=Dispatcher.Handle;SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
  Timer=new System.Windows.Forms.Timer{Interval=1000};Timer.Tick+=(s,e)=>{if(Parent!=IntPtr.Zero&&!IsWindow(Parent))Shutdown();};Timer.Start();
  new Thread(ReadCommands){IsBackground=true,Name="FileFapper CEF command reader"}.Start();Application.Run();Dispatcher.Dispose();
 }
 static void ReadCommands(){try{using(var reader=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false))){string line;while((line=reader.ReadLine())!=null){
  if(line.Length>134217728)continue;Dictionary<string,object> request;try{request=Obj(Json().DeserializeObject(line));}catch{continue;}
  Dispatcher.BeginInvoke(new Action(async()=>{var id=Get(request,"id");try{var result=await Dispatch(Text(request,"method"),Obj(Get(request,"params")));Send(new{id,result});}catch(Exception e){Send(new{id,error=new{message=e.Message}});}}));
 }}}catch{}finally{try{Dispatcher.BeginInvoke(new Action(Shutdown));}catch{}}}
 internal static bool Allowed(string value){Uri u;return value=="about:blank"||(Uri.TryCreate(value,UriKind.Absolute,out u)&&(u.Scheme=="http"||u.Scheme=="https")&&String.IsNullOrEmpty(u.UserInfo));}
 static bool SameDocument(string left,string right){Uri a,b;if(!Uri.TryCreate(left,UriKind.Absolute,out a)||!Uri.TryCreate(right,UriKind.Absolute,out b))return String.Equals(left,right,StringComparison.Ordinal);return Uri.Compare(a,b,UriComponents.SchemeAndServer|UriComponents.PathAndQuery,UriFormat.SafeUnescaped,StringComparison.OrdinalIgnoreCase)==0;}
 internal static bool AllowedDownload(string url,string source){Uri blob,page;if(Allowed(url)&&url!="about:blank")return true;return url!=null&&url.StartsWith("blob:",StringComparison.OrdinalIgnoreCase)&&Uri.TryCreate(url.Substring(5),UriKind.Absolute,out blob)&&Uri.TryCreate(source,UriKind.Absolute,out page)&&Allowed(page.AbsoluteUri)&&blob.GetLeftPart(UriPartial.Authority)==page.GetLeftPart(UriPartial.Authority);}
 internal static bool AllowedTab(Tab tab,string url){return Allowed(url)||(QaMode&&tab.Id=="__credits"&&(url=="chrome://credits"||url=="chrome://credits/"));}
 static void RecordOrigin(string url){Uri uri;if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||(uri.Scheme!="http"&&uri.Scheme!="https")||!String.IsNullOrEmpty(uri.UserInfo))return;string origin=uri.GetLeftPart(UriPartial.Authority);
  lock(Origins){if(Origins.Count>=50000||!Origins.Add(origin)||OriginSavePending)return;OriginSavePending=true;}
  Task.Run(async()=>{await Task.Delay(1000);SaveOrigins();});
 }
 static void SaveOrigins(){lock(Origins){try{if(OriginFile!=null){string tmp=OriginFile+".tmp";File.WriteAllText(tmp,Encode(Origins.ToArray()),new UTF8Encoding(false));if(File.Exists(OriginFile))File.Replace(tmp,OriginFile,null);else File.Move(tmp,OriginFile);}}catch{}finally{OriginSavePending=false;}}}
 static bool Pixiv(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.IsDefaultPort&&String.IsNullOrEmpty(uri.UserInfo)&&(uri.Host=="pixiv.net"||uri.Host=="www.pixiv.net");}
 static bool PixivMedia(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="https"&&uri.IsDefaultPort&&String.IsNullOrEmpty(uri.UserInfo)&&(uri.Host=="i.pximg.net"||uri.Host=="i-cf.pximg.net");}
 static Dictionary<string,object> Fixture(string url,string method){
  if(!QaMode)return null;Uri uri;if(!Uri.TryCreate(url,UriKind.Absolute,out uri))return null;
  lock(Fixtures)foreach(var row in Fixtures){string host=Text(row,"hostname","*"),exact=Text(row,"url"),route=Text(row,"path"),verb=Text(row,"method");
   if(host!="*"&&!String.Equals(host,uri.Host,StringComparison.OrdinalIgnoreCase)||exact.Length>0&&exact!=url||route.Length>0&&route!=uri.AbsolutePath||verb.Length>0&&!String.Equals(verb,method,StringComparison.OrdinalIgnoreCase))continue;return row;}
  return null;
 }
 internal static async void RequestDownload(Tab tab,string url,string filename,IBeforeDownloadCallback callback){
  string id=Guid.NewGuid().ToString("N");Downloads[id]=callback;Event("download-requested",tab,new{downloadId=id,url,suggestedFileName=filename});
  await Task.Delay(120000);IBeforeDownloadCallback pending;if(Downloads.TryRemove(id,out pending))pending.Dispose();
 }
 static async void DevToolsEvent(Tab tab,string method,object data){
  if(method=="Runtime.executionContextsCleared"){tab.Contexts.Clear();return;}
  if(method=="Runtime.executionContextDestroyed"){Dictionary<string,object> ignored;tab.Contexts.TryRemove(Number(Obj(data),"executionContextId"),out ignored);return;}
  if(method=="Runtime.executionContextCreated"){var context=Obj(Get(Obj(data),"context"));var aux=Obj(Get(context,"auxData"));if(Flag(aux,"isDefault"))tab.Contexts[Number(context,"id")]=new Dictionary<string,object>{{"frameId",Text(aux,"frameId")},{"origin",Text(context,"origin")}};return;}
  if(method=="Runtime.bindingCalled"){
   try{var binding=Obj(data);if(Text(binding,"name")!="__filefapperNativeSend")return;Dictionary<string,object> context;if(!tab.Contexts.TryGetValue(Number(binding,"executionContextId"),out context))return;
    string source=Text(context,"origin"),current=tab.Browser.Address,raw=Text(binding,"payload");if(!Pixiv(source)||!Pixiv(current)||new Uri(source).GetLeftPart(UriPartial.Authority)!=new Uri(current).GetLeftPart(UriPartial.Authority)||raw.Length>65536)return;
    int navigation=tab.Navigation;var frameTree=Obj(await tab.Observer.Execute(tab.Browser.GetBrowser(),"Page.getFrameTree","{}"));string mainId=Text(Obj(Get(Obj(Get(frameTree,"frameTree")),"frame")),"id");
    if(navigation!=tab.Navigation||mainId!=Text(context,"frameId")||!Pixiv(tab.Browser.Address))return;var message=Obj(Json().DeserializeObject(raw));string messageId=Text(message,"id");
    if(Text(message,"kind")!="df-pixiv-fetch"||Text(message,"method","GET")!="GET"||!PixivMedia(Text(message,"url"))||messageId.Length==0||messageId.Length>200)return;
    Event("web-message",tab,new{source,message,navigationId=navigation.ToString()});
   }catch{}return;
  }
  if(method!="Fetch.requestPaused"||Closing)return;
  var p=Obj(data);string nativeId=Text(p,"requestId");var request=Obj(Get(p,"request"));if(String.IsNullOrEmpty(nativeId))return;string url=Text(request,"url"),verb=Text(request,"method");RecordOrigin(url);var fixture=Fixture(url,verb);
  string id=Guid.NewGuid().ToString("N");var response=new TaskCompletionSource<Dictionary<string,object>>(TaskCreationOptions.RunContinuationsAsynchronously);Requests[id]=response;
  try{
   Event("resource-request",tab,new{requestId=id,url,method=verb,type=Text(p,"resourceType"),source=tab.Browser.Address});
   var completed=await Task.WhenAny(response.Task,Task.Delay(1500));var decision=completed==response.Task?response.Task.Result:new Dictionary<string,object>();
   if(Flag(decision,"block")||(QaMode&&BlockUnmatched&&fixture==null&&Allowed(url)))await tab.Observer.Execute(tab.Browser.GetBrowser(),"Fetch.failRequest",Encode(new{requestId=nativeId,errorReason="BlockedByClient"}));
   else if(QaMode&&(fixture!=null||Get(decision,"status")!=null)){
    var reply=Get(decision,"status")!=null?decision:fixture;string body=Text(reply,"bodyBase64");if(body.Length==0)body=Convert.ToBase64String(Encoding.UTF8.GetBytes(Text(reply,"body")));if(body.Length>134217728)throw new InvalidOperationException("Fixture response is too large.");
    var headers=new List<object>();foreach(var entry in Obj(Get(reply,"headers"))){if(!Regex.IsMatch(entry.Key,@"^[A-Za-z0-9!#$%&'*+.^_|~-]+$"))continue;IEnumerable values=entry.Value is string?new object[]{entry.Value}:entry.Value as IEnumerable??new object[]{entry.Value};foreach(var value in values){string v=Convert.ToString(value);if(!v.Contains("\r")&&!v.Contains("\n"))headers.Add(new{name=entry.Key,value=v});}}
    await tab.Observer.Execute(tab.Browser.GetBrowser(),"Fetch.fulfillRequest",Encode(new{requestId=nativeId,responseCode=Math.Max(100,Math.Min(599,Number(reply,"status",200))),responseHeaders=headers,body}));
   }else if(PixivMedia(url)){
    var headers=new List<object>();foreach(var entry in Obj(Get(request,"headers"))){string value=Convert.ToString(entry.Value);if(entry.Key.Equals("Referer",StringComparison.OrdinalIgnoreCase)||value.Contains("\r")||value.Contains("\n"))continue;headers.Add(new{name=entry.Key,value});}headers.Add(new{name="Referer",value="https://www.pixiv.net/"});
    await tab.Observer.Execute(tab.Browser.GetBrowser(),"Fetch.continueRequest",Encode(new{requestId=nativeId,headers}));
   }else await tab.Observer.Execute(tab.Browser.GetBrowser(),"Fetch.continueRequest",Encode(new{requestId=nativeId}));
  }catch{try{await tab.Observer.Execute(tab.Browser.GetBrowser(),"Fetch.failRequest",Encode(new{requestId=nativeId,errorReason="Failed"}));}catch{}}finally{TaskCompletionSource<Dictionary<string,object>> ignored;Requests.TryRemove(id,out ignored);}
 }
 static async Task<Tab> Create(string id){
  Tab old;if(Tabs.TryGetValue(id,out old))return old;if(!Initialized)throw new InvalidOperationException("CEF has not been initialized.");
  if(String.IsNullOrWhiteSpace(id)||id.Length>100)throw new InvalidOperationException("Invalid tab ID.");
  var t=new Tab{Id=id};var ready=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
  var browser=new ChromiumWebBrowser("about:blank"){Dock=DockStyle.None,Size=new Size(1,1),Visible=false};t.Browser=browser;browser.RequestHandler=new NavigationHandler(t);browser.LifeSpanHandler=new PopupHandler(t);browser.DownloadHandler=new DownloadHandler(t);browser.MenuHandler=new MenuHandler(t);browser.KeyboardHandler=new ShortcutHandler(t);
  browser.IsBrowserInitializedChanged+=(s,e)=>{if(browser.IsBrowserInitialized)ready.TrySetResult(true);};
  browser.AddressChanged+=(s,e)=>{bool inPage=SameDocument(t.LastAddress,e.Address)&&!String.Equals(t.LastAddress,e.Address,StringComparison.Ordinal);t.LastAddress=e.Address;Event("source-changed",t,new{url=e.Address,isNewDocument=!inPage});};
  browser.TitleChanged+=(s,e)=>Event("title-changed",t,new{title=e.Title});
  browser.LoadingStateChanged+=(s,e)=>Event("history-changed",t,new{canBack=e.CanGoBack,canForward=e.CanGoForward});
  browser.FrameLoadEnd+=(s,e)=>{if(e.Frame.IsMain&&SameDocument(e.Url,t.PendingUrl)&&SameDocument(e.Url,browser.Address)){Event("dom-ready",t,new{navigationId=t.Navigation.ToString()});Event("navigation-completed",t,new{url=browser.Address,httpStatus=e.HttpStatusCode,success=true,navigationId=t.Navigation.ToString()});}};
  browser.LoadError+=(s,e)=>{if(e.Frame.IsMain&&e.ErrorCode!=CefErrorCode.Aborted&&SameDocument(e.FailedUrl,t.PendingUrl))Event("navigation-completed",t,new{url=e.FailedUrl,errorCode=(int)e.ErrorCode,error=e.ErrorText,success=false,navigationId=t.Navigation.ToString()});};
  var h=browser.Handle;SetParent(h,Parent);browser.CreateControl();
  if(await Task.WhenAny(ready.Task,Task.Delay(30000))!=ready.Task){browser.Dispose();throw new TimeoutException("CEF tab creation timed out.");}
  t.Observer=new DevToolsObserver((method,data)=>DevToolsEvent(t,method,data));t.Registration=await Cef.UIThreadTaskFactory.StartNew(()=>browser.GetBrowser().GetHost().AddDevToolsMessageObserver(t.Observer));Tabs.Add(id,t);
  await t.Observer.Execute(browser.GetBrowser(),"Fetch.enable",Encode(new{patterns=new[]{new{urlPattern="*",requestStage="Request"}}}));return t;
 }
 static async Task<Tab> CreateTracked(string id){
  if(Closing)throw new InvalidOperationException("The browser is closing.");
  var creation=Create(id);CreatingTabs.Add(creation);
  try{return await creation;}finally{CreatingTabs.Remove(creation);}
 }
 static async Task<object> Dispatch(string method,Dictionary<string,object> p){
  if(method=="init"){
   long h;if(!Int64.TryParse(Text(p,"parentWindow"),out h)||h==0||!IsWindow(new IntPtr(h)))throw new InvalidOperationException("The parent window is unavailable.");
   string folder=Text(p,"userDataDir");if(!Path.IsPathRooted(folder))throw new InvalidOperationException("A separate browser profile directory is required.");
   Parent=new IntPtr(h);QaMode=Flag(p,"qaMode");Directory.CreateDirectory(folder);OriginFile=Path.Combine(folder,"filefapper-origins.json");try{var rows=Json().Deserialize<string[]>(File.ReadAllText(OriginFile));lock(Origins)foreach(string row in rows)if(Allowed(row))Origins.Add(row);}catch{}var settings=new CefSettings{RootCachePath=folder,CachePath=Path.Combine(folder,"Profile"),PersistSessionCookies=true};
   if(!Cef.Initialize(settings,performDependencyCheck:true,browserProcessHandler:null))throw new InvalidOperationException("CEF could not initialize the browser profile.");
   Initialized=true;return new{engine="Chromium Embedded Framework",version=Cef.ChromiumVersion};
  }
  if(method=="shutdown"){Dispatcher.BeginInvoke(new Action(Shutdown));return true;}
  if(method=="resource-decision"){TaskCompletionSource<Dictionary<string,object>> request;if(Requests.TryGetValue(Text(p,"requestId"),out request))request.TrySetResult(p);return true;}
  if(method=="set-fixtures"){
   if(!QaMode)throw new InvalidOperationException("Browser fixtures require an isolated test profile.");
   lock(Fixtures){Fixtures.Clear();var rows=Get(p,"routes") as IEnumerable;if(rows!=null)foreach(var row in rows){if(Fixtures.Count>=200)throw new InvalidOperationException("Too many browser fixtures.");Fixtures.Add(Obj(row));}BlockUnmatched=Flag(p,"blockUnmatched");}return true;
  }
  if(method=="configure-downloads")return true;
  if(method=="clear-data"){
   var options=Obj(Get(p,"options"));Tab service=await CreateTracked("__service");
   if(Flag(options,"cookies"))await service.Observer.Execute(service.Browser.GetBrowser(),"Network.clearBrowserCookies","{}");
   if(Flag(options,"cache"))await service.Observer.Execute(service.Browser.GetBrowser(),"Network.clearBrowserCache","{}");
   if(Flag(options,"storage")){
    string[] origins;lock(Origins)origins=Origins.ToArray();
    foreach(string origin in origins)await service.Observer.Execute(service.Browser.GetBrowser(),"Storage.clearDataForOrigin",Encode(new{origin,storageTypes="file_systems,indexeddb,local_storage,shader_cache,websql,service_workers,cache_storage,storage_buckets,other"}));
    foreach(var view in Tabs.Values.ToArray()){Uri uri;if(Uri.TryCreate(view.Browser.Address,UriKind.Absolute,out uri)&&(uri.Scheme=="http"||uri.Scheme=="https"))try{await view.Observer.Execute(view.Browser.GetBrowser(),"DOMStorage.clear",Encode(new{storageId=new{securityOrigin=uri.GetLeftPart(UriPartial.Authority),isLocalStorage=false}}));}catch{}}
   }return true;
  }
  if(method=="parent-foreground")return Parent!=IntPtr.Zero&&GetForegroundWindow()==Parent;
  if(method=="return-parent-focus"){
   bool foreground=Parent!=IntPtr.Zero&&GetForegroundWindow()==Parent;if(!foreground)return new{foreground=false,insideBrowser=false,moved=false};
   IntPtr focus=GetFocus();bool inside=false;foreach(var view in Tabs.Values)if(focus!=IntPtr.Zero&&(view.Browser.Handle==focus||IsChild(view.Browser.Handle,focus))){inside=true;break;}
   if(inside)SetFocus(Parent);return new{foreground=true,insideBrowser=inside,moved=inside&&GetFocus()!=focus};
  }
  if(method=="download-choice"){
   IBeforeDownloadCallback callback;if(Downloads.TryRemove(Text(p,"downloadId"),out callback)){
    string file=Text(p,"filePath");if(!Flag(p,"canceled")&&Path.IsPathRooted(file)){await Cef.UIThreadTaskFactory.StartNew(()=>{try{callback.Continue(file,false);}finally{callback.Dispose();}});}else callback.Dispose();
   }return true;
  }
  if(method=="create"){var created=await CreateTracked(Text(p,"tabId"));return new{id=created.Id,version=Cef.ChromiumVersion};}
  Tab t;if(!Tabs.TryGetValue(Text(p,"tabId"),out t))throw new InvalidOperationException("The browser tab is closed.");
  if(method=="navigate"){string url=Text(p,"url");if(!AllowedTab(t,url))throw new InvalidOperationException("Enter an HTTP or HTTPS address.");t.Browser.LoadUrl(url);return true;}
  if(method=="post-message"){
   if(!Pixiv(t.Browser.Address))throw new InvalidOperationException("The Pixiv media bridge is available only on Pixiv.");
   var message=Get(p,"message");string encoded=Encode(message);if(encoded.Length>2000000)throw new InvalidOperationException("The media bridge message is too large.");
   await t.Observer.Execute(t.Browser.GetBrowser(),"Runtime.evaluate",Encode(new{expression="window.__filefapperCefReceive?.("+encoded+")",returnByValue=true}));return true;
  }
  if(method=="position"){
   double scale=1;try{scale=GetDpiForWindow(Parent)/96.0;if(scale<=0)scale=1;}catch{}
   int x=(int)Math.Round(Number(p,"x")*scale),y=(int)Math.Round(Number(p,"y")*scale),w=Math.Max(1,(int)Math.Round(Number(p,"width",1)*scale)),h=Math.Max(1,(int)Math.Round(Number(p,"height",1)*scale));
   bool visible=Flag(p,"visible"),geometryChanged=!t.Bounds.HasValue||t.Bounds.Value!=new Rectangle(x,y,w,h),visibilityChanged=t.SurfaceVisible!=visible;
   bool sizeChanged=!t.Bounds.HasValue||t.Bounds.Value.Size!=new Size(w,h);if(!geometryChanged&&!visibilityChanged)return true;
   uint flags=0x10u|((visibilityChanged&&visible)?0u:0x4u)|(visibilityChanged?(visible?0x40u:0x80u):0u);
   if(!SetWindowPos(t.Browser.Handle,IntPtr.Zero,x,y,w,h,flags))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"The CEF browser surface could not be positioned.");
   if(sizeChanged)t.SizeChanges++;if(visibilityChanged)t.VisibilityChanges++;t.Bounds=new Rectangle(x,y,w,h);t.SurfaceVisible=visible;t.PlacementChanges++;return true;
  }
  if(method=="surface-state"){RECT rect;GetWindowRect(t.Browser.Handle,out rect);return new{hostWindow=t.Browser.Handle.ToInt64().ToString(),parentWindow=GetParent(t.Browser.Handle).ToInt64().ToString(),visible=IsWindowVisible(t.Browser.Handle),width=rect.Right-rect.Left,height=rect.Bottom-rect.Top,placementChanges=t.PlacementChanges,sizeChanges=t.SizeChanges,visibilityChanges=t.VisibilityChanges};}
  if(method=="cdp"){var command=Text(p,"method");var task=t.Observer.Execute(t.Browser.GetBrowser(),command,Encode(Get(p,"args",new Dictionary<string,object>())));if(await Task.WhenAny(task,Task.Delay(30000))!=task)throw new TimeoutException("CEF developer tools did not respond to "+command+".");return await task;}
  if(method=="goBack"){t.Browser.Back();return true;}if(method=="goForward"){t.Browser.Forward();return true;}if(method=="reload"){t.Browser.Reload();return true;}if(method=="stop"){t.Browser.Stop();return true;}if(method=="focus"){t.Browser.GetBrowser().GetHost().SetFocus(true);return true;}
  if(method=="close"){
   Tabs.Remove(t.Id);var closing=CloseTab(t);ClosingTabs.Add(closing);
   try{await closing;return true;}finally{ClosingTabs.Remove(closing);}
  }
  throw new InvalidOperationException("This CEF browser operation is not implemented yet.");
 }
 static async Task CloseTab(Tab t){
  t.Registration.Dispose();t.Observer.Dispose();t.Browser.Visible=false;
  var native=t.Browser.GetBrowser().GetHost();var nativeWindow=native.GetWindowHandle();
  await Cef.UIThreadTaskFactory.StartNew(()=>native.CloseBrowser(true));
  if(await Task.WhenAny(t.NativeClosing.Task,Task.Delay(5000))!=t.NativeClosing.Task)throw new TimeoutException("CEF native close did not start.");
  // CEF owns this window on its UI thread. Destroying the WinForms parent
  // first skips Chromium's WM_DESTROY and can crash its widget teardown.
  await Cef.UIThreadTaskFactory.StartNew(()=>{if(IsWindow(nativeWindow)&&!DestroyWindow(nativeWindow))throw new InvalidOperationException("CEF child window could not close.");});
  if(await Task.WhenAny(t.NativeClosed.Task,Task.Delay(5000))!=t.NativeClosed.Task)throw new TimeoutException("CEF native close did not complete.");
  t.Browser.Dispose();
 }
 static async void Shutdown(){
  if(Closing)return;Closing=true;Timer.Stop();SaveOrigins();foreach(var pending in Downloads.Values)try{pending.Dispose();}catch{}Downloads.Clear();
  foreach(var creating in CreatingTabs.ToArray())try{await creating;}catch{}
  var closing=ClosingTabs.ToList();var remaining=Tabs.Values.ToArray();Tabs.Clear();
  foreach(var t in remaining)closing.Add(CloseTab(t));
  foreach(var task in closing)try{await task;}catch{}
  if(Initialized)Cef.Shutdown();Application.ExitThread();
 }
}
}
