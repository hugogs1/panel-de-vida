// Formularios de hábitos: crear/editar, detalle con mapa de calor y registro rápido del día.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid } from "../ui.js";
import { iso } from "../stats.js";
import { seg, field } from "../forms.js";
import { heatmap } from "../charts.js";
import { WEEKDAYS, FREQ_LABEL, AUTO_LABEL, WORKOUT_AUTO, freqText, habitValue, setHabitValue, streaks, completion, habitLevel, heatDays, habitsToday } from "../habits.js";
import { MOODS, MOOD_COLOR, QUALITY } from "../sport.js";

const num = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n);
const parseNum = s => { const n = Number(String(s || "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

// ---------- Crear / editar hábito
export function openHabitForm(id = null) {
  const h = id ? getState().habits.habits.find(x => x.id === id) : null;
  const f = h?.frequency || { type: "daily", days: [1, 3, 5], times: 3 };
  const sheet = openSheet(`
    <h2>${h ? "Editar hábito" : "Nuevo hábito"}</h2>
    <form class="form" id="habit-form" novalidate>
      ${field("Nombre", "hb-name", `<input class="input" id="hb-name" maxlength="40" autocomplete="off" value="${esc(h?.name || "")}" placeholder="p. ej. Beber agua, Leer, Meditar">`)}
      ${field("Se marca solo al apuntar…", "hb-auto", `<select class="input" id="hb-auto">
        <option value="">Nada: lo apunto yo</option>
        ${Object.entries(AUTO_LABEL).filter(([v]) => WORKOUT_AUTO.includes(v)).map(([v, l]) => `<option value="${v}"${h?.auto === v ? " selected" : ""}>Un entreno de ${l}</option>`).join("")}
      </select>`)}
      <div class="row2" data-show="manual">
        ${field("Objetivo diario", "hb-target", `<input class="input" id="hb-target" inputmode="decimal" autocomplete="off" value="${h ? num(h.target) : ""}" placeholder="2">`)}
        ${field("Unidad", "hb-unit", `<input class="input" id="hb-unit" maxlength="15" autocomplete="off" value="${esc(h?.unit || "")}" placeholder="L, págs., min…">`)}
      </div>
      <div data-show="manual">${field("Cuánto suma cada toque de +", "hb-step", `<input class="input" id="hb-step" inputmode="decimal" autocomplete="off" value="${h?.step ? num(h.step) : ""}" placeholder="Igual al objetivo">`)}</div>
      <div class="field"><label>Frecuencia</label>${seg("freq", FREQ_LABEL, f.type)}</div>
      <div data-show="days" class="day-picks">${WEEKDAYS.map((d, i) => `<label class="day-pick"><input type="checkbox" name="day" value="${i + 1}"${(f.days || []).includes(i + 1) ? " checked" : ""}><span>${d}</span></label>`).join("")}</div>
      <div data-show="weekly">${field("Veces por semana", "hb-times", `<select class="input" id="hb-times">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${(f.times || 3) === n ? " selected" : ""}>${n} ${n === 1 ? "vez" : "veces"}</option>`).join("")}</select>`)}</div>
      ${h ? `<label class="switch-row"><input type="checkbox" id="hb-archived"${h.archived ? " checked" : ""}><span>Archivado (deja de aparecer, conserva el historial)</span></label>` : ""}
      <div class="btn-row">
        ${h ? `<button class="btn danger" type="button" id="hb-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#habit-form");
  const sync = () => {
    const freq = form.querySelector("[name=freq]:checked").value;
    const auto = form.querySelector("#hb-auto").value;
    form.querySelectorAll("[data-show]").forEach(el => {
      const k = el.dataset.show;
      el.hidden = k === "manual" ? !!auto : k !== freq;
    });
  };
  form.addEventListener("change", sync);
  sync();
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector("#hb-name").value.trim();
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    const auto = form.querySelector("#hb-auto").value || null;
    const type = form.querySelector("[name=freq]:checked").value;
    let target = 1, unit = "sesión", step = 1;
    if (!auto) {
      target = parseNum(form.querySelector("#hb-target").value || "1");
      if (!(target > 0)) { toast("El objetivo tiene que ser un número mayor que 0", { error: true }); return; }
      unit = form.querySelector("#hb-unit").value.trim();
      const st = form.querySelector("#hb-step").value.trim();
      step = st ? parseNum(st) : target;
      if (!(step > 0)) { toast("El incremento tiene que ser mayor que 0", { error: true }); return; }
    }
    const days = [...form.querySelectorAll("[name=day]:checked")].map(x => Number(x.value));
    if (type === "days" && !days.length) { toast("Elige al menos un día", { error: true }); return; }
    const frequency = { type, days: type === "days" ? days : [], times: type === "weekly" ? Number(form.querySelector("#hb-times").value) : null };
    const data = { name, auto, target, unit, step, frequency };
    update(s => {
      if (h) Object.assign(s.habits.habits.find(x => x.id === h.id), data, { archived: form.querySelector("#hb-archived").checked });
      else s.habits.habits.push({ id: uid(), ...data, archived: false, createdAt: iso() });
    });
    closeSheet();
    toast(h ? "Hábito actualizado" : "Hábito creado");
  });
  sheet.querySelector("#hb-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: `¿Borrar «${h.name}»?`, text: "Se borrará también todo su historial. Si solo quieres dejar de verlo, archívalo.", ok: "Borrar", danger: true })) return;
    update(s => {
      s.habits.habits = s.habits.habits.filter(x => x.id !== h.id);
      s.habits.logs = s.habits.logs.filter(l => l.habitId !== h.id);
    });
    toast("Hábito borrado");
  });
}

// ---------- Detalle: rachas, cumplimiento y mapa de calor del hábito
export function openHabitDetail(id) {
  const s = getState();
  const h = s.habits.habits.find(x => x.id === id);
  const st = streaks(s, h), pct = completion(s, h, 30);
  const today = iso();
  const days = heatDays(17, today).map(date => ({ date, level: habitLevel(s, h, date) }));
  const sheet = openSheet(`
    <h2>${esc(h.name)}</h2>
    <p>${h.auto === "kcal" || h.auto === "protein" ? `Se marca solo con ${AUTO_LABEL[h.auto]} · objetivo ${num(h.target)} ${esc(h.unit)}${h.mode === "max" ? " como máximo" : ""}` : h.auto ? `Se marca solo al apuntar ${AUTO_LABEL[h.auto]}` : `Objetivo: ${num(h.target)} ${esc(h.unit)}`} · ${freqText(h)}</p>
    <div class="week-stats">
      <div><b class="num" style="color:var(--agenda)">${st.current}</b><small>racha (${st.unit})</small></div>
      <div><b class="num" style="color:var(--hab)">${st.best}</b><small>mejor racha</small></div>
      <div><b class="num">${pct == null ? "—" : pct + " %"}</b><small>cumplido (30 días)</small></div>
    </div>
    ${heatmap(days, { color: "#e88fb4", today })}
    <div class="btn-row"><button class="btn" type="button" id="hd-edit">Editar</button><button class="btn primary" type="button" data-close>Cerrar</button></div>`);
  sheet.querySelector("#hd-edit").addEventListener("click", () => openHabitForm(id));
}

// ---------- Registro rápido del día: hábitos + sueño + ánimo
export function openDayLog(date = iso()) {
  const body = () => {
    const s = getState();
    const list = habitsToday(s).filter(h => !h.auto);
    const sl = s.habits.sleep.find(x => x.date === date);
    const md = s.habits.mood.find(x => x.date === date);
    return `
      <h2>Registro de hoy</h2>
      ${list.length ? `<div class="list">${list.map(h => {
        const hb = s.habits.habits.find(x => x.id === h.id);
        return `<div class="item habit-row${h.done ? " is-done" : ""}">
          <span class="t">${esc(h.name)}<small class="num">${num(h.value)} / ${num(h.target)} ${esc(h.unit)}</small><span class="mini" style="--c:var(--hab)"><i style="width:${h.pct}%"></i></span></span>
          <div class="stepper row"><button class="btn small" type="button" data-step="${h.id}" data-n="-1" aria-label="Restar">−</button><button class="btn small primary" type="button" data-step="${h.id}" data-n="1" aria-label="Sumar ${num(hb.step || hb.target)}">+${num(hb.step || hb.target)}</button></div>
        </div>`;
      }).join("")}</div>` : `<p>No tienes hábitos para apuntar hoy.</p>`}
      <form class="form" id="wb-form" novalidate>
        <h3 class="card-h">Sueño y ánimo</h3>
        <div class="row2">
          ${field("Horas dormidas", "wb-hours", `<input class="input" id="wb-hours" inputmode="decimal" autocomplete="off" value="${sl ? num(sl.hours) : ""}" placeholder="7,5">`)}
          ${field("Calidad", "wb-quality", `<select class="input" id="wb-quality">${Object.entries(QUALITY).map(([v, l]) => `<option value="${v}"${(sl?.quality || 3) === Number(v) ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
        </div>
        <div class="field"><label>¿Cómo estás hoy?</label>${moodPicker(md?.value)}</div>
        <button class="btn primary" type="submit">Guardar sueño y ánimo</button>
      </form>`;
  };
  const sheet = openSheet(body(), { onOpen: el => el.addEventListener("click", onClick) });
  const rerender = () => { sheet.innerHTML = `<div class="grabber"></div>${body()}`; wire(); };
  function onClick(e) {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    update(s => {
      const h = s.habits.habits.find(x => x.id === b.dataset.step);
      const v = habitValue(s, h, date) + Number(b.dataset.n) * (h.step || h.target || 1);
      setHabitValue(s, h.id, date, Math.max(0, v));
    });
    rerender();
  }
  function wire() {
    sheet.querySelector("#wb-form").addEventListener("submit", e => {
      e.preventDefault();
      saveWellbeing(sheet, date);
      closeSheet();
    });
  }
  wire();
}

export function moodPicker(value) {
  return `<div class="mood-pick" role="radiogroup">${Object.entries(MOODS).map(([v, l]) =>
    `<label style="--c:${MOOD_COLOR[v]}"><input type="radio" name="mood" value="${v}"${Number(v) === value ? " checked" : ""}><span><i></i>${l}</span></label>`).join("")}</div>`;
}

/** Guarda sueño y ánimo leídos de un formulario con #wb-hours, #wb-quality y [name=mood] */
export function saveWellbeing(root, date) {
  const hoursRaw = root.querySelector("#wb-hours").value.trim();
  const hours = hoursRaw ? parseNum(hoursRaw) : null;
  if (hoursRaw && !(hours >= 0 && hours <= 24)) { toast("Las horas de sueño deben estar entre 0 y 24", { error: true }); return false; }
  const quality = Number(root.querySelector("#wb-quality").value);
  const mood = Number(root.querySelector("[name=mood]:checked")?.value || 0);
  const note = root.querySelector("#wb-note")?.value.trim() || "";
  update(s => {
    s.habits.sleep = s.habits.sleep.filter(x => x.date !== date);
    if (hours != null) s.habits.sleep.push({ id: uid(), date, hours, quality });
    const prev = s.habits.mood.find(x => x.date === date);
    s.habits.mood = s.habits.mood.filter(x => x.date !== date);
    if (mood) s.habits.mood.push({ id: prev?.id || uid(), date, value: mood, note });
  });
  toast("Sueño y ánimo guardados");
  return true;
}
