// Punto de entrada: carga los datos, enruta entre pantallas y registra el modo sin conexión.

import { loadState, getState, subscribe, update, flush, consumeReplaced } from "./state.js";
import { syncGame } from "./game.js";
import { celebrate, xpPop } from "./celebrate.js";
import { ensureFinance } from "./finance.js";
import { ensureAgenda } from "./agenda.js";
import { initQuickAdd, openQuickAdd } from "./quickadd.js";
import { renderSidebar, SHORTCUT_ROUTES } from "./sidebar.js";
import { initSync, noteLocalChange, onSyncStatus } from "./sync.js";
import { applyInbox } from "./inbox.js";
import { paintSyncStatus, askConflict } from "./views/sync-ui.js";
import { requestPersistence } from "./db.js";
import { toast, closeSheet } from "./ui.js";
import * as resumen from "./views/resumen.js";
import * as finanzas from "./views/finanzas.js";
import * as trabajo from "./views/trabajo.js";
import * as habitos from "./views/habitos.js";
import * as agenda from "./views/agenda.js";
import * as ajustes from "./views/ajustes.js";
import * as logros from "./views/logros.js";
import * as semana from "./views/semana.js";

const ROUTES = {
  resumen:  { view: resumen,  title: "Resumen" },
  finanzas: { view: finanzas, title: "Finanzas",           area: "fin" },
  trabajo:  { view: trabajo,  title: "Trabajo y estudios", area: "work" },
  habitos:  { view: habitos,  title: "Hábitos y deporte",  area: "hab" },
  agenda:   { view: agenda,   title: "Agenda",             area: "ag" },
  ajustes:  { view: ajustes,  title: "Ajustes" },
  logros:   { view: logros,   title: "Logros" },
  semana:   { view: semana,   title: "Semanas" }
};

const viewEl = document.getElementById("view");
let currentRoute = null;
let mountCtl = null;

const routeName = () => {
  const r = location.hash.replace("#", "");
  return ROUTES[r] ? r : "resumen";
};

function render({ scrollTop = false } = {}) {
  const name = routeName();
  const route = ROUTES[name];
  const changed = name !== currentRoute;
  currentRoute = name;

  viewEl.classList.toggle("enter", changed);
  viewEl.dataset.route = name;
  renderSidebar(getState(), name);
  viewEl.innerHTML = route.view.render(getState());
  mountCtl?.abort();
  mountCtl = new AbortController();
  route.view.mount?.(viewEl, getState(), mountCtl.signal);
  paintSyncStatus();
  document.title = name === "resumen" ? "Panel de Vida" : `${route.title} · Panel de Vida`;

  document.querySelectorAll(".tab").forEach(t => {
    if (t.dataset.area === route.area) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  if (changed || scrollTop) window.scrollTo(0, 0);
}

async function start() {
  await loadState();
  // Categorías por defecto y gastos fijos que hayan vencido desde la última vez
  update(s => { ensureFinance(s); ensureAgenda(s); syncGame(s, { silent: true }); });
  initQuickAdd();
  // Las vistas pueden pedir repintarse al cambiar su estado interno (pestaña, mes…)
  window.addEventListener("pv:render", () => { const y = window.scrollY; render(); window.scrollTo(0, y); });
  window.addEventListener("hashchange", () => render({ scrollTop: true }));
  // Al cambiar los datos, se vuelve a pintar la pantalla actual sin mover el scroll
  // y se recalcula la XP: si sube de nivel o desbloquea un logro, se celebra
  subscribe(state => {
    const silent = consumeReplaced();
    noteLocalChange();
    const { events, gained } = syncGame(state, { silent });
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (!silent) { xpPop(gained); celebrate(events); }
  });
  render();
  requestPersistence();
  initShortcuts();
  // Sincronización cifrada con GitHub (si está configurada en este dispositivo)
  onSyncStatus(paintSyncStatus);
  initSync({ onConflict: askConflict, onInbox: receiveInbox });
  // iOS congela la app al salir: guardar cualquier cambio pendiente antes
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

// Mensajes de los Atajos del iPhone (Siri y Salud) recogidos al sincronizar
function receiveInbox(messages) {
  let res = null;
  update(s => { res = applyInbox(s, messages); });
  if (res.done.length) toast(`Recibido de Siri/Salud: ${res.done.join(" · ")}`, { ms: 5000 });
  if (res.skipped.length) setTimeout(() => toast(`No se pudo apuntar: ${res.skipped.join(" · ")}`, { error: true, ms: 5000 }), res.done.length ? 5200 : 0);
}

// Atajos de teclado (ordenador): N = apuntar algo, 1-5 = secciones, Esc = cerrar
function initShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.("input, textarea, select, [contenteditable]")) return;
    const sheetOpen = !!document.querySelector("#sheet-root .sheet, .levelup");
    if ((e.key === "n" || e.key === "N") && !sheetOpen) { e.preventDefault(); openQuickAdd(); }
    else if (/^[1-5]$/.test(e.key) && !sheetOpen) { location.hash = "#" + SHORTCUT_ROUTES[Number(e.key) - 1]; }
    else if (e.key === "Escape") closeSheet();
  });
}

start().catch(err => {
  console.error(err);
  viewEl.innerHTML = `<div class="card"><h2 class="card-h">No se pudo abrir la app</h2><p class="muted">${String(err.message || err)}</p></div>`;
});

// Modo sin conexión y actualizaciones automáticas
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Cuando se publica una versión nueva, el service worker la instala y la app se recarga sola
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    try { sessionStorage.setItem("pv-updated", "1"); } catch { /* sin almacenamiento */ }
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then(reg => {
      // Comprobar si hay versión nueva cada vez que la app vuelve a primer plano
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(console.error);
  });
  try {
    if (sessionStorage.getItem("pv-updated")) {
      sessionStorage.removeItem("pv-updated");
      setTimeout(() => toast("App actualizada a la última versión"), 600);
    }
  } catch { /* sin almacenamiento */ }
}
