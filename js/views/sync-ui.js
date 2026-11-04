// Interfaz de la sincronización: tarjeta de Ajustes, configuración paso a paso y conflictos.

import { openSheet, closeSheet, toast, confirmSheet, esc } from "../ui.js";
import { field } from "../forms.js";
import { todayISO } from "../ui.js";
import { connect, disconnect, syncNow, syncConfigured, syncInfo, statusText, getSyncStatus, getDiscarded, clearDiscarded } from "../sync.js";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Panel%20de%20Vida";
const revText = info => `${info.rev}${info.dirty ? " · cambios pendientes" : ""}`;
const fmt = d => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

// ---------- Tarjeta de Ajustes
export function syncCard() {
  const info = syncInfo();
  if (!info) return `
    <section class="card" id="sync-card">
      <h2 class="card-h">Sincronización entre dispositivos</h2>
      <p class="muted" style="font-size:13px;line-height:1.55;margin:10px 0 12px">
        Ten los mismos datos en el iPhone y en el ordenador. Se guardan <b>cifrados</b> con una contraseña que solo tú conoces en un Gist secreto de tu cuenta de GitHub: GitHub solo ve datos ilegibles.
      </p>
      <button class="btn primary" type="button" id="sync-setup">Configurar sincronización</button>
    </section>`;
  const st = getSyncStatus().state;
  return `
    <section class="card" id="sync-card">
      <h2 class="card-h">Sincronización entre dispositivos</h2>
      <div class="list">
        <div class="kv"><span>Estado</span><span id="sync-status" class="sync-st ${st}">${esc(statusText())}</span></div>
        <div class="kv"><span>Este dispositivo</span><span>${esc(info.device)}</span></div>
        <div class="kv"><span>Versión</span><span class="num" id="sync-rev">${revText(info)}</span></div>
        <div class="kv"><span>Archivo en GitHub</span><a href="https://gist.github.com/${esc(info.gistId)}" target="_blank" rel="noopener">Ver Gist</a></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" type="button" id="sync-now">Sincronizar ahora</button>
        <button class="btn danger" type="button" id="sync-off">Desconectar</button>
      </div>
      <div id="sync-discarded"></div>
    </section>`;
}

export function mountSyncCard(root) {
  root.querySelector("#sync-setup")?.addEventListener("click", openSetup);
  root.querySelector("#sync-now")?.addEventListener("click", async () => {
    await syncNow();
    const s = getSyncStatus();
    toast(s.state === "error" ? s.msg : "Sincronizado", { error: s.state === "error" });
  });
  root.querySelector("#sync-off")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Desconectar este dispositivo?", text: "Dejará de sincronizarse. Tus datos se quedan aquí y en GitHub; puedes volver a conectarlo cuando quieras.", ok: "Desconectar", danger: true })) return;
    await disconnect();
    toast("Sincronización desconectada");
    window.dispatchEvent(new Event("pv:render"));
  });
  // Versión descartada en un conflicto: se puede exportar por si hacía falta algo de ella
  getDiscarded().then(d => {
    const box = root.querySelector("#sync-discarded");
    if (!d || !box) return;
    box.innerHTML = `
      <p class="hint" style="margin-top:12px">En el último conflicto se descartó la versión de <b>${esc(d.from)}</b> (${fmt(d.at)}). Puedes guardarla como copia por si necesitas algo de ella.</p>
      <div class="btn-row" style="margin-top:8px"><button class="btn small" type="button" id="disc-export">Exportar versión descartada</button><button class="btn small" type="button" id="disc-clear">Olvidarla</button></div>`;
    box.querySelector("#disc-export").addEventListener("click", () => {
      const payload = { app: "panel-de-vida", exportedAt: d.at, schema: d.data.version, data: d.data };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `panel-de-vida-descartada-${todayISO()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    box.querySelector("#disc-clear").addEventListener("click", async () => { await clearDiscarded(); box.innerHTML = ""; });
  });
}

/** Actualiza el texto de estado allí donde aparezca (Ajustes y menú lateral) */
export function paintSyncStatus() {
  const txt = statusText(), st = getSyncStatus().state;
  const a = document.getElementById("sync-status");
  if (a) { a.textContent = txt; a.className = `sync-st ${st}`; }
  const r = document.getElementById("sync-rev"), info = syncInfo();
  if (r && info) r.textContent = revText(info);
  const b = document.getElementById("side-status");
  if (b) b.innerHTML = syncConfigured() ? `<span class="sync-dot ${st}"></span>${esc(txt)}` : "";
}

// ---------- Configuración paso a paso
function openSetup() {
  const sheet = openSheet(`
    <h2>Configurar sincronización</h2>
    <ol class="steps">
      <li><b>Crea un token en GitHub</b> (solo una vez). Abre <a href="${TOKEN_URL}" target="_blank" rel="noopener">este enlace</a> con tu sesión de GitHub iniciada: ya viene marcado el permiso <b>gist</b> y nada más. En «Expiration» elige <b>No expiration</b> (o la fecha que prefieras), baja y pulsa <b>Generate token</b>. Copia el código que empieza por <code>ghp_</code>.</li>
      <li><b>Pégalo aquí</b> y elige una <b>contraseña de cifrado</b>. En el otro dispositivo usarás el mismo token (o uno nuevo) y <b>la misma contraseña</b>.</li>
    </ol>
    <form class="form" id="sync-form" novalidate>
      ${field("Token de GitHub", "sy-token", `<input class="input" id="sy-token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…">`)}
      ${field("Contraseña de cifrado (mínimo 8 caracteres)", "sy-pass", `<input class="input" id="sy-pass" type="password" autocomplete="new-password">`)}
      <label class="switch-row"><input type="checkbox" id="sy-show"><span>Mostrar contraseña</span></label>
      <p class="hint"><b>Apúntala en un lugar seguro.</b> Si la olvidas, los datos de GitHub no se pueden descifrar (los de tus dispositivos y tus copias siguen intactos).</p>
      <div class="btn-row"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit" id="sy-go">Conectar</button></div>
    </form>`);
  const form = sheet.querySelector("#sync-form");
  form.querySelector("#sy-show").addEventListener("change", e => { form.querySelector("#sy-pass").type = e.target.checked ? "text" : "password"; });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("#sy-go");
    btn.disabled = true; btn.textContent = "Conectando…";
    try {
      const r = await connect(form.querySelector("#sy-token").value, form.querySelector("#sy-pass").value);
      closeSheet();
      toast(r === "created" ? "Sincronización activada: tus datos ya están en GitHub, cifrados" : "Conectado a tus datos de la nube", { ms: 4000 });
      window.dispatchEvent(new Event("pv:render"));
    } catch (err) {
      toast(err.message || "No se pudo conectar", { error: true, ms: 4500 });
      btn.disabled = false; btn.textContent = "Conectar";
    }
  });
}

// ---------- Conflicto: hay cambios aquí y en la nube
export function askConflict({ remoteAt, remoteDevice, localDevice }) {
  return new Promise(resolve => {
    let answered = false;
    const sheet = openSheet(`
      <h2>Hay cambios en los dos sitios</h2>
      <p>Los datos de este dispositivo (<b>${esc(localDevice)}</b>) y los de la nube (último cambio desde <b>${esc(remoteDevice || "otro dispositivo")}</b>, ${fmt(remoteAt)}) son distintos. Elige cuál conservar; la otra versión se guarda aparte por si la necesitas (Ajustes → Sincronización).</p>
      <div class="choice-list">
        <button class="choice" type="button" data-pick="remote"><b>Usar la de la nube</b><small>Lo más habitual si apuntaste cosas en el otro dispositivo.</small></button>
        <button class="choice" type="button" data-pick="local"><b>Usar la de este dispositivo</b><small>Sustituye lo que hay en la nube por lo de aquí.</small></button>
      </div>
      <button class="btn" type="button" data-close>Decidir más tarde</button>`, {
      onOpen: el => el.addEventListener("click", e => {
        const b = e.target.closest("[data-pick]");
        if (!b) return;
        answered = true;
        closeSheet();
        resolve(b.dataset.pick);
      }),
      onClose: () => { if (!answered) resolve(null); }
    });
    return sheet;
  });
}
