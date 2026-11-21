#!/usr/bin/env python3
"""Copy item photos into the website, resized for phones.

Input: the Photos folder downloaded from Google Drive, either as the .zip(s)
Drive produces or as an unzipped folder. Each item's photos sit in a folder
named with its ID (Photos/K-001/IMG_1234.jpg). Files lying directly in Photos
are also accepted if their name starts with the ID (K-001 front.jpg).

For every item found, photos/<ID>/ is replaced with 1.jpg, 2.jpg, ... (large)
and 1_t.jpg, 2_t.jpg, ... (thumbnails), in file-name order, and
photos/manifest.json is updated. Items not in the input are left alone,
unless --prune is given.

Usage:
    python3 scripts/sync_photos.py ~/Downloads/Photos-*.zip
    python3 scripts/sync_photos.py ~/Downloads/Photos --prune
"""
import argparse
import json
import re
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageOps

try:  # iPhone HEIC photos, if pillow-heif is installed
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC = True
except ImportError:
    HEIC = False

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
MANIFEST = PHOTOS / "manifest.json"

FULL_MAX = 1600       # longest side of the large photo, px
THUMB_MAX = 520       # longest side of the thumbnail, px
FULL_QUALITY = 82
THUMB_QUALITY = 74
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
ID_RE = re.compile(r"^([A-Za-z]{1,3}-\d{1,4})\b")


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def item_id_for(path: Path, top: Path):
    parent = path.parent
    if parent != top and ID_RE.match(parent.name):
        return ID_RE.match(parent.name).group(1).upper()
    m = ID_RE.match(path.stem)
    return m.group(1).upper() if m else None


def collect(sources, workdir: Path):
    """Return {item_id: [image paths]} from zips and folders."""
    found = {}
    for n, src in enumerate(sources):
        src = Path(src).expanduser()
        if src.suffix.lower() == ".zip":
            dest = workdir / f"zip{n}"
            with zipfile.ZipFile(src) as z:
                z.extractall(dest)
            roots = [dest]
        elif src.is_dir():
            roots = [src]
        else:
            sys.exit(f"Not a zip or folder: {src}")
        for root in roots:
            for p in root.rglob("*"):
                if not p.is_file() or p.name.startswith(".") or "__MACOSX" in p.parts:
                    continue
                if p.suffix.lower() not in IMAGE_EXT:
                    continue
                # "top" is the folder that holds the item folders (Photos/)
                top = p.parent.parent if ID_RE.match(p.parent.name) else p.parent
                iid = item_id_for(p, top)
                if not iid:
                    print(f"  skipped (no item ID in folder or file name): {p.name}")
                    continue
                found.setdefault(iid, []).append(p)
    for iid in found:
        found[iid].sort(key=natural_key)
    return found


def save_resized(img: Image.Image, dest: Path, max_side: int, quality: int):
    im = img.copy()
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)


def process(iid: str, files):
    out = PHOTOS / iid
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    names = []
    for f in files:
        if f.suffix.lower() in {".heic", ".heif"} and not HEIC:
            print(f"  {iid}: cannot read {f.name} (HEIC). Run: pip install pillow-heif")
            continue
        try:
            with Image.open(f) as im:
                im = ImageOps.exif_transpose(im).convert("RGB")
                n = str(len(names) + 1)
                save_resized(im, out / f"{n}.jpg", FULL_MAX, FULL_QUALITY)
                save_resized(im, out / f"{n}_t.jpg", THUMB_MAX, THUMB_QUALITY)
                names.append(n)
        except Exception as e:  # unreadable file: report and continue
            print(f"  {iid}: could not read {f.name}: {e}")
    if not names:
        shutil.rmtree(out)
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+", help="Drive zip file(s) or the unzipped Photos folder")
    ap.add_argument("--prune", action="store_true", help="delete photos of items not in the input")
    args = ap.parse_args()

    PHOTOS.mkdir(exist_ok=True)
    manifest = {"version": "", "items": {}}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())

    with tempfile.TemporaryDirectory() as tmp:
        found = collect(args.sources, Path(tmp))
        if not found:
            sys.exit("No item photos found. Each item's photos should be in a folder named with its ID, e.g. K-001.")
        for iid in sorted(found):
            names = process(iid, found[iid])
            if names:
                manifest["items"][iid] = names
                print(f"  {iid}: {len(names)} photo(s)")
            else:
                manifest["items"].pop(iid, None)

    if args.prune:
        for iid in list(manifest["items"]):
            if iid not in found:
                shutil.rmtree(PHOTOS / iid, ignore_errors=True)
                del manifest["items"][iid]
                print(f"  {iid}: removed")

    manifest["version"] = time.strftime("%Y%m%d%H%M%S")
    manifest["items"] = dict(sorted(manifest["items"].items()))
    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"Done. {len(manifest['items'])} item(s) with photos. Now commit and push to publish.")


if __name__ == "__main__":
    main()
