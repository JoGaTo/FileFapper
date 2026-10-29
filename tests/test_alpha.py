import ctypes
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from PIL import Image, ImageDraw, ImageChops

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
from upscaler import enlarge

class LocalImageModelTests(unittest.TestCase):
    def test_real_cunet_cpu_inference_and_fractional_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);im=Image.new('RGB',(24,32),'#eee7d7');d=ImageDraw.Draw(im);d.ellipse((4,5,19,24),outline='#24334b',width=2);im.save(p/'source.png');original=(p/'source.png').read_bytes()
            label=enlarge(p/'source.png',p/'enhanced.png',2,'waifu2x','off','cpu')
            self.assertIn('CUnet',label)
            with Image.open(p/'enhanced.png') as result:
                self.assertEqual(result.size,(48,64));self.assertIsNotNone(ImageChops.difference(result.convert('RGB'),im.resize((48,64),Image.Resampling.LANCZOS)).getbbox())
            enlarge(p/'source.png',p/'fraction.png',1.5,'waifu2x','gentle','cpu')
            with Image.open(p/'fraction.png') as result:self.assertEqual(result.size,(36,48))
            self.assertEqual((p/'source.png').read_bytes(),original)

    @unittest.skipUnless(os.name=='nt','Windows process ownership test')
    def test_model_child_ends_when_downloader_parent_is_terminated(self):
        script="import sys,subprocess,time;sys.path.insert(0,sys.argv[1]);from upscaler import _attach_lifetime;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)']);_attach_lifetime(p);print(p.pid,flush=True);time.sleep(120)"
        p=subprocess.Popen([sys.executable,'-u','-c',script,str(ROOT/'engine')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        handle=None
        try:
            line=p.stdout.readline();self.assertTrue(line.strip().isdigit(),p.stderr.read() if p.poll() is not None else line);child=int(line.strip())
            k=ctypes.WinDLL('kernel32',use_last_error=True);k.OpenProcess.restype=ctypes.c_void_p;k.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong];k.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong];k.CloseHandle.argtypes=[ctypes.c_void_p]
            handle=k.OpenProcess(0x100000,False,child);self.assertTrue(handle);p.kill();p.wait(timeout=10);self.assertEqual(k.WaitForSingleObject(handle,5000),0,'The image enhancer outlived its download task')
        finally:
            if p.poll() is None:p.kill();p.wait(timeout=10)
            if handle:ctypes.WinDLL('kernel32').CloseHandle(ctypes.c_void_p(handle))
            p.communicate()

if __name__=='__main__':unittest.main()
