"""Typed media validation and Pixiv ugoira playback. Never extract attachments."""
import hashlib
import json
from pathlib import Path
import tarfile
import zipfile
from PIL import Image

IMAGE = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'}
VIDEO = {'mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'ogv'}
AUDIO = {'mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac'}
ARCHIVE = {'zip', 'cbz', 'rar', 'cbr', '7z', 'tar', 'gz', 'bz2', 'xz'}
DOCUMENT = {'pdf', 'psd', 'clip', 'txt'}

def kind_for(extension):
    ext = str(extension).lower().lstrip('.')
    for kind, extensions in (('image', IMAGE), ('video', VIDEO), ('audio', AUDIO), ('archive', ARCHIVE), ('document', DOCUMENT)):
        if ext in extensions:
            return kind
    return None

def file_hash(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def validate_file(path, extension):
    """Reject HTML, truncated images, broken ZIPs and mislabeled media."""
    ext = extension.lower()
    with open(path, 'rb') as stream:
        head = stream.read(4096)
    if not head or head.lstrip().lower().startswith((b'<!doctype html', b'<html', b'<?xml')):
        raise ValueError('The server returned an empty file or a web page instead of media.')
    if ext in IMAGE:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            im.load()
        return
    if ext in {'zip', 'cbz'}:
        with zipfile.ZipFile(path) as archive:
            # Do not inflate arbitrary archives. Central-directory/length checks
            # detect an interrupted transfer without expanding a ZIP bomb.
            if any(i.header_offset + i.compress_size > Path(path).stat().st_size for i in archive.infolist()):
                raise ValueError('Incomplete ZIP archive.')
        return
    checks = {
        'mp4': len(head) >= 12 and head[4:8] == b'ftyp',
        'm4v': len(head) >= 12 and head[4:8] == b'ftyp',
        'm4a': len(head) >= 12 and head[4:8] == b'ftyp',
        'mov': len(head) >= 12 and head[4:8] in (b'ftyp', b'moov', b'mdat', b'wide'),
        'webm': head.startswith(b'\x1aE\xdf\xa3'), 'mkv': head.startswith(b'\x1aE\xdf\xa3'),
        'avi': head.startswith(b'RIFF') and head[8:12] == b'AVI ',
        'wav': head.startswith(b'RIFF') and head[8:12] == b'WAVE',
        'mp3': head.startswith(b'ID3') or (len(head) > 1 and head[0] == 255 and head[1] & 224 == 224),
        'aac': len(head) > 1 and head[0] == 255 and head[1] & 246 == 240,
        'ogg': head.startswith(b'OggS'), 'opus': head.startswith(b'OggS'), 'ogv': head.startswith(b'OggS'),
        'flac': head.startswith(b'fLaC'), 'rar': head.startswith(b'Rar!\x1a\x07'),
        'cbr': head.startswith(b'Rar!\x1a\x07'), '7z': head.startswith(b'7z\xbc\xaf\x27\x1c'),
        'gz': head.startswith(b'\x1f\x8b'), 'bz2': head.startswith(b'BZh'),
        'xz': head.startswith(b'\xfd7zXZ\x00'), 'pdf': head.startswith(b'%PDF-'),
        'psd': head.startswith(b'8BPS'), 'clip': head.startswith(b'CSFCHUNK'),
        'txt': b'\x00' not in head,
    }
    if ext == 'tar':
        with tarfile.open(path):
            return
    if not checks.get(ext, False):
        raise ValueError(f'The downloaded file is not valid {ext.upper()} media.')

def ugoira_preview(archive_path, frames, destination):
    """Keep the ZIP and frame timing JSON; create a looping, timed WebP."""
    if not isinstance(frames, list) or not 1 <= len(frames) <= 3000:
        raise ValueError('Pixiv returned an invalid ugoira frame list.')
    pictures, delays = [], []
    pixels = 0
    try:
        with zipfile.ZipFile(archive_path) as archive:
            for frame in frames:
                name = str(frame.get('file', ''))
                if not name or name != Path(name).name or '/' in name or '\\' in name:
                    raise ValueError('Invalid ugoira frame filename.')
                entry = archive.getinfo(name)
                if entry.file_size > 50_000_000 or entry.compress_size > 50_000_000:
                    raise ValueError('An ugoira frame exceeds the playback conversion limit.')
                with archive.open(entry) as stream, Image.open(stream) as picture:
                    pixels += picture.width * picture.height
                    if pixels > 240_000_000:
                        raise ValueError('This ugoira exceeds the 240 million pixel playback conversion limit. Its original ZIP is kept.')
                    pictures.append(picture.convert('RGBA'))
                delay = int(frame.get('delay', 0))
                if not 1 <= delay <= 60000:
                    raise ValueError('Pixiv returned an invalid frame delay.')
                delays.append(delay)
        temporary = Path(str(destination) + '.part')
        pictures[0].save(temporary, format='WEBP', save_all=True, append_images=pictures[1:], duration=delays, loop=0, lossless=True, method=1)
        temporary.replace(destination)
        timing = Path(destination).with_suffix('.frames.json')
        timing.write_text(json.dumps({'format': 'Pixiv ugoira', 'archive': Path(archive_path).name, 'frames': frames}, indent=2), encoding='utf-8')
        return [Path(destination), timing]
    finally:
        for picture in pictures:
            picture.close()
