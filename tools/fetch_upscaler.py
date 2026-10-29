"""Fetch the pinned portable waifu2x runtime from its official release."""
from pathlib import Path
import hashlib
import json
import urllib.request
import zipfile
import io

ROOT=Path(__file__).resolve().parents[1]
URL='https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915/waifu2x-ncnn-vulkan-20250915-windows.zip'
SHA256='7425be94b94e4c8f37a1e433ac0e0100c43790e2c37418f4b65d8235adfbdc87'
CPU_URL='https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20220728/waifu2x-ncnn-vulkan-20220728-windows.zip'
CPU_SHA256='3f60ba0b26763c602cb75178c2051bf0c46f3cc9d13975a052a902773988a34b'
def install(archive=None,cpu_archive=None):
    data=Path(archive).read_bytes() if archive else urllib.request.urlopen(URL,timeout=120).read()
    if hashlib.sha256(data).hexdigest()!=SHA256: raise ValueError('The upscaler archive failed its SHA-256 check.')
    target=ROOT/'vendor'/'waifu2x';target.mkdir(parents=True,exist_ok=True)
    keep={'waifu2x-ncnn-vulkan.exe','LICENSE','models-cunet/scale2.0x_model.bin','models-cunet/scale2.0x_model.param','models-cunet/noise0_scale2.0x_model.bin','models-cunet/noise0_scale2.0x_model.param'}
    manifest={'project':'waifu2x-ncnn-vulkan','release':'20250915','source':URL,'archiveSha256':SHA256,'files':{}}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            rel=info.filename.partition('/')[2]
            if rel not in keep: continue
            content=z.read(info);file=target/rel;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(content)
            manifest['files'][rel]=hashlib.sha256(content).hexdigest()
    if set(manifest['files'])!=keep: raise ValueError('The expected upscaler files were missing.')
    # The 20250915 Windows CPU path faults on this test machine. Keep the
    # independently tested 20220728 CPU executable with the same CUnet models.
    cpu=Path(cpu_archive).read_bytes() if cpu_archive else urllib.request.urlopen(CPU_URL,timeout=120).read()
    if hashlib.sha256(cpu).hexdigest()!=CPU_SHA256:raise ValueError('The CPU runtime archive failed its SHA-256 check.')
    with zipfile.ZipFile(io.BytesIO(cpu)) as z:
        content=z.read('waifu2x-ncnn-vulkan-20220728-windows/waifu2x-ncnn-vulkan.exe')
    file=target/'cpu'/'waifu2x-ncnn-vulkan.exe';file.parent.mkdir(exist_ok=True);file.write_bytes(content)
    manifest.update(cpuRelease='20220728',cpuSource=CPU_URL,cpuArchiveSha256=CPU_SHA256)
    manifest['files']['cpu/waifu2x-ncnn-vulkan.exe']=hashlib.sha256(content).hexdigest()
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Verified and installed the portable CUnet upscaler.')
if __name__=='__main__':
    import sys
    install(sys.argv[1] if len(sys.argv)>1 else None,sys.argv[2] if len(sys.argv)>2 else None)
