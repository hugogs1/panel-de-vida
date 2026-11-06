// Agenda estilo Calendario de iPhone: vista diaria con timeline por horas,
// tira semanal interactiva de 7 días, cuadrícula mensual y tareas estilo Recordatorios de Apple.

import { areaHeader } from "./area.js";
import { esc, toast } from "../ui.js";
import { icon } from "../icons.js";
import { iso, parseISO, addDays, weekStart } from "../stats.js";
import { update } from "../state.js";
import { registerQuickAction } from "../quickadd.js";
import { PRIORITY_COLOR, REPEATS, toggleTask, groupTasks, allTags, agendaSummary, dayItems, monthGrid } from "../agenda.js";
import { openTaskForm, openEventForm, openExport } from "./agenda-forms.js";

// Por defecto arranca en "agenda" (vista diaria estilo iPhone Calendar)
const ui = { tab: "agenda", filter: "pending", tag: null, ym: iso().slice(0, 7), day: iso() };
const TABS = { agenda: "Día", mes: "Mes", tareas: "Tareas" };

registerQuickAction("task", () => openTaskForm());

const monthLabel = ym => { 
  const [y, m] = ym.split("-").map(Number); 
  const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1)); 
  return s[0].toUpperCase() + s.slice(1); 
};
const shiftMonth = (ym, n) => { 
  const [y, m] = ym.split("-").map(Number); 
  return iso(new Date(y, m - 1 + n, 1)).slice(0, 7); 
};
const shortDate = s => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(s)).replace(/\./g, "");
const longDay = s => { 
  const t = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(parseISO(s)); 
  return t[0].toUpperCase() + t.slice(1); 
};

/** Fila de tarea estilo Recordatorios de Apple */
function taskRow(t, { showDate = true } = {}) {
  const today = iso();
  const meta = [
    showDate && t.due ? `<span class="${!t.done && t.due < today ? "late" : ""}">${t.due === today ? "Hoy" : shortDate(t.due)}</span>` : "",
    t.time ? `${t.time}` : "",
    t.repeat ? `↻ ${REPEATS[t.repeat]}` : "",
    ...(t.tags || []).map(x => `#${esc(x)}`)
  ].filter(Boolean).join(" · ");

  return `<div class="item task${t.done ? " is-done" : ""}">
    <button class="tick-btn" type="button" data-act="toggle" data-id="${t.id}" aria-pressed="${!!t.done}" aria-label="Completar ${esc(t.title)}">
      <span class="tick" style="--c:${PRIORITY_COLOR[t.priority] || "var(--agenda)"}">${icon.check}</span>
    </button>
    <button class="t task-main" type="button" data-act="edit-task" data-id="${t.id}">
      <b>${esc(t.title)}</b>
      ${meta ? `<small>${meta}</small>` : ""}
    </button>
    ${!t.done && t.priority === "alta" ? `<span class="tag" style="--c:var(--danger)">Alta</span>` : ""}
  </div>`;
}

/** Fila de evento estilo tarjeta Apple */
function eventRow(e) {
  return `<button class="item tap ios-event-card" type="button" data-act="edit-event" data-id="${e.id}">
    <div class="ios-ev-top">
      <span class="ios-ev-time num">${e.allDay ? "Todo el día" : `${e.start.slice(11, 16)}${e.end ? ` - ${e.end.slice(11, 16)}` : ""}`}</span>
      ${e.alarm != null ? `<span class="bell" title="Con aviso">${icon.bell}</span>` : ""}
    </div>
    <div class="ios-ev-title">${esc(e.title)}</div>
    ${e.place || e.note ? `<div class="ios-ev-meta">${e.place ? `<span>📍 ${esc(e.place)}</span>` : ""}${e.note ? `<span>${esc(e.note)}</span>` : ""}</div>` : ""}
  </button>`;
}

export function render(state) {
  const sum = agendaSummary(state);
  const today = iso();
  const isToday = ui.day === today;

  return `
    ${areaHeader(state, "ag")}

    <!-- Cabecera Apple Calendar: Navegación de Fecha, Selector de Vistas y Botón Hoy -->
    <header class="apple-cal-header card">
      <div class="cal-nav-bar">
        <div class="cal-title-box">
          <div class="cal-month-title">${monthLabel(ui.ym)}</div>
          <small class="muted">${longDay(ui.day)}</small>
        </div>
        <div class="cal-nav-buttons">
          <button class="icon-btn ios-nav-arrow" type="button" data-act="prev-week" aria-label="Semana anterior">${icon.back}</button>
          <button class="ios-pill-btn${isToday ? " primary" : ""}" type="button" data-act="go-today">Hoy</button>
          <button class="icon-btn ios-nav-arrow" type="button" data-act="next-week" aria-label="Semana siguiente">${icon.chevron}</button>
        </div>
      </div>

      <!-- Tira interactiva de 7 días de la semana activa estilo iPhone -->
      ${renderWeekStrip(state)}

      <!-- Selector de vistas estilo iOS Segmented Control -->
      <div class="ios-segmented-control" role="tablist">
        ${Object.entries(TABS).map(([k, l]) =>
          `<button type="button" role="tab" class="ios-seg-tab${ui.tab === k ? " active" : ""}" data-act="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("")}
      </div>

      <!-- Botones de Acción Rápida -->
      <div class="btn-row" style="margin-top:4px">
        <button class="btn primary" type="button" data-act="new-event-day" style="--c:var(--agenda-apple)">${icon.clock} + Evento</button>
        <button class="btn" type="button" data-act="new-task-day">${icon.plus} + Tarea</button>
        <button class="icon-btn" type="button" data-act="export" title="Exportar al Calendario del iPhone" style="margin-left:auto">${icon.ag}</button>
      </div>
    </header>

    <!-- Contenido según la pestaña activa -->
    ${ui.tab === "agenda" ? dayTimelineTab(state) : (ui.tab === "mes" ? mesTab(state) : tareasTab(state))}`;
}

/** Tira semanal de 7 días estilo Calendario de iPhone */
function renderWeekStrip(state) {
  const selectedDate = ui.day;
  const today = iso();
  const selDateObj = parseISO(selectedDate);
  const mon = weekStart(selDateObj);
  const weekDays = Array.from({ length: 7 }, (_, i) => iso(addDays(mon, i)));
  const dayLetters = ["L", "M", "X", "J", "V", "S", "D"];

  return `
    <div class="ios-week-strip">
      ${weekDays.map((dStr, idx) => {
        const dObj = parseISO(dStr);
        const dayNum = dObj.getDate();
        const isSel = dStr === selectedDate;
        const isTod = dStr === today;
        const eventsN = (state.agenda.events || []).filter(e => e.date === dStr).length;
        const tasks = (state.agenda.tasks || []).filter(t => t.due === dStr && !t.done);
        const hasOverdue = tasks.some(t => dStr < today);

        return `
          <button class="ios-day-cell${isSel ? " is-selected" : ""}${isTod ? " is-today" : ""}" 
            type="button" data-act="day" data-date="${dStr}" aria-label="${longDay(dStr)}">
            <span class="ios-day-name">${dayLetters[idx]}</span>
            <div class="ios-day-bubble">
              <span>${dayNum}</span>
            </div>
            <div class="ios-dots">
              ${eventsN ? `<i class="ios-dot ev"></i>` : ""}
              ${tasks.length ? `<i class="ios-dot ${hasOverdue ? "late" : "tk"}"></i>` : ""}
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

/** Vista Día con Timeline Horario estilo Calendario de iPhone */
function dayTimelineTab(state) {
  const { events, tasks } = dayItems(state, ui.day);
  const today = iso();
  const isToday = ui.day === today;

  // Eventos de todo el día y tareas sin hora fija
  const allDayEvents = events.filter(e => e.allDay);
  const timedEvents = events.filter(e => !e.allDay);
  const timedTasks = tasks.filter(t => t.time);
  const unTimedTasks = tasks.filter(t => !t.time);

  // Horas del timeline (de 08:00 a 22:00)
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8 to 22

  // Cálculo de línea de hora actual
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const showNowLine = isToday && currentHour >= 8 && currentHour <= 22;
  const nowTopPercent = showNowLine ? (((currentHour - 8) + (currentMin / 60)) / 15) * 100 : null;

  return `
    <section class="card apple-timeline-card">
      <div class="card-h">
        <span class="h-dot" style="--c:var(--agenda-apple)"></span>
        <b>${longDay(ui.day)}</b>
        <span class="spacer"></span>
        <span class="count num">${events.length} ev. · ${tasks.length} tar.</span>
      </div>

      <!-- Sección Todo el Día (si hay eventos sin hora) -->
      ${allDayEvents.length || unTimedTasks.length ? `
        <div class="ios-allday-box">
          <div class="ios-allday-label">Todo el día</div>
          <div class="ios-allday-list">
            ${allDayEvents.map(e => `
              <button class="ios-allday-item" type="button" data-act="edit-event" data-id="${e.id}">
                <span class="ios-ad-dot" style="background:var(--agenda-apple)"></span>
                <b>${esc(e.title)}</b>
                ${e.place ? `<small>📍 ${esc(e.place)}</small>` : ""}
              </button>`).join("")}
            ${unTimedTasks.map(t => `
              <div class="ios-allday-task${t.done ? " is-done" : ""}">
                <button class="tick-btn" type="button" data-act="toggle" data-id="${t.id}">
                  <span class="tick" style="--c:${PRIORITY_COLOR[t.priority] || "var(--agenda)"}">${icon.check}</span>
                </button>
                <button class="task-title" type="button" data-act="edit-task" data-id="${t.id}">${esc(t.title)}</button>
              </div>`).join("")}
          </div>
        </div>
      ` : ""}

      <!-- Línea de tiempo horaria (08:00 a 22:00) -->
      <div class="ios-timeline">
        ${showNowLine ? `
          <div class="timeline-now-line" style="top:${nowTopPercent.toFixed(2)}%">
            <span class="now-badge">${String(currentHour).padStart(2, "0")}:${String(currentMin).padStart(2, "0")}</span>
          </div>` : ""}

        ${hours.map(h => {
          const hStr = String(h).padStart(2, "0");
          const slotEvents = timedEvents.filter(e => e.start && e.start.slice(11, 13) === hStr);
          const slotTasks = timedTasks.filter(t => t.time && t.time.slice(0, 2) === hStr);

          return `
            <div class="timeline-slot" data-hour="${hStr}">
              <div class="timeline-time">${hStr}:00</div>
              <div class="timeline-content">
                ${slotEvents.map(e => `
                  <button class="ios-timeline-event" type="button" data-act="edit-event" data-id="${e.id}">
                    <div class="ite-bar" style="background:var(--cyan)"></div>
                    <div class="ite-info">
                      <b>${esc(e.title)}</b>
                      <small>${e.start.slice(11, 16)}${e.end ? ` - ${e.end.slice(11, 16)}` : ""} ${e.place ? `· 📍 ${esc(e.place)}` : ""}</small>
                    </div>
                  </button>`).join("")}
                ${slotTasks.map(t => `
                  <div class="ios-timeline-task${t.done ? " is-done" : ""}">
                    <button class="tick-btn" type="button" data-act="toggle" data-id="${t.id}">
                      <span class="tick" style="--c:${PRIORITY_COLOR[t.priority] || "var(--agenda)"}">${icon.check}</span>
                    </button>
                    <button class="task-title" type="button" data-act="edit-task" data-id="${t.id}">
                      <span>${esc(t.title)}</span>
                      <small class="num">${t.time}</small>
                    </button>
                  </div>`).join("")}
                ${!slotEvents.length && !slotTasks.length ? `
                  <button class="timeline-quick-add" type="button" data-act="quick-add-hour" data-date="${ui.day}" data-hour="${hStr}:00" title="Añadir evento a las ${hStr}:00">
                    <span>+</span>
                  </button>
                ` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <!-- Recordatorios / Tareas pendientes del día -->
      ${tasks.length ? `
        <div class="ios-reminders-box" style="margin-top:16px">
          <div class="card-h" style="padding:0 0 8px">
            <span class="h-dot" style="--c:var(--agenda)"></span>
            <b>Recordatorios y tareas del día</b>
          </div>
          <div class="list tight">
            ${tasks.map(t => taskRow(t, { showDate: false })).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

/** Vista Cuadrícula Mensual */
function mesTab(state) {
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
      <div class="legend">
        <span style="--c:var(--cyan)">Evento</span>
        <span style="--c:var(--agenda)">Tarea</span>
        <span style="--c:var(--danger)">Atrasada</span>
      </div>
      ${ui.ym !== iso().slice(0, 7) || ui.day !== iso() ? `<button class="btn small link-btn" type="button" data-act="go-today">Ir a hoy</button>` : ""}
    </section>
    <section class="card">
      <h2 class="card-h">${longDay(ui.day)}<span class="spacer"></span></h2>
      ${events.length || tasks.length ? `
        ${events.length ? `<div class="list">${events.map(eventRow).join("")}</div>` : ""}
        ${tasks.length ? `<div class="list">${tasks.map(t => taskRow(t, { showDate: false })).join("")}</div>` : ""}`
        : `<div class="empty">Nada programado para este día.</div>`}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn small" type="button" data-act="new-event-day">+ Evento este día</button>
        <button class="btn small" type="button" data-act="new-task-day">+ Tarea este día</button>
      </div>
    </section>`;
}

/** Vista Lista de Tareas estilo Recordatorios */
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
      : `<div class="empty">${ui.tag ? "No hay tareas pendientes con esta etiqueta." : "No tienes tareas pendientes.<br>Pulsa <b>+ Tarea</b> para apuntar una."}</div>`;
  }
  return `<section class="card">
    <div class="seg-row">${Object.entries(filters).map(([k, l]) => `<button class="chip" type="button" data-act="filter" data-f="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join("")}</div>
    ${tags.length ? `<div class="tag-row">${tags.map(x => `<button class="chip small" type="button" data-act="tag" data-tag="${esc(x)}" aria-pressed="${ui.tag?.toLowerCase() === x.toLowerCase()}">#${esc(x)}</button>`).join("")}</div>` : ""}
    ${body}
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
      case "prev-week": {
        const d = parseISO(ui.day);
        ui.day = iso(addDays(d, -7));
        ui.ym = ui.day.slice(0, 7);
        rerender();
        break;
      }
      case "next-week": {
        const d = parseISO(ui.day);
        ui.day = iso(addDays(d, 7));
        ui.ym = ui.day.slice(0, 7);
        rerender();
        break;
      }
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
      case "quick-add-hour": openEventForm({ date: b.dataset.date, time: b.dataset.hour }); break;
      case "edit-task": openTaskForm({ id }); break;
      case "edit-event": openEventForm({ id }); break;
      case "export": openExport(); break;
    }
  }, { signal });
}
