// Formularios de Trabajo y estudios: tiempo, proyectos (con hitos) y aprendizaje.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid } from "../ui.js";
import { iso, parseISO } from "../stats.js";
import { seg, field } from "../forms.js";
import { icon } from "../icons.js";
import { ring } from "../charts.js";
import { KINDS, LEARN_TYPES, LEARN_UNITS, fmtMin, toMinutes, projectStats } from "../work.js";

const projectOptions = (state, kind, selected) =>
  `<option value="">Sin proyecto</option>` +
  state.work.projects.filter(p => !p.archived && p.kind === kind)
    .map(p => `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${esc(p.name)}</option>`).join("");

// ---------- Registro de tiempo
export function openTimeForm({ id = null, kind = "trabajo", projectId = null } = {}) {
  const s = getState();
  const e = id ? s.work.entries.find(x => x.id === id) : null;
  if (e) { kind = e.kind; projectId = e.projectId; }
  if (projectId && !e) kind = s.work.projects.find(p => p.id === projectId)?.kind || kind;
  const h = e ? Math.floor(e.minutes / 60) : "", m = e ? e.minutes % 60 : "";

  const sheet = openSheet(`
    <h2>${e ? "Editar tiempo" : "Apuntar tiempo"}</h2>
    <form class="form" id="time-form" novalidate>
      ${seg("kind", KINDS, kind)}
      <div class="field">
        <label for="time-h">Duración</label>
        <div class="dur">
          <div class="dur-box"><input class="input" id="time-h" inputmode="numeric" autocomplete="off" placeholder="0" value="${h}"><span>h</span></div>
          <div class="dur-box"><input class="input" id="time-m" inputmode="numeric" autocomplete="off" placeholder="0" value="${m}"><span>min</span></div>
        </div>
        <div class="quick-add">${[15, 30, 60, 120].map(q => `<button class="chip" type="button" data-add="${q}">+${q < 60 ? q + " min" : q / 60 + " h"}</button>`).join("")}<button class="chip" type="button" data-add="0">Borrar</button></div>
      </div>
      <div class="row2">
        ${field("Fecha", "time-date", `<input class="input" type="date" id="time-date" value="${e?.date || iso()}">`)}
        ${field("Proyecto", "time-proj", `<select class="input" id="time-proj">${projectOptions(s, kind, projectId)}</select>`)}
      </div>
      ${field("Nota (opcional)", "time-note", `<input class="input" id="time-note" maxlength="80" autocomplete="off" value="${esc(e?.note || "")}" placeholder="p. ej. Repaso del tema 4">`)}
      <div class="btn-row">
        ${e ? `<button class="btn danger" type="button" id="time-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);

  const form = sheet.querySelector("#time-form");
  const hEl = form.querySelector("#time-h"), mEl = form.querySelector("#time-m");
  form.addEventListener("change", ev => {
    if (ev.target.name !== "kind") return;
    form.querySelector("#time-proj").innerHTML = projectOptions(getState(), ev.target.value, null);
  });
  form.querySelector(".quick-add").addEventListener("click", ev => {
    const b = ev.target.closest("[data-add]");
    if (!b) return;
    const add = Number(b.dataset.add);
    const total = add ? toMinutes(hEl.value, mEl.value) + add : 0;
    hEl.value = total ? Math.floor(total / 60) : "";
    mEl.value = total ? total % 60 : "";
  });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const minutes = toMinutes(hEl.value, mEl.value);
    if (!minutes) { toast("Indica cuánto tiempo has dedicado", { error: true }); return; }
    if (minutes > 24 * 60) { toast("Un registro no puede pasar de 24 h", { error: true }); return; }
    const data = {
      date: form.querySelector("#time-date").value || iso(),
      minutes,
      kind: form.querySelector("[name=kind]:checked").value,
      projectId: form.querySelector("#time-proj").value || null,
      note: form.querySelector("#time-note").value.trim()
    };
    update(st => {
      if (e) Object.assign(st.work.entries.find(x => x.id === e.id), data);
      else st.work.entries.push({ id: uid(), ...data });
    });
    closeSheet();
    toast(e ? "Registro actualizado" : `${fmtMin(minutes)} de ${data.kind} apuntados`);
  });
  sheet.querySelector("#time-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar este registro?", text: `${fmtMin(e.minutes)} del ${parseISO(e.date).toLocaleDateString("es-ES")}.`, ok: "Borrar", danger: true })) return;
    update(st => { st.work.entries = st.work.entries.filter(x => x.id !== e.id); });
    toast("Registro borrado");
  });
}

// ---------- Proyecto (crear / editar)
export function openProjectForm(id = null) {
  const p = id ? getState().work.projects.find(x => x.id === id) : null;
  const sheet = openSheet(`
    <h2>${p ? "Editar proyecto" : "Nuevo proyecto u objetivo"}</h2>
    <form class="form" id="proj-form" novalidate>
      ${seg("kind", KINDS, p?.kind || "trabajo")}
      ${field("Nombre", "proj-name", `<input class="input" id="proj-name" maxlength="50" autocomplete="off" value="${esc(p?.name || "")}" placeholder="p. ej. Informe trimestral, Aprobar Estadística">`)}
      ${field("Fecha límite (opcional)", "proj-deadline", `<input class="input" type="date" id="proj-deadline" value="${p?.deadline || ""}">`)}
      ${p ? "" : field("Hitos (opcional, uno por línea)", "proj-ms", `<textarea class="input textarea" id="proj-ms" rows="4" placeholder="Recopilar datos&#10;Primer borrador&#10;Revisión final"></textarea>`)}
      ${p ? `<label class="switch-row"><input type="checkbox" id="proj-archived"${p.archived ? " checked" : ""}><span>Archivado (terminado o en pausa; se oculta de la lista)</span></label>` : ""}
      <div class="btn-row">
        ${p ? `<button class="btn danger" type="button" id="proj-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#proj-form");
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = form.querySelector("#proj-name").value.trim();
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    const data = { name, kind: form.querySelector("[name=kind]:checked").value, deadline: form.querySelector("#proj-deadline").value || null };
    let newId = null;
    update(st => {
      if (p) {
        Object.assign(st.work.projects.find(x => x.id === p.id), data, { archived: form.querySelector("#proj-archived").checked });
      } else {
        const milestones = form.querySelector("#proj-ms").value.split("\n").map(x => x.trim()).filter(Boolean).map(n => ({ id: uid(), name: n, done: false }));
        newId = uid();
        st.work.projects.push({ id: newId, ...data, milestones, archived: false, createdAt: iso() });
      }
    });
    closeSheet();
    toast(p ? "Proyecto actualizado" : "Proyecto creado");
    if (newId) openProjectDetail(newId);
  });
  sheet.querySelector("#proj-del")?.addEventListener("click", async () => {
    const n = getState().work.entries.filter(x => x.projectId === p.id).length;
    if (!await confirmSheet({ title: `¿Borrar «${p.name}»?`, text: n ? `Sus ${n} registros de tiempo se conservan, pero quedarán sin proyecto.` : "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => {
      st.work.projects = st.work.projects.filter(x => x.id !== p.id);
      st.work.entries.forEach(x => { if (x.projectId === p.id) x.projectId = null; });
    });
    toast("Proyecto borrado");
  });
}

// ---------- Detalle de proyecto: hitos
export function openProjectDetail(id) {
  const body = () => {
    const s = getState();
    const p = s.work.projects.find(x => x.id === id);
    if (!p) return null;
    const st = projectStats(s, p);
    const color = p.kind === "estudio" ? "#7cc4e4" : "#7ea6f0";
    return `
      <div class="proj-head">
        ${ring(st.pct, color, { size: 60, stroke: 6, label: `${st.pct}%` })}
        <div class="t"><h2>${esc(p.name)}</h2>
          <small>${KINDS[p.kind]} · ${fmtMin(st.minutes)} en total${st.daysLeft != null ? ` · ${st.daysLeft >= 0 ? `quedan ${st.daysLeft} días` : `<span style="color:var(--danger)">vencido hace ${-st.daysLeft} días</span>`}` : ""}</small>
        </div>
      </div>
      <h3 class="card-h">Hitos <span class="spacer"></span><span class="count num">${st.done}/${st.total}</span></h3>
      <div class="list" id="ms-list">${(p.milestones || []).map(m => `
        <div class="item ms${m.done ? " is-done" : ""}">
          <button class="tick-btn" type="button" data-ms="${m.id}" aria-pressed="${m.done}" aria-label="Marcar ${esc(m.name)}"><span class="tick" style="--c:${color}">${icon.check}</span></button>
          <span class="t">${esc(m.name)}${m.done && m.doneAt ? `<small>Hecho el ${parseISO(m.doneAt).toLocaleDateString("es-ES")}</small>` : ""}</span>
          <button class="btn small" type="button" data-ms-del="${m.id}" aria-label="Borrar hito ${esc(m.name)}">✕</button>
        </div>`).join("") || `<div class="empty">Divide el proyecto en hitos para ver el avance.</div>`}</div>
      <form class="form" id="ms-add" novalidate>
        <div class="btn-row"><input class="input" id="ms-name" maxlength="60" autocomplete="off" placeholder="Nuevo hito" style="flex:2"><button class="btn" type="submit">Añadir</button></div>
      </form>
      <div class="btn-row">
        <button class="btn" type="button" id="proj-edit">Editar</button>
        <button class="btn primary" type="button" id="proj-time">${icon.clock} Apuntar tiempo</button>
      </div>`;
  };

  const sheet = openSheet(body(), {
    onOpen: el => el.addEventListener("click", onClick)
  });
  const rerender = () => { const b = body(); if (b) sheet.innerHTML = `<div class="grabber"></div>${b}`; wire(); };
  function wire() {
    sheet.querySelector("#ms-add").addEventListener("submit", ev => {
      ev.preventDefault();
      const name = sheet.querySelector("#ms-name").value.trim();
      if (!name) return;
      update(st => { st.work.projects.find(x => x.id === id).milestones.push({ id: uid(), name, done: false }); });
      rerender();
      sheet.querySelector("#ms-name").focus();
    });
  }
  function onClick(ev) {
    const t = ev.target.closest("[data-ms]");
    if (t) {
      let finished = false;
      update(st => {
        const p = st.work.projects.find(x => x.id === id);
        const m = p.milestones.find(x => x.id === t.dataset.ms);
        m.done = !m.done; m.doneAt = m.done ? iso() : null;
        finished = m.done && p.milestones.every(x => x.done);
      });
      rerender();
      if (finished) toast("¡Proyecto completado al 100 %!");
      return;
    }
    const d = ev.target.closest("[data-ms-del]");
    if (d) { update(st => { const p = st.work.projects.find(x => x.id === id); p.milestones = p.milestones.filter(x => x.id !== d.dataset.msDel); }); rerender(); return; }
    if (ev.target.closest("#proj-edit")) openProjectForm(id);
    else if (ev.target.closest("#proj-time")) openTimeForm({ projectId: id });
  }
  wire();
}

// ---------- Aprendizaje: curso, libro o habilidad
export function openLearnForm(id = null) {
  const l = id ? getState().work.learning.find(x => x.id === id) : null;
  const type = l?.type || "curso";
  const sheet = openSheet(`
    <h2>${l ? "Editar" : "Nuevo curso, libro o habilidad"}</h2>
    <form class="form" id="learn-form" novalidate>
      ${seg("type", LEARN_TYPES, type)}
      ${field("Nombre", "learn-name", `<input class="input" id="learn-name" maxlength="60" autocomplete="off" value="${esc(l?.name || "")}" placeholder="p. ej. Curso de SQL, Hábitos atómicos, Inglés">`)}
      <div class="row2">
        ${field("Llevas", "learn-done", `<input class="input" id="learn-done" inputmode="numeric" autocomplete="off" value="${l?.done ?? 0}">`)}
        ${field("Total", "learn-total", `<input class="input" id="learn-total" inputmode="numeric" autocomplete="off" value="${l?.total ?? ""}" placeholder="40">`)}
      </div>
      ${field("Unidad", "learn-unit", `<input class="input" id="learn-unit" maxlength="20" autocomplete="off" value="${esc(l?.unit || LEARN_UNITS[type])}">`)}
      <p class="hint">Para una habilidad puedes usar horas de práctica (p. ej. 30 de 100 horas) o niveles (3 de 10).</p>
      <div class="btn-row">
        ${l ? `<button class="btn danger" type="button" id="learn-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#learn-form");
  const unitEl = form.querySelector("#learn-unit");
  form.addEventListener("change", ev => {
    if (ev.target.name === "type" && Object.values(LEARN_UNITS).includes(unitEl.value)) unitEl.value = LEARN_UNITS[ev.target.value];
  });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = form.querySelector("#learn-name").value.trim();
    const done = Math.max(0, Math.round(Number(form.querySelector("#learn-done").value.replace(",", ".")) || 0));
    const total = Math.round(Number(form.querySelector("#learn-total").value.replace(",", ".")) || 0);
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    if (total <= 0) { toast("Indica el total (lecciones, páginas, horas…)", { error: true }); return; }
    const data = { name, type: form.querySelector("[name=type]:checked").value, done: Math.min(done, total), total, unit: unitEl.value.trim() || "unidades" };
    update(st => {
      if (l) {
        const x = st.work.learning.find(y => y.id === l.id);
        Object.assign(x, data, { finishedAt: data.done >= data.total ? (x.finishedAt || iso()) : null });
      } else st.work.learning.push({ id: uid(), ...data, startedAt: iso(), finishedAt: data.done >= data.total ? iso() : null });
    });
    closeSheet();
    toast(l ? "Actualizado" : "Añadido");
  });
  sheet.querySelector("#learn-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: `¿Borrar «${l.name}»?`, text: "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.work.learning = st.work.learning.filter(x => x.id !== l.id); });
    toast("Borrado");
  });
}

/** Avanza (o retrocede) una unidad en un elemento de aprendizaje */
export function stepLearn(id, delta) {
  let finished = false, name = "";
  update(st => {
    const x = st.work.learning.find(y => y.id === id);
    const before = x.done;
    x.done = Math.max(0, Math.min(x.total, x.done + delta));
    finished = before < x.total && x.done >= x.total;
    x.finishedAt = x.done >= x.total ? (x.finishedAt || iso()) : null;
    name = x.name;
  });
  if (finished) toast(`¡«${name}» terminado!`);
}
