"""Exercise the compiled reader against local, non-explicit image fixtures."""
import argparse,hashlib,http.server,io,json,pathlib,subprocess,threading
from PIL import Image

def run(worker,qa):
    qa.mkdir(parents=True,exist_ok=False)
    data=io.BytesIO();Image.new('RGB',(32,48),'#628d70').save(data,'PNG');png=data.getvalue()
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.endswith('.png'):body=png;kind='image/png'
            else:body=b'<h1>Compiled scoped reader</h1><article id="post-123"><div class="entry-content"><img src="/one.png"><img src="/two.png"></div></article><article id="post-999"><div class="entry-content"><img src="/decoy.png"></div></article>';kind='text/html'
            self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    summaries=[]
    try:
        for id,url,site,expected in [('local-sample','dfdemo://sample/fixture','demo',12),('added-reader',f'http://127.0.0.1:{server.server_port}/123/','rule34ai',2)]:
            req=dict(mode='download',id=id,url=url,siteId=site,downloadDir=str(qa/'downloads'),workers=2,delay=.01,quality='resampled')
            result=subprocess.run([str(worker)],input=json.dumps(req)+'\n',text=True,encoding='utf-8',capture_output=True,timeout=60)
            events=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
            assert result.returncode==0,(result.returncode,events[-1:] )
            assert events[-1]['event']=='complete' and events[-1]['done']==expected,events[-1:]
            files=[e for e in events if e['event']=='file'];assert len(files)==expected
            assert all(pathlib.Path(e['path']).is_file() for e in files)
            summaries.append(dict(site=site,files=expected,passed=True))
        return {'passed':True,'files':12,'bundledRuntime':True,'newSiteFiles':2,'checks':summaries,'workerExe':str(worker),'workerSha256':hashlib.file_digest(worker.open('rb'),'sha256').hexdigest(),'qaDir':str(qa),'version':'1.0.0','build':'2026.10.29-filefapper-100-cef','scope':'Actual compiled worker, 12 local sample files and 2 full-size scoped post files from a local HTTP fixture. No external gallery downloaded.'}
    finally:server.shutdown();server.server_close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('worker',type=pathlib.Path);p.add_argument('qa',type=pathlib.Path);p.add_argument('report',type=pathlib.Path);a=p.parse_args();report=run(a.worker.resolve(),a.qa.resolve());a.report.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
