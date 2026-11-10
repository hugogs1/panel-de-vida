// Agenda estilo Calendario de iPhone: vista mensual con cuadrícula de días,
// navegación de mes y año, anotación rápida y recuadro de próximas fechas registradas.

import { areaHeader } from "./area.js";
import { esc, toast, confirmSheet } from "../ui.js";
import { icon } from "../icons.js";
import { iso, parseISO, addDays, weekStart } from "../stats.js";
import { update } from "../state.js";
import { registerQuickAction } from "../quickadd.js";
import { PRIORITY_COLOR, REPEATS, toggleTask, groupTasks, allTags, agendaSummary, dayItems, monthGrid } from "../agenda.js";
import { openTaskForm, openEventForm, openExport } from "./agenda-forms.js";

// Por defecto arranca en "mes" (vista de Calendario completa)
const ui = { tab: "mes", filter: "pending", tag: null, ym: iso().slice(0, 7), day: iso() };
const TABS = { mes: "Calendario", agenda: "Día", tareas: "Tareas" };

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
const shiftYear = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return `${y + n}-${String(m).padStart(2, "0")}`;
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
    t.repeat ? `↺ ${REPEATS[t.repeat]}` : "",
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

/** Recuadro con las Fechas Próximas Registradas */
function upcomingDatesBox(state) {
  const today = iso();
  const allEvents = (state.agenda.events || [])
    .filter(e => e.date >= today)
    .map(e => ({
      type: "event",
      id: e.id,
      date: e.date,
      title: e.title,
      subtitle: e.allDay ? "Todo el día" : (e.start ? e.start.slice(11, 16) : ""),
      place: e.place || "",
      note: e.note || ""
    }));

  const allTasks = (state.agenda.tasks || [])
    .filter(t => !t.done && t.due && t.due >= today)
    .map(t => ({
      type: "task",
      id: t.id,
      date: t.due,
      title: t.title,
      subtitle: t.time || "",
      priority: t.priority || "media",
      tags: t.tags || []
    }));

  const combined = [...allEvents, ...allTasks].sort((a, b) => {
    const diff = a.date.localeCompare(b.date);
    if (diff !== 0) return diff;
    return (a.subtitle || "").localeCompare(b.subtitle || "");
  }).slice(0, 10);

  const relLabel = dStr => {
    if (dStr === today) return { text: "Hoy", cls: "is-today" };
    const diffDays = Math.round((parseISO(dStr) - parseISO(today)) / 86400000);
    if (diffDays === 1) return { text: "Mañana", cls: "is-tomorrow" };
    if (diffDays <= 7) return { text: `En ${diffDays}d`, cls: "is-soon" };
    return { text: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(dStr)).replace(/\./g, ""), cls: "" };
  };

  return `
    <section class="card upcoming-dates-card">
      <div class="card-h">
        <span class="h-dot" style="--c:var(--cyan)"></span>
        <b>Fechas próximas y eventos registrados</b>
        <span class="spacer"></span>
        <button class="btn small" type="button" data-act="new-event">+ Nueva fecha</button>
      </div>

      ${combined.length ? `
        <div class="upcoming-list">
          ${combined.map(item => {
            const rel = relLabel(item.date);
            const isTask = item.type === "task";
            return `
              <div class="upcoming-item">
                <span class="up-date-badge ${rel.cls}">${rel.text}</span>
                <div class="up-info">
                  <span class="up-title">${isTask ? "📌 " : "📅 "}${esc(item.title)}</span>
                  <span class="up-meta">
                    <span>${shortDate(item.date)}</span>
                    ${item.subtitle ? `<span>· ${item.subtitle}</span>` : ""}
                    ${item.place ? `<span>· 📍 ${esc(item.place)}</span>` : ""}
                    ${item.tags && item.tags.length ? `<span>· #${esc(item.tags[0])}</span>` : ""}
                  </span>
                </div>
                <div class="up-act">
                  ${isTask ? `
                    <button class="tick-btn" type="button" data-act="toggle" data-id="${item.id}" title="Marcar como hecha">
                      <span class="tick" style="--c:${PRIORITY_COLOR[item.priority] || "var(--agenda)"}">${icon.check}</span>
                    </button>
                  ` : `
                    <button class="icon-btn small" type="button" data-act="edit-event" data-id="${item.id}" title="Ver evento">
                      ${icon.chevron}
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : `
        <div class="empty" style="padding:16px 8px;text-align:center">
          No hay fechas próximas registradas todavía.<br>
          <small class="muted">Toca en cualquier día del calendario o en <b>+ Nueva fecha</b> para anotar tus exámenes, eventos o entregas.</small>
        </div>
      `}
    </section>
  `;
}

export function render(state) {
  return `
    ${areaHeader(state, "ag")}

    <!-- Selector de vistas estilo iOS Segmented Control -->
    <div class="ios-segmented-control" role="tablist" style="margin-bottom:12px">
      ${Object.entries(TABS).map(([k, l]) =>
        `<button type="button" role="tab" class="ios-seg-tab${ui.tab === k ? " active" : ""}" data-act="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("")}
    </div>

    <!-- Contenido según la pestaña activa -->
    ${ui.tab === "mes" ? mesTab(state) : (ui.tab === "agenda" ? dayTimelineTab(state) : tareasTab(state))}`;
}

/** Vista Cuadrícula Mensual Completa */
function mesTab(state) {
  const cells = monthGrid(state, ui.ym);
  const { events, tasks } = dayItems(state, ui.day);
  const [currentY, currentM] = ui.ym.split("-").map(Number);
  const today = iso();
  const isTodayMonth = ui.ym === today.slice(0, 7);
  const isTodayDay = ui.day === today;

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  return `
    <!-- Barra de Navegación de Mes y Año -->
    <section class="card" style="padding-bottom:12px">
      <div class="cal-nav-bar">
        <div class="cal-title-box">
          <div class="cal-month-title">${monthLabel(ui.ym)}</div>
          <small class="muted">${longDay(ui.day)}</small>
        </div>
        <div class="cal-nav-buttons">
          <button class="icon-btn ios-nav-arrow" type="button" data-act="year" data-n="-1" title="Año anterior («)">«</button>
          <button class="icon-btn ios-nav-arrow" type="button" data-act="month" data-n="-1" title="Mes anterior">${icon.back}</button>
          <button class="ios-pill-btn${isTodayMonth && isTodayDay ? " primary" : ""}" type="button" data-act="go-today">Hoy</button>
          <button class="icon-btn ios-nav-arrow" type="button" data-act="month" data-n="1" title="Mes siguiente">${icon.chevron}</button>
          <button class="icon-btn ios-nav-arrow" type="button" data-act="year" data-n="1" title="Año siguiente (»)">»</button>
        </div>
      </div>

      <!-- Selectores de Salto Rápido de Mes y Año -->
      <div class="cal-jump-bar">
        <select class="cal-jump-select" data-act="jump-month" aria-label="Seleccionar mes">
          ${months.map((mName, mIdx) => `
            <option value="${String(mIdx + 1).padStart(2, "0")}"${mIdx + 1 === currentM ? " selected" : ""}>${mName}</option>
          `).join("")}
        </select>
        <select class="cal-jump-select" data-act="jump-year" aria-label="Seleccionar año">
          ${years.map(yNum => `
            <option value="${yNum}"${yNum === currentY ? " selected" : ""}>${yNum}</option>
          `).join("")}
        </select>
        <button class="icon-btn" type="button" data-act="export" title="Exportar al Calendario del iPhone" style="margin-left:auto">${icon.ag}</button>
      </div>

      <!-- Cuadrícula Mensual Completa con todos los días del mes -->
      <div class="cal">
        ${["L", "M", "X", "J", "V", "S", "D"].map(d => `<span class="cal-h">${d}</span>`).join("")}
        ${cells.map(c => `
          <button type="button" class="cal-d${c.inMonth ? "" : " out"}${c.today ? " today" : ""}${c.date === ui.day ? " sel" : ""}" 
            data-act="day" data-date="${c.date}" aria-label="${longDay(c.date)}">
            <span class="num">${c.day}</span>
            <span class="cal-dots">
              ${c.events ? `<i class="ev" title="${c.events} eventos"></i>` : ""}
              ${c.tasks ? `<i class="${c.overdue ? "late" : "tk"}" title="${c.tasks} tareas"></i>` : ""}
              ${c.workouts ? `<i class="gym" title="Entreno"></i>` : ""}
            </span>
          </button>
        `).join("")}
      </div>

      <div class="legend" style="margin-top:10px">
        <span style="--c:var(--cyan)">Evento</span>
        <span style="--c:var(--agenda)">Tarea</span>
        <span style="--c:#A1F524">Entreno</span>
        <span style="--c:var(--danger)">Atrasada</span>
      </div>
    </section>

    <!-- Sección del Día Seleccionado y Anotar Cosas -->
    <section class="card">
      <div class="card-h">
        <span class="h-dot" style="--c:var(--agenda)"></span>
        <b>${longDay(ui.day)}</b>
        <span class="spacer"></span>
        <div class="btn-row" style="margin:0">
          <button class="btn small primary" type="button" data-act="new-task-day">+ Tarea</button>
          <button class="btn small" type="button" data-act="new-event-day">+ Evento</button>
        </div>
      </div>

      <!-- Formulario rápido para anotar algo en este día -->
      <form class="agenda-inline-add" data-act="inline-add">
        <input class="input" type="text" id="inline-note-inp" placeholder="Anotar algo rápido para el ${shortDate(ui.day)}..." autocomplete="off" required>
        <button class="btn primary" type="submit">+ Anotar</button>
      </form>

      ${events.length || tasks.length ? `
        ${events.length ? `<div class="list" style="margin-bottom:8px">${events.map(eventRow).join("")}</div>` : ""}
        ${tasks.length ? `<div class="list">${tasks.map(t => taskRow(t, { showDate: false })).join("")}</div>` : ""}
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button class="btn small link-btn danger" type="button" data-act="clear-day-agenda" style="font-size:11px">🗑️ Borrar tareas y eventos de este día</button>
        </div>
      ` : `
        <div class="empty" style="padding:12px;text-align:center">
          Nada programado para este día.<br>
          <small class="muted">Escribe arriba para anotar algo al instante o pulsa + Tarea / + Evento.</small>
        </div>
      `}
    </section>

    <!-- Recuadro con las Fechas Próximas Registradas -->
    ${upcomingDatesBox(state)}
  `;
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
  const hours = Array.from({ length: 15 }, (_, i) => i + 8);

  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const showNowLine = isToday && currentHour >= 8 && currentHour <= 22;
  const nowTopPercent = showNowLine ? (((currentHour - 8) + (currentMin / 60)) / 15) * 100 : null;

  return `
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

      ${renderWeekStrip(state)}

      <div class="btn-row" style="margin-top:4px">
        <button class="btn primary" type="button" data-act="new-event-day" style="--c:var(--agenda-apple)">${icon.clock} + Evento</button>
        <button class="btn" type="button" data-act="new-task-day">${icon.plus} + Tarea</button>
        <button class="icon-btn" type="button" data-act="export" title="Exportar al Calendario del iPhone" style="margin-left:auto">${icon.ag}</button>
      </div>
    </header>

    <section class="card apple-timeline-card">
      <div class="card-h">
        <span class="h-dot" style="--c:var(--agenda-apple)"></span>
        <b>Línea de tiempo · ${longDay(ui.day)}</b>
        <span class="spacer"></span>
        <span class="count num">${events.length} ev. · ${tasks.length} tar.</span>
      </div>

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
      case "year": ui.ym = shiftYear(ui.ym, Number(b.dataset.n)); rerender(); break;
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
      case "clear-day-agenda": {
        confirmSheet({
          title: `¿Borrar agenda del ${shortDate(ui.day)}?`,
          text: "Se eliminarán todas las tareas y eventos registrados en este día.",
          ok: "Borrar día",
          danger: true
        }).then(ok => {
          if (!ok) return;
          update(st => {
            st.agenda.tasks = (st.agenda.tasks || []).filter(t => t.due !== ui.day);
            st.agenda.events = (st.agenda.events || []).filter(e => e.date !== ui.day);
          });
          toast(`Agenda del ${shortDate(ui.day)} borrada`);
          rerender();
        });
        break;
      }
      case "export": openExport(); break;
    }
  }, { signal });

  // Manejar saltos de mes y año desde los selectores
  root.addEventListener("change", e => {
    const sel = e.target;
    if (sel.dataset.act === "jump-month") {
      const [y] = ui.ym.split("-");
      ui.ym = `${y}-${sel.value}`;
      window.dispatchEvent(new Event("pv:render"));
    } else if (sel.dataset.act === "jump-year") {
      const [, m] = ui.ym.split("-");
      ui.ym = `${sel.value}-${m}`;
      window.dispatchEvent(new Event("pv:render"));
    }
  }, { signal });

  // Manejar formulario inline de anotación rápida
  root.addEventListener("submit", e => {
    const f = e.target.closest("[data-act=inline-add]");
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector("#inline-note-inp");
    const val = (inp?.value || "").trim();
    if (!val) return;
    const nid = `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    update(s => {
      s.agenda.tasks.push({
        id: nid,
        title: val,
        due: ui.day,
        time: null,
        priority: "media",
        tags: [],
        note: "",
        repeat: null,
        done: false,
        doneAt: null,
        createdAt: iso(),
        updatedAt: new Date().toISOString(),
        source: "panel"
      });
    });
    toast(`Anotado para el ${shortDate(ui.day)}: "${val}"`);
    inp.value = "";
    window.dispatchEvent(new Event("pv:render"));
  }, { signal });
}
