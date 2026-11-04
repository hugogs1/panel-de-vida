// Cálculos que alimentan el resumen. Funciones puras: reciben el estado y devuelven datos.
// Formato de fechas: "AAAA-MM-DD" en hora local; eventos con "AAAA-MM-DDTHH:mm".

export const iso = (d = new Date()) => {
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const parseISO = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
/** Lunes de la semana de d */
export const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
/** 1 = lunes … 7 = domingo */
export const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;

const PRIORITY = { alta: 0, media: 1, baja: 2 };

// ---------- Hoy: tareas pendientes de hoy (y atrasadas) + eventos de hoy
export function todayItems(state, now = new Date()) {
  const today = iso(now);
  const tasks = state.agenda.tasks
    .filter(t => !t.done && t.due && t.due <= today)
    .map(t => ({ kind: "task", id: t.id, title: t.title, time: t.time || "", overdue: t.due < today, priority: t.priority || "media", note: t.note || "" }));
  const doneToday = state.agenda.tasks
    .filter(t => t.done && t.doneAt?.slice(0, 10) === today)
    .map(t => ({ kind: "task", id: t.id, title: t.title, time: t.time || "", done: true, priority: t.priority || "media" }));
  const events = state.agenda.events
    .filter(e => e.start?.slice(0, 10) === today)
    .map(e => ({ kind: "event", id: e.id, title: e.title, time: e.allDay ? "Todo el día" : e.start.slice(11, 16), place: e.place || "" }));

  const pending = [...tasks, ...events].sort((a, b) =>
    (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) ||
    (a.time || "99").localeCompare(b.time || "99") ||
    (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1));
  return { pending, done: doneToday, total: pending.length + doneToday.length };
}

// ---------- Dinero
export function money(state, now = new Date()) {
  const fin = state.finance;
  const total = fin.accounts.reduce((s, a) => s + (a.initial || 0), 0) + fin.transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const month = iso(now).slice(0, 7);
  let income = 0, expense = 0;
  for (const t of fin.transactions) {
    if (t.transferId || !t.date?.startsWith(month)) continue;
    if (t.amount > 0) income += t.amount; else expense += t.amount;
  }
  const today = iso(now);
  const upcoming = fin.recurring
    .filter(r => r.active !== false && r.nextDate && r.nextDate >= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  return { total, income, expense, upcoming, hasAccounts: fin.accounts.length > 0 };
}

// ---------- Semana (lunes a domingo): horas de trabajo/estudio y sueño
export function week(state, now = new Date()) {
  const start = weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
  const today = iso(now);
  const todayIdx = days.indexOf(today);
  const hours = days.map((d, i) => {
    if (i > todayIdx) return null;
    const m = state.work.entries.filter(e => e.date === d).reduce((s, e) => s + (e.minutes || 0), 0);
    return m / 60;
  });
  const sleep = days.map((d, i) => {
    if (i > todayIdx) return null;
    const s = state.habits.sleep.find(x => x.date === d);
    return s ? s.hours : null;
  });
  const totalHours = hours.reduce((s, v) => s + (v || 0), 0);
  const sleepVals = sleep.filter(v => v != null);
  const avgSleep = sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;
  const workouts = state.habits.workouts.filter(w => w.date >= days[0] && w.date <= today).length;
  return { labels: ["L", "M", "X", "J", "V", "S", "D"], hours, sleep, todayIdx, totalHours, avgSleep, workouts, hasData: totalHours > 0 || sleepVals.length > 0 };
}

// ---------- Racha: días seguidos (hasta hoy, o hasta ayer si hoy aún no hay nada) con algún registro
export function activeDays(state) {
  const s = new Set();
  const add = d => d && s.add(d.slice(0, 10));
  state.habits.logs.forEach(l => l.value > 0 && add(l.date));
  state.habits.workouts.forEach(w => add(w.date));
  state.habits.sleep.forEach(x => add(x.date));
  state.habits.mood.forEach(x => add(x.date));
  (state.habits.nutrition || []).forEach(x => add(x.date));
  state.work.entries.forEach(e => add(e.date));
  state.finance.transactions.forEach(t => !t.auto && add(t.date));
  state.agenda.tasks.forEach(t => t.done && add(t.doneAt));
  return s;
}

export function streak(state, now = new Date()) {
  const days = activeDays(state);
  let d = new Date(now);
  if (!days.has(iso(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(iso(d))) { n++; d = addDays(d, -1); }
  return n;
}

export function hasAnyData(state) {
  const f = state.finance, w = state.work, h = state.habits, a = state.agenda;
  return [f.accounts, f.transactions, f.recurring, f.goals, w.entries, w.projects, w.learning,
    h.habits, h.logs, h.workouts, h.body, h.sleep, h.mood, h.nutrition || [], a.tasks, a.events].some(arr => arr.length > 0);
}
