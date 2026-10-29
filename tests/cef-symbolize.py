"""Resolve captured CEF-relative addresses against the official release PDB."""
import ctypes as c
from ctypes import wintypes as w
import os, sys

dbg=c.WinDLL('dbghelp',use_last_error=True);kernel=c.WinDLL('kernel32',use_last_error=True)
kernel.GetCurrentProcess.restype=w.HANDLE
dbg.SymInitializeW.argtypes=[w.HANDLE,w.LPCWSTR,w.BOOL]
dbg.SymSetOptions.argtypes=[w.DWORD]
dbg.SymLoadModuleExW.argtypes=[w.HANDLE,w.HANDLE,w.LPCWSTR,w.LPCWSTR,c.c_uint64,w.DWORD,c.c_void_p,w.DWORD]
dbg.SymLoadModuleExW.restype=c.c_uint64
class Symbol(c.Structure):
    _fields_=[('SizeOfStruct',w.ULONG),('TypeIndex',w.ULONG),('Reserved',c.c_uint64*2),('Index',w.ULONG),('Size',w.ULONG),('ModBase',c.c_uint64),('Flags',w.ULONG),('Value',c.c_uint64),('Address',c.c_uint64),('Register',w.ULONG),('Scope',w.ULONG),('Tag',w.ULONG),('NameLen',w.ULONG),('MaxNameLen',w.ULONG),('Name',w.WCHAR*2048)]
dbg.SymFromAddrW.argtypes=[w.HANDLE,c.c_uint64,c.POINTER(c.c_uint64),c.POINTER(Symbol)]
process=kernel.GetCurrentProcess();binary=os.path.abspath(sys.argv[1]);symbols=os.path.abspath(sys.argv[2]);base=0x180000000
dbg.SymSetOptions(0x10|0x200|0x80000000)
if not dbg.SymInitializeW(process,symbols,False):raise OSError(c.get_last_error(),'SymInitialize')
loaded=dbg.SymLoadModuleExW(process,None,binary,None,base,0,None,0)
if not loaded:raise OSError(c.get_last_error(),'SymLoadModuleEx')
for item in sys.argv[3:]:
    offset=int(item,16);symbol=Symbol();symbol.SizeOfStruct=88;symbol.MaxNameLen=2048;distance=c.c_uint64()
    if dbg.SymFromAddrW(process,loaded+offset,c.byref(distance),c.byref(symbol)):
        print(f'{item}: {symbol.Name}+0x{distance.value:x}')
    else: print(f'{item}: unresolved ({c.get_last_error()})')
