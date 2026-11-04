// Lógica de hábitos: valores por día, calendario, rachas, cumplimiento y mapa de calor.
// habit: { id, name, unit, target, step, frequency: { type: "daily"|"days"|"weekly", days: [1..7], times },
//          auto: null|"gym"|"futbol"|"any", archived, createdAt }
// logs:  { id, habitId, date, value }   (se suman si hay varios el mismo día)

import { iso, addDays, parseISO, weekStart, isoWeekday } from "./stats.js";
import { uid } from "./ui.js";

export const FREQ_LABEL = { daily: "Todos los días", days: "Días concretos", weekly: "Veces por semana" };
export const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
export const AUTO_LABEL = { gym: "gimnasio", futbol: "fútbol", any: "cualquier entreno", kcal: "las calorías de Foodvisor", protein: "la proteína de Foodvisor" };
/** Los que dependen de entrenos (los de nutrición se crean desde la pestaña Nutrición) */
export const WORKOUT_AUTO = ["gym", "futbol", "any"];
const NUTRI_FIELD = { kcal: "kcal", protein: "protein" };

export function habitValue(state, h, date) {
  if (NUTRI_FIELD[h.auto]) return (state.habits.nutrition || []).find(n => n.date === date)?.[NUTRI_FIELD[h.auto]] || 0;
  if (h.auto) return state.habits.workouts.filter(w => w.date === date && (h.auto === "any" || w.type === h.auto)).length;
  return state.habits.logs.filter(l => l.habitId === h.id && l.date === date).reduce((s, l) => s + (l.value || 0), 0);
}

const target = h => h.target || 1;
/**
 * ¿Se cumple el hábito con este valor? Normalmente valor ≥ objetivo.
 * Calorías en modo «no pasarse» (mode: "max"): hay registro y no supera el objetivo; el día de
 * hoy no cuenta hasta que termina, porque aún puedes comer más.
 */
export function meets(h, value, date, today = iso()) {
  if (h.mode === "max") return date < today && value > 0 && value <= target(h);
  return value >= target(h);
}
export const isDone = (state, h, date) => meets(h, habitValue(state, h, date), date);
export const isScheduled = (h, date) => {
  const f = h.frequency || { type: "daily" };
  return f.type !== "days" || (f.days || []).includes(isoWeekday(parseISO(date)));
};

export function freqText(h) {
  const f = h.frequency || { type: "daily" };
  if (f.type === "weekly") return `${f.times || 1} ${f.times === 1 ? "vez" : "veces"} por semana`;
  if (f.type === "days") return (f.days || []).slice().sort().map(d => WEEKDAYS[d - 1]).join(" · ") || "Sin días";
  return "Todos los días";
}

/** Fija el valor de un día (sustituye los registros de ese día) */
export function setHabitValue(s, habitId, date, value) {
  s.habits.logs = s.habits.logs.filter(l => !(l.habitId === habitId && l.date === date));
  if (value > 0) s.habits.logs.push({ id: uid(), habitId, date, value: Math.round(value * 100) / 100 });
}

/** Días cumplidos de una semana (para hábitos semanales) */
function weekDone(state, h, wsDate) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(state, h, iso(addDays(wsDate, i)))) n++;
  return n;
}

function firstDate(state, h) {
  const dates = h.auto
    ? state.habits.workouts.filter(w => h.auto === "any" || w.type === h.auto).map(w => w.date)
    : state.habits.logs.filter(l => l.habitId === h.id).map(l => l.date);
  const c = h.createdAt ? [h.createdAt.slice(0, 10)] : [];
  return [...dates, ...c].sort()[0] || iso();
}

/** Racha actual y mejor racha. Unidad: días (o semanas si el hábito es semanal). */
export function streaks(state, h, today = iso()) {
  const f = h.frequency || { type: "daily" };
  const start = firstDate(state, h);

  if (f.type === "weekly") {
    const goal = f.times || 1;
    const thisWeek = weekStart(parseISO(today));
    // semana actual: cuenta si ya se ha cumplido; si no, aún no rompe la racha
    let w = weekDone(state, h, thisWeek) >= goal ? thisWeek : addDays(thisWeek, -7);
    let current = 0;
    while (iso(addDays(w, 6)) >= start && weekDone(state, h, w) >= goal) { current++; w = addDays(w, -7); }
    let best = 0, run = 0;
    for (let x = weekStart(parseISO(start)); iso(x) <= today; x = addDays(x, 7)) {
      if (weekDone(state, h, x) >= goal) best = Math.max(best, ++run); else if (iso(x) !== iso(thisWeek)) run = 0;
    }
    return { current, best: Math.max(best, current), unit: "semanas" };
  }

  let d = parseISO(today);
  if (!isDone(state, h, today)) d = addDays(d, -1); // hoy todavía no rompe la racha
  let current = 0;
  while (iso(d) >= start) {
    const day = iso(d);
    if (isScheduled(h, day)) { if (isDone(state, h, day)) current++; else break; }
    d = addDays(d, -1);
  }
  let best = 0, run = 0;
  for (let x = parseISO(start); iso(x) <= today; x = addDays(x, 1)) {
    const day = iso(x);
    if (!isScheduled(h, day)) continue;
    if (isDone(state, h, day)) best = Math.max(best, ++run); else if (day !== today) run = 0;
  }
  return { current, best: Math.max(best, current), unit: "días" };
}

/** % de cumplimiento de los últimos n días (o de las últimas n/7 semanas si es semanal) */
export function completion(state, h, n = 30, today = iso()) {
  const f = h.frequency || { type: "daily" };
  const start = firstDate(state, h);
  if (f.type === "weekly") {
    let ok = 0, tot = 0;
    for (let i = 1; i <= Math.round(n / 7); i++) {
      const w = addDays(weekStart(parseISO(today)), -7 * i);
      if (iso(addDays(w, 6)) < start) break;
      tot++; if (weekDone(state, h, w) >= (f.times || 1)) ok++;
    }
    return tot ? Math.round(ok / tot * 100) : null;
  }
  let ok = 0, tot = 0;
  for (let i = 0; i < n; i++) {
    const day = iso(addDays(parseISO(today), -i));
    if (day < start) break;
    if (!isScheduled(h, day)) continue;
    if (i === 0 && !isDone(state, h, day)) continue; // hoy aún está en curso
    tot++; if (isDone(state, h, day)) ok++;
  }
  return tot ? Math.round(ok / tot * 100) : null;
}

/** Nivel 0-4 de un hábito en un día (null si no tocaba) */
export function habitLevel(state, h, date) {
  if (!isScheduled(h, date) && (h.frequency?.type !== "weekly")) return null;
  const v = habitValue(state, h, date) / target(h);
  if (v <= 0) return 0;
  return v < .5 ? 1 : v < 1 ? 2 : v < 1.5 ? 3 : 4;
}

/** Nivel 0-4 global de un día: proporción de hábitos que tocaban y se cumplieron */
export function dayLevel(state, date) {
  const hs = state.habits.habits.filter(h => !h.archived && h.frequency?.type !== "weekly" && isScheduled(h, date));
  const weekly = state.habits.habits.filter(h => !h.archived && h.frequency?.type === "weekly" && isDone(state, h, date));
  if (!hs.length && !weekly.length) return null;
  const done = hs.filter(h => isDone(state, h, date)).length + weekly.length;
  const r = done / Math.max(1, hs.length + weekly.length);
  return r === 0 ? 0 : r < .34 ? 1 : r < .67 ? 2 : r < 1 ? 3 : 4;
}

/** Días para el mapa de calor: semanas completas (lunes a domingo) terminando en la actual */
export function heatDays(weeks = 17, today = iso()) {
  const start = addDays(weekStart(parseISO(today)), -7 * (weeks - 1));
  return Array.from({ length: weeks * 7 }, (_, i) => iso(addDays(start, i)));
}

/** Hábitos que tocan hoy (o ya cumplidos) con su progreso, para el resumen */
export function habitsToday(state, now = new Date()) {
  const today = iso(now);
  const ws = weekStart(now);
  return state.habits.habits.filter(h => !h.archived).map(h => {
    const f = h.frequency || { type: "daily" };
    const value = habitValue(state, h, today);
    const t = target(h);
    const weekly = f.type === "weekly" ? { done: weekDone(state, h, ws), goal: f.times || 1 } : null;
    const due = f.type === "daily" || (f.type === "days" && isScheduled(h, today)) || (weekly && weekly.done < weekly.goal);
    return { id: h.id, name: h.name, unit: h.unit || "", value, target: t, pct: Math.min(100, Math.round(value / t * 100)), done: meets(h, value, today), due, weekly, auto: h.auto || null, mode: h.mode || null };
  }).filter(h => h.due || h.done);
}
