// Ajustes: perfil, copias de seguridad, instalación y datos.

import { update, getState, replaceState, defaultState } from "../state.js";
import { exportBackup, readBackupFile, applyBackup } from "../backup.js";
import { esc, toast, confirmSheet, daysSince } from "../ui.js";
import { icon } from "../icons.js";
import { requestPersistence } from "../db.js";
import { buildDemo } from "../demo.js";
import { homeBtn } from "./area.js";
import { syncCard, mountSyncCard } from "./sync-ui.js";
import { atajosCard, mountAtajosCard } from "./atajos.js";
import { hevyCard, mountHevyCard } from "./hevy-ui.js";
import { syncConfigured } from "../sync.js";
import { hasAnyData, iso } from "../stats.js";

const fmt = iso => iso ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Nunca";
const isStandalone = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (typeof navigator !== "undefined" && navigator.standalone === true);

export function render(state) {
  const last = state.settings.lastBackupAt;
  const ago = daysSince(last);
  return `
    <header class="topbar">
      ${homeBtn()}
      <h1 class="page-h">Ajustes</h1>
    </header>

    ${isStandalone() ? "" : `
    <section class="card">
      <h2 class="card-h">Instalar en el iPhone</h2>
      <ol class="roadmap" style="--c:var(--cyan);padding:0">
        <li>Abre esta página en <b>Safari</b>.</li>
        <li>Pulsa el botón <b>Compartir</b> (cuadrado con flecha hacia arriba).</li>
        <li>Elige <b>Añadir a pantalla de inicio</b> y confirma.</li>
      </ol>
    </section>`}

    <section class="card">
      <h2 class="card-h">Perfil de jugador</h2>
      <form id="profile-form" class="field" style="margin-top:10px">
        <label for="alias">Alias</label>
        <div class="btn-row">
          <input class="input" id="alias" name="alias" maxlength="24" autocomplete="off" value="${esc(state.profile.alias)}" style="flex:2">
          <button class="btn" type="submit">Guardar</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2 class="card-h">Copia de seguridad</h2>
      <div class="list">
        <div class="kv"><span>Última copia</span><span>${fmt(last)}</span></div>
        <div class="kv"><span>Recordatorio</span><span>Cada ${state.settings.backupEveryDays} días</span></div>
      </div>
      <p class="muted" style="font-size:13px;line-height:1.5;margin:8px 0 12px">
        Exportar crea un archivo <b>.json</b> con todos tus datos. En el iPhone, elige <b>Guardar en Archivos</b> (mejor en iCloud Drive).
        ${last && ago >= 7 ? `<br><span style="color:var(--warn)">Hace ${ago} días de la última copia.</span>` : ""}
      </p>
      <div class="btn-row">
        <button class="btn primary" type="button" id="export">Exportar copia</button>
        <label class="btn" for="import-file">Importar copia</label>
        <input class="sr-only" type="file" id="import-file" accept="application/json,.json">
      </div>
    </section>

    ${syncCard()}

    ${atajosCard(state)}

    ${hevyCard(state)}

    ${dataManagementCard(state)}

    ${demoCard(state)}

    <section class="card">
      <h2 class="card-h">Almacenamiento</h2>
      <div class="list">
        <div class="kv"><span>Dónde están tus datos</span><span>${syncConfigured() ? "Aquí y cifrados en GitHub" : "Solo en este dispositivo"}</span></div>
        <div class="kv"><span>Protección frente a borrado</span><span id="persist-state">Comprobando…</span></div>
        <div class="kv"><span>Versión de datos</span><span class="num">v${state.version}</span></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn danger" type="button" id="wipe">Borrar todos los datos</button>
      </div>
    </section>`;
}

function dataManagementCard(state) {
  const fitnessCount = (state.habits.workouts || []).length;
  const financeCount = (state.finance.transactions || []).length;
  const agendaTasksCount = (state.agenda.tasks || []).length;
  const agendaEventsCount = (state.agenda.events || []).length;
  const habitsLogsCount = (state.habits.logs || []).length;

  return `
    <section class="card">
      <h2 class="card-h">Gestión y borrado manual de datos</h2>
      <p class="muted" style="font-size:13px;line-height:1.5;margin:6px 0 14px">
        Elimina datos de apartados concretos o de un día en específico sin tocar el resto de la app.
      </p>

      <!-- Borrar por fecha concreta -->
      <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:14px">
        <b style="font-size:12.5px;display:flex;align-items:center;gap:6px;color:#fff;margin-bottom:4px">
          <span>📅</span> Borrar registros de una fecha concreta
        </b>
        <p class="muted" style="font-size:11px;margin-bottom:8px">Limpia pasos, entrenamientos, tareas y gastos que coincidan con el día elegido.</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" id="del-date-input" value="${iso()}" class="input" style="padding:6px 10px;font-size:12px;border-radius:8px">
          <button class="btn small danger" type="button" id="btn-del-by-date">🗑️ Borrar este día</button>
        </div>
      </div>

      <!-- Borrar por apartado -->
      <div class="list" style="gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)">
          <div>
            <b style="font-size:12.5px;display:flex;align-items:center;gap:6px;color:#fff"><span>👟</span> Fitness y Deportes</b>
            <small class="muted" style="font-size:11px">${fitnessCount} entrenos · historial de pasos</small>
          </div>
          <button class="btn small danger" type="button" id="btn-del-fitness">Borrar fitness</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)">
          <div>
            <b style="font-size:12.5px;display:flex;align-items:center;gap:6px;color:#fff"><span>💰</span> Finanzas (Movimientos)</b>
            <small class="muted" style="font-size:11px">${financeCount} movimientos (mantiene tus cuentas)</small>
          </div>
          <button class="btn small danger" type="button" id="btn-del-finance">Borrar gastos</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)">
          <div>
            <b style="font-size:12.5px;display:flex;align-items:center;gap:6px;color:#fff"><span>📅</span> Agenda</b>
            <small class="muted" style="font-size:11px">${agendaTasksCount} tareas · ${agendaEventsCount} eventos</small>
          </div>
          <button class="btn small danger" type="button" id="btn-del-agenda">Borrar agenda</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)">
          <div>
            <b style="font-size:12.5px;display:flex;align-items:center;gap:6px;color:#fff"><span>🔁</span> Historial de Hábitos</b>
            <small class="muted" style="font-size:11px">${habitsLogsCount} registros diarios de hábitos</small>
          </div>
          <button class="btn small danger" type="button" id="btn-del-habits">Borrar hábitos</button>
        </div>
      </div>
    </section>`;
}

function demoCard(state) {
  if (state.settings.demo) return `
    <section class="card">
      <h2 class="card-h">Datos de ejemplo</h2>
      <p class="muted" style="font-size:13px;line-height:1.5;margin:10px 0 12px">Ahora mismo ves datos inventados. Quítalos para empezar con los tuyos (tu alias se mantiene).</p>
      <button class="btn danger" type="button" id="demo-off">Quitar datos de ejemplo</button>
    </section>`;
  if (hasAnyData(state)) return "";
  return `
    <section class="card">
      <h2 class="card-h">Datos de ejemplo</h2>
      <p class="muted" style="font-size:13px;line-height:1.5;margin:10px 0 12px">Carga cuentas, hábitos, tareas y horas inventadas para ver cómo queda el panel con datos. Podrás quitarlos con un toque.</p>
      <button class="btn" type="button" id="demo-on">Cargar datos de ejemplo</button>
    </section>`;
}

export function mount(root) {
  mountSyncCard(root);
  mountAtajosCard(root);
  mountHevyCard(root);

  // Borrado manual por fecha concreta
  root.querySelector("#btn-del-by-date")?.addEventListener("click", async () => {
    const d = root.querySelector("#del-date-input")?.value;
    if (!d) return;
    const ok = await confirmSheet({
      title: `¿Borrar todos los datos del ${d}?`,
      text: "Se eliminarán los pasos, entrenamientos, tareas, eventos y gastos registrados en esta fecha exacta.",
      ok: "Borrar día",
      danger: true
    });
    if (!ok) return;
    update(st => {
      st.habits.workouts = (st.habits.workouts || []).filter(w => w.date !== d);
      st.habits.logs = (st.habits.logs || []).filter(l => l.date !== d);
      st.agenda.tasks = (st.agenda.tasks || []).filter(t => t.due !== d);
      st.agenda.events = (st.agenda.events || []).filter(e => e.date !== d);
      st.finance.transactions = (st.finance.transactions || []).filter(t => t.date !== d);
      if (st.habits.sleep) st.habits.sleep = st.habits.sleep.filter(s => s.date !== d);
      if (st.habits.nutrition) st.habits.nutrition = st.habits.nutrition.filter(n => n.date !== d);
      if (st.habits.body) st.habits.body = st.habits.body.filter(b => b.date !== d);
    });
    toast(`Datos del ${d} eliminados`);
    window.dispatchEvent(new Event("pv:render"));
  });

  // Borrado manual de Fitness
  root.querySelector("#btn-del-fitness")?.addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "¿Borrar todos los datos de Fitness?",
      text: "Se eliminarán todos los entrenamientos de gimnasio, deportes y el historial de pasos. Esta acción no se puede deshacer.",
      ok: "Borrar Fitness",
      danger: true
    });
    if (!ok) return;
    update(st => {
      st.habits.workouts = [];
      st.habits.logs = (st.habits.logs || []).filter(l => l.habitId !== "hb-pasos-salud");
    });
    toast("Datos de fitness eliminados");
    window.dispatchEvent(new Event("pv:render"));
  });

  // Borrado manual de Finanzas
  root.querySelector("#btn-del-finance")?.addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "¿Borrar todos los movimientos?",
      text: "Se eliminarán todos los gastos e ingresos registrados. Tus cuentas y presupuestos se mantendrán.",
      ok: "Borrar movimientos",
      danger: true
    });
    if (!ok) return;
    update(st => {
      st.finance.transactions = [];
    });
    toast("Movimientos de finanzas eliminados");
    window.dispatchEvent(new Event("pv:render"));
  });

  // Borrado manual de Agenda
  root.querySelector("#btn-del-agenda")?.addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "¿Borrar toda la Agenda?",
      text: "Se eliminarán todas las tareas pendientes, completadas y los eventos del calendario.",
      ok: "Borrar Agenda",
      danger: true
    });
    if (!ok) return;
    update(st => {
      st.agenda.tasks = [];
      st.agenda.events = [];
    });
    toast("Agenda eliminada");
    window.dispatchEvent(new Event("pv:render"));
  });

  // Borrado manual de Hábitos
  root.querySelector("#btn-del-habits")?.addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "¿Borrar historial de hábitos?",
      text: "Se eliminarán los registros diarios de cumplimiento. La configuración de tus hábitos se mantendrá.",
      ok: "Borrar registros",
      danger: true
    });
    if (!ok) return;
    update(st => {
      st.habits.logs = [];
    });
    toast("Historial de hábitos eliminado");
    window.dispatchEvent(new Event("pv:render"));
  });
  root.querySelector("#demo-on")?.addEventListener("click", async () => {
    await replaceState(buildDemo(getState().profile.alias));
    toast("Datos de ejemplo cargados");
    location.hash = "#resumen";
  });
  root.querySelector("#demo-off")?.addEventListener("click", async () => {
    const ok = await confirmSheet({ title: "¿Quitar los datos de ejemplo?", text: "El panel quedará vacío para que empieces con tus datos reales.", ok: "Quitar" });
    if (!ok) return;
    const fresh = defaultState();
    fresh.profile.alias = getState().profile.alias;
    await replaceState(fresh);
    toast("Datos de ejemplo quitados");
  });

  root.querySelector("#profile-form").addEventListener("submit", e => {
    e.preventDefault();
    const alias = root.querySelector("#alias").value.trim();
    if (!alias) { toast("Escribe un alias", { error: true }); return; }
    update(s => { s.profile.alias = alias; });
    toast("Alias guardado");
  });

  root.querySelector("#export").addEventListener("click", async () => {
    try {
      const r = await exportBackup();
      if (r !== "cancelled") toast("Copia exportada");
    } catch (e) {
      console.error(e);
      toast("No se pudo exportar la copia", { error: true });
    }
  });

  const fileInput = root.querySelector("#import-file");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const parsed = await readBackupFile(file);
      const when = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(parsed.exportedAt));
      const ok = await confirmSheet({
        title: "¿Restaurar esta copia?",
        text: `Es del ${when}. Sustituirá TODOS los datos actuales de este dispositivo.`,
        ok: "Restaurar", danger: true
      });
      if (!ok) return;
      await applyBackup(parsed);
      toast("Copia restaurada");
    } catch (e) {
      toast(e.message || "No se pudo importar el archivo", { error: true, ms: 4000 });
    }
  });

  root.querySelector("#wipe").addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "¿Borrar todos los datos?",
      text: "Se eliminará todo lo que has apuntado en este dispositivo. Exporta antes una copia si quieres conservarlo.",
      ok: "Borrar todo", danger: true
    });
    if (!ok) return;
    const alias = getState().profile.alias;
    const fresh = defaultState();
    fresh.profile.alias = alias;
    await replaceState(fresh);
    toast("Datos borrados");
  });

  requestPersistence().then(ok => {
    const el = root.querySelector("#persist-state");
    if (el) el.textContent = ok ? "Activada" : (isStandalone() ? "No disponible" : "Instala la app para activarla");
  });
}
