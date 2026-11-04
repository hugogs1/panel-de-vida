// Agenda y tareas: lista de tareas agrupada, calendario mensual y exportación al Calendario.

import { areaHeader } from "./area.js";
import { esc, toast } from "../ui.js";
import { icon } from "../icons.js";
import { iso, parseISO } from "../stats.js";
import { update } from "../state.js";
import { registerQuickAction } from "../quickadd.js";
import { PRIORITY_COLOR, REPEATS, toggleTask, groupTasks, allTags, agendaSummary, dayItems, monthGrid } from "../agenda.js";
import { openTaskForm, openEventForm, openExport } from "./agenda-forms.js";

const ui = { tab: "tareas", filter: "pending", tag: null, ym: iso().slice(0, 7), day: iso() };
const TABS = { tareas: "Tareas", calendario: "Calendario" };

registerQuickAction("task", () => openTaskForm());

const monthLabel = ym => { const [y, m] = ym.split("-").map(Number); const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1)); return s[0].toUpperCase() + s.slice(1); };
const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); return iso(new Date(y, m - 1 + n, 1)).slice(0, 7); };
const shortDate = s => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(s)).replace(/\./g, "");
const longDay = s => { const t = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(parseISO(s)); return t[0].toUpperCase() + t.slice(1); };

/** Fila de tarea reutilizable (también en el calendario) */
function taskRow(t, { showDate = true } = {}) {
  const today = iso();
  const meta = [
    showDate && t.due ? `<span class="${!t.done && t.due < today ? "late" : ""}">${t.due === today ? "Hoy" : shortDate(t.due)}</span>` : "",
    t.time ? `${t.time}` : "",
    t.repeat ? `↻ ${REPEATS[t.repeat]}` : "",
    ...(t.tags || []).map(x => `#${esc(x)}`)
  ].filter(Boolean).join(" · ");
  return `<div class="item task${t.done ? " is-done" : ""}">
    <button class="tick-btn" type="button" data-act="toggle" data-id="${t.id}" aria-pressed="${!!t.done}" aria-label="Completar ${esc(t.title)}"><span class="tick" style="--c:${PRIORITY_COLOR[t.priority] || "var(--agenda)"}">${icon.check}</span></button>
    <button class="t task-main" type="button" data-act="edit-task" data-id="${t.id}">${esc(t.title)}${meta ? `<small>${meta}</small>` : ""}</button>
    ${!t.done && t.priority === "alta" ? `<span class="tag" style="--c:var(--danger)">Alta</span>` : ""}
  </div>`;
}

function eventRow(e) {
  return `<button class="item tap" type="button" data-act="edit-event" data-id="${e.id}">
    <span class="ev-time num">${e.allDay ? "Todo<br>el día" : `${e.start.slice(11, 16)}${e.end ? `<br><small>${e.end.slice(11, 16)}</small>` : ""}`}</span>
    <span class="t">${esc(e.title)}${e.place || e.note ? `<small>${esc(e.place || e.note)}</small>` : ""}</span>
    ${e.alarm != null ? `<span class="bell" title="Con aviso">${icon.bell}</span>` : ""}
  </button>`;
}

export function render(state) {
  const sum = agendaSummary(state);
  return `
    ${areaHeader(state, "ag")}

    <section class="card">
      <h2 class="card-h"><span class="h-dot" style="--c:var(--agenda)"></span>Resumen<span class="spacer"></span></h2>
      <div class="ag-stats">
        <div><b class="num" style="color:${sum.overdue ? "var(--danger)" : "var(--fg)"}">${sum.overdue}</b><small>atrasadas</small></div>
        <div><b class="num" style="color:var(--agenda)">${sum.today}</b><small>para hoy</small></div>
        <div><b class="num">${sum.week}</b><small>esta semana</small></div>
        <div><b class="num" style="color:var(--fin)">${sum.doneToday}</b><small>hechas hoy</small></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn" type="button" data-act="new-event">${icon.clock} Evento</button>
        <button class="btn primary" type="button" data-act="new-task">${icon.plus} Tarea</button>
      </div>
      <button class="btn small link-btn" type="button" data-act="export">${icon.ag} Exportar al Calendario del iPhone</button>
    </section>

    <div class="chips" role="tablist">${Object.entries(TABS).map(([k, l]) =>
      `<button type="button" role="tab" class="chip" data-act="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("")}</div>

    ${ui.tab === "tareas" ? tareasTab(state) : calendarioTab(state)}`;
}

// ---------- Tareas
function tareasTab(state) {
  const tags = allTags(state);
  let list = state.agenda.tasks;
  if (ui.tag) list = list.filter(t => (t.tags || []).some(x => x.toLowerCase() === ui.tag.toLowerCase()));
  const filters = { pending: "Pendientes", done: "Completadas" };

  let body;
  if (ui.filter === "done") {
    const done = list.filter(t => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || "")).slice(0, 40);
    body = done.length ? `<div class="list">${done.map(t => taskRow(t)).join("")}</div>` : `<div class="empty">Aún no has completado tareas${ui.tag ? " con esta etiqueta" : ""}.</div>`;
  } else {
    const groups = groupTasks(list.filter(t => !t.done));
    body = groups.length ? groups.map(g => `
      <div class="day-h${g.key === "overdue" ? " late" : ""}"><span>${g.label}</span><span class="num">${g.tasks.length}</span></div>
      <div class="list tight">${g.tasks.map(t => taskRow(t, { showDate: !["today", "tomorrow"].includes(g.key) })).join("")}</div>`).join("")
      : `<div class="empty">${ui.tag ? "No hay tareas pendientes con esta etiqueta." : "No tienes tareas pendientes.<br>Pulsa <b>+ Tarea</b> o el botón <b>+</b>."}</div>`;
  }
  return `<section class="card">
    <div class="seg-row">${Object.entries(filters).map(([k, l]) => `<button class="chip" type="button" data-act="filter" data-f="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join("")}</div>
    ${tags.length ? `<div class="tag-row">${tags.map(x => `<button class="chip small" type="button" data-act="tag" data-tag="${esc(x)}" aria-pressed="${ui.tag?.toLowerCase() === x.toLowerCase()}">#${esc(x)}</button>`).join("")}</div>` : ""}
    ${body}
  </section>`;
}

// ---------- Calendario
function calendarioTab(state) {
  const cells = monthGrid(state, ui.ym);
  const { events, tasks } = dayItems(state, ui.day);
  return `
    <section class="card">
      <div class="month-nav" style="margin-top:0">
        <button class="icon-btn" type="button" data-act="month" data-n="-1" aria-label="Mes anterior">${icon.back}</button>
        <b>${monthLabel(ui.ym)}</b>
        <button class="icon-btn" type="button" data-act="month" data-n="1" aria-label="Mes siguiente">${icon.chevron}</button>
      </div>
      <div class="cal">
        ${["L", "M", "X", "J", "V", "S", "D"].map(d => `<span class="cal-h">${d}</span>`).join("")}
        ${cells.map(c => `<button type="button" class="cal-d${c.inMonth ? "" : " out"}${c.today ? " today" : ""}${c.date === ui.day ? " sel" : ""}" data-act="day" data-date="${c.date}" aria-label="${longDay(c.date)}${c.events ? `, ${c.events} eventos` : ""}${c.tasks ? `, ${c.tasks} tareas` : ""}">
          <span class="num">${c.day}</span>
          <span class="cal-dots">${c.events ? `<i class="ev"></i>` : ""}${c.tasks ? `<i class="${c.overdue ? "late" : "tk"}"></i>` : ""}</span>
        </button>`).join("")}
      </div>
      <div class="legend"><span style="--c:var(--hab)">Evento</span><span style="--c:var(--agenda)">Tarea</span><span style="--c:var(--danger)">Atrasada</span></div>
      ${ui.ym !== iso().slice(0, 7) || ui.day !== iso() ? `<button class="btn small link-btn" type="button" data-act="go-today">Ir a hoy</button>` : ""}
    </section>
    <section class="card">
      <h2 class="card-h">${longDay(ui.day)}<span class="spacer"></span></h2>
      ${events.length || tasks.length ? `
        ${events.length ? `<div class="list">${events.map(eventRow).join("")}</div>` : ""}
        ${tasks.length ? `<div class="list">${tasks.map(t => taskRow(t, { showDate: false })).join("")}</div>` : ""}`
        : `<div class="empty">Nada para este día.</div>`}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn small" type="button" data-act="new-event-day">+ Evento este día</button>
        <button class="btn small" type="button" data-act="new-task-day">+ Tarea este día</button>
      </div>
    </section>`;
}

// ---------- Interacción
export function mount(root, _state, signal) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    const rerender = () => window.dispatchEvent(new Event("pv:render"));
    switch (b.dataset.act) {
      case "tab": ui.tab = b.dataset.tab; rerender(); break;
      case "filter": ui.filter = b.dataset.f; rerender(); break;
      case "tag": ui.tag = ui.tag?.toLowerCase() === b.dataset.tag.toLowerCase() ? null : b.dataset.tag; rerender(); break;
      case "month": ui.ym = shiftMonth(ui.ym, Number(b.dataset.n)); rerender(); break;
      case "day": ui.day = b.dataset.date; ui.ym = b.dataset.date.slice(0, 7); rerender(); break;
      case "go-today": ui.day = iso(); ui.ym = ui.day.slice(0, 7); rerender(); break;
      case "toggle": {
        let r = null;
        update(s => { r = toggleTask(s, id); });
        if (r?.next) toast(`Hecha · la siguiente es el ${shortDate(r.next)}`);
        break;
      }
      case "new-task": openTaskForm(); break;
      case "new-event": openEventForm(); break;
      case "new-task-day": openTaskForm({ date: ui.day }); break;
      case "new-event-day": openEventForm({ date: ui.day }); break;
      case "edit-task": openTaskForm({ id }); break;
      case "edit-event": openEventForm({ id }); break;
      case "export": openExport(); break;
    }
  }, { signal });
}

