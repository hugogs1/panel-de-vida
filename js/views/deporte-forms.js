// Formularios de deporte y cuerpo: entreno de gimnasio, rutinas, fútbol, medidas, bienestar y récords.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid, int } from "../ui.js";
import { iso, parseISO } from "../stats.js";
import { seg, field } from "../forms.js";
import { areaChart } from "../charts.js";
import { lastSets, newRecords, records, kg, FUTBOL_KINDS, QUALITY } from "../sport.js";
import { moodPicker, saveWellbeing } from "./habitos-forms.js";

const num = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);
const parseNum = s => { const n = Number(String(s ?? "").trim().replace(",", ".")); return String(s ?? "").trim() && Number.isFinite(n) ? n : null; };
const shortDate = s => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(s)).replace(".", "");

// ---------- Entreno de gimnasio
export function openWorkoutForm({ id = null, routineId = null } = {}) {
  const s = getState();
  const w = id ? s.habits.workouts.find(x => x.id === id) : null;
  const routines = s.habits.routines;
  let rid = w ? w.routineId || "" : routineId ?? routines[0]?.id ?? "";

  // Modelo editable: [{ name, sets: [{ w, r }] }]
  const fromRoutine = r => (r?.exercises || []).map(ex => {
    const prev = lastSets(s, ex.name, id);
    const sets = prev ? prev.map(x => ({ w: x.w, r: x.r }))
      : Array.from({ length: ex.sets || 3 }, () => ({ w: null, r: ex.reps || 10 }));
    return { name: ex.name, sets, hint: prev ? `La última vez: ${prev.map(x => `${num(x.w || 0)}×${x.r}`).join(", ")}` : "" };
  });
  let exs = w ? structuredClone(w.exercises || []) : fromRoutine(routines.find(r => r.id === rid));

  const exHTML = () => exs.map((ex, i) => `
    <div class="ex" data-ex="${i}">
      <div class="ex-h"><input class="input ex-name" data-f="name" value="${esc(ex.name)}" placeholder="Ejercicio" aria-label="Nombre del ejercicio" maxlength="40">
        <button class="btn small" type="button" data-del-ex="${i}" aria-label="Quitar ejercicio">✕</button></div>
      ${ex.hint ? `<small class="hint">${esc(ex.hint)}</small>` : ""}
      <div class="sets">
        <div class="set-h"><span>Serie</span><span>Peso (kg)</span><span>Reps</span><span></span></div>
        ${ex.sets.map((st, k) => `<div class="set" data-set="${k}">
          <span class="num">${k + 1}</span>
          <input class="input" data-f="w" inputmode="decimal" autocomplete="off" value="${st.w != null ? num(st.w) : ""}" placeholder="0" aria-label="Peso serie ${k + 1}">
          <input class="input" data-f="r" inputmode="numeric" autocomplete="off" value="${st.r ?? ""}" placeholder="0" aria-label="Repeticiones serie ${k + 1}">
          <button class="btn small" type="button" data-del-set="${k}" aria-label="Quitar serie">−</button>
        </div>`).join("")}
      </div>
      <button class="btn small" type="button" data-add-set="${i}">+ Serie</button>
    </div>`).join("") || `<div class="empty">Añade ejercicios o elige una rutina.</div>`;

  const sheet = openSheet(`
    <h2>${w ? "Editar entreno" : "Entreno de gimnasio"}</h2>
    <form class="form" id="wo-form" novalidate>
      ${field("Rutina", "wo-routine", `<select class="input" id="wo-routine"${w ? " disabled" : ""}>
        ${routines.map(r => `<option value="${r.id}"${r.id === rid ? " selected" : ""}>${esc(r.name)}</option>`).join("")}
        <option value=""${!rid ? " selected" : ""}>Entreno libre</option></select>`)}
      <div class="row2">
        ${field("Fecha", "wo-date", `<input class="input" type="date" id="wo-date" value="${w?.date || iso()}">`)}
        ${field("Duración (min)", "wo-min", `<input class="input" id="wo-min" inputmode="numeric" autocomplete="off" value="${w?.minutes || ""}" placeholder="60">`)}
      </div>
      <div id="wo-exs">${exHTML()}</div>
      <button class="btn" type="button" id="wo-add-ex">+ Añadir ejercicio</button>
      ${field("Nota (opcional)", "wo-note", `<input class="input" id="wo-note" maxlength="80" autocomplete="off" value="${esc(w?.note || "")}">`)}
      <div class="btn-row">
        ${w ? `<button class="btn danger" type="button" id="wo-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#wo-form");
  const box = sheet.querySelector("#wo-exs");

  // Copia lo escrito en los campos al modelo antes de repintar
  const read = () => {
    box.querySelectorAll("[data-ex]").forEach(el => {
      const ex = exs[Number(el.dataset.ex)];
      ex.name = el.querySelector("[data-f=name]").value;
      el.querySelectorAll("[data-set]").forEach(row => {
        const st = ex.sets[Number(row.dataset.set)];
        st.w = parseNum(row.querySelector("[data-f=w]").value);
        st.r = parseNum(row.querySelector("[data-f=r]").value);
      });
    });
  };
  const paint = () => { box.innerHTML = exHTML(); };

  // Al escribir el peso de una serie, se copia a las series siguientes que estén vacías
  box.addEventListener("input", e => {
    const inp = e.target;
    if (inp.dataset.f !== "w") return;
    const rowsEls = [...inp.closest(".sets").querySelectorAll("[data-set]")];
    const k = rowsEls.indexOf(inp.closest("[data-set]"));
    rowsEls.slice(k + 1).forEach(row => {
      const w = row.querySelector("[data-f=w]");
      if (!w.value || w.dataset.auto === "1") { w.value = inp.value; w.dataset.auto = "1"; }
    });
    delete inp.dataset.auto;
  });

  form.querySelector("#wo-routine").addEventListener("change", e => {
    rid = e.target.value;
    exs = fromRoutine(routines.find(r => r.id === rid));
    paint();
  });
  sheet.querySelector("#wo-add-ex").addEventListener("click", () => {
    read();
    exs.push({ name: "", sets: [{ w: null, r: 10 }] });
    paint();
    box.querySelector(`[data-ex="${exs.length - 1}"] .ex-name`).focus();
  });
  box.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    read();
    if (b.dataset.addSet != null) { const ex = exs[Number(b.dataset.addSet)]; const last = ex.sets.at(-1); ex.sets.push({ w: last?.w ?? null, r: last?.r ?? 10 }); }
    else if (b.dataset.delSet != null) { const ex = exs[Number(b.closest("[data-ex]").dataset.ex)]; ex.sets.splice(Number(b.dataset.delSet), 1); }
    else if (b.dataset.delEx != null) exs.splice(Number(b.dataset.delEx), 1);
    paint();
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    read();
    const exercises = exs.map(ex => ({ name: ex.name.trim(), sets: ex.sets.filter(x => x.r > 0).map(x => ({ w: x.w || 0, r: x.r })) }))
      .filter(ex => ex.name && ex.sets.length);
    if (!exercises.length) { toast("Apunta al menos un ejercicio con repeticiones", { error: true }); return; }
    const data = { date: form.querySelector("#wo-date").value || iso(), type: "gym", routineId: rid || null, minutes: parseNum(form.querySelector("#wo-min").value) || null, exercises, note: form.querySelector("#wo-note").value.trim() };
    const wid = w?.id || uid();
    const prs = newRecords(getState(), { id: wid, ...data });
    update(st => {
      if (w) Object.assign(st.habits.workouts.find(x => x.id === w.id), data);
      else st.habits.workouts.push({ id: wid, ...data });
    });
    closeSheet();
    toast(prs.length ? `¡Nuevo récord! ${prs.map(p => `${p.name}: ${kg(p.w)}`).join(" · ")}` : w ? "Entreno actualizado" : "Entreno guardado", { ms: prs.length ? 4500 : 2600 });
  });
  sheet.querySelector("#wo-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar este entreno?", text: "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.habits.workouts = st.habits.workouts.filter(x => x.id !== w.id); });
    toast("Entreno borrado");
  });
}

// ---------- Rutina
export function openRoutineForm(id = null) {
  const r = id ? getState().habits.routines.find(x => x.id === id) : null;
  let exs = r ? structuredClone(r.exercises) : [{ id: uid(), name: "", sets: 3, reps: 10 }];
  const rows = () => exs.map((ex, i) => `<div class="rt-row" data-i="${i}">
    <input class="input" data-f="name" value="${esc(ex.name)}" placeholder="Ejercicio" aria-label="Ejercicio ${i + 1}" maxlength="40">
    <input class="input" data-f="sets" inputmode="numeric" value="${ex.sets}" aria-label="Series">
    <input class="input" data-f="reps" inputmode="numeric" value="${ex.reps}" aria-label="Repeticiones">
    <button class="btn small" type="button" data-del="${i}" aria-label="Quitar">✕</button></div>`).join("");
  const sheet = openSheet(`
    <h2>${r ? "Editar rutina" : "Nueva rutina"}</h2>
    <form class="form" id="rt-form" novalidate>
      ${field("Nombre", "rt-name", `<input class="input" id="rt-name" maxlength="30" autocomplete="off" value="${esc(r?.name || "")}" placeholder="p. ej. Torso, Pierna, Full body">`)}
      <div class="field"><label>Ejercicios</label>
        <div class="rt-head"><span>Ejercicio</span><span>Series</span><span>Reps</span><span></span></div>
        <div id="rt-rows">${rows()}</div>
      </div>
      <button class="btn" type="button" id="rt-add">+ Añadir ejercicio</button>
      <div class="btn-row">
        ${r ? `<button class="btn danger" type="button" id="rt-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const box = sheet.querySelector("#rt-rows");
  const read = () => box.querySelectorAll("[data-i]").forEach(row => {
    const ex = exs[Number(row.dataset.i)];
    ex.name = row.querySelector("[data-f=name]").value;
    ex.sets = Math.max(1, parseInt(row.querySelector("[data-f=sets]").value) || 3);
    ex.reps = Math.max(1, parseInt(row.querySelector("[data-f=reps]").value) || 10);
  });
  sheet.querySelector("#rt-add").addEventListener("click", () => { read(); exs.push({ id: uid(), name: "", sets: 3, reps: 10 }); box.innerHTML = rows(); box.querySelector(`[data-i="${exs.length - 1}"] input`).focus(); });
  box.addEventListener("click", e => { const b = e.target.closest("[data-del]"); if (!b) return; read(); exs.splice(Number(b.dataset.del), 1); box.innerHTML = rows(); });
  sheet.querySelector("#rt-form").addEventListener("submit", e => {
    e.preventDefault();
    read();
    const name = sheet.querySelector("#rt-name").value.trim();
    const exercises = exs.map(x => ({ ...x, name: x.name.trim() })).filter(x => x.name);
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    if (!exercises.length) { toast("Añade al menos un ejercicio", { error: true }); return; }
    update(st => {
      if (r) Object.assign(st.habits.routines.find(x => x.id === r.id), { name, exercises });
      else st.habits.routines.push({ id: uid(), name, exercises });
    });
    closeSheet();
    toast(r ? "Rutina actualizada" : "Rutina creada");
  });
  sheet.querySelector("#rt-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: `¿Borrar la rutina «${r.name}»?`, text: "Los entrenos ya guardados se conservan.", ok: "Borrar", danger: true })) return;
    update(st => { st.habits.routines = st.habits.routines.filter(x => x.id !== r.id); });
    toast("Rutina borrada");
  });
}

// ---------- Fútbol
export function openFutbolForm(id = null) {
  const w = id ? getState().habits.workouts.find(x => x.id === id) : null;
  const sheet = openSheet(`
    <h2>${w ? "Editar sesión de fútbol" : "Fútbol"}</h2>
    <form class="form" id="fb-form" novalidate>
      ${seg("kind", FUTBOL_KINDS, w?.kind || "entrenamiento")}
      <div class="row2">
        ${field("Fecha", "fb-date", `<input class="input" type="date" id="fb-date" value="${w?.date || iso()}">`)}
        ${field("Minutos", "fb-min", `<input class="input" id="fb-min" inputmode="numeric" autocomplete="off" value="${w?.minutes || ""}" placeholder="90">`)}
      </div>
      <div class="quick-add">${[45, 60, 90, 120].map(m => `<button class="chip" type="button" data-min="${m}">${m} min</button>`).join("")}</div>
      ${field("Nota (opcional)", "fb-note", `<input class="input" id="fb-note" maxlength="80" autocomplete="off" value="${esc(w?.note || "")}" placeholder="p. ej. Liga contra el Atlético B">`)}
      <div class="btn-row">
        ${w ? `<button class="btn danger" type="button" id="fb-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#fb-form");
  form.querySelector(".quick-add").addEventListener("click", e => { const b = e.target.closest("[data-min]"); if (b) form.querySelector("#fb-min").value = b.dataset.min; });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const minutes = parseNum(form.querySelector("#fb-min").value);
    if (!(minutes > 0)) { toast("Indica los minutos", { error: true }); return; }
    const data = { type: "futbol", kind: form.querySelector("[name=kind]:checked").value, date: form.querySelector("#fb-date").value || iso(), minutes: Math.round(minutes), note: form.querySelector("#fb-note").value.trim() };
    update(st => {
      if (w) Object.assign(st.habits.workouts.find(x => x.id === w.id), data);
      else st.habits.workouts.push({ id: uid(), ...data });
    });
    closeSheet();
    toast(w ? "Sesión actualizada" : `${FUTBOL_KINDS[data.kind]} de ${data.minutes} min apuntado`);
  });
  sheet.querySelector("#fb-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar esta sesión?", text: "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.habits.workouts = st.habits.workouts.filter(x => x.id !== w.id); });
    toast("Sesión borrada");
  });
}

// ---------- Medidas corporales
export function openBodyForm(id = null) {
  const b = id ? getState().habits.body.find(x => x.id === id) : null;
  const last = [...getState().habits.body].sort((x, y) => y.date.localeCompare(x.date))[0];
  const sheet = openSheet(`
    <h2>${b ? "Editar medición" : "Nueva medición"}</h2>
    <form class="form" id="body-form" novalidate>
      ${field("Fecha", "bd-date", `<input class="input" type="date" id="bd-date" value="${b?.date || iso()}">`)}
      <div class="row2">
        ${field("Peso (kg)", "bd-w", `<input class="input" id="bd-w" inputmode="decimal" autocomplete="off" value="${b?.weight != null ? num(b.weight) : ""}" placeholder="${last?.weight != null ? num(last.weight) : "75"}">`)}
        ${field("Grasa (%)", "bd-fat", `<input class="input" id="bd-fat" inputmode="decimal" autocomplete="off" value="${b?.fat != null ? num(b.fat) : ""}" placeholder="${last?.fat != null ? num(last.fat) : "opcional"}">`)}
      </div>
      ${field("Cintura (cm)", "bd-waist", `<input class="input" id="bd-waist" inputmode="decimal" autocomplete="off" value="${b?.waist != null ? num(b.waist) : ""}" placeholder="${last?.waist != null ? num(last.waist) : "opcional"}">`)}
      <div class="btn-row">
        ${b ? `<button class="btn danger" type="button" id="bd-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#body-form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = { date: form.querySelector("#bd-date").value || iso(), weight: parseNum(form.querySelector("#bd-w").value), fat: parseNum(form.querySelector("#bd-fat").value), waist: parseNum(form.querySelector("#bd-waist").value) };
    if (data.weight == null && data.fat == null && data.waist == null) { toast("Apunta al menos una medida", { error: true }); return; }
    update(st => {
      if (b) Object.assign(st.habits.body.find(x => x.id === b.id), data);
      else st.habits.body.push({ id: uid(), ...data });
    });
    closeSheet();
    toast("Medición guardada");
  });
  sheet.querySelector("#bd-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar esta medición?", text: "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.habits.body = st.habits.body.filter(x => x.id !== b.id); });
    toast("Medición borrada");
  });
}

// ---------- Sueño y ánimo de un día concreto
export function openWellbeingForm(date = iso()) {
  const s = getState();
  const sl = s.habits.sleep.find(x => x.date === date), md = s.habits.mood.find(x => x.date === date);
  const sheet = openSheet(`
    <h2>Sueño y ánimo</h2>
    <form class="form" id="wb2-form" novalidate>
      ${field("Día", "wb-date", `<input class="input" type="date" id="wb-date" value="${date}">`)}
      <div class="row2">
        ${field("Horas dormidas", "wb-hours", `<input class="input" id="wb-hours" inputmode="decimal" autocomplete="off" value="${sl ? num(sl.hours) : ""}" placeholder="7,5">`)}
        ${field("Calidad", "wb-quality", `<select class="input" id="wb-quality">${Object.entries(QUALITY).map(([v, l]) => `<option value="${v}"${(sl?.quality || 3) === Number(v) ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      </div>
      <div class="field"><label>Ánimo</label>${moodPicker(md?.value)}</div>
      ${field("Nota (opcional)", "wb-note", `<input class="input" id="wb-note" maxlength="100" autocomplete="off" value="${esc(md?.note || "")}" placeholder="¿Qué ha marcado el día?">`)}
      <div class="btn-row"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = sheet.querySelector("#wb2-form");
  // al cambiar de día, recargar los valores guardados de ese día
  form.querySelector("#wb-date").addEventListener("change", e => openWellbeingForm(e.target.value || iso()));
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (saveWellbeing(form, form.querySelector("#wb-date").value || iso())) closeSheet();
  });
}

// ---------- Progreso de un ejercicio: gráfica (peso máximo, 1RM estimado o volumen) y sesiones
const METRICS = {
  w:   { label: "Peso máximo", legend: by => `Peso más alto de cada ${by}`, fmt: kg },
  e1:  { label: "1RM estimado", legend: by => `Mejor 1RM estimado de cada ${by}`, fmt: v => kg(Math.round(v * 10) / 10) },
  vol: { label: "Volumen", legend: by => by === "mes" ? "Mayor volumen de una sesión en cada mes" : "Volumen de cada sesión", fmt: v => `${int(v)} kg` }
};
let recMetric = "w";
const monthShort = (ym, withYear) => {
  const [y, m] = ym.split("-").map(Number);
  const t = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(y, m - 1, 1)).replace(".", "");
  return withYear ? `${t} ${String(y).slice(2)}` : t;
};

/** Puntos de la gráfica: por mes (lo mejor de cada mes) si hay 3 meses o más; si no, por sesión */
function progressPoints(hist, metric) {
  const months = new Map();
  for (const h of hist) { const ym = h.date.slice(0, 7); months.set(ym, Math.max(months.get(ym) || 0, h[metric])); }
  if (months.size >= 3) {
    const keys = [...months.keys()].slice(-18);
    const withYear = keys[0].slice(0, 4) !== keys.at(-1).slice(0, 4);
    return { by: "mes", points: keys.map(k => ({ label: monthShort(k, withYear), value: months.get(k) })) };
  }
  return { by: "sesión", points: hist.slice(-12).map(h => ({ label: shortDate(h.date), value: h[metric] })) };
}

function progressChart(rec) {
  const m = METRICS[recMetric];
  const { by, points } = progressPoints(rec.history, recMetric);
  if (points.length < 2) return `<div class="empty">Con ${by === "mes" ? "un solo mes" : "una sola sesión"} aún no hay evolución que dibujar.</div>`;
  const first = points[0].value, last = points.at(-1).value;
  const diff = first ? Math.round((last - first) / first * 100) : 0;
  return `${areaChart(points, { color: "#e88fb4", format: m.fmt, id: "rec" })}
    <div class="legend"><span style="--c:var(--hab)">${m.legend(by)}</span>${diff ? `<span style="--c:${diff > 0 ? "var(--fin)" : "var(--agenda)"}">${diff > 0 ? "+" : "−"}${Math.abs(diff)} % desde ${points[0].label}</span>` : ""}</div>`;
}

export function openRecordDetail(name) {
  const rec = records(getState()).find(r => r.name.toLowerCase() === name.toLowerCase());
  if (!rec) return;
  const bestVol = Math.max(...rec.history.map(h => h.vol));
  const sessions = rec.history.slice().reverse();
  const row = h => `<div class="kv"><span>${shortDate(h.date)}${h.date.slice(0, 4) !== iso().slice(0, 4) ? ` ${h.date.slice(0, 4)}` : ""}</span><span class="num">${kg(h.w)} × ${h.r} · ${h.sets} ${h.sets === 1 ? "serie" : "series"}${h.w === rec.best.w && h.r === rec.best.r ? " · <b style=\"color:var(--hab)\">récord</b>" : ""}</span></div>`;
  openSheet(`
    <h2>${esc(rec.name)}</h2>
    <div class="week-stats">
      <div><b class="num" style="color:var(--hab)">${kg(rec.best.w)}</b><small>récord × ${rec.best.r} reps</small></div>
      <div><b class="num">${kg(Math.round(rec.bestE1rm * 10) / 10)}</b><small>1RM estimado</small></div>
      <div><b class="num">${METRICS.vol.fmt(bestVol)}</b><small>mejor volumen</small></div>
    </div>
    <div class="chips acc-chips" role="tablist" aria-label="Qué mostrar">${Object.entries(METRICS).map(([k, m]) =>
      `<button type="button" role="tab" class="chip small" data-metric="${k}" aria-selected="${k === recMetric}">${m.label}</button>`).join("")}</div>
    <div id="rec-chart">${progressChart(rec)}</div>
    <h3 class="card-h" style="margin-top:14px">Sesiones · ${rec.sessions}</h3>
    <div class="list" id="rec-sessions">${sessions.slice(0, 10).map(row).join("")}</div>
    ${sessions.length > 10 ? `<button class="btn small" type="button" id="rec-more" style="margin-top:8px">Ver todas</button>` : ""}
    <p class="hint">Cada sesión muestra su serie más pesada, sin contar calentamientos. El 1RM estimado es el peso que podrías levantar una sola vez (fórmula de Epley). El volumen suma kg × repeticiones de todas las series.</p>
    <button class="btn primary" type="button" data-close>Cerrar</button>`, {
    onOpen: sheet => {
      sheet.querySelectorAll("[data-metric]").forEach(b => b.addEventListener("click", () => {
        recMetric = b.dataset.metric;
        sheet.querySelectorAll("[data-metric]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
        sheet.querySelector("#rec-chart").innerHTML = progressChart(rec);
      }));
      sheet.querySelector("#rec-more")?.addEventListener("click", e => {
        sheet.querySelector("#rec-sessions").innerHTML = sessions.map(row).join("");
        e.currentTarget.remove();
      });
    }
  });
}
