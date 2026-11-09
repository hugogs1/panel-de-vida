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
import { setHabitValue } from "./habits.js";
import { iso } from "./stats.js";
import * as resumen from "./views/resumen.js";
import * as finanzas from "./views/finanzas.js";
import * as habitos from "./views/habitos.js";
import * as agenda from "./views/agenda.js";
import * as ajustes from "./views/ajustes.js";
import * as logros from "./views/logros.js";
import * as semana from "./views/semana.js";

const ROUTES = {
  resumen:  { view: resumen,  title: "Agenda Hoy",        area: "resumen" },
  finanzas: { view: finanzas, title: "Cartera y Finanzas", area: "fin" },
  habitos:  { view: habitos,  title: "Hábitos y Deporte",  area: "hab" },
  agenda:   { view: agenda,   title: "Agenda y Tareas",    area: "ag" },
  ajustes:  { view: ajustes,  title: "Ajustes" },
  logros:   { view: logros,   title: "Logros" },
  semana:   { view: semana,   title: "Semanas" }
};

const viewEl = document.getElementById("view");
let currentRoute = null;
let mountCtl = null;

const routeName = () => {
  const r = location.hash.replace("#", "");
  if (r === "trabajo") return "resumen";
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


// Sincronización instantánea directa mediante hash URL (para Atajos de iOS / enlaces directos)
function handleDirectSync() {
  const hash = location.hash;
  if (!hash.startsWith("#sync")) return false;

  const qIdx = hash.indexOf("?");
  if (qIdx >= 0) {
    const params = new URLSearchParams(hash.slice(qIdx));
    let rawFecha = params.get("fecha") || params.get("date") || "hoy";
    let fecha = iso();
    if (rawFecha === "ayer") {
      const d = new Date(); d.setDate(d.getDate() - 1);
      fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(rawFecha)) {
      fecha = rawFecha.slice(0, 10);
    }

    const pasos = parseInt(params.get("pasos") || params.get("steps") || "0", 10);
    const gymMin = parseInt(params.get("gym") || params.get("fuerza") || "0", 10);
    const gymTitle = params.get("gym_title") || "Entrenamiento de fuerza (Hevy)";
    const deporte = params.get("deporte") || params.get("sport") || "";
    const deporteMin = parseInt(params.get("deporte_min") || params.get("minutos") || "0", 10);
    const batchJson = params.get("batch") || params.get("lote") || "";

    update(s => {
      if (batchJson) {
        try {
          const items = JSON.parse(decodeURIComponent(batchJson));
          if (Array.isArray(items)) {
            applyInbox(s, [{ name: `sync-batch-${Date.now()}`, text: JSON.stringify(items) }]);
          }
        } catch (e) {
          console.warn("Error al procesar lote JSON de URL", e);
        }
      }

      if (pasos > 0) {
        let h = s.habits.habits.find(x => x.id === "hb-pasos-salud" || /paso/i.test(x.name || ""));
        if (!h) {
          h = { id: "hb-pasos-salud", name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: iso() };
          s.habits.habits.push(h);
        }
        setHabitValue(s, h.id, fecha, pasos);
      }

      if (gymMin > 0) {
        s.habits.workouts ||= [];
        const existing = s.habits.workouts.find(w => w.date === fecha && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
        if (existing) {
          existing.minutes = gymMin;
          existing.title = gymTitle;
          existing.source = "salud";
        } else {
          s.habits.workouts.push({
            id: `wo-gym-${fecha}-${Date.now().toString(36)}`,
            date: fecha,
            type: "gym",
            sport: "gym",
            title: gymTitle,
            minutes: gymMin,
            exercises: [],
            note: "Sincronizado vía URL / Atajo",
            source: "salud"
          });
        }
      }

      if (deporte && deporteMin > 0) {
        s.habits.workouts ||= [];
        const sportKind = /camin|andar|paseo|walk/i.test(deporte) ? "andar" : (/correr|running/i.test(deporte) ? "correr" : (/futbol/i.test(deporte) ? "futbol" : "actividad"));
        const existing = s.habits.workouts.find(w => w.date === fecha && (w.type === "deporte" || w.sport === sportKind));
        if (existing) {
          existing.minutes = deporteMin;
          existing.source = "salud";
        } else {
          s.habits.workouts.push({
            id: `wo-sport-${fecha}-${Date.now().toString(36)}`,
            date: fecha,
            type: sportKind === "futbol" ? "futbol" : "deporte",
            sport: sportKind,
            title: deporte,
            minutes: deporteMin,
            note: "Sincronizado vía URL / Atajo",
            source: "salud"
          });
        }
      }
    });

    toast(`✅ Sincronizados datos de fitness para ${fecha}`, { ms: 4000 });
    history.replaceState(null, "", "#resumen");
    return true;
  }
  return false;
}

async function start() {
  await loadState();
  // Categorías por defecto y gastos fijos que hayan vencido desde la última vez
  update(s => { ensureFinance(s); ensureAgenda(s); syncGame(s, { silent: true }); });
  initQuickAdd();
  // Las vistas pueden pedir repintarse al cambiar su estado interno (pestaña, mes…)
  window.addEventListener("pv:render", () => { const y = window.scrollY; render(); window.scrollTo(0, y); });
  window.addEventListener("hashchange", () => {
    if (handleDirectSync()) return;
    render({ scrollTop: true });
  });
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
  handleDirectSync();
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

// Atajos de teclado (ordenador): N = apuntar algo, 1-4 = secciones, Esc = cerrar
function initShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.("input, textarea, select, [contenteditable]")) return;
    const sheetOpen = !!document.querySelector("#sheet-root .sheet, .levelup");
    if ((e.key === "n" || e.key === "N") && !sheetOpen) { e.preventDefault(); openQuickAdd(); }
    else if (/^[1-4]$/.test(e.key) && !sheetOpen) { location.hash = "#" + SHORTCUT_ROUTES[Number(e.key) - 1]; }
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
      // Comprobar actualización de forma inmediata al abrir la app
      reg.update().catch(() => {});
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
