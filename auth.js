// Shared account helpers (demo only: accounts live in this browser's localStorage)
const USERS_KEY = "lnhsUsers";
// Teachers must enter this key when they sign up (so students can't make teacher accounts). CHANGE IT.
const TEACHER_KEY = "LNHS-TEACHER";
const SESSION_KEY = "lnhsSession";

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch (e) { return []; }
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function getSession() {
  const a = getAccess();
  return a ? a.name : null;
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "auth-msg " + type;
}
function wireSocialButtons() {
  document.querySelectorAll("[data-social]").forEach(b =>
    b.addEventListener("click", () => alert("Social login is not available yet. Please use username and password.")));
}

// ---------- Section codes (teacher generates, student logs in with one) ----------
const CODES_KEY = "lnhsCodes";
const CODE_SESSION_KEY = "lnhsCodeSession";

function getCodes() {
  try { return JSON.parse(localStorage.getItem(CODES_KEY) || "[]"); } catch (e) { return []; }
}
function saveCodes(codes) {
  localStorage.setItem(CODES_KEY, JSON.stringify(codes));
}
// No look-alike characters (0/O, 1/I/L) so codes are easy to read out loud or copy from the board
function generateCode(grade, section) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codes = getCodes();
  let code;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const s = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
    code = s.slice(0, 3) + "-" + s.slice(3);
  } while (codes.some(c => c.code === code));
  codes.push({ code, grade: String(grade), section, created: Date.now() });
  saveCodes(codes);
  return code;
}
function normalizeCode(v) {
  const s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 6 ? s.slice(0, 3) + "-" + s.slice(3) : s;
}

// Who is logged in? teacher (username + password) or student (section code), else null
function getAccess() {
  const who = localStorage.getItem(SESSION_KEY);
  const acct = who && getUsers().find(u => u.username === who);
  if (acct) {
    if (acct.role === "student") return { role: "student", name: acct.username, grade: acct.grade, section: acct.section };
    return { role: "teacher", name: acct.username };   // accounts made before roles existed count as teachers
  }
  const c = localStorage.getItem(CODE_SESSION_KEY);
  const rec = c && getCodes().find(x => x.code === c);   // a revoked code logs the student out
  if (rec) return { role: "student", code: rec.code, grade: rec.grade, section: rec.section, name: `Grade ${rec.grade} – ${rec.section}` };
  return null;
}
function logout() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CODE_SESSION_KEY);
}
