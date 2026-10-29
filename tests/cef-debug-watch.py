"""Attach to an isolated QA helper and report native exceptions, without dumps."""
import ctypes as c
import sys
from ctypes import wintypes as w

k = c.WinDLL('kernel32', use_last_error=True)
p = c.WinDLL('psapi', use_last_error=True)
PTR = c.c_uint64 if c.sizeof(c.c_void_p) == 8 else c.c_uint32

class Record(c.Structure):
    _fields_ = [('code',w.DWORD),('flags',w.DWORD),('record',PTR),('address',PTR),('count',w.DWORD),('align',w.DWORD),('info',PTR*15)]
class ExceptionInfo(c.Structure):
    _fields_ = [('record',Record),('first',w.DWORD)]
class Info(c.Union):
    _fields_ = [('exception',ExceptionInfo),('padding',c.c_byte*160)]
class Event(c.Structure):
    _fields_ = [('kind',w.DWORD),('pid',w.DWORD),('tid',w.DWORD),('info',Info)]
class ModuleInfo(c.Structure):
    _fields_ = [('base',c.c_void_p),('size',w.DWORD),('entry',c.c_void_p)]

k.DebugActiveProcess.argtypes=[w.DWORD]
k.DebugSetProcessKillOnExit.argtypes=[w.BOOL]
k.WaitForDebugEvent.argtypes=[c.POINTER(Event),w.DWORD]
k.ContinueDebugEvent.argtypes=[w.DWORD,w.DWORD,w.DWORD]
k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
k.OpenThread.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenThread.restype=w.HANDLE
k.CloseHandle.argtypes=[w.HANDLE]
k.GetThreadContext.argtypes=[w.HANDLE,c.c_void_p]
k.ReadProcessMemory.argtypes=[w.HANDLE,c.c_void_p,c.c_void_p,c.c_size_t,c.POINTER(c.c_size_t)]
p.EnumProcessModules.argtypes=[w.HANDLE,c.POINTER(w.HMODULE),w.DWORD,c.POINTER(w.DWORD)]
p.GetModuleInformation.argtypes=[w.HANDLE,w.HMODULE,c.POINTER(ModuleInfo),w.DWORD]
p.GetModuleFileNameExW.argtypes=[w.HANDLE,w.HMODULE,w.LPWSTR,w.DWORD]

pid=int(sys.argv[1])
if not k.DebugActiveProcess(pid):
    raise OSError(c.get_last_error(),'DebugActiveProcess')
k.DebugSetProcessKillOnExit(False)
handle=k.OpenProcess(0x0410,False,pid)
print('DEBUG-READY',flush=True)
initial=True
while True:
    event=Event()
    if not k.WaitForDebugEvent(c.byref(event),30000):
        break
    status=0x00010002
    if event.kind == 1:
        ex=event.info.exception; code=ex.record.code; addr=ex.record.address
        if code == 0x80000003 and initial:
            initial=False
        else:
            status=0x80010001
            if code in (0xc0000005,0xc0000409,0xc000001d,0x80000003,0xe0434352):
                label='unknown'; modules=(w.HMODULE*2048)();needed=w.DWORD()
                ranges=[]
                if handle and p.EnumProcessModules(handle,modules,c.sizeof(modules),c.byref(needed)):
                    for module in modules[:needed.value//c.sizeof(w.HMODULE)]:
                        info=ModuleInfo()
                        if p.GetModuleInformation(handle,module,c.byref(info),c.sizeof(info)):
                            name=c.create_unicode_buffer(1024);p.GetModuleFileNameExW(handle,module,name,len(name));ranges.append((info.base,info.base+info.size,name.value))
                            if info.base <= addr < info.base+info.size:label=f'{name.value}+0x{addr-info.base:x}'
                print(f'EXCEPTION code=0x{code:08x} first={ex.first} addr=0x{addr:x} {label}',flush=True)
                if code==0x80000003:
                    thread=k.OpenThread(0x48,False,event.tid);context=(c.c_ulonglong*256)();c.c_uint32.from_buffer(context,48).value=0x100003
                    if thread and k.GetThreadContext(thread,c.byref(context)):
                        sp=c.c_ulonglong.from_buffer(context,152).value;words=(c.c_ulonglong*2048)();read=c.c_size_t()
                        k.ReadProcessMemory(handle,c.c_void_p(sp),c.byref(words),c.sizeof(words),c.byref(read))
                        if read.value:
                            seen=set()
                            for value in words[:read.value//8]:
                                for base,end,name in ranges:
                                    if base<=value<end and 'libcef.dll' in name.lower() and value not in seen:
                                        seen.add(value);print(f'  stack candidate {name}+0x{value-base:x}',flush=True);break
                                if len(seen)>=24:break
                        else:print('  no readable stack',hex(sp),c.get_last_error(),flush=True)
                    else:print('  no thread context',c.get_last_error(),flush=True)
                    if thread:k.CloseHandle(thread)
    k.ContinueDebugEvent(event.pid,event.tid,status)
    if event.kind == 5:
        break
