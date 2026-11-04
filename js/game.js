// Gamificación: XP calculada a partir de los datos, niveles, títulos y logros.
//
// La XP NO se suma al hacer cada acción: se recalcula siempre a partir de lo que hay
// guardado. Así, si borras un gasto o desmarcas una tarea, la XP se ajusta sola y no
// se puede "inflar" marcando y desmarcando. Lo único que se guarda es qué logros has
// desbloqueado (y cuándo) y el último nivel celebrado.

import { iso, addDays, parseISO, streak as globalStreak } from "./stats.js";
import { meets } from "./habits.js";

export const AREAS = {
  fin:  { key: "fin",  name: "Finanzas",           short: "Finanzas", color: "var(--fin)",    hex: "#7fcf9b", route: "finanzas" },
  work: { key: "work", name: "Trabajo y estudios", short: "Trabajo",  color: "var(--work)",   hex: "#7ea6f0", route: "trabajo" },
  hab:  { key: "hab",  name: "Hábitos y deporte",  short: "Hábitos",  color: "var(--hab)",    hex: "#e88fb4", route: "habitos" },
  ag:   { key: "ag",   name: "Agenda y tareas",    short: "Agenda",   color: "var(--agenda)", hex: "#e0b467", route: "agenda" }
};

// ---------- Niveles y títulos
// XP necesaria para pasar del nivel n al n+1: 100, 150, 200, 250…
export const xpToNext = level => 100 + 50 * (level - 1);

export function levelFromXp(xp) {
  let level = 1, rest = xp || 0;
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  const need = xpToNext(level);
  return { level, into: rest, need, pct: Math.round((rest / need) * 100) };
}

export const TITLES = [
  [1, "Novato"], [3, "Iniciado"], [5, "Runner"], [10, "Netrunner"],
  [15, "Operador"], [20, "Ciberninja"], [30, "Arquitecto"], [40, "Leyenda neón"]
];
export const titleFor = level => TITLES.filter(([l]) => level >= l).pop()[1];

// ---------- Tabla de XP (se muestra tal cual en la pantalla de Logros)
export const XP = {
  tx: 5, txDailyCap: 10, goalContribution: 10, goalReached: 100, positiveMonth: 50,
  per30min: 5, workDailyCapMin: 720, milestone: 25, project: 100, learn10pct: 10, learnDone: 75,
  habitDay: 10, perfectDay: 20, gym: 30, futbolTraining: 25, futbolMatch: 30, record: 20, wellbeing: 3, body: 5,
  task: { baja: 5, media: 10, alta: 15 }, onTime: 5, event: 2
};

export const XP_RULES = [
  ["fin", "Movimiento apuntado (máx. 10 al día)", `${XP.tx}`],
  ["fin", "Aportación a una meta de ahorro", `${XP.goalContribution}`],
  ["fin", "Meta de ahorro conseguida", `${XP.goalReached}`],
  ["fin", "Mes cerrado con balance positivo", `${XP.positiveMonth}`],
  ["work", "Cada 30 min de trabajo o estudio (máx. 12 h al día)", `${XP.per30min}`],
  ["work", "Hito completado", `${XP.milestone}`],
  ["work", "Proyecto completado", `${XP.project}`],
  ["work", "Cada 10 % de un curso, libro o habilidad", `${XP.learn10pct}`],
  ["work", "Curso, libro o habilidad terminado", `${XP.learnDone}`],
  ["hab", "Hábito cumplido en un día", `${XP.habitDay}`],
  ["hab", "Día perfecto (todos los hábitos del día)", `${XP.perfectDay}`],
  ["hab", "Entreno de gimnasio", `${XP.gym}`],
  ["hab", "Fútbol: entrenamiento / partido", `${XP.futbolTraining} / ${XP.futbolMatch}`],
  ["hab", "Nuevo récord en un ejercicio", `${XP.record}`],
  ["hab", "Sueño o ánimo apuntado", `${XP.wellbeing}`],
  ["hab", "Medición corporal", `${XP.body}`],
  ["ag", "Tarea completada (baja / media / alta)", `${XP.task.baja} / ${XP.task.media} / ${XP.task.alta}`],
  ["ag", "Bonus por completarla a tiempo", `${XP.onTime}`],
  ["ag", "Evento creado", `${XP.event}`]
];

// ---------- Cálculo de XP y estadísticas (para los logros)
export function computeXP(state, today = iso()) {
  const fin = state.finance, work = state.work, hb = state.habits, ag = state.agenda;
  const st = {};
  const areas = { fin: 0, work: 0, hab: 0, ag: 0 };

  // Finanzas
  const perDay = new Map();
  let txCount = 0;
  for (const t of fin.transactions) {
    if (t.auto || (t.transferId && t.amount > 0)) continue;
    txCount++;
    perDay.set(t.date, (perDay.get(t.date) || 0) + 1);
  }
  perDay.forEach(n => { areas.fin += Math.min(n, XP.txDailyCap) * XP.tx; });
  let contributions = 0, goalsReached = 0;
  for (const g of fin.goals) {
    contributions += (g.history || []).filter(h => h.amount > 0).length;
    if (g.target > 0 && g.saved >= g.target) goalsReached++;
  }
  areas.fin += contributions * XP.goalContribution + goalsReached * XP.goalReached;
  const months = new Map();
  for (const t of fin.transactions) {
    if (t.transferId) continue;
    const m = t.date.slice(0, 7);
    months.set(m, (months.get(m) || 0) + t.amount);
  }
  const thisMonth = today.slice(0, 7);
  const positiveMonths = [...months.entries()].filter(([m, net]) => m < thisMonth && net > 0).length;
  areas.fin += positiveMonths * XP.positiveMonth;
  Object.assign(st, { txCount, goalsReached, positiveMonths, recurring: fin.recurring.length, accounts: fin.accounts.length });

  // Trabajo y estudios
  const workDay = new Map();
  let workMin = 0;
  for (const e of work.entries) { workDay.set(e.date, (workDay.get(e.date) || 0) + (e.minutes || 0)); workMin += e.minutes || 0; }
  workDay.forEach(m => { areas.work += Math.floor(Math.min(m, XP.workDailyCapMin) / 30) * XP.per30min; });
  let milestones = 0, projectsDone = 0;
  for (const p of work.projects) {
    const ms = p.milestones || [];
    const d = ms.filter(m => m.done).length;
    milestones += d;
    if (ms.length && d === ms.length) projectsDone++;
  }
  areas.work += milestones * XP.milestone + projectsDone * XP.project;
  let learnDone = 0;
  for (const l of work.learning) {
    if (!(l.total > 0)) continue;
    const frac = Math.min(1, l.done / l.total);
    areas.work += Math.floor(frac * 10) * XP.learn10pct;
    if (frac >= 1) { areas.work += XP.learnDone; learnDone++; }
  }
  Object.assign(st, { workHours: workMin / 60, milestones, projectsDone, learnDone });

  // Hábitos y deporte
  const logSum = new Map();
  for (const l of hb.logs) { const k = `${l.habitId}|${l.date}`; logSum.set(k, (logSum.get(k) || 0) + (l.value || 0)); }
  const woByDay = new Map();
  for (const w of hb.workouts) {
    for (const k of [`any|${w.date}`, `${w.type}|${w.date}`]) woByDay.set(k, (woByDay.get(k) || 0) + 1);
  }
  const nutri = new Map((hb.nutrition || []).map(n => [n.date, n]));
  const valueOn = (h, date) => h.auto === "kcal" ? (nutri.get(date)?.kcal || 0) : h.auto === "protein" ? (nutri.get(date)?.protein || 0)
    : h.auto ? (woByDay.get(`${h.auto}|${date}`) || 0) : (logSum.get(`${h.id}|${date}`) || 0);
  const doneDates = new Map(); // habitId -> Set(fechas cumplidas)
  let habitDays = 0;
  for (const h of hb.habits) {
    const dates = new Set();
    if (h.auto === "kcal" || h.auto === "protein") nutri.forEach((_, d) => dates.add(d));
    else if (h.auto) hb.workouts.forEach(w => { if (h.auto === "any" || w.type === h.auto) dates.add(w.date); });
    else hb.logs.forEach(l => { if (l.habitId === h.id) dates.add(l.date); });
    const done = new Set([...dates].filter(d => d <= today && meets(h, valueOn(h, d), d, today)));
    doneDates.set(h.id, done);
    habitDays += done.size;
  }
  areas.hab += habitDays * XP.habitDay;
  // Día perfecto: todos los hábitos (no semanales) que tocaban ese día, cumplidos
  const daily = hb.habits.filter(h => !h.archived && (h.frequency?.type || "daily") !== "weekly");
  const candidates = new Set();
  daily.forEach(h => doneDates.get(h.id).forEach(d => candidates.add(d)));
  let perfectDays = 0;
  for (const d of candidates) {
    const wd = ((parseISO(d).getDay() + 6) % 7) + 1;
    const due = daily.filter(h => (!h.createdAt || h.createdAt.slice(0, 10) <= d) && (h.frequency?.type !== "days" || (h.frequency.days || []).includes(wd)));
    if (due.length && due.every(h => doneDates.get(h.id).has(d))) perfectDays++;
  }
  areas.hab += perfectDays * XP.perfectDay;
  let gym = 0, futbol = 0, partidos = 0, futbolMin = 0;
  for (const w of hb.workouts) {
    if (w.type === "gym") { gym++; areas.hab += XP.gym; }
    else if (w.type === "futbol") { futbol++; futbolMin += w.minutes || 0; if (w.kind === "partido") { partidos++; areas.hab += XP.futbolMatch; } else areas.hab += XP.futbolTraining; }
  }
  // Récords: cada vez que el peso máximo de un ejercicio supera al anterior
  let records = 0;
  const best = new Map();
  for (const w of hb.workouts.filter(x => x.type === "gym").sort((a, b) => a.date.localeCompare(b.date))) {
    for (const ex of w.exercises || []) {
      const top = Math.max(0, ...(ex.sets || []).filter(s => s.r > 0 && s.t !== "warmup").map(s => s.w || 0));
      if (!top) continue;
      const k = ex.name.trim().toLowerCase();
      if (best.has(k) && top > best.get(k)) records++;
      if (!best.has(k) || top > best.get(k)) best.set(k, top);
    }
  }
  areas.hab += records * XP.record;
  areas.hab += (hb.sleep.length + hb.mood.length) * XP.wellbeing + hb.body.length * XP.body;
  let bestHabitStreak = 0;
  for (const h of daily) {
    let run = 0;
    const done = doneDates.get(h.id);
    const sorted = [...done].sort();
    let prev = null;
    for (const d of sorted) {
      // días seguidos contando solo los días que tocaba el hábito
      if (prev) {
        let x = addDays(parseISO(prev), 1), gap = false;
        while (iso(x) < d) {
          const wd = ((x.getDay() + 6) % 7) + 1;
          if (h.frequency?.type !== "days" || (h.frequency.days || []).includes(wd)) { gap = true; break; }
          x = addDays(x, 1);
        }
        run = gap ? 1 : run + 1;
      } else run = 1;
      bestHabitStreak = Math.max(bestHabitStreak, run);
      prev = d;
    }
  }
  Object.assign(st, { habitDays, perfectDays, gym, futbol, partidos, futbolMin, records, wellbeing: hb.sleep.length + hb.mood.length, body: hb.body.length, bestHabitStreak });

  // Agenda
  let tasksDone = 0, onTime = 0;
  for (const t of ag.tasks) {
    if (!t.done) continue;
    tasksDone++;
    areas.ag += XP.task[t.priority] || XP.task.media;
    if (t.due && t.doneAt && t.doneAt.slice(0, 10) <= t.due) { areas.ag += XP.onTime; onTime++; }
  }
  areas.ag += ag.events.length * XP.event;
  const overdue = ag.tasks.filter(t => !t.done && t.due && t.due < today).length;
  Object.assign(st, { tasksDone, onTime, events: ag.events.length, overdue });

  st.streak = globalStreak(state);
  st.backup = !!state.settings.lastBackupAt;
  const total = areas.fin + areas.work + areas.hab + areas.ag;
  st.level = levelFromXp(total).level;
  return { total, areas, stats: st };
}

// ---------- Logros: [id, área, nombre, descripción, (stats) => [actual, objetivo]]
export const ACHIEVEMENTS = [
  ["first-xp", "all", "Primer paso", "Gana tus primeros puntos de experiencia", s => [s.level > 1 || s.txCount + s.habitDays + s.tasksDone + s.workHours > 0 ? 1 : 0, 1]],
  ["lvl-5", "all", "Runner", "Llega al nivel 5", s => [s.level, 5]],
  ["lvl-10", "all", "Netrunner", "Llega al nivel 10", s => [s.level, 10]],
  ["lvl-20", "all", "Ciberninja", "Llega al nivel 20", s => [s.level, 20]],
  ["lvl-40", "all", "Leyenda neón", "Llega al nivel 40", s => [s.level, 40]],
  ["streak-7", "all", "Semana encendida", "7 días seguidos apuntando algo", s => [s.streak, 7]],
  ["streak-30", "all", "Mes en llamas", "30 días seguidos apuntando algo", s => [s.streak, 30]],
  ["backup", "all", "A salvo", "Exporta tu primera copia de seguridad", s => [s.backup ? 1 : 0, 1]],

  ["fin-first", "fin", "Primer euro controlado", "Apunta tu primer movimiento", s => [s.txCount, 1]],
  ["fin-100", "fin", "Contable", "Apunta 100 movimientos", s => [s.txCount, 100]],
  ["fin-500", "fin", "Auditor", "Apunta 500 movimientos", s => [s.txCount, 500]],
  ["fin-goal", "fin", "Objetivo cumplido", "Consigue una meta de ahorro", s => [s.goalsReached, 1]],
  ["fin-green", "fin", "Mes en verde", "Cierra un mes con balance positivo", s => [s.positiveMonths, 1]],
  ["fin-green6", "fin", "Seis meses en verde", "Cierra 6 meses con balance positivo", s => [s.positiveMonths, 6]],

  ["work-1h", "work", "Primera hora", "Registra tu primera hora de trabajo o estudio", s => [Math.floor(s.workHours), 1]],
  ["work-100h", "work", "Cien horas", "Registra 100 horas", s => [Math.floor(s.workHours), 100]],
  ["work-500h", "work", "Maratón", "Registra 500 horas", s => [Math.floor(s.workHours), 500]],
  ["work-ms10", "work", "Paso a paso", "Completa 10 hitos", s => [s.milestones, 10]],
  ["work-project", "work", "Misión cumplida", "Completa un proyecto", s => [s.projectsDone, 1]],
  ["work-learn", "work", "Mente curiosa", "Termina un curso, libro o habilidad", s => [s.learnDone, 1]],

  ["hab-first", "hab", "Buen comienzo", "Cumple un hábito por primera vez", s => [s.habitDays, 1]],
  ["hab-perfect", "hab", "Día perfecto", "Cumple todos los hábitos de un día", s => [s.perfectDays, 1]],
  ["hab-perfect30", "hab", "Disciplina", "Consigue 30 días perfectos", s => [s.perfectDays, 30]],
  ["hab-streak21", "hab", "Hábito forjado", "Racha de 21 en un mismo hábito", s => [s.bestHabitStreak, 21]],
  ["hab-gym10", "hab", "Hierro", "Completa 10 entrenos de gimnasio", s => [s.gym, 10]],
  ["hab-gym100", "hab", "Bestia del gimnasio", "Completa 100 entrenos de gimnasio", s => [s.gym, 100]],
  ["hab-pr", "hab", "Nuevo récord", "Bate tu primer récord", s => [s.records, 1]],
  ["hab-pr25", "hab", "Imparable", "Bate 25 récords", s => [s.records, 25]],
  ["hab-futbol", "hab", "Once titular", "Juega 10 partidos de fútbol", s => [s.partidos, 10]],
  ["hab-sleep", "hab", "Autoconocimiento", "Apunta sueño o ánimo 30 veces", s => [s.wellbeing, 30]],

  ["ag-first", "ag", "Tachado", "Completa tu primera tarea", s => [s.tasksDone, 1]],
  ["ag-100", "ag", "Productivo", "Completa 100 tareas", s => [s.tasksDone, 100]],
  ["ag-ontime", "ag", "Puntual", "Completa 25 tareas a tiempo", s => [s.onTime, 25]],
  ["ag-clean", "ag", "Bandeja limpia", "Ninguna tarea atrasada tras completar 10", s => [s.tasksDone >= 10 && s.overdue === 0 ? 1 : 0, 1]],
  ["ag-plan", "ag", "Planificador", "Crea 10 eventos", s => [s.events, 10]]
].map(([id, area, name, desc, fn]) => ({ id, area, name, desc, progress: fn }));

// ---------- Sincronización: actualiza la XP guardada y detecta subidas de nivel y logros nuevos
export function syncGame(state, { silent = false } = {}) {
  const x = computeXP(state);
  const g = state.game;
  const before = g.xp || 0;
  g.xp = x.total;
  g.areaXp = { ...x.areas };
  g.achievements ||= [];

  const levels = { global: levelFromXp(x.total).level };
  Object.keys(AREAS).forEach(k => { levels[k] = levelFromXp(x.areas[k]).level; });
  const events = [];

  if (!g.lastLevels || silent) {
    g.lastLevels = { ...levels };
  } else {
    const ups = Object.keys(AREAS).filter(k => levels[k] > (g.lastLevels[k] || 1)).map(k => ({ area: k, level: levels[k] }));
    if (levels.global > (g.lastLevels.global || 1)) {
      events.push({ type: "level", level: levels.global, title: titleFor(levels.global), newTitle: titleFor(levels.global) !== titleFor(g.lastLevels.global || 1), areas: ups });
    } else if (ups.length) events.push({ type: "area", areas: ups });
    // se guarda el máximo alcanzado para no celebrar dos veces lo mismo al desmarcar y volver a marcar
    for (const k of Object.keys(levels)) g.lastLevels[k] = Math.max(levels[k], g.lastLevels[k] || 1);
  }

  const have = new Set(g.achievements.map(a => a.id));
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    const [cur, goal] = a.progress(x.stats);
    if (cur >= goal) {
      g.achievements.push({ id: a.id, unlockedAt: new Date().toISOString() });
      if (!silent) events.push({ type: "achievement", achievement: a });
    }
  }
  return { events, gained: silent ? 0 : x.total - before, stats: x.stats };
}
