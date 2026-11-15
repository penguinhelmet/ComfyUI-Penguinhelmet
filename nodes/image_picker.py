"""Image Picker: load an image from ComfyUI's input OR output folder.

The browser does everything through the ComfyUI server, so it works the same
whether ComfyUI runs on this computer or on a remote box reached over an SSH
tunnel / LAN: files are listed, previewed and uploaded on the server side.
"""
import asyncio
import io
import os
from collections import OrderedDict

import folder_paths
import nodes
from aiohttp import web
from PIL import Image, ImageOps
from server import PromptServer

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff")
SOURCES = ("input", "output")
SKIP_DIRS = {"3d", "__pycache__"}


def base_dir(source):
    if source == "input":
        return folder_paths.get_input_directory()
    if source == "output":
        return folder_paths.get_output_directory()
    raise ValueError(f"unknown source {source!r}")


def resolve(source, rel):
    """Absolute path of `rel` inside the source folder, or None if it escapes."""
    if source not in SOURCES or not rel or "\x00" in rel:
        return None
    base = os.path.realpath(base_dir(source))
    full = os.path.realpath(os.path.join(base, rel))
    if os.path.commonpath([base, full]) != base or full == base:
        return None
    return full


def parse_value(value):
    """'sub/a.png [output]' -> ('output', 'sub/a.png'). No tag means input."""
    value = (value or "").strip()
    for s in SOURCES:
        tag = f" [{s}]"
        if value.endswith(tag):
            return s, value[: -len(tag)]
    return "input", value


def list_images(source):
    base = base_dir(source)
    files = []
    for root, dirs, names in os.walk(base, followlinks=True):
        rel_root = os.path.relpath(root, base)
        rel_root = "" if rel_root == "." else rel_root.replace(os.sep, "/")
        dirs[:] = sorted(d for d in dirs if not d.startswith(".")
                         and not (rel_root == "" and d in SKIP_DIRS))
        for n in names:
            if n.startswith(".") or not n.lower().endswith(IMAGE_EXT):
                continue
            try:
                st = os.stat(os.path.join(root, n))
            except OSError:
                continue
            files.append({"folder": rel_root, "name": n,
                          "mtime": st.st_mtime, "size": st.st_size})
    files.sort(key=lambda f: -f["mtime"])
    return files


class ThumbCache:
    def __init__(self, limit=600):
        self.limit = limit
        self.items = OrderedDict()

    def get(self, key):
        if key in self.items:
            self.items.move_to_end(key)
            return self.items[key]

    def put(self, key, data):
        self.items[key] = data
        if len(self.items) > self.limit:
            self.items.popitem(last=False)


THUMBS = ThumbCache()


def make_thumb(path, size):
    with Image.open(path) as im:
        im.draft("RGB", (size * 2, size * 2))
        im = ImageOps.exif_transpose(im)
        im.thumbnail((size, size), Image.LANCZOS)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=80)
        return buf.getvalue()


routes = PromptServer.instance.routes


@routes.get("/image_picker/list")
async def api_list(request):
    source = request.query.get("source", "input")
    if source not in SOURCES:
        return web.json_response({"error": "bad source"}, status=400)
    files = await asyncio.to_thread(list_images, source)
    return web.json_response({"source": source, "files": files})


@routes.get("/image_picker/thumb")
async def api_thumb(request):
    q = request.query
    size = max(32, min(int(q.get("size", "192") or 192), 512))
    path = resolve(q.get("source", ""), q.get("path", ""))
    if not path or not os.path.isfile(path):
        return web.Response(status=404)
    st = os.stat(path)
    key = (path, st.st_mtime_ns, size)
    data = THUMBS.get(key)
    if data is None:
        try:
            data = await asyncio.to_thread(make_thumb, path, size)
        except Exception:
            return web.Response(status=415)
        THUMBS.put(key, data)
    return web.Response(body=data, content_type="image/webp",
                        headers={"Cache-Control": "private, max-age=86400"})


@routes.post("/image_picker/mkdir")
async def api_mkdir(request):
    body = await request.json()
    name = str(body.get("name", "")).strip().strip("/")
    if not name or name.startswith(".") or any(p in ("", "..") for p in name.split("/")):
        return web.json_response({"error": "bad folder name"}, status=400)
    path = resolve("input", name)
    if not path:
        return web.json_response({"error": "bad folder name"}, status=400)
    os.makedirs(path, exist_ok=True)
    return web.json_response({"ok": True, "folder": name})


class ImagePicker:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("STRING", {"default": ""})}}

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("image", "mask", "path")
    FUNCTION = "load"
    CATEGORY = "penguinhelmet/image"
    DESCRIPTION = "Pick an image from the input or output folder, or upload one."

    def load(self, image):
        source, rel = parse_value(image)
        path = resolve(source, rel)
        img, mask = nodes.LoadImage().load_image(f"{rel} [{source}]")
        return (img, mask, path)

    @classmethod
    def IS_CHANGED(cls, image):
        path = resolve(*parse_value(image))
        if not path or not os.path.isfile(path):
            return image
        st = os.stat(path)
        return f"{path}:{st.st_mtime_ns}:{st.st_size}"

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        path = resolve(*parse_value(image))
        if not path or not os.path.isfile(path):
            return f"Image not found: {image or '(none selected)'}"
        return True


NODE_CLASS_MAPPINGS = {"PH_ImagePicker": ImagePicker}
NODE_DISPLAY_NAME_MAPPINGS = {"PH_ImagePicker": "Image Picker (Input / Output)"}
