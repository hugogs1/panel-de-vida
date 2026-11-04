// Datos de ejemplo para ver el panel "vivo" antes de apuntar nada.
// Se generan alrededor de la fecha actual. Se cargan y se quitan desde Ajustes.

import { defaultState } from "./state.js";
import { iso, addDays, weekStart } from "./stats.js";
import { defaultCategories } from "./finance.js";

// Aleatorio reproducible: siempre salen los mismos datos
function rng(seed = 7) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

export function buildDemo(alias) {
  const s = defaultState();
  s.profile.alias = alias;
  s.settings.demo = true;
  s.settings.lastBackupAt = new Date().toISOString();
  const r = rng();
  const now = new Date();
  const today = iso(now);
  const d = n => iso(addDays(now, n));
  const month = today.slice(0, 7);
  let id = 0;
  const nid = p => `${p}${++id}`;

  // ---- Finanzas
  s.finance.accounts = [
    { id: "acc-banco", name: "Banco", type: "banco", initial: 980 },
    { id: "acc-efectivo", name: "Efectivo", type: "efectivo", initial: 120 },
    { id: "acc-ahorro", name: "Ahorro", type: "ahorro", initial: 1400 }
  ];
  s.finance.categories = defaultCategories();
  const tx = (date, amount, categoryId, note, accountId = "acc-banco") =>
    s.finance.transactions.push({ id: nid("tx"), date, amount, accountId, categoryId, note });
  for (let k = 5; k >= 1; k--) {
    const m0 = iso(new Date(now.getFullYear(), now.getMonth() - k, 1)).slice(0, 7);
    tx(`${m0}-01`, 1850, "c-nomina", "Nómina");
    tx(`${m0}-01`, -650, "c-casa-alquiler-o-hipoteca", "Alquiler");
    tx(`${m0}-12`, -Math.round((520 + r() * 420) * 100) / 100, "c-comida-supermercado", "Compras del mes");
    tx(`${m0}-20`, -Math.round((80 + r() * 160) * 100) / 100, "c-ocio-salidas", "Ocio");
  }
  tx(`${month}-01`, 1850, "c-nomina", "Nómina");
  tx(`${month}-01`, -650, "c-casa-alquiler-o-hipoteca", "Alquiler");
  for (let i = 0; i < 14; i++) {
    const day = d(-Math.floor(r() * Math.min(now.getDate() - 1, 27)));
    const pick = r();
    if (pick < .45) tx(day, -Math.round((18 + r() * 55) * 100) / 100, "c-comida-supermercado", "Supermercado");
    else if (pick < .7) tx(day, -Math.round((9 + r() * 30) * 100) / 100, "c-comida-restaurantes", "Cena fuera", "acc-efectivo");
    else if (pick < .85) tx(day, -Math.round((5 + r() * 20) * 100) / 100, "c-transporte-combustible", "Gasolina");
    else tx(day, -Math.round((10 + r() * 40) * 100) / 100, "c-ocio-salidas", "Ocio");
  }
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nm = (day) => iso(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day));
  s.finance.recurring = [
    { id: "rec-alquiler", name: "Alquiler", amount: -650, accountId: "acc-banco", categoryId: "c-casa-alquiler-o-hipoteca", every: "month", nextDate: nm(1), day: 1 },
    { id: "rec-netflix", name: "Netflix", amount: -12.99, accountId: "acc-banco", categoryId: "c-subs-streaming", every: "month", nextDate: nm(3), day: 3 },
    { id: "rec-gym", name: "Gimnasio", amount: -39.9, accountId: "acc-banco", categoryId: "c-deporte-gimnasio", every: "month", nextDate: nm(5), day: 5 }
  ];
  s.finance.transactions.push(
    { id: nid("tx"), date: d(-3), amount: -200, accountId: "acc-banco", categoryId: null, note: "Ahorro del mes", transferId: "trf1" },
    { id: nid("tx"), date: d(-3), amount: 200, accountId: "acc-ahorro", categoryId: null, note: "Ahorro del mes", transferId: "trf1" });
  s.finance.goals = [{ id: "goal-viaje", name: "Viaje a Japón", target: 3000, saved: 1400, deadline: iso(new Date(now.getFullYear() + 1, 6, 1)), history: [] },
    { id: "goal-colchon", name: "Fondo de emergencia", target: 2000, saved: 650, deadline: null, history: [] }];

  // ---- Trabajo y estudios (últimos 13 días)
  const ms = (names, doneN) => names.map((name, i) => ({ id: nid("ms"), name, done: i < doneN, doneAt: i < doneN ? d(-(names.length - i) * 2) : null }));
  s.work.projects = [
    { id: "prj-informe", name: "Informe trimestral", kind: "trabajo", deadline: d(4), archived: false,
      milestones: ms(["Recopilar datos de ventas", "Análisis por región", "Primer borrador", "Revisión con el equipo", "Entrega final"], 3) },
    { id: "prj-sql", name: "Aprobar el certificado de SQL", kind: "estudio", deadline: d(45), archived: false,
      milestones: ms(["Consultas básicas", "JOINs", "Subconsultas", "Índices y rendimiento", "Examen de prueba", "Examen oficial"], 2) },
    { id: "prj-web", name: "Rediseño de la intranet", kind: "trabajo", deadline: null, archived: true,
      milestones: ms(["Maqueta", "Desarrollo", "Publicación"], 3) }
  ];
  for (let i = 55; i >= 0; i--) {
    const day = addDays(now, -i), wd = (day.getDay() + 6) % 7;
    if (wd < 5) s.work.entries.push({ id: nid("w"), date: iso(day), minutes: Math.round((300 + r() * 180) / 15) * 15, projectId: "prj-informe", kind: "trabajo" });
    if (r() < .6) s.work.entries.push({ id: nid("w"), date: iso(day), minutes: Math.round((30 + r() * 90) / 15) * 15, projectId: "prj-sql", kind: "estudio" });
  }
  s.work.learning = [
    { id: "lrn-sql", name: "Curso de SQL", type: "curso", done: 12, total: 40, unit: "lecciones", startedAt: d(-30) },
    { id: "lrn-libro", name: "Hábitos atómicos", type: "libro", done: 184, total: 320, unit: "páginas", startedAt: d(-20) },
    { id: "lrn-ingles", name: "Inglés (conversación)", type: "habilidad", done: 34, total: 100, unit: "horas", startedAt: d(-90) },
    { id: "lrn-excel", name: "Excel avanzado", type: "curso", done: 24, total: 24, unit: "lecciones", startedAt: d(-60), finishedAt: d(-10) }
  ];

  // ---- Hábitos (últimas 17 semanas; hoy a medias)
  s.habits.habits = [
    { id: "hb-agua", name: "Beber agua", unit: "L", target: 2, step: 0.5, frequency: { type: "daily" }, createdAt: d(-120) },
    { id: "hb-leer", name: "Leer", unit: "págs.", target: 20, step: 5, frequency: { type: "daily" }, createdAt: d(-120) },
    { id: "hb-gym", name: "Gimnasio", unit: "sesión", target: 1, step: 1, auto: "gym", frequency: { type: "weekly", times: 4 }, createdAt: d(-120) },
    { id: "hb-medit", name: "Meditar", unit: "min", target: 10, step: 5, frequency: { type: "days", days: [1, 3, 5] }, createdAt: d(-120) }
  ];
  for (let i = 119; i >= 1; i--) {
    const day = d(-i), wd = ((addDays(now, -i).getDay() + 6) % 7) + 1;
    const good = i < 40 ? .9 : .7; // últimamente más constante
    s.habits.logs.push({ id: nid("l"), habitId: "hb-agua", date: day, value: r() < good ? 2 : r() < .5 ? 1.5 : 1 });
    if (r() < good - .1) s.habits.logs.push({ id: nid("l"), habitId: "hb-leer", date: day, value: 20 + Math.round(r() * 10) });
    if ([1, 3, 5].includes(wd) && r() < good) s.habits.logs.push({ id: nid("l"), habitId: "hb-medit", date: day, value: 10 });
  }
  s.habits.logs.push({ id: nid("l"), habitId: "hb-agua", date: today, value: 1.5 });
  s.habits.logs.push({ id: nid("l"), habitId: "hb-leer", date: today, value: 10 });

  // ---- Gimnasio: rutinas y 8 semanas de entrenos con progresión
  s.habits.routines = [
    { id: "rt-torso", name: "Torso", exercises: [
      { id: "e1", name: "Press banca", sets: 4, reps: 8 }, { id: "e2", name: "Remo con barra", sets: 4, reps: 8 },
      { id: "e3", name: "Press militar", sets: 3, reps: 10 }, { id: "e4", name: "Dominadas", sets: 3, reps: 8 }] },
    { id: "rt-pierna", name: "Pierna", exercises: [
      { id: "e5", name: "Sentadilla", sets: 4, reps: 6 }, { id: "e6", name: "Peso muerto rumano", sets: 3, reps: 10 },
      { id: "e7", name: "Prensa", sets: 3, reps: 12 }, { id: "e8", name: "Gemelos", sets: 4, reps: 15 }] }
  ];
  const base = { "Press banca": 70, "Remo con barra": 60, "Press militar": 40, "Dominadas": 0, "Sentadilla": 90, "Peso muerto rumano": 80, "Prensa": 160, "Gemelos": 60 };
  for (let wk = 7; wk >= 0; wk--) {
    const ws = addDays(weekStart(now), -7 * wk);
    [[0, "rt-torso"], [1, "rt-pierna"], [3, "rt-torso"], [4, "rt-pierna"]].forEach(([off, rid], k) => {
      const day = addDays(ws, off);
      if (iso(day) > today || (wk === 0 && k > 1)) return;
      const rt = s.habits.routines.find(x => x.id === rid);
      const inc = (7 - wk) * 1.25;
      s.habits.workouts.push({ id: nid("wo"), date: iso(day), type: "gym", routineId: rid, minutes: 60 + Math.round(r() * 20),
        exercises: rt.exercises.map(ex => ({ name: ex.name, sets: Array.from({ length: ex.sets }, () => ({ w: Math.round((base[ex.name] + inc * (ex.name === "Prensa" ? 4 : 1)) / 2.5) * 2.5, r: ex.reps })) })) });
    });
  }
  // fútbol: entrenamiento los martes, partido algunos sábados
  for (let wk = 7; wk >= 0; wk--) {
    const ws = addDays(weekStart(now), -7 * wk);
    if (iso(addDays(ws, 1)) <= today) s.habits.workouts.push({ id: nid("fb"), date: iso(addDays(ws, 1)), type: "futbol", kind: "entrenamiento", minutes: 90, note: "" });
    if (wk % 2 === 0 && iso(addDays(ws, 5)) < today) s.habits.workouts.push({ id: nid("fb"), date: iso(addDays(ws, 5)), type: "futbol", kind: "partido", minutes: 70, note: "Liga" });
  }

  for (let i = 13; i >= 0; i--) {
    s.habits.sleep.push({ id: nid("s"), date: d(-i), hours: Math.round((6.2 + r() * 2.2) * 10) / 10, quality: 3 + Math.round(r() * 2) });
    s.habits.mood.push({ id: nid("m"), date: d(-i), value: 2 + Math.round(r() * 3) });
  }
  s.habits.body = [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ id: nid("bd"), date: d(-7 * (7 - k)), weight: Math.round((78.2 - k * 0.32 + r() * .4) * 10) / 10, fat: Math.round((19 - k * .2) * 10) / 10, waist: k % 2 ? null : 86 - k * .4 }));

  // ---- Agenda
  const ts = new Date().toISOString();
  const task = (title, due, extra = {}) => ({ id: nid("tk"), title, due, time: null, priority: "media", tags: [], note: "", repeat: null, done: false, doneAt: null, createdAt: d(-10), updatedAt: ts, ...extra });
  s.agenda.tasks = [
    task("Entregar informe trimestral", today, { time: "18:00", priority: "alta", tags: ["trabajo"] }),
    task("Lección 13 del curso de SQL", today, { tags: ["estudio"] }),
    task("Pagar la cuota del equipo", d(-1), { tags: ["fútbol"] }),
    task("Comprar proteína", today, { priority: "baja", done: true, doneAt: ts }),
    task("Revisar el presupuesto de noviembre", d(2), { tags: ["finanzas"] }),
    task("Regar las plantas", d(1), { priority: "baja", repeat: "week", tags: ["casa"] }),
    task("Repasar tema 5 de Estadística", d(3), { priority: "alta", tags: ["estudio"] }),
    task("Pedir cita para la ITV", d(9), { tags: ["coche"] }),
    task("Llamar a la abuela", d(4), { repeat: "week" }),
    task("Ordenar el trastero", null, { priority: "baja", tags: ["casa"] }),
    task("Mirar vuelos para Japón", null, { tags: ["viaje"] })
  ];
  const ev = (title, date, start, end, extra = {}) => ({ id: nid("ev"), title, date, allDay: !start, start: `${date}T${start || "00:00"}`, end: end ? `${date}T${end}` : null, place: "", note: "", alarm: 30, createdAt: d(-10), updatedAt: ts, ...extra });
  s.agenda.events = [
    ev("Fútbol 7 con el equipo", today, "20:30", "22:00", { place: "Polideportivo" }),
    ev("Cena con amigos", d(1), "21:00", null),
    ev("Dentista", d(3), "17:30", "18:00", { place: "Clínica Sonrisa", alarm: 60 }),
    ev("Reunión de seguimiento", d(5), "10:00", "11:00", { place: "Sala 2" }),
    ev("Cumpleaños de Laura", d(8), null, null, { alarm: 1440 }),
    ev("Partido de liga", d(7), "12:00", "13:30", { place: "Campo municipal" }),
    ev("Examen de SQL (simulacro)", d(12), "09:00", "11:00", { alarm: 1440 })
  ];

  return s;
}
