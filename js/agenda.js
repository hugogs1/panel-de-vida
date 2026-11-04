// Lógica de Agenda: tareas (con repetición), eventos, agrupación, calendario y exportación .ics.
// task:  { id, title, due: "AAAA-MM-DD"|null, time: "HH:MM"|null, priority: "alta"|"media"|"baja",
//          tags: [], note, repeat: null|"day"|"weekdays"|"week"|"2weeks"|"month"|"year",
//          done, doneAt, spawnedId, createdAt, updatedAt }
// event: { id, title, date: "AAAA-MM-DD", allDay, start: "AAAA-MM-DDTHH:MM", end: "AAAA-MM-DDTHH:MM"|null,
//          place, note, alarm: minutos antes|null, updatedAt }

import { iso, addDays, parseISO, weekStart } from "./stats.js";
import { uid } from "./ui.js";

export const PRIORITIES = { alta: "Alta", media: "Media", baja: "Baja" };
export const PRIORITY_COLOR = { alta: "var(--danger)", media: "var(--agenda)", baja: "var(--muted)" };
export const REPEATS = { "": "No se repite", day: "Cada día", weekdays: "Entre semana (L-V)", week: "Cada semana", "2weeks": "Cada 2 semanas", month: "Cada mes", year: "Cada año" };
export const ALARMS = { "": "Sin aviso", 0: "A la hora", 10: "10 min antes", 30: "30 min antes", 60: "1 hora antes", 1440: "1 día antes" };
const PRI_ORDER = { alta: 0, media: 1, baja: 2 };

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** Siguiente fecha de una repetición a partir de `date` */
export function nextRepeat(date, repeat) {
  const d = parseISO(date);
  switch (repeat) {
    case "day": return iso(addDays(d, 1));
    case "weekdays": { let x = addDays(d, 1); while ([0, 6].includes(x.getDay())) x = addDays(x, 1); return iso(x); }
    case "week": return iso(addDays(d, 7));
    case "2weeks": return iso(addDays(d, 14));
    case "month": { const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(), m = (d.getMonth() + 1) % 12; return iso(new Date(y, m, Math.min(d.getDate(), daysIn(y, m)))); }
    case "year": return iso(new Date(d.getFullYear() + 1, d.getMonth(), Math.min(d.getDate(), daysIn(d.getFullYear() + 1, d.getMonth()))));
    default: return null;
  }
}

/** Marca o desmarca una tarea. Si es recurrente, al completarla crea la siguiente. Muta el estado. */
export function toggleTask(s, id, today = iso()) {
  const t = s.agenda.tasks.find(x => x.id === id);
  if (!t) return null;
  if (!t.done) {
    t.done = true;
    t.doneAt = new Date().toISOString();
    if (t.repeat) {
      let next = nextRepeat(t.due || today, t.repeat);
      let guard = 0;
      while (next <= today && guard++ < 1000) next = nextRepeat(next, t.repeat);
      const copy = { ...t, id: uid(), due: next, done: false, doneAt: null, spawnedId: null, createdAt: today, updatedAt: new Date().toISOString() };
      s.agenda.tasks.push(copy);
      t.spawnedId = copy.id;
      return { done: true, next };
    }
    return { done: true };
  }
  t.done = false;
  t.doneAt = null;
  if (t.spawnedId) {
    const sp = s.agenda.tasks.find(x => x.id === t.spawnedId);
    if (sp && !sp.done) s.agenda.tasks = s.agenda.tasks.filter(x => x.id !== sp.id);
    t.spawnedId = null;
  }
  return { done: false };
}

const sortTasks = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.time || "99").localeCompare(b.time || "99") || PRI_ORDER[a.priority] - PRI_ORDER[b.priority];

/** Agrupa las tareas pendientes por cercanía */
export function groupTasks(tasks, today = iso()) {
  const tomorrow = iso(addDays(parseISO(today), 1));
  const endWeek = iso(addDays(weekStart(parseISO(today)), 6));
  const groups = [
    ["overdue", "Atrasadas", t => t.due && t.due < today],
    ["today", "Hoy", t => t.due === today],
    ["tomorrow", "Mañana", t => t.due === tomorrow],
    ["week", "Esta semana", t => t.due > tomorrow && t.due <= endWeek],
    ["later", "Más adelante", t => t.due > endWeek],
    ["nodate", "Sin fecha", t => !t.due]
  ];
  return groups.map(([key, label, fn]) => ({ key, label, tasks: tasks.filter(fn).sort(sortTasks) })).filter(g => g.tasks.length);
}

export function allTags(state) {
  const set = new Map();
  state.agenda.tasks.forEach(t => (t.tags || []).forEach(tag => set.set(tag.toLowerCase(), tag)));
  return [...set.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export const parseTags = s => [...new Set(String(s || "").split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean))];

export function agendaSummary(state, today = iso()) {
  const pending = state.agenda.tasks.filter(t => !t.done);
  const endWeek = iso(addDays(weekStart(parseISO(today)), 6));
  return {
    overdue: pending.filter(t => t.due && t.due < today).length,
    today: pending.filter(t => t.due === today).length,
    week: pending.filter(t => t.due && t.due >= today && t.due <= endWeek).length,
    doneToday: state.agenda.tasks.filter(t => t.done && t.doneAt?.slice(0, 10) === today).length,
    eventsToday: state.agenda.events.filter(e => e.date === today).length
  };
}

/** Eventos y tareas de un día concreto */
export function dayItems(state, date) {
  return {
    events: state.agenda.events.filter(e => e.date === date).sort((a, b) => (a.allDay ? "00" : a.start.slice(11)).localeCompare(b.allDay ? "00" : b.start.slice(11))),
    tasks: state.agenda.tasks.filter(t => t.due === date).sort(sortTasks)
  };
}

/** Celdas del mes (semanas completas de lunes a domingo) con marcas de eventos y tareas */
export function monthGrid(state, ym, today = iso()) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = weekStart(first);
  const last = new Date(y, m, 0);
  const cells = [];
  for (let d = start; d <= last || cells.length % 7; d = addDays(d, 1)) {
    const date = iso(d);
    const tasks = state.agenda.tasks.filter(t => t.due === date);
    cells.push({
      date, day: d.getDate(), inMonth: d.getMonth() === m - 1, today: date === today,
      events: state.agenda.events.filter(e => e.date === date).length,
      tasks: tasks.filter(t => !t.done).length,
      overdue: tasks.some(t => !t.done && date < today)
    });
  }
  return cells;
}

// ---------- Exportación al calendario (.ics)
const pad = n => String(n).padStart(2, "0");
const icsDate = date => date.replace(/-/g, "");
const icsDateTime = dt => `${dt.slice(0, 10).replace(/-/g, "")}T${dt.slice(11, 13)}${dt.slice(14, 16)}00`;
const icsText = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = () => { const d = new Date(); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const RRULE = { day: "FREQ=DAILY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", week: "FREQ=WEEKLY", "2weeks": "FREQ=WEEKLY;INTERVAL=2", month: "FREQ=MONTHLY", year: "FREQ=YEARLY" };

// Las líneas de más de 75 caracteres se parten (norma iCalendar)
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? " " : "") + line.slice(i, i + 73));
  return parts.join("\r\n");
}
const alarm = (min, title) => min == null || min === "" ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(title)}`, `TRIGGER:-PT${Number(min)}M`, "END:VALARM"];

/** Construye el .ics. onlySince: ISO; si se indica, solo elementos creados o cambiados después. */
export function buildICS(state, { onlySince = null, today = iso() } = {}) {
  const changed = x => !onlySince || (x.updatedAt || x.createdAt || "") > onlySince;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Panel de Vida//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Panel de Vida"];
  let count = 0;
  for (const e of state.agenda.events) {
    if (e.date < iso(addDays(parseISO(today), -1)) || !changed(e)) continue;
    lines.push("BEGIN:VEVENT", `UID:${e.id}@panel-de-vida`, `DTSTAMP:${stamp()}`, `SUMMARY:${icsText(e.title)}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(iso(addDays(parseISO(e.date), 1)))}`);
    else {
      lines.push(`DTSTART:${icsDateTime(e.start)}`);
      const end = e.end && e.end > e.start ? e.end : null;
      lines.push(end ? `DTEND:${icsDateTime(end)}` : "DURATION:PT1H");
    }
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (e.note) lines.push(`DESCRIPTION:${icsText(e.note)}`);
    lines.push(...alarm(e.alarm, e.title), "END:VEVENT");
    count++;
  }
  for (const t of state.agenda.tasks) {
    if (t.done || !t.due || !changed(t)) continue;
    lines.push("BEGIN:VEVENT", `UID:${t.id}@panel-de-vida`, `DTSTAMP:${stamp()}`, `SUMMARY:${icsText("☐ " + t.title)}`);
    if (t.time) lines.push(`DTSTART:${icsDateTime(`${t.due}T${t.time}`)}`, "DURATION:PT15M");
    else lines.push(`DTSTART;VALUE=DATE:${icsDate(t.due)}`, `DTEND;VALUE=DATE:${icsDate(iso(addDays(parseISO(t.due), 1)))}`);
    if (t.repeat && RRULE[t.repeat]) lines.push(`RRULE:${RRULE[t.repeat]}`);
    const desc = [`Prioridad ${PRIORITIES[t.priority] || "media"}`, (t.tags || []).map(x => "#" + x).join(" "), t.note].filter(Boolean).join(" · ");
    lines.push(`DESCRIPTION:${icsText(desc)}`);
    // con hora: aviso a esa hora; sin hora: aviso a las 9:00 del día de la tarea
    if (t.time) lines.push(...alarm(0, t.title));
    else lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(t.title)}`, "TRIGGER:PT9H", "END:VALARM");
    lines.push("END:VEVENT");
    count++;
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(fold).join("\r\n") + "\r\n", count };
}

/** Normaliza datos antiguos (eventos sin campo date). Se llama al arrancar. */
export function ensureAgenda(state) {
  state.agenda.events.forEach(e => { if (!e.date && e.start) e.date = e.start.slice(0, 10); });
}
