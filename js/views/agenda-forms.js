// Formularios de Agenda: tarea, evento y exportación al Calendario del iPhone.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid } from "../ui.js";
import { iso, parseISO } from "../stats.js";
import { seg, field } from "../forms.js";
import { PRIORITIES, REPEATS, ALARMS, allTags, parseTags, buildICS } from "../agenda.js";

const kindSwitch = current => `<div class="kind-switch">${seg("kind", { task: "Tarea", event: "Evento" }, current)}</div>`;

// Cambiar entre tarea y evento conservando el título y la fecha escritos
function wireKind(sheet, getTitle, getDate) {
  sheet.querySelectorAll("[name=kind]").forEach(r => r.addEventListener("change", () => {
    const opts = { title: getTitle(), date: getDate() };
    if (r.value === "event") openEventForm(opts); else openTaskForm(opts);
  }));
}

// ---------- Tarea
export function openTaskForm({ id = null, date = null, title = "" } = {}) {
  const s = getState();
  const t = id ? s.agenda.tasks.find(x => x.id === id) : null;
  const due = t ? t.due : date ?? iso();
  const tags = allTags(s);
  const sheet = openSheet(`
    ${t ? "<h2>Editar tarea</h2>" : kindSwitch("task")}
    <form class="form" id="task-form" novalidate>
      ${field("Tarea", "tk-title", `<input class="input" id="tk-title" maxlength="80" autocomplete="off" value="${esc(t?.title ?? title)}" placeholder="¿Qué tienes que hacer?">`)}
      <div class="field"><label>Prioridad</label>${seg("priority", PRIORITIES, t?.priority || "media")}</div>
      <label class="switch-row"><input type="checkbox" id="tk-hasdate"${due ? " checked" : ""}><span>Con fecha</span></label>
      <div class="row2" id="tk-dates"${due ? "" : " hidden"}>
        ${field("Fecha", "tk-due", `<input class="input" type="date" id="tk-due" value="${due || iso()}">`)}
        ${field("Hora (opcional)", "tk-time", `<input class="input" type="time" id="tk-time" value="${t?.time || ""}">`)}
      </div>
      <div id="tk-repeat-box"${due ? "" : " hidden"}>${field("Repetir", "tk-repeat", `<select class="input" id="tk-repeat">${Object.entries(REPEATS).map(([v, l]) => `<option value="${v}"${(t?.repeat || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
      ${field("Etiquetas (separadas por comas)", "tk-tags", `<input class="input" id="tk-tags" autocomplete="off" value="${esc((t?.tags || []).join(", "))}" placeholder="trabajo, casa…">`)}
      ${tags.length ? `<div class="quick-add" id="tk-tag-picks">${tags.map(x => `<button class="chip" type="button" data-tag="${esc(x)}">#${esc(x)}</button>`).join("")}</div>` : ""}
      ${field("Nota (opcional)", "tk-note", `<textarea class="input textarea" id="tk-note" rows="2" maxlength="300">${esc(t?.note || "")}</textarea>`)}
      ${t?.repeat ? `<p class="hint">Al completarla se creará la siguiente según la repetición.</p>` : ""}
      <div class="btn-row">
        ${t ? `<button class="btn danger" type="button" id="tk-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#task-form");
  const titleEl = form.querySelector("#tk-title");
  if (!t) setTimeout(() => titleEl.focus(), 250);
  wireKind(sheet, () => titleEl.value, () => form.querySelector("#tk-hasdate").checked ? form.querySelector("#tk-due").value : null);
  form.querySelector("#tk-hasdate").addEventListener("change", e => {
    form.querySelector("#tk-dates").hidden = !e.target.checked;
    form.querySelector("#tk-repeat-box").hidden = !e.target.checked;
  });
  form.querySelector("#tk-tag-picks")?.addEventListener("click", e => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    const inp = form.querySelector("#tk-tags");
    const cur = parseTags(inp.value);
    if (!cur.some(x => x.toLowerCase() === b.dataset.tag.toLowerCase())) inp.value = [...cur, b.dataset.tag].join(", ");
  });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const title = titleEl.value.trim();
    if (!title) { toast("Escribe la tarea", { error: true }); return; }
    const hasDate = form.querySelector("#tk-hasdate").checked;
    const data = {
      title,
      priority: form.querySelector("[name=priority]:checked").value,
      due: hasDate ? form.querySelector("#tk-due").value || iso() : null,
      time: hasDate ? form.querySelector("#tk-time").value || null : null,
      repeat: hasDate ? form.querySelector("#tk-repeat").value || null : null,
      tags: parseTags(form.querySelector("#tk-tags").value),
      note: form.querySelector("#tk-note").value.trim(),
      updatedAt: new Date().toISOString()
    };
    update(st => {
      if (t) Object.assign(st.agenda.tasks.find(x => x.id === t.id), data);
      else st.agenda.tasks.push({ id: uid(), ...data, done: false, doneAt: null, createdAt: iso() });
    });
    closeSheet();
    toast(t ? "Tarea actualizada" : "Tarea creada");
  });
  sheet.querySelector("#tk-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar esta tarea?", text: t.repeat ? "Solo se borra esta; las repeticiones ya creadas se mantienen." : "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.agenda.tasks = st.agenda.tasks.filter(x => x.id !== t.id); });
    toast("Tarea borrada");
  });
}

// ---------- Evento
export function openEventForm({ id = null, date = null, title = "" } = {}) {
  const e = id ? getState().agenda.events.find(x => x.id === id) : null;
  const day = e?.date || date || iso();
  const start = e && !e.allDay ? e.start.slice(11, 16) : "";
  const end = e?.end ? e.end.slice(11, 16) : "";
  const sheet = openSheet(`
    ${e ? "<h2>Editar evento</h2>" : kindSwitch("event")}
    <form class="form" id="event-form" novalidate>
      ${field("Evento", "ev-title", `<input class="input" id="ev-title" maxlength="80" autocomplete="off" value="${esc(e?.title ?? title)}" placeholder="p. ej. Dentista, Partido, Cena">`)}
      ${field("Fecha", "ev-date", `<input class="input" type="date" id="ev-date" value="${day}">`)}
      <label class="switch-row"><input type="checkbox" id="ev-allday"${e?.allDay ? " checked" : ""}><span>Todo el día</span></label>
      <div class="row2" id="ev-times"${e?.allDay ? " hidden" : ""}>
        ${field("Empieza", "ev-start", `<input class="input" type="time" id="ev-start" value="${start || "10:00"}">`)}
        ${field("Termina (opcional)", "ev-end", `<input class="input" type="time" id="ev-end" value="${end}">`)}
      </div>
      ${field("Lugar (opcional)", "ev-place", `<input class="input" id="ev-place" maxlength="80" autocomplete="off" value="${esc(e?.place || "")}">`)}
      ${field("Aviso en el Calendario del iPhone", "ev-alarm", `<select class="input" id="ev-alarm">${Object.entries(ALARMS).map(([v, l]) => `<option value="${v}"${String(e ? e.alarm ?? "" : 30) === v ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${field("Nota (opcional)", "ev-note", `<textarea class="input textarea" id="ev-note" rows="2" maxlength="300">${esc(e?.note || "")}</textarea>`)}
      <div class="btn-row">
        ${e ? `<button class="btn danger" type="button" id="ev-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#event-form");
  const titleEl = form.querySelector("#ev-title");
  if (!e) setTimeout(() => titleEl.focus(), 250);
  wireKind(sheet, () => titleEl.value, () => form.querySelector("#ev-date").value);
  form.querySelector("#ev-allday").addEventListener("change", ev => { form.querySelector("#ev-times").hidden = ev.target.checked; });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const title = titleEl.value.trim();
    if (!title) { toast("Escribe el nombre del evento", { error: true }); return; }
    const date = form.querySelector("#ev-date").value || iso();
    const allDay = form.querySelector("#ev-allday").checked;
    const st = form.querySelector("#ev-start").value || "10:00";
    const en = form.querySelector("#ev-end").value;
    if (!allDay && en && en <= st) { toast("La hora de fin debe ser posterior a la de inicio", { error: true }); return; }
    const alarmV = form.querySelector("#ev-alarm").value;
    const data = {
      title, date, allDay,
      start: allDay ? `${date}T00:00` : `${date}T${st}`,
      end: !allDay && en ? `${date}T${en}` : null,
      place: form.querySelector("#ev-place").value.trim(),
      note: form.querySelector("#ev-note").value.trim(),
      alarm: alarmV === "" ? null : Number(alarmV),
      updatedAt: new Date().toISOString()
    };
    update(s => {
      if (e) Object.assign(s.agenda.events.find(x => x.id === e.id), data);
      else s.agenda.events.push({ id: uid(), ...data, createdAt: iso() });
    });
    closeSheet();
    toast(e ? "Evento actualizado" : "Evento creado");
  });
  sheet.querySelector("#ev-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar este evento?", text: "No se puede deshacer. Si ya lo exportaste, bórralo también del Calendario del iPhone.", ok: "Borrar", danger: true })) return;
    update(s => { s.agenda.events = s.agenda.events.filter(x => x.id !== e.id); });
    toast("Evento borrado");
  });
}

// ---------- Exportar al Calendario del iPhone
export function openExport() {
  const s = getState();
  const last = s.settings.lastIcsAt || null;
  const newCount = buildICS(s, { onlySince: last }).count;
  const allCount = buildICS(s).count;
  const fmt = d => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
  const sheet = openSheet(`
    <h2>Exportar al Calendario</h2>
    <p>Crea un archivo de calendario con tus eventos y tareas con fecha (con sus avisos). Al abrirlo, el iPhone te ofrece <b>Añadir todo</b> al Calendario, que es quien te avisará.</p>
    <form class="form" id="ics-form" novalidate>
      <div class="field"><label>¿Qué exportar?</label>${seg("what", { new: `Solo lo nuevo (${newCount})`, all: `Todo (${allCount})` }, last ? "new" : "all")}</div>
      <p class="hint">${last ? `Última exportación: ${fmt(last)}. «Solo lo nuevo» incluye lo creado o cambiado desde entonces, para no duplicar en el Calendario.` : "Es la primera vez: se exportará todo."} Si cambias algo ya exportado, en el Calendario quedará la versión antigua: bórrala allí.</p>
      <div class="btn-row">
        <button class="btn" type="button" id="ics-share">Compartir archivo</button>
        <button class="btn primary" type="submit">Abrir en Calendario</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#ics-form");
  const make = () => {
    const what = form.querySelector("[name=what]:checked").value;
    const { text, count } = buildICS(getState(), { onlySince: what === "new" ? last : null });
    if (!count) { toast("No hay nada nuevo que exportar", { error: true }); return null; }
    return { file: new File([text], `panel-de-vida-${iso()}.ics`, { type: "text/calendar" }), count };
  };
  const done = count => {
    update(st => { st.settings.lastIcsAt = new Date().toISOString(); });
    closeSheet();
    toast(`${count} elemento${count > 1 ? "s" : ""} exportado${count > 1 ? "s" : ""}`);
  };
  // Abrir: el iPhone muestra el contenido del archivo con el botón «Añadir todo»
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const r = make();
    if (!r) return;
    const url = URL.createObjectURL(r.file);
    const a = Object.assign(document.createElement("a"), { href: url, download: r.file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    done(r.count);
  });
  // Compartir: por si se prefiere guardarlo en Archivos o enviarlo
  sheet.querySelector("#ics-share").addEventListener("click", async () => {
    const r = make();
    if (!r) return;
    if (navigator.canShare?.({ files: [r.file] })) {
      try { await navigator.share({ files: [r.file], title: "Calendario de Panel de Vida" }); done(r.count); }
      catch (err) { if (err.name !== "AbortError") toast("No se pudo compartir el archivo", { error: true }); }
    } else toast("Este navegador no permite compartir archivos; usa «Abrir en Calendario»", { error: true, ms: 4000 });
  });
}
