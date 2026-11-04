// Tarjeta «Hevy» de Ajustes: importar el CSV de entrenos y ayuda para exportarlo.

import { update } from "../state.js";
import { openSheet, toast } from "../ui.js";
import { icon } from "../icons.js";
import { parseHevy, applyHevy } from "../hevy.js";

const fmt = d => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export function hevyCard(state) {
  const n = state.habits.workouts.filter(w => w.source === "hevy").length;
  const last = state.settings.lastHevyImport;
  const hevyMode = state.settings.gymSource === "hevy";
  return `
    <section class="card" id="hevy-card">
      <h2 class="card-h">Hevy (gimnasio)</h2>
      <div class="list">
        <div class="kv"><span>Entrenos importados</span><span class="num">${n}</span></div>
        <div class="kv"><span>Última importación</span><span>${last ? fmt(last) : "Nunca"}</span></div>
      </div>
      <p class="hint" style="margin:8px 0 12px">Exporta tus entrenos desde Hevy e impórtalos aquí. Se añaden los nuevos y se actualizan los que cambiaste, sin duplicar.</p>
      <div class="btn-row">
        <label class="btn primary" for="hevy-file">${icon.upload} Importar CSV de Hevy</label>
        <input class="sr-only" type="file" id="hevy-file" accept=".csv,text/csv">
        <button class="btn" type="button" id="hevy-help">Cómo exportar</button>
      </div>
      ${n ? `<label class="switch-row" style="margin-top:12px"><input type="checkbox" id="hevy-mode"${hevyMode ? " checked" : ""}><span>Apunto el gimnasio solo en Hevy (oculta las rutinas y el registro manual del panel)</span></label>` : ""}
    </section>`;
}

export function mountHevyCard(root) {
  root.querySelector("#hevy-help")?.addEventListener("click", hevyHelp);
  root.querySelector("#hevy-mode")?.addEventListener("change", e => {
    update(s => { s.settings.gymSource = e.target.checked ? "hevy" : "panel"; });
  });
  root.querySelector("#hevy-file")?.addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const workouts = parseHevy(await file.text());
      let r = null;
      update(s => { r = applyHevy(s, workouts); });
      toast(r.added || r.updated ? `Hevy: ${r.added} entrenos nuevos${r.updated ? `, ${r.updated} actualizados` : ""} (de ${r.total})` : `Todo al día: los ${r.total} entrenos ya estaban importados`, { ms: 4500 });
    } catch (err) {
      toast(err.message || "No se pudo leer el archivo", { error: true, ms: 4500 });
    }
  });
}

function hevyHelp() {
  openSheet(`
    <h2>Exportar tus entrenos de Hevy</h2>
    <ol class="steps">
      <li>Abre <b>Hevy</b> → pestaña <b>Perfil</b> → icono de <b>ajustes</b> (rueda, arriba a la derecha).</li>
      <li>Entra en <b>Exportar e importar datos</b> (<i>Export &amp; Import Data</i>).</li>
      <li>Pulsa <b>Exportar entrenamientos</b> (<i>Export Workouts</i>). Se genera un archivo <code>.csv</code> con todo tu historial.</li>
      <li>En la hoja de compartir elige <b>Guardar en Archivos</b> (por ejemplo en iCloud Drive).</li>
      <li>Vuelve a <b>Ajustes → Hevy</b> → <b>Importar CSV de Hevy</b> → elige ese archivo.</li>
    </ol>
    <p class="hint">Cada exportación incluye todo tu historial, así que puedes importar cuando quieras (por ejemplo una vez a la semana): solo se añade lo nuevo. Las series de calentamiento se guardan pero no cuentan para los récords.</p>
    <button class="btn primary" type="button" data-close>Entendido</button>`);
}
