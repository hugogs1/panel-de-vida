// Buzón de Atajos (Siri y Salud): mensajes de texto que los Atajos del iPhone dejan en el Gist
// y que la app convierte en datos al sincronizar.
//
// Formato de cada mensaje: una línea por campo, "clave: valor". Ejemplos:
//   tipo: gasto        importe: 12,50     nota: Mercadona
//   tipo: tarea        titulo: Llamar al dentista     fecha: mañana
//   tipo: habito       nombre: Agua       cantidad: 0,5
//   tipo: tiempo       clase: estudio     horas: 2
//   tipo: gimnasio     minutos: 60
//   tipo: futbol       minutos: 90        partido: sí
//   tipo: pasos        fecha: 2026-11-01  valor: 8.423
//   tipo: cuerpo       peso: 75,4         grasa: 18,5   cintura: 84
//   tipo: nutricion    calorias: 1.850 kcal   proteinas: 120 g   carbohidratos: 210   grasas: 60   peso: 75,4

import { iso, addDays } from "./stats.js";
import { parseAmount } from "./finance.js";
import { habitValue, setHabitValue } from "./habits.js";
import { money, int } from "./ui.js";

export const INBOX_PREFIX = "inbox-";
export const STEPS_HABIT_ID = "hb-pasos-salud";

const norm = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "clave: valor" por línea → objeto con claves normalizadas (sin tildes, minúsculas) */
export function parseMessage(text) {
  const out = {};
  // una línea por campo, o todo en una línea separado por «;» (útil para probar a mano)
  for (const line of String(text || "").split(/\r?\n|;/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    out[norm(line.slice(0, i))] = line.slice(i + 1).trim();
  }
  return out;
}

// Acepta números con texto alrededor ("7.512 pasos", "12,50 €", "1,5 h"), como los que genera Atajos
const num = v => {
  const m = String(v ?? "").match(/-?\d[\d.,]*/);
  const n = m ? parseAmount(m[0]) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

function parseDay(v, today) {
  const s = norm(v);
  if (!s || s === "hoy") return today;
  if (s === "ayer") return iso(addDays(new Date(), -1));
  if (s === "manana") return iso(addDays(new Date(), 1));
  if (["ninguna", "sin fecha", "no"].includes(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);   // 1/11/2026
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return today;
}

/**
 * Aplica los mensajes al estado (muta s). Cada mensaje genera ids deterministas a partir del
 * nombre del archivo, así que si el mismo mensaje llega dos veces no se duplica.
 * Devuelve { done: [textos para el aviso], skipped: [motivos] }.
 */
export function applyInbox(s, messages, today = iso()) {
  const done = [], skipped = [];
  s.inboxSeen ||= [];
  const seen = new Set(s.inboxSeen);

  // Desempaquetar lotes JSON si llegan como array
  const expanded = [];
  for (const msg of messages) {
    const trimmed = String(msg.text || "").trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          arr.forEach((item, idx) => {
            const lines = Object.entries(item).map(([k, v]) => `${k}: ${v}`).join("\n");
            expanded.push({ name: `${msg.name}-item${idx}`, text: lines });
          });
          continue;
        }
      } catch (err) { /* si falla, se procesa como texto estándar */ }
    }
    expanded.push(msg);
  }

  for (const { name, text } of expanded) {
    const hash = (str => { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return (h >>> 0).toString(36); })(text || "");
    const id = `ibx-${name.replace(/\.[a-z]+$/i, "")}-${hash}`;
    if (seen.has(id)) continue;      // ya procesado (en este u otro dispositivo)
    seen.add(id);
    s.inboxSeen.push(id);

    // Soporte para lote de pasos multifecha en un solo mensaje: YYYY-MM-DD: <pasos>
    const dateMatches = [...String(text || "").matchAll(/(\d{4}-\d{2}-\d{2})\s*[:=]\s*([\d.,]+)/g)];
    if (dateMatches.length > 1) {
      let h = s.habits.habits.find(x => x.id === STEPS_HABIT_ID);
      if (!h) {
        h = { id: STEPS_HABIT_ID, name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: today };
        s.habits.habits.push(h);
      }
      for (const match of dateMatches) {
        const d = match[1];
        const v = Math.round(num(match[2]));
        if (v > 0) {
          setHabitValue(s, h.id, d, v);
          done.push(`${d}: ${int(v)} pasos`);
        }
      }
      continue;
    }

    const m = parseMessage(text);
    const tipo = norm(m.tipo);

    if (tipo === "gasto" || tipo === "ingreso") {
      const value = Math.abs(num(m.importe));
      if (!value) { skipped.push("gasto sin importe"); continue; }
      const acc = s.finance.accounts.find(a => a.id === s.settings.inboxAccountId) || s.finance.accounts[0];
      if (!acc) { skipped.push("gasto: crea primero una cuenta en Finanzas"); continue; }
      const note = (m.nota || m.concepto || "").trim();
      // categoría: la del último movimiento con el mismo concepto
      const prev = note && [...s.finance.transactions].reverse().find(t => !t.transferId && norm(t.note) === norm(note) && (tipo === "gasto" ? t.amount < 0 : t.amount > 0));
      const categoryId = prev?.categoryId || (tipo === "gasto" ? "c-otros" : "c-otrosing");
      s.finance.transactions.push({ id, date: parseDay(m.fecha, today) || today, amount: tipo === "gasto" ? -value : value, accountId: acc.id, categoryId, note, source: "siri" });
      done.push(`${tipo} ${money(value)}${note ? ` (${note})` : ""}`);
    } else if (tipo === "tarea") {
      const title = (m.titulo || m.tarea || "").trim();
      if (!title) { skipped.push("tarea sin título"); continue; }
      s.agenda.tasks.push({ id, title, due: parseDay(m.fecha, today), time: null, priority: ["alta", "baja"].includes(norm(m.prioridad)) ? norm(m.prioridad) : "media", tags: [], note: "", repeat: null, done: false, doneAt: null, createdAt: today, updatedAt: new Date().toISOString(), source: "siri" });
      done.push(`tarea «${title}»`);
    } else if (tipo === "habito") {
      const n = norm(m.nombre);
      const h = s.habits.habits.find(x => !x.archived && !x.auto && norm(x.name) === n) || s.habits.habits.find(x => !x.archived && !x.auto && n && norm(x.name).includes(n));
      if (!h) { skipped.push(`hábito «${m.nombre || "?"}» no encontrado`); continue; }
      const amount = m.cantidad ? num(m.cantidad) : (h.step || h.target || 1);
      if (!(amount > 0)) { skipped.push(`hábito «${h.name}»: cantidad no válida`); continue; }
      const day = parseDay(m.fecha, today) || today;
      setHabitValue(s, h.id, day, habitValue(s, h, day) + amount);
      done.push(`${h.name} +${String(amount).replace(".", ",")} ${h.unit || ""}`.trim());
    } else if (tipo === "tiempo") {
      const minutes = Math.round(m.minutos ? num(m.minutos) : num(m.horas) * 60);
      if (!(minutes > 0) || minutes > 24 * 60) { skipped.push("tiempo no válido"); continue; }
      const kind = norm(m.clase).startsWith("trab") ? "trabajo" : "estudio";
      const p = m.proyecto && s.work.projects.find(x => !x.archived && norm(x.name).includes(norm(m.proyecto)));
      s.work.entries.push({ id, date: parseDay(m.fecha, today) || today, minutes, kind, projectId: p?.id || null, note: m.nota || "", source: "siri" });
      done.push(`${minutes >= 60 ? `${String(Math.round(minutes / 6) / 10).replace(".", ",")} h` : `${minutes} min`} de ${kind}`);
    } else if (tipo === "gimnasio" || tipo === "gym" || tipo === "fuerza" || tipo === "pesas" || tipo === "hevy" || tipo === "futbol" || tipo === "entreno" || tipo === "deporte" || tipo === "actividad" || tipo === "caminar" || tipo === "andar" || tipo === "paseo" || tipo === "correr" || tipo === "workout") {
      let rawMin = num(m.minutos || m.duracion || m.tiempo || m.mins || m.duration);
      if (Number.isFinite(rawMin) && rawMin > 500) {
        // Si supera 500, viene en segundos desde Apple Health / Atajos (ej. 3600 s = 60 min, 3120 s = 52 min)
        rawMin = Math.round(rawMin / 60);
      }
      const minutes = Math.max(1, Math.round(rawMin)) || (tipo === "futbol" ? 90 : 60);
      const date = parseDay(m.fecha, today) || today;
      const rawName = String(m.nombre || m.titulo || m.actividad || m.title || m.workout || (tipo === "caminar" || tipo === "andar" || tipo === "paseo" ? "Caminata" : (tipo === "correr" ? "Running" : (tipo === "gimnasio" || tipo === "gym" || tipo === "fuerza" || tipo === "pesas" || tipo === "hevy" ? "Gimnasio" : "Entreno")))).trim();
      const nName = norm(rawName);

      const isWalking = /camin|andar|paseo|walk/i.test(nName);
      const isRunning = /correr|running|carrera/i.test(nName);
      const isBoxing = /boxeo|boxing|box/i.test(nName);
      const isFutbol = tipo === "futbol" || ["si", "sí", "partido"].includes(norm(m.partido)) || /futbol|fútbol/i.test(nName);
      const isCycling = /bici|ciclism|bike|cycling/i.test(nName);

      // Reconocimiento inteligente de Gimnasio / Fuerza / Hevy:
      const isGym = tipo === "gimnasio" || tipo === "gym" || tipo === "fuerza" || tipo === "pesas" || tipo === "hevy"
        || /gym|gimnasio|fuerza|pesas|hevy|musculacion|press|sentadilla|strength|weight|pierna|pecho|espalda|torso|brazo|biceps|triceps|hombro|gluteo|pull|push|legs|upper|lower|fullbody|full body|rutina|mancuerna|barra|banca|deadlift|remo|dominada|hipertrofia|crossfit/i.test(nName)
        || /hevy|fuerza|strength/i.test(String(m.origen || m.app || m.fuente || m.nota || ""))
        || (tipo === "entreno" && !/tenis|padel|natacion|basket|baloncesto|yoga|pilates/i.test(nName));

      if (isFutbol) {
        s.habits.workouts.push({ id, date, type: "futbol", sport: "futbol", kind: ["si", "sí", "partido"].includes(norm(m.partido)) ? "partido" : "entrenamiento", minutes, title: "Fútbol", note: m.nota || "", source: "salud" });
        done.push(`fútbol ${minutes} min`);
      } else if (isWalking) {
        s.habits.workouts.push({ id, date, type: "deporte", sport: "andar", title: rawName || "Caminata", minutes, note: m.nota || "Salud/Xiaomi", source: "salud" });
        done.push(`caminata ${minutes} min`);
      } else if (isRunning) {
        s.habits.workouts.push({ id, date, type: "deporte", sport: "correr", title: rawName || "Running", minutes, note: m.nota || "Salud/Xiaomi", source: "salud" });
        done.push(`running ${minutes} min`);
      } else if (isBoxing) {
        s.habits.workouts.push({ id, date, type: "deporte", sport: "boxeo", title: rawName || "Boxeo", minutes, note: m.nota || "Salud/Xiaomi", source: "salud" });
        done.push(`boxeo ${minutes} min`);
      } else if (isCycling) {
        s.habits.workouts.push({ id, date, type: "deporte", sport: "ciclismo", title: rawName || "Ciclismo", minutes, note: m.nota || "Salud/Xiaomi", source: "salud" });
        done.push(`ciclismo ${minutes} min`);
      } else if (isGym) {
        const existing = s.habits.workouts.find(w => w.date === date && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
        if (existing) {
          existing.minutes = minutes;
          if (rawName && rawName !== "Gimnasio") existing.title = rawName;
          existing.source = "salud";
        } else {
          s.habits.workouts.push({ id, date, type: "gym", sport: "gym", routineId: null, title: rawName || "Gimnasio", minutes, exercises: [], note: m.nota || "Hevy/Gimnasio", source: "salud" });
        }
        done.push(`gimnasio ${minutes} min`);
      } else {
        s.habits.workouts.push({ id, date, type: "deporte", sport: "actividad", title: rawName || "Actividad deportiva", minutes, note: m.nota || "Salud", source: "salud" });
        done.push(`${rawName || "actividad"} ${minutes} min`);
      }
    } else if (tipo === "sueno" || tipo === "dormir") {
      const hours = num(m.horas);
      if (!(hours >= 0 && hours <= 24)) { skipped.push("horas de sueño no válidas"); continue; }
      const quality = Math.min(5, Math.max(1, Math.round(num(m.calidad)))) || 3;
      const date = parseDay(m.fecha, today) || today;
      s.habits.sleep = (s.habits.sleep || []).filter(x => x.date !== date);
      s.habits.sleep.push({ id, date, hours: Math.round(hours * 10) / 10, quality });
      done.push(`${String(Math.round(hours * 10) / 10).replace(".", ",")} h de sueño`);
    } else if (tipo === "cuerpo") {
      const data = { weight: num(m.peso), fat: num(m.grasa), waist: num(m.cintura) };
      Object.keys(data).forEach(k => { if (!(data[k] > 0)) delete data[k]; });
      if (!Object.keys(data).length) { skipped.push("medición sin datos"); continue; }
      const date = parseDay(m.fecha, today) || today;
      const prev = s.habits.body.find(b => b.date === date);   // una medición por día: se completa
      if (prev) Object.assign(prev, data);
      else s.habits.body.push({ id, date, weight: null, fat: null, waist: null, ...data, source: "siri" });
      done.push([data.weight && `${String(data.weight).replace(".", ",")} kg`, data.fat && `${String(data.fat).replace(".", ",")} % grasa`, data.waist && `${String(data.waist).replace(".", ",")} cm cintura`].filter(Boolean).join(", "));
    } else if (tipo === "nutricion") {
      // Totales del día leídos de Salud (Foodvisor): cada envío sustituye al anterior del mismo día
      const date = parseDay(m.fecha, today) || today;
      const v = { kcal: num(m.calorias ?? m.energia), protein: num(m.proteinas), carbs: num(m.carbohidratos), fat: num(m.grasas), fiber: num(m.fibra), sugar: num(m.azucar) };
      Object.keys(v).forEach(k => { v[k] = v[k] >= 0 ? Math.round(v[k] * 10) / 10 : null; });
      s.habits.nutrition ||= [];
      const hasNutri = v.kcal > 0 || v.protein > 0 || v.carbs > 0 || v.fat > 0;
      if (hasNutri) {
        const prev = s.habits.nutrition.find(n => n.date === date);
        const entry = { ...v, kcal: Math.round(v.kcal || 0), source: "foodvisor", at: new Date().toISOString() };
        if (prev) Object.assign(prev, entry); else s.habits.nutrition.push({ id, date, ...entry });
      }
      const w = num(m.peso);
      if (w > 0) {
        const b = s.habits.body.find(x => x.date === date);
        if (b) b.weight = Math.round(w * 10) / 10;
        else s.habits.body.push({ id: id + "-peso", date, weight: Math.round(w * 10) / 10, fat: null, waist: null, source: "foodvisor" });
      }
      if (!hasNutri && !(w > 0)) {
        // se muestra lo recibido para poder ver qué falla en el atajo
        const got = ["calorias", "proteinas", "carbohidratos", "grasas", "peso"].map(k => `${k}: «${m[k] ?? "falta"}»`).join(", ");
        skipped.push(`nutrición sin datos (llegó ${got})`);
        continue;
      }
      done.push([hasNutri && `${int(v.kcal || 0)} kcal`, v.protein > 0 && `${int(v.protein)} g proteína`, w > 0 && `${String(Math.round(w * 10) / 10).replace(".", ",")} kg`].filter(Boolean).join(" · "));
    } else if (tipo === "pasos") {
      const value = Math.round(num(m.valor ?? m.pasos));
      if (!(value >= 0)) { skipped.push("pasos sin valor"); continue; }
      let h = s.habits.habits.find(x => x.id === STEPS_HABIT_ID);
      if (!h) {
        h = { id: STEPS_HABIT_ID, name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: today };
        s.habits.habits.push(h);
      }
      // el total del día sustituye al anterior (la automatización puede ejecutarse varias veces)
      setHabitValue(s, h.id, parseDay(m.fecha, today) || today, value);
      done.push(`${int(value)} pasos`);
    } else {
      skipped.push(`mensaje de tipo «${m.tipo || "?"}» desconocido`);
    }
  }
  s.inboxSeen = s.inboxSeen.slice(-500);
  return { done, skipped };
}
