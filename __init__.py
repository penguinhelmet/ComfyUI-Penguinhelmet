"""ComfyUI-Penguinhelmet: a pack of custom nodes.

Each module in nodes/ defines NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS;
they are merged here. Frontend extensions live in js/.
"""
import importlib
import logging
import pkgutil

from . import nodes

WEB_DIRECTORY = "./js"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for mod in pkgutil.iter_modules(nodes.__path__):
    try:
        m = importlib.import_module(f"{__name__}.nodes.{mod.name}")
    except Exception:
        logging.exception("[Penguinhelmet] failed to load nodes/%s.py", mod.name)
        continue
    NODE_CLASS_MAPPINGS.update(getattr(m, "NODE_CLASS_MAPPINGS", {}))
    NODE_DISPLAY_NAME_MAPPINGS.update(getattr(m, "NODE_DISPLAY_NAME_MAPPINGS", {}))

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
