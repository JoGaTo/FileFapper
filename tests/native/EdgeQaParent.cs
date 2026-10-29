// QA-only foreign-process HWND for Edge browser integration tests.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace DandF.EdgeQa {
 internal static class Parent {
  static Form Window;
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  static readonly object OutputLock=new object();
  static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=1048576};}
  static void Send(object value){lock(OutputLock){Console.WriteLine(Json().Serialize(value));Console.Out.Flush();}}
  static Dictionary<string,object> Obj(object value){return value as Dictionary<string,object>??new Dictionary<string,object>();}
  static object Get(Dictionary<string,object> p,string key,object fallback=null){object value;return p.TryGetValue(key,out value)?value:fallback;}
  static string Text(Dictionary<string,object> p,string key,string fallback=""){object value=Get(p,key);return value==null?fallback:Convert.ToString(value);}
  static int Number(Dictionary<string,object> p,string key,int fallback){try{return Convert.ToInt32(Get(p,key,fallback));}catch{return fallback;}}
  static object State(){return new{parentWindow=Window.Handle.ToInt64().ToString(),pid=Process.GetCurrentProcess().Id,width=Window.ClientSize.Width,height=Window.ClientSize.Height,visible=Window.Visible};}
  [STAThread] static void Main(string[] args){
   try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
   Console.OutputEncoding=new UTF8Encoding(false);
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   Window=new Form{Text="D&F Edge integration test",ClientSize=new Size(1280,800),StartPosition=FormStartPosition.CenterScreen,BackColor=Color.White};
   Window.Shown+=delegate{
    Send(State());
    Thread reader=new Thread(Read){IsBackground=true,Name="D&F QA parent command reader"};reader.Start();
   };
   Application.Run(Window);
   Window.Dispose();
  }
  static void Read(){
   try{
    using(StreamReader input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false))){
     string line;
     while((line=input.ReadLine())!=null){
      Dictionary<string,object> command;
      try{command=Obj(Json().DeserializeObject(line));}
      catch{Send(new{id=(object)null,error=new{message="Invalid QA command JSON."}});continue;}
      Window.BeginInvoke(new Action(delegate{
       object id=Get(command,"id");
       try{
        string method=Text(command,"method",Text(command,"command"));
        Dictionary<string,object> p=Obj(Get(command,"params",command));
        if(method=="resize")Window.ClientSize=new Size(Math.Max(100,Number(p,"width",1280)),Math.Max(100,Number(p,"height",800)));
        else if(method=="show"){Window.Show();Window.Activate();}
        else if(method=="hide")Window.Hide();
        else if(method=="position")Window.Location=new Point(Number(p,"x",Window.Left),Number(p,"y",Window.Top));
        else if(method=="state"){}
        else if(method=="close"){Send(new{id=id,result=true});Window.Close();return;}
        else throw new InvalidOperationException("Unknown QA parent command.");
        Send(new{id=id,result=State()});
       }catch(Exception error){Send(new{id=id,error=new{message=error.Message}});}
      }));
     }
    }
   }catch{}
   finally{try{Window.BeginInvoke(new Action(delegate{Window.Close();}));}catch{}}
  }
 }
}
