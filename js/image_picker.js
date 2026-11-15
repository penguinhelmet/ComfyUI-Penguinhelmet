import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODES = ["PH_ImagePicker", "ImagePickerIO"]; // second is the old id
const SOURCES = ["input", "output"];
const RENDER_STEP = 300;

// ---------- value helpers ----------
// Widget value: "sub/a.png [output]". No tag means input (same as core LoadImage).
function parseValue(v) {
  v = (v || "").trim();
  for (const s of SOURCES) if (v.endsWith(` [${s}]`)) return split(s, v.slice(0, -(s.length + 3)));
  return split("input", v);
}
function split(source, rel) {
  const i = rel.lastIndexOf("/");
  return { source, rel, folder: i < 0 ? "" : rel.slice(0, i), name: i < 0 ? rel : rel.slice(i + 1) };
}
const relOf = (f) => (f.folder ? f.folder + "/" : "") + f.name;
const valueOf = (source, f) => `${relOf(f)} [${source}]`;
const thumbURL = (source, rel, size, v) =>
  api.apiURL(`/image_picker/thumb?source=${source}&path=${encodeURIComponent(rel)}&size=${size}&v=${v || 0}`);

const store = {
  get(k, d) { try { return localStorage.getItem("image-picker." + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("image-picker." + k, v); } catch {} },
};

// ---------- file listings (shared by all nodes) ----------
const lists = {};
async function listFiles(source, force) {
  if (!force && lists[source]) return lists[source];
  const r = await api.fetchApi(`/image_picker/list?source=${source}`);
  if (!r.ok) throw new Error(`list ${source}: ${r.status}`);
  lists[source] = (await r.json()).files;
  return lists[source];
}

async function uploadFile(file, subfolder) {
  const body = new FormData();
  body.append("image", file);
  body.append("type", "input");
  if (subfolder) body.append("subfolder", subfolder);
  const r = await api.fetchApi("/upload/image", { method: "POST", body });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  delete lists.input;
  return { folder: j.subfolder || "", name: j.name };
}

// ---------- styles ----------
const CSS = `
.ipk-node{display:flex;flex-direction:column;gap:6px;height:100%;box-sizing:border-box;font:12px/1.3 sans-serif;color:var(--input-text,#ddd)}
.ipk-bar{display:flex;gap:4px;align-items:center}
.ipk-btn{background:var(--comfy-input-bg,#222);color:inherit;border:1px solid var(--border-color,#444);border-radius:6px;padding:4px 8px;cursor:pointer;white-space:nowrap;font:inherit}
.ipk-btn:hover{border-color:#f66744}
.ipk-btn.grow{flex:1;overflow:hidden;text-overflow:ellipsis;text-align:left}
.ipk-name{font-size:11px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ipk-prev{flex:1;min-height:60px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(0,0,0,.25);overflow:hidden}
.ipk-prev img{max-width:100%;max-height:100%;object-fit:contain}
.ipk-prev .empty{opacity:.5}
.ipk-node.drop .ipk-prev{outline:2px dashed #f66744}
.ipk-pop{position:fixed;z-index:10000;display:flex;flex-direction:column;background:var(--comfy-menu-bg,#1e1e1e);color:var(--input-text,#ddd);border:1px solid var(--border-color,#444);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.55);font:14px/1.3 sans-serif;overflow:hidden}
.ipk-head{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border-color,#444)}
.ipk-head input{flex:1;min-width:60px;background:transparent;border:0;outline:0;color:inherit;font:inherit;font-size:15px}
.ipk-seg{display:flex;border:1px solid var(--border-color,#555);border-radius:7px;overflow:hidden}
.ipk-seg button{background:transparent;color:inherit;border:0;padding:5px 10px;cursor:pointer;font:inherit;font-size:13px}
.ipk-seg button.on{background:#f66744;color:#fff}
.ipk-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:8px 12px;border-bottom:1px solid var(--border-color,#444);font-size:14px}
.ipk-crumbs .c{cursor:pointer;padding:3px 7px;border-radius:6px;color:#8fa4ff}
.ipk-crumbs .c:hover{background:rgba(255,255,255,.07)}
.ipk-crumbs .c.cur{color:inherit;font-weight:600;cursor:default;background:none}
.ipk-crumbs .sep{opacity:.4}
.ipk-main{flex:1;overflow:auto;padding:12px;scrollbar-color:#555 transparent}
.ipk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--ipk-t),1fr));gap:10px;align-items:start}
.ipk-tile{position:relative;border-radius:9px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.04);border:2px solid transparent;min-width:0}
.ipk-tile:hover{border-color:rgba(246,103,68,.55)}
.ipk-tile.on{border-color:#f66744;box-shadow:0 0 0 2px rgba(246,103,68,.35)}
.ipk-tile img,.ipk-tile .ico{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.ipk-tile .ico{display:flex;align-items:center;justify-content:center;font-size:42px;opacity:.45}
.ipk-dir{border:1px solid var(--border-color,#444);background:rgba(255,255,255,.06)}
.ipk-dir .cap{padding:6px 9px 8px}
.ipk-dir b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.ipk-dir small{display:block;opacity:.6;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ipk-foot{padding:7px;text-align:center;font-size:12px;opacity:.65;border-top:1px solid var(--border-color,#444)}
.ipk-more{grid-column:1/-1;justify-self:center;margin:6px}
.ipk-msg{padding:24px;text-align:center;opacity:.6}
`;
function injectCSS() {
  if (document.getElementById("ipk-css")) return;
  const s = document.createElement("style");
  s.id = "ipk-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

function pickFile(cb) {
  const inp = el("input", { type: "file", accept: "image/*", style: "display:none" });
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); };
  document.body.append(inp);
  inp.click();
}

const ago = (t) => {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t * 1000).toLocaleDateString();
};

// ---------- popup ----------
let openPopup = null;

function closePopup() {
  if (!openPopup) return;
  openPopup.cleanup();
  openPopup = null;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const mb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : (n / 1048576).toFixed(1) + " MB");
const under = (f, d) => !d || f.folder === d || f.folder.startsWith(d + "/");

function showPicker(node, anchor) {
  closePopup();
  const cur = parseValue(node._ipk.widget.value);
  const st = {
    source: cur.rel ? cur.source : store.get("source", "output"),
    dir: cur.rel ? cur.folder : "",
    q: "",
    size: store.get("size", "L"),
    files: [],
    shown: RENDER_STEP,
    newDirs: new Set(),
    scrollToSel: true,
  };

  const q = el("input", { placeholder: "Filter images…" });
  const srcSeg = el("div", { class: "ipk-seg" });
  const sizeSeg = el("div", { class: "ipk-seg" });
  const mkBtn = el("button", { class: "ipk-btn", title: "New folder here (input only)" }, "+ Folder");
  const upBtn = el("button", { class: "ipk-btn", title: "Upload from this computer (saved to input)" }, "⬆ Upload");
  const reBtn = el("button", { class: "ipk-btn", title: "Reload list" }, "⟳");
  const crumbs = el("div", { class: "ipk-crumbs" });
  const grid = el("div", { class: "ipk-grid" });
  const main = el("div", { class: "ipk-main" }, grid);
  const foot = el("div", { class: "ipk-foot" });
  const pop = el("div", { class: "ipk-pop" },
    el("div", { class: "ipk-head" }, "🔍", q, srcSeg, mkBtn, upBtn, reBtn, sizeSeg), crumbs, main, foot);

  // position near the anchor, clamped to the viewport
  const W = Math.min(900, innerWidth - 24), H = Math.min(720, innerHeight - 24);
  const r = anchor.getBoundingClientRect();
  pop.style.width = W + "px";
  pop.style.height = H + "px";
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - W - 12)) + "px";
  pop.style.top = Math.max(12, Math.min(r.bottom + 6, innerHeight - H - 12)) + "px";
  document.body.append(pop);

  const seg = (box, items, get, set) => {
    box.replaceChildren(...items.map(([v, label]) => el("button", {
      class: get() === v ? "on" : "", onclick: () => { set(v); },
    }, label)));
  };
  const drawHead = () => {
    seg(srcSeg, [["input", "Input"], ["output", "Output"]], () => st.source, (v) => load(v));
    seg(sizeSeg, [["S", "S"], ["L", "L"]], () => st.size, (v) => { st.size = v; store.set("size", v); drawHead(); draw(); });
    mkBtn.style.display = st.source === "input" ? "" : "none";
  };

  // Immediate subfolders of `d`, each with its newest image as cover and
  // totals over everything below it. Files arrive newest first.
  const children = (d) => {
    const pre = d ? d + "/" : "";
    const m = new Map();
    for (const f of st.files) {
      if (f.folder === d || !f.folder.startsWith(pre)) continue;
      const name = f.folder.slice(pre.length).split("/")[0];
      const c = m.get(name) || { n: 0, size: 0, cover: null };
      c.n++;
      c.size += f.size;
      c.cover ||= f;
      m.set(name, c);
    }
    for (const x of st.newDirs) {
      if (st.source !== "input" || x === d || !x.startsWith(pre)) continue;
      const name = x.slice(pre.length).split("/")[0];
      if (!m.has(name)) m.set(name, { n: 0, size: 0, cover: null });
    }
    return [...m.entries()].sort((a, b) => (b[1].cover?.mtime || Infinity) - (a[1].cover?.mtime || Infinity));
  };

  const go = (d) => {
    st.dir = d;
    st.q = q.value = "";
    st.shown = RENDER_STEP;
    draw();
    main.scrollTop = 0;
  };

  const draw = () => {
    const parts = st.dir ? st.dir.split("/") : [];
    const cs = [el("span", { class: "c" + (parts.length ? "" : " cur"), onclick: () => go("") }, `📁 ${st.source}`)];
    parts.forEach((p, i) => {
      const d = parts.slice(0, i + 1).join("/");
      cs.push(el("span", { class: "sep" }, "›"),
        el("span", { class: "c" + (i === parts.length - 1 ? " cur" : ""), onclick: () => go(d) }, p));
    });
    crumbs.replaceChildren(...cs);

    const big = st.size === "L";
    grid.style.setProperty("--ipk-t", big ? "150px" : "96px");
    const tsize = big ? 320 : 192;
    const needle = st.q.toLowerCase();
    const dirs = needle ? [] : children(st.dir);
    const files = needle
      ? st.files.filter((f) => under(f, st.dir) && relOf(f).toLowerCase().includes(needle))
      : st.files.filter((f) => f.folder === st.dir);
    const sel = node._ipk.widget.value;
    const pre = st.dir ? st.dir + "/" : "";
    const out = [];
    if (parts.length && !needle) {
      out.push(el("div", { class: "ipk-tile ipk-dir", title: "Up one level", onclick: () => go(parts.slice(0, -1).join("/")) },
        el("div", { class: "ico" }, "↩")));
    }
    for (const [name, c] of dirs) {
      out.push(el("div", { class: "ipk-tile ipk-dir", title: pre + name, onclick: () => go(pre + name) },
        c.cover ? el("img", { loading: "lazy", src: thumbURL(st.source, relOf(c.cover), tsize, c.cover.mtime) }) : el("div", { class: "ico" }, "📁"),
        el("div", { class: "cap" }, el("b", {}, "📁 " + name), el("small", {}, `${plural(c.n, "image")} · ${mb(c.size)}`))));
    }
    for (const f of files.slice(0, st.shown)) {
      const v = valueOf(st.source, f);
      out.push(el("div", {
        class: "ipk-tile" + (v === sel ? " on" : ""),
        title: `${needle ? relOf(f) : f.name}\n${ago(f.mtime)} · ${mb(f.size)}`,
        onclick: () => { select(node, st.source, f); closePopup(); },
      }, el("img", { loading: "lazy", src: thumbURL(st.source, relOf(f), tsize, f.mtime) })));
    }
    if (files.length > st.shown) {
      out.push(el("button", { class: "ipk-btn ipk-more", onclick: () => { st.shown += RENDER_STEP; draw(); } },
        `Show more (${files.length - st.shown} left)`));
    }
    grid.replaceChildren(...out);
    if (!dirs.length && !files.length) {
      grid.append(el("div", { class: "ipk-msg", style: "grid-column:1/-1" }, needle ? "No match" : "Empty folder"));
    }
    foot.textContent = `${dirs.length ? plural(dirs.length, "folder") + " · " : ""}${plural(files.length, "image")} · ${st.source}/${st.dir}`;
    if (st.scrollToSel) {
      st.scrollToSel = false;
      grid.querySelector(".ipk-tile.on")?.scrollIntoView({ block: "center" });
    }
  };

  async function load(source, force) {
    if (source !== st.source) st.dir = source === cur.source && cur.rel ? cur.folder : "";
    st.source = source;
    store.set("source", source);
    drawHead();
    grid.replaceChildren(el("div", { class: "ipk-msg", style: "grid-column:1/-1" }, "Loading…"));
    try {
      st.files = await listFiles(source, force);
    } catch (e) {
      grid.replaceChildren(el("div", { class: "ipk-msg", style: "grid-column:1/-1" }, String(e)));
      return;
    }
    if (st.dir && !st.newDirs.has(st.dir) && !st.files.some((f) => under(f, st.dir))) st.dir = "";
    st.shown = RENDER_STEP;
    draw();
  }

  q.addEventListener("input", () => { st.q = q.value; st.shown = RENDER_STEP; draw(); });
  reBtn.onclick = () => load(st.source, true);
  mkBtn.onclick = async () => {
    const name = prompt(`New folder inside input/${st.dir ? st.dir + "/" : ""}`);
    if (!name) return;
    const full = (st.dir ? st.dir + "/" : "") + name.trim().replace(/^\/+|\/+$/g, "");
    const r = await api.fetchApi("/image_picker/mkdir", { method: "POST", body: JSON.stringify({ name: full }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "failed");
    st.newDirs.add(j.folder);
    go(j.folder);
  };
  upBtn.onclick = () => pickFile(async (file) => {
    try {
      const f = await uploadFile(file, st.source === "input" ? st.dir : "");
      select(node, "input", f);
      closePopup();
    } catch (e) { alert(e.message); }
  });

  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopup(); };
  const onKey = (e) => {
    if (e.key === "Escape") closePopup();
    else if (e.key === "Backspace" && (e.target !== q || !q.value) && st.dir) { e.preventDefault(); go(st.dir.split("/").slice(0, -1).join("/")); }
    else return;
    e.stopPropagation();
  };
  setTimeout(() => document.addEventListener("pointerdown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  pop.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  openPopup = { cleanup() { pop.remove(); document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); } };

  load(st.source);
  q.focus();
}

// ---------- node ----------
function select(node, source, f) {
  node._ipk.widget.value = valueOf(source, f);
  node._ipk.widget.callback?.(node._ipk.widget.value);
  refresh(node);
  app.graph.setDirtyCanvas(true, true);
}

function refresh(node) {
  const { widget, prev, label } = node._ipk;
  const v = parseValue(widget.value);
  label.textContent = v.rel ? `${v.source}/${v.rel}` : "No image selected — drop a file here";
  label.title = label.textContent;
  if (!v.rel) return prev.replaceChildren(el("span", { class: "empty" }, "🖼"));
  const known = lists[v.source]?.find((f) => relOf(f) === v.rel);
  const img = el("img", { src: thumbURL(v.source, v.rel, 512, known?.mtime || Date.now()) });
  img.onerror = () => prev.replaceChildren(el("span", { class: "empty" }, "⚠ not found"));
  prev.replaceChildren(img);
}

async function step(node, dir) {
  const v = parseValue(node._ipk.widget.value);
  const files = (await listFiles(v.source, true)).filter((f) => f.folder === v.folder);
  if (!files.length) return;
  const i = files.findIndex((f) => f.name === v.name);
  select(node, v.source, files[((i < 0 ? 0 : i + dir) % files.length + files.length) % files.length]);
}

async function uploadAndSelect(node, file) {
  try { select(node, "input", await uploadFile(file, "")); } catch (e) { alert(e.message); }
}

function setupNode(node) {
  injectCSS();
  const widget = node.widgets.find((w) => w.name === "image");
  widget.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.options = { ...(widget.options || {}), canvasOnly: true };

  const browse = el("button", { class: "ipk-btn grow", title: "Choose from input / output" }, "📂 Browse…");
  const upload = el("button", { class: "ipk-btn", title: "Upload from this computer" }, "⬆");
  const prevB = el("button", { class: "ipk-btn", title: "Previous in folder" }, "◀");
  const nextB = el("button", { class: "ipk-btn", title: "Next in folder" }, "▶");
  const label = el("div", { class: "ipk-name" });
  const prev = el("div", { class: "ipk-prev" });
  const root = el("div", { class: "ipk-node" }, el("div", { class: "ipk-bar" }, browse, upload, prevB, nextB), label, prev);

  browse.onclick = () => showPicker(node, browse);
  prev.ondblclick = () => showPicker(node, browse);
  upload.onclick = () => pickFile((f) => uploadAndSelect(node, f));
  prevB.onclick = () => step(node, -1);
  nextB.onclick = () => step(node, 1);
  root.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); root.classList.add("drop"); } });
  root.addEventListener("dragleave", () => root.classList.remove("drop"));
  root.addEventListener("drop", (e) => {
    root.classList.remove("drop");
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); e.stopPropagation(); uploadAndSelect(node, f); }
  });

  const dom = node.addDOMWidget("picker", "image_picker", root, {
    serialize: false,
    getValue: () => null,
    setValue: () => {},
    getMinHeight: () => 220,
  });
  dom.serialize = false;
  node._ipk = { widget, prev, label };

  // drop onto the canvas body of the node (outside the DOM widget)
  node.onDragOver = (e) => !!e.dataTransfer?.types?.includes("Files");
  node.onDragDrop = (e) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (!f) return false;
    uploadAndSelect(node, f);
    return true;
  };

  const sz = node.computeSize();
  node.setSize([Math.max(node.size[0], 300), Math.max(node.size[1], sz[1], 340)]);
  refresh(node);
}

app.registerExtension({
  name: "penguinhelmet.image_picker",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODES.includes(nodeData.name)) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = created?.apply(this, arguments);
      setupNode(this);
      return r;
    };
    const configure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = configure?.apply(this, arguments);
      if (this._ipk) refresh(this);
      return r;
    };
    const removed = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      closePopup();
      return removed?.apply(this, arguments);
    };
  },
});
