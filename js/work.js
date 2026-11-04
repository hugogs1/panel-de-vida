// Lógica de Trabajo y estudios: horas, proyectos con hitos y aprendizaje.
// entries:  { id, date, minutes, kind: "trabajo"|"estudio", projectId|null, note }
// projects: { id, name, kind, deadline|null, milestones: [{ id, name, done, doneAt }], archived }
// learning: { id, name, type: "curso"|"libro"|"habilidad", done, total, unit, finishedAt }

import { iso, addDays, weekStart, parseISO } from "./stats.js";

export const KINDS = { trabajo: "Trabajo", estudio: "Estudio" };
export const KIND_COLOR = { trabajo: "#7ea6f0", estudio: "#8fd3bf" };
export const LEARN_TYPES = { curso: "Curso", libro: "Libro", habilidad: "Habilidad" };
export const LEARN_UNITS = { curso: "lecciones", libro: "páginas", habilidad: "horas" };

const sumMin = list => list.reduce((s, e) => s + (e.minutes || 0), 0);

/** "2 h 30 min", "45 min", "3 h" */
export function fmtMin(m) {
  m = Math.round(m || 0);
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** Horas con un decimal: "34,5 h" */
export const fmtHours = m => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format((m || 0) / 60)} h`;

/** Semana (lunes-domingo) que contiene `ref`: minutos por día de trabajo y estudio */
export function weekBreakdown(state, ref = new Date()) {
  const start = weekStart(ref);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
  const today = iso();
  const entries = state.work.entries;
  const per = kind => days.map(d => d > today ? null : sumMin(entries.filter(e => e.date === d && e.kind === kind)) / 60);
  const trabajo = per("trabajo"), estudio = per("estudio");
  const tot = arr => arr.reduce((s, v) => s + (v || 0), 0) * 60;
  return { days, start: days[0], end: days[6], trabajo, estudio, minTrabajo: tot(trabajo), minEstudio: tot(estudio), todayIdx: days.indexOf(today) };
}

/** Minutos totales por semana de las últimas n semanas (la última es la actual) */
export function weeksHistory(state, n = 8) {
  const ws = weekStart(new Date());
  return Array.from({ length: n }, (_, i) => {
    const s = addDays(ws, -7 * (n - 1 - i)), e = addDays(s, 6);
    const a = iso(s), b = iso(e);
    const list = state.work.entries.filter(x => x.date >= a && x.date <= b);
    return {
      label: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(s).replace(".", ""),
      trabajo: sumMin(list.filter(x => x.kind === "trabajo")),
      estudio: sumMin(list.filter(x => x.kind === "estudio"))
    };
  });
}

export function projectStats(state, p) {
  const ms = p.milestones || [];
  const done = ms.filter(m => m.done).length;
  const pct = ms.length ? Math.round(done / ms.length * 100) : 0;
  const entries = state.work.entries.filter(e => e.projectId === p.id);
  const ws = iso(weekStart(new Date()));
  let daysLeft = null;
  if (p.deadline) daysLeft = Math.ceil((parseISO(p.deadline) - parseISO(iso())) / 86400000);
  return {
    done, total: ms.length, pct,
    minutes: sumMin(entries),
    weekMinutes: sumMin(entries.filter(e => e.date >= ws)),
    daysLeft,
    next: ms.find(m => !m.done) || null
  };
}

/** Acepta horas y minutos por separado; devuelve minutos (0 si no es válido) */
export function toMinutes(h, m) {
  const hh = Number(String(h || 0).replace(",", "."));
  const mm = Number(String(m || 0).replace(",", "."));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0) return 0;
  return Math.round(hh * 60 + mm);
}
