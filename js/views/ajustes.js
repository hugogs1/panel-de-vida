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
import { hasAnyData } from "../stats.js";

const fmt = iso => iso ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Nunca";
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

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
