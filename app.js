// ---------- LOGIN GUARD ----------
const access = getAccess();           // { role: "teacher" | "student", ... } or null
if (!access) {
  window.location.replace("login.html");
}
const isStudent = !!access && access.role === "student";

const $ = id => document.getElementById(id);
$("whoami").textContent = access ? access.name : "";

$("logoutBtn").addEventListener("click", () => {
  logout();
  window.location.href = "login.html";
});

// A student only ever sees their own grade + section. Teachers see everything.
const inScope = h => !!access && (!isStudent || (h.grade === access.grade && h.section === access.section));

if (isStudent) {
  $("dropIn").classList.add("hidden");
  $("codeGen").classList.add("hidden");
  $("locLabel").textContent = `🏫 Classroom Pickup : ${access.section} Section`;
  $("grade").value = access.grade;   $("grade").disabled = true;
  $("section").value = access.section; $("section").disabled = true;
} else {
  $("locLabel").textContent = "🏫 Classroom Pickup : All sections";
}

// ---------- DATA ----------
const day = 86400000;
const fwd = n => new Date(Date.now() + n * day);

let handouts = [];   // starts empty: add handouts with Teacher Drop-In

// ---------- STORAGE (IndexedDB: keeps handouts and their files after a refresh) ----------
const dbReady = new Promise(resolve => {
  try {
    const req = indexedDB.open("lnhsHandouts", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handouts", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  } catch (e) { resolve(null); }
});
async function dbAll() {
  const db = await dbReady;
  if (!db) return [];
  return new Promise(res => {
    const r = db.transaction("handouts").objectStore("handouts").getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => res([]);
  });
}
async function dbPut(rec) {
  const db = await dbReady;
  if (!db) return;
  db.transaction("handouts", "readwrite").objectStore("handouts").put(rec);
}
function hydrate(rec) {   // stored record -> in-memory handout with a fresh file URL
  return { ...rec, fileUrl: rec.file ? URL.createObjectURL(rec.file) : "" };
}
const getSubjects = () => [...new Set(handouts.map(h => h.subject))];

// ---------- STATE ----------
const state = {
  subject: "All", view: "crate", page: "pickup",
  search: "", grade: "", section: "", date: "",
  saved: new Set(JSON.parse(localStorage.getItem("pickupList") || "[]")),
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = d => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

// ---------- FILTERING ----------
function matchesBase(h) {
  if (!inScope(h)) return false;
  const q = state.search.toLowerCase();
  if (q && !(h.title + h.subject + h.teacher).toLowerCase().includes(q)) return false;
  if (state.grade && h.grade !== state.grade) return false;
  if (state.section && h.section !== state.section) return false;
  const age = (Date.now() - h.assigned) / day;
  if (state.date === "today" && age >= 1) return false;
  if (state.date === "week" && age > 7) return false;
  if (state.date === "month" && age > 31) return false;
  if (state.page === "catchup" && age > 14) return false;
  if (state.page === "upcoming" && h.due < Date.now()) return false;
  if (state.page === "mylist" && !state.saved.has(h.id)) return false;
  return true;
}
const baseList = () => handouts.filter(matchesBase);
const visible = () => baseList().filter(h => state.subject === "All" || h.subject === state.subject);

// ---------- RENDER ----------
function renderSubjects() {
  const base = baseList();
  if (state.subject !== "All" && !getSubjects().includes(state.subject)) state.subject = "All";
  const tabs = [{ name: "All", label: "All Subjects", count: base.length }]
    .concat(getSubjects().map(s => ({ name: s, label: s, count: base.filter(h => h.subject === s).length })));
  $("subjects").innerHTML = tabs.map(t => `
    <button data-subject="${esc(t.name)}" class="${state.subject === t.name ? "active" : ""} ${t.count === 0 ? "empty" : ""}">
      ${esc(t.label)} <span class="count">${t.count}</span>
    </button>`).join("");
}

function cardHTML(h) {
  const saved = state.saved.has(h.id);
  return `
  <article class="card">
    <div class="subj">${esc(h.subject)}</div>
    <h3>${esc(h.title)}</h3>
    <div class="meta">👤 ${esc(h.teacher)}<br>🎓 Grade ${esc(h.grade)} – ${esc(h.section)}<br>📅 Assigned ${fmt(h.assigned)} · Due ${fmt(h.due)}</div>
    ${h.fileUrl ? `<a class="filelink" href="${h.fileUrl}" download="${esc(h.fileName)}" target="_blank" rel="noopener">📎 ${esc(h.fileName)}</a>` : ""}
    <div class="foot">
      <span class="copies ${h.copies <= 3 ? "low" : ""}">${h.copies} copies left</span>
      <div class="actions">
        <button data-save="${h.id}" class="${saved ? "saved" : ""}">${saved ? "✓ Saved" : "+ Pickup List"}</button>
        <button data-print="${h.id}">🖨️</button>
      </div>
    </div>
  </article>`;
}

function renderContent() {
  const list = visible();
  const el = $("content");
  $("crate").classList.toggle("plain", state.view !== "crate");
  $("visCount").textContent = list.length;
  $("docCount").textContent = `${list.length} document${list.length === 1 ? "" : "s"} inside`;
  $("crateSub").textContent = state.subject === "All" ? "Hanging folders with remaining paper copies" : `${state.subject} folder`;

  if (!list.length) { el.innerHTML = `<div class="empty-msg">📭 No handouts yet. Click “Teacher Drop-In” to add one.</div>`; return; }

  if (state.view === "table") {
    el.innerHTML = `<table><thead><tr><th>Title</th><th>Subject</th><th>Teacher</th><th>Grade/Section</th><th>Assigned</th><th>Due</th><th>Copies</th><th>File</th></tr></thead><tbody>
      ${list.map(h => `<tr><td>${esc(h.title)}</td><td>${esc(h.subject)}</td><td>${esc(h.teacher)}</td><td>${esc(h.grade)} – ${esc(h.section)}</td><td>${fmt(h.assigned)}</td><td>${fmt(h.due)}</td><td>${h.copies}</td><td>${h.fileUrl ? `<a class="filelink" href="${h.fileUrl}" download="${esc(h.fileName)}">📎 ${esc(h.fileName)}</a>` : "—"}</td></tr>`).join("")}
    </tbody></table>`;
  } else {
    el.innerHTML = `<div class="cards" style="${state.view === "grid" ? "grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px" : ""}">${list.map(cardHTML).join("")}</div>`;
  }
}

function render() { renderSubjects(); renderContent(); }

// ---------- EVENTS ----------
$("subjects").addEventListener("click", e => {
  const b = e.target.closest("button[data-subject]");
  if (!b) return;
  state.subject = b.dataset.subject;
  render();
});

$("views").addEventListener("click", e => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  state.view = b.dataset.view;
  document.querySelectorAll("#views button").forEach(x => x.classList.toggle("active", x === b));
  renderContent();
});

$("nav").addEventListener("click", e => {
  const b = e.target.closest("button[data-page]");
  if (!b) return;
  state.page = b.dataset.page;
  document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("active", x === b));
  render();
});

$("search").addEventListener("input", e => { state.search = e.target.value; render(); });
["grade", "section", "date"].forEach(id => $(id).addEventListener("change", e => { state[id] = e.target.value; render(); }));

$("content").addEventListener("click", e => {
  const s = e.target.closest("[data-save]");
  const p = e.target.closest("[data-print]");
  if (s) {
    const id = +s.dataset.save;
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    localStorage.setItem("pickupList", JSON.stringify([...state.saved]));
    toast(state.saved.has(id) ? "Added to My Pickup List" : "Removed from My Pickup List");
    render();
  }
  if (p) printFiles([handouts.find(x => x.id === +p.dataset.print)]);
});

// ---------- PRINT THE FILE (not the web page) ----------
const fileKind = h => {
  const t = (h.fileType || "").toLowerCase(), n = (h.fileName || "").toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return "image";
  if (t.startsWith("text/") || n.endsWith(".txt")) return "text";
  return "other";   // Word, PowerPoint, etc. can't be printed from a browser
};

function openFile(h) {   // fallback: let the person print it from the browser's own file viewer
  const a = document.createElement("a");
  a.href = h.fileUrl; a.target = "_blank"; a.rel = "noopener"; a.download = h.fileName;
  document.body.appendChild(a); a.click(); a.remove();
}

function printOne(h) {
  return new Promise(resolve => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    let loaded = false, done = false;
    const finish = () => { if (done) return; done = true; setTimeout(() => { frame.remove(); resolve(); }, 1000); };
    frame.onload = () => {
      loaded = true;
      setTimeout(() => {   // small wait so the built-in PDF viewer is ready
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { openFile(h); }
        finish();
      }, 400);
    };
    if (fileKind(h) === "image") {
      frame.srcdoc = `<!doctype html><title>${esc(h.title)}</title><style>@page{margin:0}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:0 auto}</style><img src="${h.fileUrl}">`;
    } else {
      frame.src = h.fileUrl;
    }
    document.body.appendChild(frame);
    // Some browsers (most phones) download PDFs instead of showing them inline, so load never fires
    setTimeout(() => { if (!loaded) { openFile(h); toast(`Opened ${h.fileName}: print it from there.`); } finish(); }, 6000);
  });
}

async function printFiles(list) {
  list = list.filter(Boolean);
  const withFile = list.filter(h => h.fileUrl);
  const printable = withFile.filter(h => fileKind(h) !== "other");
  const other = withFile.filter(h => fileKind(h) === "other");

  if (!withFile.length) return toast(list.length > 1 ? "None of these handouts has a file attached." : "This handout has no file attached.");

  for (const h of printable) {
    toast(`Printing ${h.fileName}...`);
    await printOne(h);
  }
  // Word / PowerPoint files: download them so they can be printed from the right app
  other.forEach(openFile);
  if (other.length) toast(`${other.length} file${other.length > 1 ? "s" : ""} downloaded: open ${other.length > 1 ? "them" : "it"} to print (browsers can't print Word/PowerPoint directly).`);
}

function printVisible() {
  const list = visible();
  if (!list.length) return toast("Nothing to print.");
  printFiles(list);
}
$("printAll").addEventListener("click", printVisible);
$("printPacket").addEventListener("click", printVisible);

// File attach (click or drag & drop)
let pickedFile = null;
function setFile(f) {
  pickedFile = f;
  $("fileLabel").innerHTML = f ? `<span class="fname">${esc(f.name)}</span>` : "Click to choose a file or drag it here";
}
$("dropzone").addEventListener("click", () => $("fFile").click());
$("fFile").addEventListener("click", e => e.stopPropagation());
$("fFile").addEventListener("change", e => setFile(e.target.files[0] || null));
["dragenter", "dragover"].forEach(ev => $("dropzone").addEventListener(ev, e => { e.preventDefault(); $("dropzone").classList.add("over"); }));
["dragleave", "drop"].forEach(ev => $("dropzone").addEventListener(ev, e => { e.preventDefault(); $("dropzone").classList.remove("over"); }));
$("dropzone").addEventListener("drop", e => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

// Teacher drop-in modal
$("dropIn").addEventListener("click", () => {
  $("subjectList").innerHTML = getSubjects().map(s => `<option value="${esc(s)}">`).join("");
  $("modalBg").classList.add("open");
});
$("cancelDrop").addEventListener("click", () => $("modalBg").classList.remove("open"));
$("dropForm").addEventListener("submit", e => {
  e.preventDefault();
  if (isStudent) return;   // only teachers can post files
  const rec = {
    id: Date.now(), title: $("fTitle").value, teacher: $("fTeacher").value, subject: $("fSubject").value.trim(),
    grade: $("fGrade").value, section: $("fSection").value, assigned: new Date(), due: fwd(7), copies: +$("fCopies").value || 1,
    fileName: pickedFile ? pickedFile.name : "", fileType: pickedFile ? pickedFile.type : "", file: pickedFile || null,
  };
  dbPut(rec);
  handouts.push(hydrate(rec));
  $("dropForm").reset();
  setFile(null);
  $("modalBg").classList.remove("open");
  toast("Handout added!");
  render();
});

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2000);
}

// ---------- CODE GENERATOR (teachers only) ----------
function renderCodes() {
  const codes = getCodes().slice().reverse();
  $("codeList").innerHTML = codes.length ? codes.map(c => `
    <div class="code-row">
      <span class="code">${esc(c.code)}</span>
      <span class="for">Grade ${esc(c.grade)} – ${esc(c.section)}</span>
      <button data-copy="${esc(c.code)}">Copy</button>
      <button data-revoke="${esc(c.code)}" class="revoke">Revoke</button>
    </div>`).join("") : `<div class="code-empty">No codes yet.</div>`;
}
if (!isStudent) {
  $("codeGen").addEventListener("click", () => { renderCodes(); $("codeBg").classList.add("open"); });
  $("closeCodes").addEventListener("click", () => $("codeBg").classList.remove("open"));
  $("makeCode").addEventListener("click", () => {
    const code = generateCode($("cGrade").value, $("cSection").value);
    renderCodes();
    toast(`New code: ${code}`);
  });
  $("codeList").addEventListener("click", e => {
    const cp = e.target.closest("[data-copy]"), rv = e.target.closest("[data-revoke]");
    if (cp) {
      const v = cp.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast("Copied " + v), () => toast("Copy failed. Select the code and copy it."));
    }
    if (rv && confirm(`Revoke ${rv.dataset.revoke}? Students using it will be logged out.`)) {
      saveCodes(getCodes().filter(c => c.code !== rv.dataset.revoke));
      renderCodes();
    }
  });
}

// Load saved handouts, then draw (a student's session only ever receives their own section)
render();
dbAll().then(rows => { handouts = rows.map(hydrate).filter(inScope); render(); });
