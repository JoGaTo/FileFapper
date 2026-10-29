"""Local, offline image enlargement. Preserve source bytes in the caller."""
from pathlib import Path
import ctypes
from ctypes import wintypes
import os
import subprocess
import sys
import tempfile
import threading
from PIL import Image, ImageOps

_lock=threading.Lock()
_job=None

def runtime_dir():
    if os.environ.get('DF_UPSCALER_DIR'):return Path(os.environ['DF_UPSCALER_DIR'])
    if getattr(sys,'frozen',False): return Path(sys.executable).parent.parent/'upscaler'
    return Path(__file__).resolve().parents[1]/'vendor'/'waifu2x'

def _attach_lifetime(process):
    """Windows kills model processes when their owning downloader exits."""
    global _job
    if os.name!='nt': return
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateJobObjectW.restype=wintypes.HANDLE
    k.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]
    k.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
    k.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
    class Basic(ctypes.Structure):
        _fields_=[('ProcessTime',ctypes.c_int64),('JobTime',ctypes.c_int64),('Flags',wintypes.DWORD),('MinWorkingSet',ctypes.c_size_t),('MaxWorkingSet',ctypes.c_size_t),('ActiveProcesses',wintypes.DWORD),('Affinity',ctypes.c_size_t),('Priority',wintypes.DWORD),('Scheduling',wintypes.DWORD)]
    class Counters(ctypes.Structure):
        _fields_=[('ReadOps',ctypes.c_uint64),('WriteOps',ctypes.c_uint64),('OtherOps',ctypes.c_uint64),('ReadBytes',ctypes.c_uint64),('WriteBytes',ctypes.c_uint64),('OtherBytes',ctypes.c_uint64)]
    class Extended(ctypes.Structure):
        _fields_=[('Basic',Basic),('Io',Counters),('ProcessMemory',ctypes.c_size_t),('JobMemory',ctypes.c_size_t),('PeakProcessMemory',ctypes.c_size_t),('PeakJobMemory',ctypes.c_size_t)]
    if _job is None:
        handle=k.CreateJobObjectW(None,None);info=Extended();info.Basic.Flags=0x2000
        if not handle or not k.SetInformationJobObject(handle,9,ctypes.byref(info),ctypes.sizeof(info)):
            raise OSError('Could not attach the image enhancer to the download task.')
        _job=handle
    if not k.AssignProcessToJobObject(_job,wintypes.HANDLE(process._handle)):
        raise OSError('Could not manage the image enhancer lifetime.')

def _run(args,timeout=300):
    p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        _attach_lifetime(p)
        _,error=p.communicate(timeout=timeout)
        if p.returncode: raise RuntimeError('The local image model could not run on this device.')
    except BaseException:
        if p.poll() is None:p.kill()
        p.communicate()
        raise

def enlarge(source,destination,scale=2,method='waifu2x',denoise='off',device='auto'):
    with Image.open(source) as raw:
        image=ImageOps.exif_transpose(raw).convert('RGBA' if 'A' in raw.getbands() else 'RGB')
        target=(max(1,round(image.width*scale)),max(1,round(image.height*scale)))
        if max(target)>32768 or target[0]*target[1]>160_000_000:raise ValueError('The enlarged image is too large. Use original size or a smaller scale.')
        if method=='lanczos':
            image.resize(target,Image.Resampling.LANCZOS).save(destination,format='PNG');return 'Lanczos resize'
        runtime=runtime_dir();exe=runtime/'waifu2x-ncnn-vulkan.exe'
        if not exe.is_file():raise RuntimeError('The bundled image enhancer is missing. Choose Original size, or restore the complete FileFapper folder.')
        # A model call per worker is expensive. Serial calls keep GPU memory bounded.
        with _lock,tempfile.TemporaryDirectory(prefix='dandf-upscale-') as tmp:
            tmp=Path(tmp);src=tmp/'input.png';out=tmp/'output.png';image.save(src)
            args=[str(exe),'-i',str(src),'-o',str(out),'-m',str(runtime/'models-cunet'),'-n','0' if denoise=='gentle' else '-1','-s','2','-t','128','-j','1:1:1','-f','png']
            cpu=runtime/'cpu'/'waifu2x-ncnn-vulkan.exe'
            if device=='cpu':args[0]=str(cpu);args+=['-g','-1']
            try:_run(args)
            except (RuntimeError,OSError,subprocess.TimeoutExpired):
                if device=='cpu':raise RuntimeError('The local CPU image enhancer failed. Your source remains in originals/. Choose Original size to continue.')
                out.unlink(missing_ok=True)
                try:_run([str(cpu),*args[1:],'-g','-1'])
                except (RuntimeError,OSError,subprocess.TimeoutExpired) as exc:raise RuntimeError('The GPU and CPU image enhancers failed. Your source remains in originals/. Choose Original size to continue.') from exc
            with Image.open(out) as enhanced:
                enhanced.load()
                if enhanced.size!=(image.width*2,image.height*2):raise ValueError('The image model returned an unexpected size.')
                if enhanced.size!=target:enhanced=enhanced.resize(target,Image.Resampling.LANCZOS)
                enhanced.save(destination,format='PNG')
        return 'waifu2x CUnet · '+('gentle denoise' if denoise=='gentle' else 'no denoise')
