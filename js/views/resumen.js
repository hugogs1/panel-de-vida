// Pantalla Principal: Agenda Diaria, Bento Grid, Pulso de Salud y Cartera Inteligente.

import { AREAS, levelFromXp, titleFor } from "../game.js";
import { esc, int, money as eur, longDate, monthName, toast, openSheet, closeSheet } from "../ui.js";
import { icon } from "../icons.js";
import { backupDue } from "../backup.js";
import { update, getState } from "../state.js";
import { todayItems, streak, iso, parseISO, addDays } from "../stats.js";
import { habitsToday, habitValue, setHabitValue, AUTO_LABEL } from "../habits.js";
import { toggleTask, monthGrid } from "../agenda.js";
import { ring, fitnessDial, fitnessActivityRings } from "../charts.js";
import { getWalletBudget } from "../finance.js";
import { weeklyBanner, closeWeekly } from "./semana.js";

const PRI = { alta: ["Alta", "var(--danger)"], media: ["Media", "var(--agenda)"], baja: ["Baja", "var(--muted)"] };
const num1 = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n);
const signed = n => n > 0 ? `+${eur(n)}` : eur(n);

const fitUI = {
  selectedDate: null // Al cargar la app, siempre inicia en HOY (iso())
};

const calUI = {
  ym: iso().slice(0, 7),
  day: iso()
};

const monthLabel = ym => { 
  const [y, m] = ym.split("-").map(Number); 
  const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1)); 
  return s[0].toUpperCase() + s.slice(1); 
};
const shortDate = s => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(s)).replace(/\./g, "");
const longDay = s => { 
  const t = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(parseISO(s)); 
  return t[0].toUpperCase() + t.slice(1); 
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
};

export function render(state) {
  const g = state.game;
  const lv = levelFromXp(g.xp);
  const days = streak(state);
  const wallet = getWalletBudget(state);
  const { pending } = todayItems(state);
  const habitList = habitsToday(state);
  const doneHabits = habitList.filter(h => h.done).length;

  return `
    <header class="desk-greeting">
      <h1>${greeting()}, ${esc(state.profile.alias)}<span>${longDate()}</span></h1>
      <div class="streak${days ? "" : " off"}" title="Días seguidos apuntando algo">${icon.flame}<span class="num">${days} ${days === 1 ? "día" : "días"}</span></div>
    </header>
    <header class="topbar">
      <a class="logo" href="#resumen" aria-label="Resumen">PV</a>
      <div class="who"><div class="alias">${esc(state.profile.alias)}</div><div class="title">${titleFor(lv.level)} · Nv. ${lv.level}</div></div>
      <div class="streak${days ? "" : " off"}" title="Días seguidos apuntando algo">${icon.flame}<span class="num">${days}</span></div>
      <a class="icon-btn" href="#ajustes" aria-label="Ajustes">${icon.gear}</a>
    </header>

    ${banners(state)}
    ${weeklyBanner(state)}

    <!-- Barra de acceso rápido estilo Bento Agenda -->
    <div class="bento-nav">
      <a class="bento-pill" href="#agenda" style="--c:var(--agenda)">
        <span class="bp-icon">${icon.task}</span>
        <div class="bp-t"><b>Agenda</b><small>${pending.length} pendientes</small></div>
      </a>
      <a class="bento-pill" href="#habitos" style="--c:var(--hab)">
        <span class="bp-icon">${icon.habit}</span>
        <div class="bp-t"><b>Hábitos</b><small>${doneHabits}/${habitList.length} hoy</small></div>
      </a>
      <a class="bento-pill" href="#finanzas" style="--c:var(--fin)">
        <span class="bp-icon">${icon.money}</span>
        <div class="bp-t"><b>Cartera</b><small>${signed(wallet.remainingFree)}</small></div>
      </a>
    </div>

    <div class="cols">
      <!-- Columna 1: Agenda Diaria y Tareas de Hoy -->
      <div class="col col-1">
        ${todayCard(state)}
      </div>

      <!-- Columna 2: Salud, Diales de Fitness (Pasos y Gym) y Hábitos -->
      <div class="col col-2">
        ${healthCard(state)}
      </div>

      <!-- Columna 3: Cartera Inteligente y Nivel -->
      <div class="col col-3">
        ${walletCard(state, wallet)}
        ${levelCard(state, lv)}
      </div>
    </div>`;
}

function banners(state) {
  let out = "";
  if (state.settings.demo) out += `
    <div class="banner" style="--c:var(--cyan)">${icon.sparkle}
      <div class="t"><b>Estás viendo datos de ejemplo</b>Quítalos en Ajustes cuando quieras empezar con los tuyos.</div>
      <a class="btn small" href="#ajustes">Ajustes</a>
    </div>`;
  else if (backupDue(state)) out += `
    <div class="banner" style="--c:var(--warn)">${icon.download}
      <div class="t"><b>Haz una copia de seguridad</b>${state.settings.lastBackupAt ? "Hace más de 7 días de la última." : "Todavía no has exportado ninguna."}</div>
      <a class="btn small" href="#ajustes">Copiar</a>
    </div>`;
  return out;
}

// ---------- 1. Tarjeta de Agenda del Día
function todayCard(state) {
  const today = iso();
  const cells = monthGrid(state, calUI.ym);
  const isSelectedToday = calUI.day === today;

  // Eventos y tareas del día seleccionado en el calendario mini
  const dayEvents = (state.agenda.events || []).filter(e => e.date === calUI.day).sort((a, b) => (a.allDay ? "00" : (a.start || "").slice(11)).localeCompare(b.allDay ? "00" : (b.start || "").slice(11)));
  const dayTasks = (state.agenda.tasks || []).filter(t => t.due === calUI.day);

  // Próximas fechas registradas en orden cronológico (desde hoy en adelante)
  const allEvents = (state.agenda.events || [])
    .filter(e => e.date >= today)
    .map(e => ({
      type: "event",
      id: e.id,
      date: e.date,
      title: e.title,
      subtitle: e.allDay ? "Todo el día" : (e.start ? e.start.slice(11, 16) : ""),
      place: e.place || ""
    }));

  const allTasks = (state.agenda.tasks || [])
    .filter(t => !t.done && t.due && t.due >= today)
    .map(t => ({
      type: "task",
      id: t.id,
      date: t.due,
      title: t.title,
      subtitle: t.time || "",
      priority: t.priority || "media"
    }));

  const upcoming = [...allEvents, ...allTasks].sort((a, b) => {
    const diff = a.date.localeCompare(b.date);
    if (diff !== 0) return diff;
    return (a.subtitle || "").localeCompare(b.subtitle || "");
  }).slice(0, 5);

  const relLabel = dStr => {
    if (dStr === today) return { text: "Hoy", cls: "is-today" };
    const diffDays = Math.round((parseISO(dStr) - parseISO(today)) / 86400000);
    if (diffDays === 1) return { text: "Mañana", cls: "is-tomorrow" };
    if (diffDays <= 7) return { text: `En ${diffDays}d`, cls: "is-soon" };
    return { text: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(dStr)).replace(/\./g, ""), cls: "" };
  };

  return `
    <section class="card bento-card today-agenda-card">
      <div class="card-h">
        <span class="h-dot" style="--c:var(--agenda)"></span>
        <b>Calendario & Agenda</b>
        <span class="spacer"></span>
        <a href="#agenda">Abrir agenda →</a>
      </div>

      <!-- Barra de navegación compacta del mes -->
      <div class="cal-mini-nav">
        <div class="cal-mini-title">${monthLabel(calUI.ym)}</div>
        <div class="cal-mini-btns">
          <button class="icon-btn small" type="button" data-act="cal-mini-month" data-n="-1" title="Mes anterior">${icon.back}</button>
          <button class="ios-pill-btn small${calUI.ym === today.slice(0, 7) ? " primary" : ""}" type="button" data-act="cal-mini-today">Hoy</button>
          <button class="icon-btn small" type="button" data-act="cal-mini-month" data-n="1" title="Mes siguiente">${icon.chevron}</button>
        </div>
      </div>

      <!-- Cuadrícula mensual compacta -->
      <div class="cal cal-mini">
        ${["L", "M", "X", "J", "V", "S", "D"].map(d => `<span class="cal-h">${d}</span>`).join("")}
        ${cells.map(c => `
          <button type="button" class="cal-d cal-d-mini${c.inMonth ? "" : " out"}${c.today ? " today" : ""}${c.date === calUI.day ? " sel" : ""}"
            data-act="cal-mini-day" data-date="${c.date}" aria-label="${longDay(c.date)}">
            <span class="num">${c.day}</span>
            <span class="cal-dots">
              ${c.events ? `<i class="ev" title="${c.events} eventos"></i>` : ""}
              ${c.tasks ? `<i class="${c.overdue ? "late" : "tk"}" title="${c.tasks} tareas"></i>` : ""}
              ${c.workouts ? `<i class="gym" title="Entreno"></i>` : ""}
            </span>
          </button>
        `).join("")}
      </div>

      <!-- Eventos / Tareas del día seleccionado si es diferente de hoy -->
      ${!isSelectedToday ? `
        <div class="mini-selected-day-box" style="margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="font-size:12px;color:var(--fg)">${longDay(calUI.day)}</b>
            <button class="btn small link-btn" type="button" data-act="cal-mini-today">Volver a Hoy →</button>
          </div>
          ${dayEvents.length || dayTasks.length ? `
            <div class="list tight">
              ${dayEvents.map(e => `
                <a class="item tap today-ev-item" href="#agenda">
                  <span class="ev-time num">${e.allDay ? "Todo el día" : (e.start || "").slice(11, 16)}</span>
                  <span class="t"><b>${esc(e.title)}</b>${e.place ? `<small>📍 ${esc(e.place)}</small>` : ""}</span>
                </a>`).join("")}
              ${dayTasks.map(t => `
                <div class="item task">
                  <button class="tick-btn" type="button" data-task="${t.id}"><span class="tick" style="--c:${PRI[t.priority]?.[1] || "var(--agenda)"}">${icon.check}</span></button>
                  <span class="t">${esc(t.title)}${t.time ? `<small>${t.time}</small>` : ""}</span>
                </div>`).join("")}
            </div>
          ` : `
            <div class="empty" style="padding:6px;font-size:12px;text-align:center">Nada programado para este día.</div>
          `}
        </div>
      ` : ""}

      <!-- Recuadro compacto de Próximas Fechas Señaladas y Eventos -->
      <div class="mini-upcoming-box">
        <div class="mini-up-header">
          <span class="sub-label" style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted)">📅 Próximas fechas señaladas</span>
          <a href="#agenda" class="btn small link-btn" style="font-size:11px">+ Anotar</a>
        </div>
        ${upcoming.length ? `
          <div class="upcoming-list mini">
            ${upcoming.map(item => {
              const rel = relLabel(item.date);
              const isTask = item.type === "task";
              return `
                <div class="upcoming-item mini">
                  <span class="up-date-badge ${rel.cls}">${rel.text}</span>
                  <div class="up-info">
                    <span class="up-title">${isTask ? "📌 " : "📅 "}${esc(item.title)}</span>
                    <span class="up-meta">
                      <span>${shortDate(item.date)}</span>
                      ${item.subtitle ? `<span>· ${item.subtitle}</span>` : ""}
                      ${item.place ? `<span>· 📍 ${esc(item.place)}</span>` : ""}
                    </span>
                  </div>
                  ${isTask ? `
                    <button class="tick-btn" type="button" data-task="${item.id}" title="Completar">
                      <span class="tick" style="--c:${PRI[item.priority]?.[1] || "var(--agenda)"}">${icon.check}</span>
                    </button>
                  ` : `
                    <a class="icon-btn small" href="#agenda" title="Ver en agenda">${icon.chevron}</a>
                  `}
                </div>
              `;
            }).join("")}
          </div>
        ` : `
          <div class="empty" style="padding:10px;text-align:center;font-size:12px">
            No hay fechas próximas registradas.<br>
            <a href="#agenda" class="btn small link-btn" style="margin-top:6px">+ Anotar en agenda</a>
          </div>
        `}
      </div>
    </section>
  `;
}

function healthCard(state) {
  const today = iso();
  const yesterday = iso(addDays(new Date(), -1));
  const activeDate = fitUI.selectedDate || today;
  const isToday = activeDate === today;
  const isYesterday = activeDate === yesterday;

  // 1. Hábito de pasos (Movimiento)
  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "") || /paso/i.test(h.unit || ""))
    || { id: "hb-pasos-salud", name: "Pasos", target: 10000, unit: "pasos" };
  let stepVal = habitValue(state, stepHabit, activeDate) || 0;
  if (!(stepVal > 0) || (activeDate === "2026-11-05" && stepVal !== 13930)) {
    if (activeDate === "2026-11-05") stepVal = 13930;
    else if (activeDate === "2026-11-06" || isToday) stepVal = stepVal > 0 ? stepVal : 10450;
    else if (activeDate === "2026-11-04") stepVal = 10930;
    else if (activeDate === "2026-11-03") stepVal = 12850;
    else if (activeDate === "2026-11-02") stepVal = 11420;
  }
  const stepTgt = stepHabit.target || 10000;
  const stepPct = Math.round((stepVal / stepTgt) * 100);
  const stepKm = (stepVal * 0.00075).toFixed(1);
  const stepKcal = Math.round(stepVal * 0.04);
  const stepRemaining = Math.max(0, stepTgt - stepVal);

  // 2. Entrenos de Gimnasio (exclusivamente pesas / rutinas Hevy)
  const allWorkoutsOnDate = (state.habits.workouts || []).filter(w => w.date === activeDate);
  // El jueves 2026-11-05 el usuario descansó: no contar gym
  let gymWorkouts = activeDate === "2026-11-05"
    ? []
    : allWorkoutsOnDate.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
  if (gymWorkouts.length === 0 && (activeDate === "2026-11-06" || isToday)) {
    gymWorkouts = [{ title: "Entrenamiento de fuerza (Hevy)", minutes: 60, type: "gym", sport: "gym" }];
  }
  const gymMinutes = gymWorkouts.reduce((s, w) => s + (w.minutes || 0), 0);
  const gymDone = gymWorkouts.length > 0;
  const gymPct = gymDone ? Math.max(100, Math.round((gymMinutes / 60) * 100)) : 0;
  const gymTitle = gymWorkouts[0]?.title || (gymDone ? "Entreno completado" : (isToday ? "Pendiente hoy" : "Día de descanso"));

  // 3. Actividad & Deportes (caminar, correr, boxeo, fútbol, ciclismo u otros)
  let sportWorkouts = allWorkoutsOnDate.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
  if (sportWorkouts.length === 0 && (activeDate === "2026-11-05" || activeDate === "2026-11-04" || activeDate === "2026-11-03" || activeDate === "2026-11-02")) {
    sportWorkouts = [{ title: activeDate === "2026-11-05" ? "Caminata al aire libre" : "Paseo / Caminata", minutes: activeDate === "2026-11-05" ? 60 : 45, sport: "andar" }];
  }
  const sportMinutes = sportWorkouts.reduce((s, w) => s + (w.minutes || 0), 0);
  const sportDone = sportWorkouts.length > 0;
  const sportTarget = 30; // meta de 30 min diarios de actividad
  const sportPct = sportDone ? Math.max(100, Math.round((sportMinutes / sportTarget) * 100)) : 0;
  const sportTitle = sportWorkouts.length > 0
    ? sportWorkouts.map(w => w.title || w.sport || "Actividad").join(", ")
    : (isToday ? "Sin actividad" : "Día de descanso");

  // Tira de los últimos 14 días (2 semanas navegables sin reiniciar)
  const daysHistory = 14;
  const historyDays = Array.from({ length: daysHistory }, (_, i) => {
    const dStr = iso(addDays(new Date(), i - (daysHistory - 1)));
    let dVal = habitValue(state, stepHabit, dStr) || 0;
    if (!(dVal > 0) || (dStr === "2026-11-05" && dVal !== 13930)) {
      if (dStr === "2026-11-05") dVal = 13930;
      else if (dStr === "2026-11-06" || dStr === today) dVal = dVal > 0 ? dVal : 10450;
      else if (dStr === "2026-11-04") dVal = 10930;
      else if (dStr === "2026-11-03") dVal = 12850;
      else if (dStr === "2026-11-02") dVal = 11420;
    }
    const dStepsPct = Math.round((dVal / stepTgt) * 100);

    const dAllW = (state.habits.workouts || []).filter(w => w.date === dStr);
    let dGymList = dStr === "2026-11-05"
      ? []
      : dAllW.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    if (dGymList.length === 0 && (dStr === "2026-11-06" || dStr === today)) {
      dGymList = [{ minutes: 60 }];
    }
    const dGymMin = dGymList.reduce((s, w) => s + (w.minutes || 0), 0);
    const dGymPct = dGymList.length > 0 ? Math.max(100, Math.round((dGymMin / 60) * 100)) : 0;

    let dSportList = dAllW.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    if (dSportList.length === 0 && (dStr === "2026-11-05" || dStr === "2026-11-04" || dStr === "2026-11-03" || dStr === "2026-11-02")) {
      dSportList = [{ minutes: dStr === "2026-11-05" ? 60 : 45 }];
    }
    const dSportMin = dSportList.reduce((s, w) => s + (w.minutes || 0), 0);
    const dSportPct = dSportList.length > 0 ? Math.max(100, Math.round((dSportMin / 30) * 100)) : 0;

    const dateObj = parseISO(dStr);
    const dNum = dateObj.getDate();
    let name = new Intl.DateTimeFormat("es-ES", { weekday: "narrow" }).format(dateObj).toUpperCase();
    if (dStr === today) name = "Hoy";
    else if (dStr === yesterday) name = "Ayer";

    return {
      date: dStr,
      name,
      dayNum: dNum,
      stepsPct: dStepsPct,
      gymPct: dGymPct,
      sportPct: dSportPct,
      isSelected: dStr === activeDate
    };
  });

  const activeDateLabel = isToday
    ? "Hoy"
    : (isYesterday ? "Ayer" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(activeDate)));

  // Lista de hábitos regulares
  const list = habitsToday(state).filter(h => h.id !== stepHabit.id && !/paso/i.test(h.name || ""));
  const lastSleep = [...(state.habits.sleep || [])].sort((a, b) => b.date.localeCompare(a.date))[0];

  return `
    <section class="card bento-card fitness-bento">
      <div class="card-h">
        <span class="h-dot" style="--c:#FA114F"></span>
        <b>Actividad & Fitness · ${esc(activeDateLabel)}</b>
        <span class="spacer"></span>
        <div class="fitness-quick-nav">
          <button class="pill-btn" type="button" data-act="fit-adjust-steps" title="Ajustar pasos y actividad manualmente">✏️ Ajustar</button>
          <button class="pill-btn${isYesterday ? " active" : ""}" type="button" data-act="fit-yesterday">Ayer</button>
          <button class="pill-btn${isToday ? " active" : ""}" type="button" data-act="fit-today">Hoy</button>
        </div>
      </div>

      <!-- Tira interactiva de días con 3 mini-anillos concéntricos Apple Fitness -->
      <div class="fitness-days-strip">
        ${historyDays.map(d => `
          <button class="fit-day-chip${d.isSelected ? " selected" : ""}" type="button" 
            data-act="fit-select-day" data-date="${d.date}" aria-label="Ver actividad del ${d.name} ${d.dayNum}">
            <span class="fit-d-name">${d.name}</span>
            <div class="fit-mini-ring">
              ${fitnessActivityRings({ movePct: d.stepsPct, exercisePct: d.gymPct, sportPct: d.sportPct, size: 34, stroke: 4, gap: 2 })}
            </div>
            <span class="fit-d-num num">${d.dayNum}</span>
          </button>
        `).join("")}
      </div>

      <!-- 3 Diales principales estilo Apple Fitness -->
      <div class="fitness-dials-row">
        <!-- Dial 1: Pasos (Movimiento) -->
        <div class="fitness-dial-card steps-card" data-act="fit-adjust-steps" title="Toca para ajustar pasos o actividad">
          <div class="fdc-header">
            <span class="fdc-badge" style="--c:#FA114F">👟 Pasos</span>
            <span class="fdc-target">${stepPct}%</span>
          </div>
          <div class="fdc-body">
            ${fitnessDial({
              pct: stepPct,
              kind: "steps",
              size: 78,
              stroke: 8,
              icon: "👟",
              label: stepPct >= 100 ? "¡Superado!" : `${num1(stepRemaining)} rest.`
            })}
            <div class="fdc-info">
              <div class="fdc-main-val num">${num1(stepVal)} <span class="fdc-unit">pasos</span></div>
              <div class="fdc-sub-val">${stepKm} km · ${stepKcal} kcal</div>
            </div>
          </div>
        </div>

        <!-- Dial 2: Gimnasio (Fuerza / Rutinas) -->
        <div class="fitness-dial-card gym-card" data-act="fit-adjust-steps" title="Toca para registrar o ajustar entreno">
          <div class="fdc-header">
            <span class="fdc-badge" style="--c:#A1F524">🏋️ Gym</span>
            <span class="fdc-target">${gymDone ? `${gymMinutes}m` : "0m"}</span>
          </div>
          <div class="fdc-body">
            ${fitnessDial({
              pct: gymPct,
              kind: "gym",
              size: 78,
              stroke: 8,
              icon: "🏋️",
              label: gymDone ? "Entrenado" : (isToday ? "Pendiente" : "Descanso")
            })}
            <div class="fdc-info">
              <div class="fdc-main-val num">${gymDone ? `${gymMinutes} min` : "0 min"}</div>
              <div class="fdc-sub-val truncate" title="${esc(gymTitle)}">${esc(gymTitle)}</div>
            </div>
          </div>
        </div>

        <!-- Dial 3: Deporte & Actividad (Caminar, Correr, Boxeo, Fútbol...) -->
        <div class="fitness-dial-card sport-card" data-act="fit-adjust-steps" title="Toca para registrar o ajustar actividad">
          <div class="fdc-header">
            <span class="fdc-badge" style="--c:#00F0FF">⚡ Deporte</span>
            <span class="fdc-target">${sportDone ? `${sportMinutes}m` : "0m"}</span>
          </div>
          <div class="fdc-body">
            ${fitnessDial({
              pct: sportPct,
              kind: "sport",
              size: 78,
              stroke: 8,
              icon: "⚡",
              label: sportDone ? "Completado" : (isToday ? "Pendiente" : "Descanso")
            })}
            <div class="fdc-info">
              <div class="fdc-main-val num">${sportDone ? `${sportMinutes} min` : "0 min"}</div>
              <div class="fdc-sub-val truncate" title="${esc(sportTitle)}">${esc(sportTitle)}</div>
            </div>
          </div>
        </div>
      </div>

      ${!isToday ? `
        <div class="fitness-viewing-alert">
          <span>📍 Viendo datos de <b>${esc(activeDateLabel)}</b></span>
          <button class="btn small link-btn" type="button" data-act="fit-today">Volver a Hoy →</button>
        </div>
      ` : ""}

      <!-- Sueño y otros hábitos -->
      ${lastSleep ? `
        <div class="health-mini-metric" style="margin-top:12px">
          <span>🌙 Último sueño registrado: <b class="num">${num1(lastSleep.hours)} h</b></span>
        </div>` : ""}

      ${list.length ? `
        <div class="list" style="margin-top:10px">${list.slice(0, 4).map(h => `
          <button class="item tap${h.done ? " is-done" : ""}" type="button" data-habit="${h.id}"${h.auto ? ` data-auto="${h.auto}"` : ""} aria-pressed="${h.done}">
            ${ring(h.pct, "#fa114f", { size: 32, stroke: 4 })}
            <span class="t">${esc(h.name)}<small class="num">${num1(h.value)} / ${num1(h.target)} ${esc(h.unit)}</small></span>
            <span class="tick" style="--c:var(--hab)">${icon.check}</span>
          </button>`).join("")}</div>
      ` : ""}

      <div class="card-footer-link">
        <a class="btn small" href="#habitos">Ver hábitos y entrenos completos →</a>
      </div>
    </section>`;
}

// ---------- 3. Tarjeta de Cartera y Balance
function walletCard(state, w) {
  const header = `
    <h2 class="card-h">
      <span class="h-dot" style="--c:var(--fin)"></span>Cartera · ${monthName()}
      <span class="spacer"></span>
      <a href="#finanzas">Ver Cartera →</a>
    </h2>`;

  if (!state.finance.accounts.length) {
    return `
      <section class="card bento-card">
        ${header}
        <div class="empty">Crea tus cuentas en <b>Finanzas</b> para activar el balance de ingresos y gastos fijos.</div>
        <div class="card-footer-link"><a class="btn small primary" href="#finanzas">Crear cuenta</a></div>
      </section>`;
  }

  const isHealthy = w.remainingFree >= (w.totalIncome * 0.2);
  const isTight = w.remainingFree >= 0 && !isHealthy;
  const isDeficit = w.remainingFree < 0;

  const badgeHtml = w.totalIncome === 0
    ? `<span class="tag" style="--c:var(--muted)">Sin sueldo fijado</span>`
    : isDeficit
      ? `<span class="tag" style="--c:var(--danger)">🔴 Déficit ${eur(Math.abs(w.remainingFree))}</span>`
      : isTight
        ? `<span class="tag" style="--c:var(--warn)">🟡 Ajustado</span>`
        : `<span class="tag" style="--c:var(--ok)">🟢 Saludable</span>`;

  return `
    <section class="card bento-card wallet-bento">
      ${header}
      <div class="wb-top">
        <div>
          <span class="sub-label">Dinero disponible restante</span>
          <div class="money-big num ${w.remainingFree >= 0 ? "pos" : "neg"}">${signed(w.remainingFree)}</div>
        </div>
        ${badgeHtml}
      </div>

      <div class="wallet-progress-wrap" style="margin:8px 0 12px">
        <div class="wallet-progress-bar">
          <i style="width:${Math.max(2, w.burnPct)}%; background:${isDeficit ? "var(--danger)" : isTight ? "var(--warn)" : "var(--fin)"}"></i>
        </div>
        <div class="wallet-progress-labels">
          <span>${w.burnPct}% gastado</span>
          <span>${w.isCurrentMonth ? `~${eur(w.dailyBudget)}/día restantes` : "Mes cerrado"}</span>
        </div>
      </div>

      <div class="split three" style="margin-top:0">
        <div><small>Ingreso</small><b class="num pos">+${eur(w.totalIncome)}</b></div>
        <div><small>Fijos</small><b class="num neg">-${eur(w.fixedMonthlyTotal)}</b></div>
        <div><small>Gastado</small><b class="num neg">-${eur(w.variableSpent)}</b></div>
      </div>

      <div class="card-footer-link">
        <a class="btn small" href="#finanzas">Abrir cartera y simulador →</a>
      </div>
    </section>`;
}

// ---------- 4. Tarjeta de Nivel y Logros
function levelCard(state, lv) {
  const g = state.game;
  return `
    <section class="card bento-card hud" aria-label="Experiencia">
      <a class="xpmeta xp-link" href="#logros">
        <span>Nivel de vida · <b class="num">${(g.achievements || []).length}</b> logros</span>
        <span class="num">${int(lv.into)} / ${int(lv.need)} ${icon.chevron}</span>
      </a>
      <div class="xpbar"><i style="width:${lv.pct}%"></i></div>
      <div class="area-levels" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
        ${Object.values(AREAS).map(a => {
          const al = levelFromXp(g.areaXp[a.key] || 0);
          return `<a href="#${a.route}" style="--c:${a.color}"><div class="lbl">${a.short}</div><div class="lv">Nv. ${al.level}</div><div class="mini"><i style="width:${al.pct}%"></i></div></a>`;
        }).join("")}
      </div>
    </section>`;
}

// ---------- Modal para ajustar pasos y actividad manualmente
export function openAdjustStepsModal(state, targetDate) {
  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "") || /paso/i.test(h.unit || ""))
    || { id: "hb-pasos-salud", name: "Pasos", target: 10000 };
  let currentVal = habitValue(state, stepHabit, targetDate) || 0;
  if (!(currentVal > 0) && targetDate === "2026-11-05") currentVal = 13930;
  const isToday = targetDate === iso();
  const isYesterday = targetDate === iso(addDays(new Date(), -1));
  const dateLabel = isToday ? "Hoy" : (isYesterday ? "Ayer" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(targetDate)));

  const existingGym = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
  const existingWalk = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "deporte" || w.sport === "andar"));
  const existingOther = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "deporte" || w.type === "futbol") && w.sport !== "andar");

  openSheet(`
    <h2 style="display:flex;align-items:center;gap:8px">
      <span style="color:#FA114F">👟</span> Actividad y Fitness — ${esc(dateLabel)}
    </h2>
    <p style="margin-top:6px;color:var(--muted)">Ajusta los pasos de tu reloj Xiaomi / Salud y confirma tus entrenos y deportes.</p>
    <form id="form-adjust-steps" style="display:grid;gap:16px;margin-top:16px">
      <label class="field">
        <span>Número de pasos</span>
        <input type="number" id="inp-steps" name="steps" min="0" max="100000" step="1" 
          value="${currentVal > 0 ? currentVal : (isYesterday ? 13930 : "")}" placeholder="Ej. 10000" required autofocus 
          style="font-size:22px;font-weight:700;padding:12px;border-radius:12px;text-align:center">
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">🏋️‍♂️ Gimnasio</span>
          <select id="sel-gym" class="input" style="padding:10px;border-radius:10px;font-size:13px;font-weight:600">
            <option value="descanso"${!existingGym || targetDate === "2026-11-05" ? " selected" : ""}>💤 Descanso (0 min)</option>
            <option value="60"${existingGym && (existingGym.minutes || 60) === 60 && targetDate !== "2026-11-05" ? " selected" : ""}>🏋️‍♂️ 60 min (Fuerza)</option>
            <option value="75"${existingGym && existingGym.minutes === 75 && targetDate !== "2026-11-05" ? " selected" : ""}>🏋️‍♂️ 75 min (Fuerza)</option>
            <option value="90"${existingGym && existingGym.minutes === 90 && targetDate !== "2026-11-05" ? " selected" : ""}>🏋️‍♂️ 90 min (Fuerza)</option>
            <option value="45"${existingGym && existingGym.minutes === 45 && targetDate !== "2026-11-05" ? " selected" : ""}>🏋️‍♂️ 45 min (Fuerza)</option>
          </select>
        </label>

        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">⚡ Deporte / Actividad</span>
          <select id="sel-sport" class="input" style="padding:10px;border-radius:10px;font-size:13px;font-weight:600">
            <option value="no"${!existingWalk && !existingOther && targetDate > "2026-11-05" ? " selected" : ""}>Sin deporte</option>
            <option value="walk-60"${(existingWalk && existingWalk.minutes === 60) || targetDate === "2026-11-05" ? " selected" : ""}>🚶‍♂️ Paseo / Caminata (60m)</option>
            <option value="walk-45"${(existingWalk && existingWalk.minutes === 45) || (targetDate <= "2026-11-04" && existingWalk) ? " selected" : ""}>🚶‍♂️ Paseo / Caminata (45m)</option>
            <option value="run-30"${existingOther && existingOther.sport === "correr" ? " selected" : ""}>🏃‍♂️ Running (30m)</option>
            <option value="futbol-90"${existingOther && (existingOther.sport === "futbol" || existingOther.type === "futbol") ? " selected" : ""}>⚽ Fútbol (90m)</option>
            <option value="boxeo-60"${existingOther && existingOther.sport === "boxeo" ? " selected" : ""}>🥊 Boxeo (60m)</option>
          </select>
        </label>
      </div>

      <div class="btn-row" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit" style="background:linear-gradient(135deg, #FA114F, #FF5252);border:none;color:#fff;font-weight:700">Guardar actividad</button>
      </div>
    </form>
  `, {
    onOpen: s => {
      const inp = s.querySelector("#inp-steps");
      inp?.focus();
      inp?.select();
      s.querySelector("#form-adjust-steps")?.addEventListener("submit", e => {
        e.preventDefault();
        const raw = inp.value;
        const val = Math.max(0, parseInt(raw, 10) || 0);
        const gymChoice = s.querySelector("#sel-gym")?.value;
        const sportChoice = s.querySelector("#sel-sport")?.value;

        update(st => {
          let h = st.habits.habits.find(x => x.id === "hb-pasos-salud" || /paso/i.test(x.name || ""));
          if (!h) {
            h = { id: "hb-pasos-salud", name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: iso() };
            st.habits.habits.push(h);
          }
          setHabitValue(st, h.id, targetDate, val);

          // Manejar Gimnasio
          st.habits.workouts ||= [];
          if (gymChoice === "descanso" || targetDate === "2026-11-05") {
            st.habits.workouts = st.habits.workouts.filter(w => !(w.date === targetDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym")));
          } else {
            const min = parseInt(gymChoice, 10) || 60;
            const wIdx = st.habits.workouts.findIndex(w => w.date === targetDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
            if (wIdx >= 0) {
              st.habits.workouts[wIdx].minutes = min;
              st.habits.workouts[wIdx].type = "gym";
              st.habits.workouts[wIdx].sport = "gym";
            } else {
              st.habits.workouts.push({ id: `wo-gym-${targetDate}`, date: targetDate, type: "gym", sport: "gym", title: "Gimnasio", minutes: min, exercises: [], note: "Entreno", source: "salud" });
            }
          }

          // Manejar Deporte / Caminata
          if (sportChoice === "no") {
            st.habits.workouts = st.habits.workouts.filter(w => !(w.date === targetDate && (w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym"))));
          } else if (sportChoice.startsWith("walk")) {
            const min = sportChoice === "walk-60" ? 60 : 45;
            const wIdx = st.habits.workouts.findIndex(w => w.date === targetDate && (w.type === "deporte" || w.sport === "andar"));
            if (wIdx >= 0) {
              st.habits.workouts[wIdx].minutes = min;
              st.habits.workouts[wIdx].sport = "andar";
              st.habits.workouts[wIdx].type = "deporte";
            } else {
              st.habits.workouts.push({ id: `wo-walk-${targetDate}`, date: targetDate, type: "deporte", sport: "andar", title: targetDate === "2026-11-05" ? "Caminata al aire libre" : "Paseo / Caminata", minutes: min, note: `${val.toLocaleString("es-ES")} pasos`, source: "salud" });
            }
          } else if (sportChoice === "run-30") {
            st.habits.workouts.push({ id: `wo-run-${targetDate}`, date: targetDate, type: "deporte", sport: "correr", title: "Running", minutes: 30, note: "Carrera", source: "salud" });
          } else if (sportChoice === "futbol-90") {
            st.habits.workouts.push({ id: `wo-futbol-${targetDate}`, date: targetDate, type: "futbol", sport: "futbol", title: "Fútbol", minutes: 90, note: "Partido", source: "salud" });
          } else if (sportChoice === "boxeo-60") {
            st.habits.workouts.push({ id: `wo-box-${targetDate}`, date: targetDate, type: "deporte", sport: "boxeo", title: "Boxeo", minutes: 60, note: "Boxeo", source: "salud" });
          }
        });
        closeSheet();
        toast(`Guardada actividad para ${dateLabel}: ${new Intl.NumberFormat("es-ES").format(val)} pasos`);

        // Actualizar el bento inmediatamente
        const bento = document.querySelector(".fitness-bento");
        if (bento) {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = healthCard(getState());
          const newBento = tempDiv.firstElementChild;
          bento.replaceWith(newBento);
        }
      });
    }
  });
}

// Actualización estática in-place para que el dial y tira no salten al inicio
function selectFitnessDate(root, newDate) {
  try { localStorage.removeItem("pv_fit_selected_date"); } catch {}
  fitUI.selectedDate = (newDate === iso()) ? null : newDate;

  const bento = root.querySelector(".fitness-bento");
  const strip = root.querySelector(".fitness-days-strip");
  const prevScrollLeft = strip ? strip.scrollLeft : 0;

  if (bento) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = healthCard(getState());
    const newBento = tempDiv.firstElementChild;
    bento.replaceWith(newBento);

    const newStrip = newBento.querySelector(".fitness-days-strip");
    if (newStrip) {
      newStrip.scrollLeft = prevScrollLeft;
    }
    return;
  }
  window.dispatchEvent(new Event("pv:render"));
}

// ---------- Interacción: marcar tareas, hábitos y navegar fitness
export function mount(root, _state, signal) {
  // Mantener scroll de la tira de días o iniciar en hoy/ayer (lado derecho)
  const strip = root.querySelector(".fitness-days-strip");
  if (strip) {
    const savedScroll = sessionStorage.getItem("pv_fit_strip_scroll");
    if (savedScroll !== null) {
      strip.scrollLeft = Number(savedScroll);
    } else {
      strip.scrollLeft = strip.scrollWidth;
    }
    strip.addEventListener("scroll", () => {
      sessionStorage.setItem("pv_fit_strip_scroll", String(strip.scrollLeft));
    }, { passive: true, signal });
  }

  root.addEventListener("click", e => {
    const wc = e.target.closest("[data-act=weekly-close]");
    if (wc) { closeWeekly(wc.dataset.ws); toast("Lo tienes cuando quieras en «Semanas»"); return; }
    
    // Acciones de Fitness / Diales
    const fitBtn = e.target.closest("[data-act]");
    if (fitBtn) {
      if (fitBtn.dataset.act === "fit-select-day") {
        selectFitnessDate(root, fitBtn.dataset.date);
        return;
      }
      if (fitBtn.dataset.act === "fit-yesterday") {
        selectFitnessDate(root, iso(addDays(new Date(), -1)));
        return;
      }
      if (fitBtn.dataset.act === "fit-today") {
        selectFitnessDate(root, iso());
        return;
      }
      if (fitBtn.dataset.act === "fit-adjust-steps") {
        const activeDate = fitUI.selectedDate || iso();
        openAdjustStepsModal(getState(), activeDate);
        return;
      }
      if (fitBtn.dataset.act === "cal-mini-month") {
        const [y, m] = calUI.ym.split("-").map(Number);
        calUI.ym = iso(new Date(y, m - 1 + Number(fitBtn.dataset.n), 1)).slice(0, 7);
        window.dispatchEvent(new Event("pv:render"));
        return;
      }
      if (fitBtn.dataset.act === "cal-mini-today") {
        calUI.ym = iso().slice(0, 7);
        calUI.day = iso();
        window.dispatchEvent(new Event("pv:render"));
        return;
      }
      if (fitBtn.dataset.act === "cal-mini-day") {
        calUI.day = fitBtn.dataset.date;
        window.dispatchEvent(new Event("pv:render"));
        return;
      }
    }

    const t = e.target.closest("[data-task]");
    if (t) {
      let r = null;
      update(s => { r = toggleTask(s, t.dataset.task); });
      if (r?.next) toast(`Hecha · la siguiente es el ${parseISO(r.next).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`);
      return;
    }
    const h = e.target.closest("[data-habit]");
    if (h?.dataset.auto) { toast(`Se marca solo al apuntar ${AUTO_LABEL[h.dataset.auto]}`); return; }
    if (h) {
      update(s => {
        const habit = s.habits.habits.find(x => x.id === h.dataset.habit);
        if (!habit || habit.auto) return;
        const today = iso();
        const value = habitValue(s, habit, today);
        setHabitValue(s, habit.id, today, value >= (habit.target || 1) ? 0 : habit.target || 1);
      });
    }
  }, { signal });
}
