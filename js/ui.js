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

function attachSwipeToDismiss(sheet, backdrop, onDismiss) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let isGrabberTouch = false;

  const onTouchStart = e => {
    if (e.touches.length !== 1) return;
    const isAtTop = sheet.scrollTop <= 0;
    const onGrabber = e.target.closest(".grabber, .sheet-close-btn") !== null;
    isGrabberTouch = onGrabber;
    if (!isAtTop && !onGrabber) return;

    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sheet.style.transition = "none";
    if (backdrop) backdrop.style.transition = "none";
  };

  const onTouchMove = e => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      if (e.cancelable) e.preventDefault();
      sheet.style.transform = `translateY(${deltaY}px)`;
      if (backdrop) {
        const progress = Math.min(1, deltaY / 280);
        backdrop.style.opacity = `${Math.max(0, 1 - progress * 0.85)}`;
      }
    } else {
      sheet.style.transform = "";
      if (backdrop) backdrop.style.opacity = "";
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const deltaY = currentY - startY;
    const threshold = isGrabberTouch ? 45 : 85;

    if (deltaY > threshold) {
      sheet.style.transition = "transform .22s cubic-bezier(.2, .8, .2, 1), opacity .22s ease";
      sheet.style.transform = "translateY(100%)";
      sheet.style.opacity = "0";
      if (backdrop) {
        backdrop.style.transition = "opacity .22s ease";
        backdrop.style.opacity = "0";
      }
      setTimeout(() => {
        onDismiss();
      }, 210);
    } else {
      sheet.style.transition = "transform .2s ease-out, opacity .2s ease-out";
      sheet.style.transform = "";
      sheet.style.opacity = "";
      if (backdrop) {
        backdrop.style.transition = "opacity .2s ease-out";
        backdrop.style.opacity = "";
      }
      setTimeout(() => {
        sheet.style.transition = "";
        if (backdrop) backdrop.style.transition = "";
      }, 200);
    }
  };

  sheet.addEventListener("touchstart", onTouchStart, { passive: false });
  sheet.addEventListener("touchmove", onTouchMove, { passive: false });
  sheet.addEventListener("touchend", onTouchEnd);
  sheet.addEventListener("touchcancel", onTouchEnd);
}

export function openSheet(html, { onOpen, onClose } = {}) {
  closeSheet(true);
  const root = document.getElementById("sheet-root");
  root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grabber" data-drag-hint></div>
      <button class="sheet-close-btn" type="button" data-close aria-label="Cerrar ventana" title="Cerrar (Esc)">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="1" y1="1" x2="13" y2="13"></line>
          <line x1="13" y1="1" x2="1" y2="13"></line>
        </svg>
      </button>
      ${html}
    </div>`;
  const sheet = root.querySelector(".sheet");
  const backdrop = root.querySelector(".sheet-backdrop");
  const onKey = e => { if (e.key === "Escape") closeSheet(); };
  root.onclick = e => { if (e.target.closest("[data-close]")) closeSheet(); };
  document.addEventListener("keydown", onKey);

  attachSwipeToDismiss(sheet, backdrop, () => closeSheet(true));

  closeCurrent = (skipAnim = false) => {
    document.removeEventListener("keydown", onKey);
    if (skipAnim) {
      root.innerHTML = "";
      onClose?.();
      return;
    }
    sheet?.classList.add("sheet-closing");
    backdrop?.classList.add("backdrop-closing");
    setTimeout(() => {
      root.innerHTML = "";
      onClose?.();
    }, 190);
  };

  onOpen?.(sheet);
  sheet.querySelector("button, input, a")?.focus({ preventScroll: true });
  return sheet;
}

export function closeSheet(immediate = false) {
  const fn = closeCurrent;
  closeCurrent = null;
  fn?.(immediate);
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
