// Utilidades de interfaz: escape de HTML, formatos, hoja inferior y avisos.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Formato español con punto de miles siempre (Intl no agrupa números de 4 cifras en es-ES)
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const money = n => {
  const v = Math.round((n || 0) * 100) / 100;
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "−" : ""}${group(i)},${d} €`;
};
export const int = n => `${n < 0 ? "−" : ""}${group(String(Math.round(Math.abs(n || 0))))}`;

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const longDate = (d = new Date()) =>
  new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric" }).format(d);
export const monthName = (d = new Date()) =>
  new Intl.DateTimeFormat("es-ES", { month: "long" }).format(d);
export const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Avisos breves
export function toast(msg, { error = false, ms = 2600 } = {}) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = msg;
  root.replaceChildren(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Hoja inferior
let closeCurrent = null;

export function openSheet(html, { onOpen, onClose } = {}) {
  closeSheet();
  const root = document.getElementById("sheet-root");
  root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  const sheet = root.querySelector(".sheet");
  const onKey = e => { if (e.key === "Escape") closeSheet(); };
  root.onclick = e => { if (e.target.closest("[data-close]")) closeSheet(); };
  document.addEventListener("keydown", onKey);
  closeCurrent = () => {
    document.removeEventListener("keydown", onKey);
    root.innerHTML = "";
    onClose?.();
  };
  onOpen?.(sheet);
  sheet.querySelector("button, input, a")?.focus({ preventScroll: true });
  return sheet;
}

export function closeSheet() {
  const fn = closeCurrent;
  closeCurrent = null;
  fn?.();
}

// Confirmación dentro de la app (sustituye a confirm())
export function confirmSheet({ title, text, ok = "Confirmar", danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    openSheet(`
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <div class="btn-row">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn ${danger ? "danger" : "primary"}" type="button" id="confirm-ok">${esc(ok)}</button>
      </div>`, {
      onOpen: s => s.querySelector("#confirm-ok").addEventListener("click", () => { answered = true; closeSheet(); resolve(true); }),
      onClose: () => { if (!answered) resolve(false); }
    });
  });
}
