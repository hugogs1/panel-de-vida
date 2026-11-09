// Pantalla Principal: Agenda Diaria, Bento Grid, Pulso de Salud y Cartera Inteligente.

import { AREAS, levelFromXp, titleFor } from "../game.js";
import { esc, int, money as eur, longDate, monthName, toast, openSheet, closeSheet } from "../ui.js";
import { icon } from "../icons.js";
import { backupDue } from "../backup.js";
import { update, getState } from "../state.js";
import { syncConfigured, syncNow, getSyncStatus, statusText } from "../sync.js";
import { parseHevy, applyHevy } from "../hevy.js";
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
  selectedDate: null, // Al cargar la app, siempre inicia en HOY (iso())
  summaryYm: iso().slice(0, 7)
};

// ---------- CÁLCULO DE RESUMEN MENSUAL DE FITNESS
export function getMonthlyFitnessData(state, ym = iso().slice(0, 7)) {
  const [year, month] = ym.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = iso();

  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "") || /paso/i.test(h.unit || ""))
    || { id: "hb-pasos-salud", name: "Pasos", target: 10000, unit: "pasos" };
  const stepTgt = stepHabit.target || 10000;

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${ym}-${String(d).padStart(2, "0")}`;
    const val = habitValue(state, stepHabit, dStr) || 0;

    const allW = (state.habits.workouts || []).filter(w => w.date === dStr);
    const gymList = allW.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const gymMin = gymList.reduce((s, w) => s + (w.minutes || 0), 0);
    const gymDone = gymList.length > 0;

    const sportList = allW.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const sportMin = sportList.reduce((s, w) => s + (w.minutes || 0), 0);
    const sportDone = sportList.length > 0;

    const dateObj = parseISO(dStr);
    const dayOfWeek = (dateObj.getDay() + 6) % 7; // 0 = Lunes, 6 = Domingo

    days.push({
      date: dStr,
      dayNum: d,
      dayOfWeek,
      steps: val,
      stepsPct: Math.round((val / stepTgt) * 100),
      gymMin,
      gymDone,
      gymPct: gymDone ? Math.max(100, Math.round((gymMin / 60) * 100)) : 0,
      sportMin,
      sportDone,
      sportPct: sportDone ? Math.max(100, Math.round((sportMin / 30) * 100)) : 0,
      isFuture: dStr > today,
      isToday: dStr === today
    });
  }

  const elapsedDays = days.filter(d => !d.isFuture);
  const totalSteps = days.reduce((s, d) => s + d.steps, 0);
  const avgSteps = elapsedDays.length ? Math.round(totalSteps / elapsedDays.length) : 0;
  const daysGoalMet = elapsedDays.filter(d => d.steps >= stepTgt).length;
  const bestDay = [...elapsedDays].sort((a, b) => b.steps - a.steps)[0] || null;
  const totalGymSessions = days.filter(d => d.gymDone).length;
  const totalGymMinutes = days.reduce((s, d) => s + d.gymMin, 0);
  const totalSportSessions = days.filter(d => d.sportDone).length;
  const totalSportMinutes = days.reduce((s, d) => s + d.sportMin, 0);
  const totalKm = (totalSteps * 0.00075).toFixed(1);
  const totalKcal = Math.round(totalSteps * 0.04);

  return {
    ym,
    year,
    month,
    daysInMonth,
    days,
    elapsedDays,
    totalSteps,
    avgSteps,
    daysGoalMet,
    bestDay,
    totalGymSessions,
    totalGymMinutes,
    totalSportSessions,
    totalSportMinutes,
    totalKm,
    totalKcal,
    stepTgt
  };
}

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
  const tomorrow = iso(addDays(new Date(), 1));
  const activeDate = fitUI.selectedDate || today;
  const isToday = activeDate === today;
  const isYesterday = activeDate === yesterday;
  const isTomorrow = activeDate === tomorrow;
  const isFuture = activeDate > today;

  // 1. Hábito de pasos (Movimiento) - lectura pura de base de datos
  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "") || /paso/i.test(h.unit || ""))
    || { id: "hb-pasos-salud", name: "Pasos", target: 10000, unit: "pasos" };
  const stepVal = habitValue(state, stepHabit, activeDate) || 0;
  const stepTgt = stepHabit.target || 10000;
  const stepPct = Math.round((stepVal / stepTgt) * 100);
  const stepKm = (stepVal * 0.00075).toFixed(1);
  const stepKcal = Math.round(stepVal * 0.04);
  const stepRemaining = Math.max(0, stepTgt - stepVal);

  // 2. Entrenos de Gimnasio (exclusivamente pesas / rutinas Hevy)
  const allWorkoutsOnDate = (state.habits.workouts || []).filter(w => w.date === activeDate);
  const gymWorkouts = allWorkoutsOnDate.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
  const gymMinutes = gymWorkouts.reduce((s, w) => s + (w.minutes || 0), 0);
  const gymDone = gymWorkouts.length > 0;
  const gymPct = gymDone ? Math.max(100, Math.round((gymMinutes / 60) * 100)) : 0;
  const gymTitle = gymWorkouts[0]?.title || (gymDone ? "Entreno completado" : (isFuture ? "Pendiente (programar)" : (isToday ? "Pendiente hoy" : "Día de descanso")));

  // 3. Actividad & Deportes (caminar, correr, boxeo, fútbol, ciclismo u otros)
  const sportWorkouts = allWorkoutsOnDate.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
  const sportMinutes = sportWorkouts.reduce((s, w) => s + (w.minutes || 0), 0);
  const sportDone = sportWorkouts.length > 0;
  const sportTarget = 30; // meta de 30 min diarios de actividad
  const sportPct = sportDone ? Math.max(100, Math.round((sportMinutes / sportTarget) * 100)) : 0;
  const sportTitle = sportWorkouts.length > 0
    ? sportWorkouts.map(w => w.title || w.sport || "Actividad").join(", ")
    : (isFuture ? "Sin actividad programada" : (isToday ? "Sin actividad" : "Día de descanso"));

  // Tira de días ampliada:
  // - Pasados: 10 días hacia atrás
  // - Presente: Hoy
  // - Futuros: 14 días siguientes hacia adelante
  const daysPast = 10;
  const daysFuture = 14;
  const historyDays = [];
  for (let offset = -daysPast; offset <= daysFuture; offset++) {
    const dStr = iso(addDays(new Date(), offset));
    const dVal = habitValue(state, stepHabit, dStr) || 0;
    const dStepsPct = Math.round((dVal / stepTgt) * 100);

    const dAllW = (state.habits.workouts || []).filter(w => w.date === dStr);
    const dGymList = dAllW.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const dGymMin = dGymList.reduce((s, w) => s + (w.minutes || 0), 0);
    const dGymPct = dGymList.length > 0 ? Math.max(100, Math.round((dGymMin / 60) * 100)) : 0;

    const dSportList = dAllW.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const dSportMin = dSportList.reduce((s, w) => s + (w.minutes || 0), 0);
    const dSportPct = dSportList.length > 0 ? Math.max(100, Math.round((dSportMin / 30) * 100)) : 0;

    const dateObj = parseISO(dStr);
    const dNum = dateObj.getDate();
    let name = "";
    if (dStr === today) name = "Hoy";
    else if (dStr === yesterday) name = "Ayer";
    else if (dStr === tomorrow) name = "Mañana";
    else {
      const wd = new Intl.DateTimeFormat("es-ES", { weekday: "narrow" }).format(dateObj).toUpperCase();
      name = wd;
    }

    historyDays.push({
      date: dStr,
      name,
      dayNum: dNum,
      stepsPct: dStepsPct,
      gymPct: dGymPct,
      sportPct: dSportPct,
      isSelected: dStr === activeDate,
      isToday: dStr === today,
      isFuture: dStr > today
    });
  }

  const activeDateLabel = isToday
    ? "Hoy"
    : (isYesterday ? "Ayer" : (isTomorrow ? "Mañana" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(activeDate))));

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
          <button class="pill-btn nav-arrow" type="button" data-act="fit-prev-day" title="Día anterior">‹</button>
          <button class="pill-btn${isYesterday ? " active" : ""}" type="button" data-act="fit-yesterday">Ayer</button>
          <button class="pill-btn${isToday ? " active" : ""}" type="button" data-act="fit-today">Hoy</button>
          <button class="pill-btn${isTomorrow ? " active" : ""}" type="button" data-act="fit-tomorrow">Mañana</button>
          <button class="pill-btn nav-arrow" type="button" data-act="fit-next-day" title="Día siguiente">›</button>
          <button class="pill-btn highlight" type="button" data-act="fit-monthly" title="Ver Resumen Mensual de Fitness">📊 Mes</button>
          <button class="pill-btn highlight" type="button" data-act="fit-sync-center" title="Centro de sincronización de salud y Hevy">🔄 Sincronizar</button>
          <button class="pill-btn" type="button" data-act="fit-adjust-steps" title="Ajustar o planificar actividad">✏️ Ajustar</button>
        </div>
      </div>

      <!-- Desplegable y selector directo de día -->
      <div class="fit-dropdown-bar">
        <label class="fit-dropdown-label" for="fit-day-select">
          <span style="color:#FA114F">📅</span> Desplegable de días:
        </label>
        <select id="fit-day-select" class="fit-dropdown-select input" data-act="fit-dropdown-select" aria-label="Seleccionar día de actividad">
          ${historyDays.map(d => `
            <option value="${d.date}"${d.isSelected ? " selected" : ""}>
              ${d.isToday ? "★ Hoy" : (d.isYesterday ? "Ayer" : (d.isTomorrow ? "Mañana" : d.name))} (${shortDate(d.date)})
            </option>
          `).join("")}
        </select>
        <button class="pill-btn highlight" type="button" data-act="fit-adjust-steps" title="Ajustar o planificar actividad de este día">
          ✏️ Ajustar este día
        </button>
      </div>

      <!-- Tira interactiva de días con 3 mini-anillos concéntricos Apple Fitness (pasados, hoy y todos los siguientes) -->
      <div class="fitness-days-strip">
        ${historyDays.map(d => `
          <button class="fit-day-chip${d.isSelected ? " selected" : ""}${d.isFuture ? " is-future" : ""}${d.isToday ? " is-today" : ""}" type="button" 
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
              label: gymDone ? "Entrenado" : (isFuture ? "Planificar" : (isToday ? "Pendiente" : "Descanso"))
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
              label: sportDone ? "Completado" : (isFuture ? "Planificar" : (isToday ? "Pendiente" : "Descanso"))
            })}
            <div class="fdc-info">
              <div class="fdc-main-val num">${sportDone ? `${sportMinutes} min` : "0 min"}</div>
              <div class="fdc-sub-val truncate" title="${esc(sportTitle)}">${esc(sportTitle)}</div>
            </div>
          </div>
        </div>
      </div>

      ${!isToday ? `
        <div class="fit-selected-day-panel">
          <div class="fsd-header">
            <div class="fsd-info">
              <span class="fsd-badge ${isFuture ? 'future' : 'past'}">${isFuture ? 'Día futuro' : 'Día anterior'}</span>
              <b>📍 ${esc(activeDateLabel)} (${shortDate(activeDate)})</b>
            </div>
            <div class="fsd-btns" style="display:flex;align-items:center;gap:6px">
              <button class="btn small primary" type="button" data-act="fit-adjust-steps" style="background:linear-gradient(135deg, #FA114F, #FF2442);border:none;color:#fff;font-weight:700;font-size:11px">
                ✏️ ${isFuture ? "Planificar entreno" : "Ajustar actividad"}
              </button>
              <button class="btn small link-btn" type="button" data-act="fit-today" style="font-size:11px">Volver a Hoy →</button>
            </div>
          </div>
          <div class="fsd-summary-row">
            <span class="fsd-pill">👟 <b>${num1(stepVal)}</b> pasos (${stepPct}%)</span>
            <span class="fsd-pill">🏋️ <b>${gymDone ? `${gymMinutes}m` : "0m"}</b> (${gymDone ? gymTitle : "Descanso"})</span>
            <span class="fsd-pill">⚡ <b>${sportDone ? `${sportMinutes}m` : "0m"}</b> (${sportDone ? sportTitle : "Sin actividad"})</span>
          </div>
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

      <div class="card-footer-link" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <button class="btn small primary" type="button" data-act="fit-monthly" style="background:linear-gradient(135deg, #FA114F, #FF2442);border:none;color:#fff;font-weight:700">
          📊 Resumen Mensual de Fitness →
        </button>
        <a class="btn small link-btn" href="#habitos">Ver hábitos completos →</a>
      </div>
    </section>`;
}

// ---------- 2.1 Hoja Modal de Resumen Mensual de Fitness (Apple Fitness Style)
export function openMonthlyFitnessSheet(state, initialYm = iso().slice(0, 7)) {
  let ym = initialYm;

  function renderModalHtml() {
    const data = getMonthlyFitnessData(state, ym);
    const [y, m] = ym.split("-").map(Number);
    const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
    const title = monthName[0].toUpperCase() + monthName.slice(1);
    
    // Primer día del mes y celdas vacías al inicio para el calendario
    const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
    const leadEmptyDays = (firstDayOfWeek + 6) % 7; // 0 = Lunes

    return `
      <div class="monthly-fit-sheet">
        <!-- Cabecera de navegación de mes -->
        <div class="mf-nav">
          <button class="icon-btn small" type="button" data-mf-act="prev-month" title="Mes anterior">«</button>
          <div class="mf-title-box">
            <h2 style="margin:0;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:6px">
              <span style="color:#FA114F">📊</span> Resumen Fitness · ${title}
            </h2>
            <span style="font-size:11px;color:var(--muted)">Historial acumulado en memoria local</span>
          </div>
          <button class="icon-btn small" type="button" data-mf-act="next-month" title="Mes siguiente">»</button>
        </div>

        <!-- 4 Tarjetas de KPIs del Mes -->
        <div class="mf-kpi-grid">
          <!-- KPI 1: Pasos Totales -->
          <div class="mf-kpi-card" style="--c:#FA114F">
            <div class="mf-kpi-top">
              <span class="mf-kpi-icon">👟</span>
              <span class="mf-kpi-lbl">Pasos Totales</span>
            </div>
            <div class="mf-kpi-val num">${num1(data.totalSteps)}</div>
            <div class="mf-kpi-sub">
              <span>Media: <b>${num1(data.avgSteps)}</b> /día</span>
              <span>· ${data.totalKm} km (${num1(data.totalKcal)} kcal)</span>
            </div>
            <div class="mf-kpi-progress">
              <div class="mf-kpi-bar" style="width:${Math.min(100, Math.round((data.daysGoalMet / Math.max(1, data.elapsedDays.length)) * 100))}%"></div>
            </div>
            <span class="mf-kpi-meta">${data.daysGoalMet} de ${data.elapsedDays.length} días con objetivo cumplido</span>
          </div>

          <!-- KPI 2: Gimnasio & Fuerza (Hevy) -->
          <div class="mf-kpi-card" style="--c:#A1F524">
            <div class="mf-kpi-top">
              <span class="mf-kpi-icon">🏋️‍♂️</span>
              <span class="mf-kpi-lbl">Gimnasio & Fuerza</span>
            </div>
            <div class="mf-kpi-val num">${data.totalGymSessions} <small style="font-size:13px;font-weight:600">sesiones</small></div>
            <div class="mf-kpi-sub">
              <span>Tiempo total: <b>${Math.floor(data.totalGymMinutes / 60)}h ${data.totalGymMinutes % 60}m</b></span>
            </div>
            <div class="mf-kpi-progress">
              <div class="mf-kpi-bar" style="width:${Math.min(100, Math.round((data.totalGymSessions / 16) * 100))}%"></div>
            </div>
            <span class="mf-kpi-meta">Rutinas registradas en Hevy / Salud</span>
          </div>

          <!-- KPI 3: Deporte & Caminatas -->
          <div class="mf-kpi-card" style="--c:#00F0FF">
            <div class="mf-kpi-top">
              <span class="mf-kpi-icon">⚡</span>
              <span class="mf-kpi-lbl">Deporte & Actividad</span>
            </div>
            <div class="mf-kpi-val num">${data.totalSportSessions} <small style="font-size:13px;font-weight:600">sesiones</small></div>
            <div class="mf-kpi-sub">
              <span>Tiempo activo: <b>${Math.floor(data.totalSportMinutes / 60)}h ${data.totalSportMinutes % 60}m</b></span>
            </div>
            <div class="mf-kpi-progress">
              <div class="mf-kpi-bar" style="width:${Math.min(100, Math.round((data.totalSportSessions / 16) * 100))}%"></div>
            </div>
            <span class="mf-kpi-meta">Caminatas, running, deportes</span>
          </div>

          <!-- KPI 4: Mejor Día del Mes -->
          <div class="mf-kpi-card" style="--c:#FFD60A">
            <div class="mf-kpi-top">
              <span class="mf-kpi-icon">🏆</span>
              <span class="mf-kpi-lbl">Récord del Mes</span>
            </div>
            <div class="mf-kpi-val num">${data.bestDay ? num1(data.bestDay.steps) : "0"} <small style="font-size:13px;font-weight:600">pasos</small></div>
            <div class="mf-kpi-sub">
              <span>${data.bestDay ? `Día ${shortDate(data.bestDay.date)}` : "Sin datos registrados"}</span>
            </div>
            <span class="mf-kpi-meta" style="margin-top:auto">Mayor registro de actividad diaria</span>
          </div>
        </div>

        <!-- Calendario Mensual de Actividad (Apple Fitness Activity Calendar) -->
        <div class="mf-cal-section">
          <div class="mf-cal-header">
            <span style="font-size:12px;font-weight:700;color:var(--fg);text-transform:uppercase;letter-spacing:0.5px">
              📅 Calendario de Anillos · ${title}
            </span>
            <span style="font-size:11px;color:var(--muted)">Toca un día para ver o ajustar</span>
          </div>

          <div class="mf-cal-grid">
            <div class="mf-cal-dow">L</div>
            <div class="mf-cal-dow">M</div>
            <div class="mf-cal-dow">X</div>
            <div class="mf-cal-dow">J</div>
            <div class="mf-cal-dow">V</div>
            <div class="mf-cal-dow">S</div>
            <div class="mf-cal-dow">D</div>

            ${Array.from({ length: leadEmptyDays }, () => `<div class="mf-cal-empty"></div>`).join("")}

            ${data.days.map(d => `
              <button class="mf-cal-cell${d.isToday ? " is-today" : ""}${d.isFuture ? " is-future" : ""}" type="button"
                data-mf-act="select-day" data-date="${d.date}" title="${d.date}: ${num1(d.steps)} pasos, ${d.gymMin}m gym, ${d.sportMin}m deporte">
                <span class="mf-cal-day-num num">${d.dayNum}</span>
                <div class="mf-cal-rings">
                  ${fitnessActivityRings({ movePct: d.stepsPct, exercisePct: d.gymPct, sportPct: d.sportPct, size: 30, stroke: 3.5, gap: 1 })}
                </div>
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Estado de memoria persistente -->
        <div class="mf-storage-info">
          <span>💾 <b>Memoria persistente activa:</b> Todos tus registros diarios se guardan automáticamente en tu dispositivo para consultar el histórico cuando quieras.</span>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button class="btn" type="button" data-close>Cerrar resumen</button>
        </div>
      </div>
    `;
  }

  const sheet = openSheet(renderModalHtml(), {
    onOpen: s => {
      s.addEventListener("click", e => {
        const btn = e.target.closest("[data-mf-act]");
        if (!btn) return;
        const act = btn.dataset.mf-act || btn.getAttribute("data-mf-act");
        if (act === "prev-month") {
          const [y, m] = ym.split("-").map(Number);
          ym = iso(new Date(y, m - 2, 1)).slice(0, 7);
          fitUI.summaryYm = ym;
          s.innerHTML = `<div class="grabber"></div>${renderModalHtml()}`;
          return;
        }
        if (act === "next-month") {
          const [y, m] = ym.split("-").map(Number);
          ym = iso(new Date(y, m, 1)).slice(0, 7);
          fitUI.summaryYm = ym;
          s.innerHTML = `<div class="grabber"></div>${renderModalHtml()}`;
          return;
        }
        if (act === "select-day") {
          const targetDate = btn.dataset.date;
          fitUI.selectedDate = targetDate;
          closeSheet();
          window.dispatchEvent(new Event("pv:render"));
          setTimeout(() => {
            const el = document.querySelector(".fitness-bento");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
          return;
        }
      });
    }
  });
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
  const currentVal = habitValue(state, stepHabit, targetDate) || 0;
  const isToday = targetDate === iso();
  const isYesterday = targetDate === iso(addDays(new Date(), -1));
  const isTomorrow = targetDate === iso(addDays(new Date(), 1));
  const dateLabel = isToday ? "Hoy" : (isYesterday ? "Ayer" : (isTomorrow ? "Mañana" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(targetDate))));

  const existingGym = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
  const existingWalk = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "deporte" || w.sport === "andar"));
  const existingOther = (state.habits.workouts || []).find(w => w.date === targetDate && (w.type === "deporte" || w.type === "futbol") && w.sport !== "andar");

  openSheet(`
    <h2 style="display:flex;align-items:center;gap:8px">
      <span style="color:#FA114F">👟</span> Actividad y Fitness — ${esc(dateLabel)}
    </h2>
    <p style="margin-top:6px;color:var(--muted)">Ajusta los pasos de tu reloj Xiaomi / Salud y confirma tus entrenos y deportes para guardarlos en memoria.</p>
    
    <form id="form-adjust-steps" style="display:grid;gap:16px;margin-top:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">📅 Fecha seleccionada</span>
          <input type="date" id="inp-target-date" value="${targetDate}" class="input" style="padding:10px;border-radius:10px;font-size:13px;font-weight:600">
        </label>
        
        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">👟 Número de pasos</span>
          <input type="number" id="inp-steps" name="steps" min="0" max="100000" step="1" 
            value="${currentVal > 0 ? currentVal : ""}" placeholder="Ej. 10000" required autofocus 
            style="font-size:16px;font-weight:700;padding:10px;border-radius:10px;text-align:center">
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">🏋️‍♂️ Gimnasio</span>
          <select id="sel-gym" class="input" style="padding:10px;border-radius:10px;font-size:13px;font-weight:600">
            <option value="descanso"${!existingGym ? " selected" : ""}>💤 Descanso (0 min)</option>
            <option value="60"${existingGym && (existingGym.minutes || 60) === 60 ? " selected" : ""}>🏋️‍♂️ 60 min (Fuerza)</option>
            <option value="75"${existingGym && existingGym.minutes === 75 ? " selected" : ""}>🏋️‍♂️ 75 min (Fuerza)</option>
            <option value="90"${existingGym && existingGym.minutes === 90 ? " selected" : ""}>🏋️‍♂️ 90 min (Fuerza)</option>
            <option value="45"${existingGym && existingGym.minutes === 45 ? " selected" : ""}>🏋️‍♂️ 45 min (Fuerza)</option>
          </select>
        </label>

        <label class="field" style="display:flex;flex-direction:column;gap:6px">
          <span style="font-size:12px;color:var(--muted)">⚡ Deporte / Actividad</span>
          <select id="sel-sport" class="input" style="padding:10px;border-radius:10px;font-size:13px;font-weight:600">
            <option value="no"${!existingWalk && !existingOther ? " selected" : ""}>Sin deporte</option>
            <option value="walk-60"${existingWalk && existingWalk.minutes === 60 ? " selected" : ""}>🚶‍♂️ Paseo / Caminata (60m)</option>
            <option value="walk-45"${existingWalk && existingWalk.minutes === 45 ? " selected" : ""}>🚶‍♂️ Paseo / Caminata (45m)</option>
            <option value="run-30"${existingOther && existingOther.sport === "correr" ? " selected" : ""}>🏃‍♂️ Running (30m)</option>
            <option value="futbol-90"${existingOther && (existingOther.sport === "futbol" || existingOther.type === "futbol") ? " selected" : ""}>⚽ Fútbol (90m)</option>
            <option value="boxeo-60"${existingOther && existingOther.sport === "boxeo" ? " selected" : ""}>🥊 Boxeo (60m)</option>
          </select>
        </label>
      </div>

      <div class="btn-row" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit" style="background:linear-gradient(135deg, #FA114F, #FF5252);border:none;color:#fff;font-weight:700">💾 Guardar en memoria</button>
      </div>
    </form>
  `, {
    onOpen: s => {
      const inp = s.querySelector("#inp-steps");
      inp?.focus();
      inp?.select();
      s.querySelector("#form-adjust-steps")?.addEventListener("submit", e => {
        e.preventDefault();
        const saveDate = s.querySelector("#inp-target-date")?.value || targetDate;
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
          setHabitValue(st, h.id, saveDate, val);

          // Manejar Gimnasio
          st.habits.workouts ||= [];
          if (gymChoice === "descanso") {
            st.habits.workouts = st.habits.workouts.filter(w => !(w.date === saveDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym")));
          } else {
            const min = parseInt(gymChoice, 10) || 60;
            const wIdx = st.habits.workouts.findIndex(w => w.date === saveDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
            if (wIdx >= 0) {
              st.habits.workouts[wIdx].minutes = min;
              st.habits.workouts[wIdx].type = "gym";
              st.habits.workouts[wIdx].sport = "gym";
              st.habits.workouts[wIdx].title = "Entrenamiento de fuerza (Hevy)";
            } else {
              st.habits.workouts.push({ id: `wo-gym-${saveDate}`, date: saveDate, type: "gym", sport: "gym", title: "Entrenamiento de fuerza (Hevy)", minutes: min, exercises: [], note: "Registrado desde Hevy / Salud", source: "salud" });
            }
          }

          // Manejar Deporte y Actividades
          const walkIdx = st.habits.workouts.findIndex(w => w.date === saveDate && (w.type === "deporte" || w.sport === "andar"));
          const otherSportIdx = st.habits.workouts.findIndex(w => w.date === saveDate && (w.type === "deporte" || w.type === "futbol") && w.sport !== "andar");

          if (sportChoice === "no") {
            st.habits.workouts = st.habits.workouts.filter(w => !(w.date === saveDate && (w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym"))));
          } else if (sportChoice.startsWith("walk-")) {
            const min = parseInt(sportChoice.split("-")[1], 10) || 45;
            if (walkIdx >= 0) {
              st.habits.workouts[walkIdx].minutes = min;
              st.habits.workouts[walkIdx].title = min >= 60 ? "Caminata al aire libre" : "Paseo / Caminata";
            } else {
              st.habits.workouts.push({ id: `wo-walk-${saveDate}`, date: saveDate, type: "deporte", sport: "andar", title: min >= 60 ? "Caminata al aire libre" : "Paseo / Caminata", minutes: min, note: "Salud / Xiaomi", source: "salud" });
            }
          } else if (sportChoice === "run-30") {
            if (otherSportIdx >= 0) {
              st.habits.workouts[otherSportIdx].minutes = 30;
              st.habits.workouts[otherSportIdx].sport = "correr";
              st.habits.workouts[otherSportIdx].title = "Running";
            } else {
              st.habits.workouts.push({ id: `wo-run-${saveDate}`, date: saveDate, type: "deporte", sport: "correr", title: "Running", minutes: 30, note: "Salud", source: "salud" });
            }
          } else if (sportChoice === "futbol-90") {
            if (otherSportIdx >= 0) {
              st.habits.workouts[otherSportIdx].minutes = 90;
              st.habits.workouts[otherSportIdx].sport = "futbol";
              st.habits.workouts[otherSportIdx].type = "futbol";
              st.habits.workouts[otherSportIdx].title = "Fútbol";
            } else {
              st.habits.workouts.push({ id: `wo-futbol-${saveDate}`, date: saveDate, type: "futbol", sport: "futbol", title: "Fútbol", minutes: 90, note: "Partido", source: "salud" });
            }
          } else if (sportChoice === "boxeo-60") {
            if (otherSportIdx >= 0) {
              st.habits.workouts[otherSportIdx].minutes = 60;
              st.habits.workouts[otherSportIdx].sport = "boxeo";
              st.habits.workouts[otherSportIdx].title = "Boxeo";
            } else {
              st.habits.workouts.push({ id: `wo-boxeo-${saveDate}`, date: saveDate, type: "deporte", sport: "boxeo", title: "Boxeo", minutes: 60, note: "Entrenamiento", source: "salud" });
            }
          }
        });

        fitUI.selectedDate = saveDate;
        closeSheet();
        toast(`Guardado en memoria: ${val.toLocaleString("es-ES")} pasos · ${shortDate(saveDate)}`);
        window.dispatchEvent(new Event("pv:render"));
      });
    }
  });
}

// Navegación interactiva de fechas de actividad: actualización 100% estática sin saltos de la barra
function selectFitnessDate(root, newDate) {
  fitUI.selectedDate = newDate;
  try { sessionStorage.setItem("pv_fit_selected_date", newDate); } catch {}

  const bento = root.querySelector(".fitness-bento") || document.querySelector(".fitness-bento");
  const strip = bento?.querySelector(".fitness-days-strip");
  const currentScrollLeft = strip ? strip.scrollLeft : null;

  if (bento) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = healthCard(getState());
    const newBento = tempDiv.firstElementChild;
    bento.replaceWith(newBento);

    const newStrip = newBento.querySelector(".fitness-days-strip");
    if (newStrip && currentScrollLeft !== null) {
      newStrip.scrollLeft = currentScrollLeft;
    }
    return;
  }

  window.dispatchEvent(new Event("pv:render"));
}

// ---------- Modal Centro de Sincronización (Salud, Xiaomi y Hevy)
export function openSyncCenterModal(state) {
  const isCloudOn = syncConfigured();
  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "")) || { id: "hb-pasos-salud", name: "Pasos", target: 10000 };
  const today = iso();

  // Auditoría de los últimos 7 días
  const auditDays = [];
  for (let offset = 0; offset >= -6; offset--) {
    const dStr = iso(addDays(new Date(), offset));
    const steps = habitValue(state, stepHabit, dStr) || 0;
    const allW = (state.habits.workouts || []).filter(w => w.date === dStr);
    const gymW = allW.filter(w => (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym") && !/camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const gymMin = gymW.reduce((s, w) => s + (w.minutes || 0), 0);
    const sportW = allW.filter(w => w.type === "deporte" || w.type === "futbol" || (w.sport && w.sport !== "gym") || /camin|andar|paseo|walk/i.test((w.title || "") + " " + (w.note || "")));
    const sportMin = sportW.reduce((s, w) => s + (w.minutes || 0), 0);

    const isCurrentDay = dStr === today;
    const isSynced = steps > 0 || gymMin > 0 || sportMin > 0;

    auditDays.push({
      date: dStr,
      label: isCurrentDay ? "Hoy" : (offset === -1 ? "Ayer" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(dStr))),
      steps,
      gymMin,
      sportMin,
      isSynced,
      isCurrentDay
    });
  }

  const pendingDays = auditDays.filter(d => !d.isCurrentDay && !d.isSynced);

  openSheet(`
    <div class="sync-center-modal">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <h2 style="display:flex;align-items:center;gap:8px;font-size:18px;margin:0">
          <span style="color:#FA114F">🔄</span> Centro de Sincronización
        </h2>
        <span class="badge ${isCloudOn ? "active" : "muted"}" style="font-size:11px;padding:3px 8px;border-radius:6px">
          ${isCloudOn ? "☁️ Nube conectada" : "📱 Modo local"}
        </span>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:14px">
        Gestiona la carga de pasos de Xiaomi / Apple Salud y los entrenos de fuerza de Hevy. Los datos se guardan directamente en la base de datos persistente.
      </p>

      <!-- 1. Diagnóstico y Nube -->
      <div class="sync-card-block" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:12px;font-weight:700;color:#fff">Estado de sincronización</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(statusText())}</div>
          </div>
          <button class="btn small primary" type="button" id="btn-sync-now" style="background:linear-gradient(135deg, #FA114F, #FF5252);border:none;color:#fff;font-weight:700">
            🔄 Sincronizar ahora
          </button>
        </div>
      </div>

      <!-- 2. Auditoría últimos 7 días -->
      <div class="sync-card-block" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700;color:#fff">📅 Auditoría últimos 7 días</div>
          ${pendingDays.length > 0 ? `
            <button class="btn small" type="button" id="btn-autofill-pending" style="font-size:11px;padding:3px 8px;color:#A1F524;border-color:rgba(161,245,36,0.3)">
              ⚡ Rellenar pendientes
            </button>
          ` : `
            <span style="font-size:11px;color:#A1F524;font-weight:700">✓ Todos al día</span>
          `}
        </div>

        <div class="sync-days-list" style="display:flex;flex-direction:column;gap:6px">
          ${auditDays.map(d => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:8px;background:${d.isCurrentDay ? "rgba(250,17,79,0.08)" : "rgba(255,255,255,0.02)"};border:1px solid ${d.isCurrentDay ? "rgba(250,17,79,0.2)" : "rgba(255,255,255,0.04)"}">
              <div style="display:flex;flex-direction:column">
                <span style="font-size:12px;font-weight:700;color:${d.isCurrentDay ? "#FA114F" : "#fff"}">
                  ${esc(d.label)} <small style="color:var(--muted);font-weight:normal">(${shortDate(d.date)})</small>
                </span>
                <span style="font-size:10.5px;color:var(--muted);margin-top:1px">
                  👟 ${d.steps.toLocaleString("es-ES")} pasos · 🏋️ ${d.gymMin ? `${d.gymMin}m gym` : "descanso"} · ⚡ ${d.sportMin ? `${d.sportMin}m deporte` : "sin dep."}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:${d.isSynced ? "rgba(161,245,36,0.15);color:#A1F524" : "rgba(255,149,0,0.15);color:#FF9500"}">
                  ${d.isSynced ? "✓ Registrado" : (d.isCurrentDay ? "En progreso" : "⚠️ Sin datos")}
                </span>
                <button class="pill-btn" type="button" data-sync-edit-date="${d.date}" style="padding:2px 8px;font-size:11px" title="Ajustar datos de este día">
                  ✏️
                </button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- 3. Importación Directa Hevy (CSV) -->
      <div class="sync-card-block" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:4px">🏋️ Importar entrenos de Hevy (CSV)</div>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px">
          Sube tu exportación de Hevy (Perfil → Ajustes → Exportar datos) para registrar todas tus sesiones de fuerza en el calendario de raíz.
        </p>
        <input type="file" id="inp-hevy-csv" accept=".csv" style="display:none">
        <button class="btn small" type="button" id="btn-trigger-hevy-file" style="display:flex;align-items:center;gap:6px;font-weight:600">
          📁 Seleccionar archivo CSV de Hevy
        </button>
      </div>

      <!-- 4. Enlace directo de sincronización rápida -->
      <div class="sync-card-block" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px">
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:4px">📲 Sincronización instantánea vía URL / Atajo</div>
        <p style="font-size:11px;color:var(--muted);margin-bottom:6px">
          Puedes enviar pasos y entrenos directamente abriendo la app con estos parámetros (compatible con Atajos de iOS):
        </p>
        <code style="display:block;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.4);color:#00F0FF;font-size:10.5px;word-break:break-all;margin-bottom:8px">
          https://hugogs1.github.io/panel-de-vida/#sync?pasos=10500&fecha=hoy&gym=60
        </code>
        <div style="display:flex;gap:6px">
          <button class="btn small" type="button" id="btn-copy-sync-url" style="font-size:11px">📋 Copiar enlace</button>
          <a class="btn small link-btn" href="#ajustes" style="font-size:11px" data-close>Ir a Guía de Atajos →</a>
        </div>
      </div>
    </div>
  `, {
    onOpen: sheet => {
      // 1. Sincronizar nube ahora
      sheet.querySelector("#btn-sync-now")?.addEventListener("click", async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "Sincronizando…";
        try {
          await syncNow();
          toast("Sincronización completada con éxito");
          closeSheet();
        } catch (err) {
          toast(err.message || "Error al sincronizar con la nube", { error: true });
          btn.disabled = false;
          btn.textContent = "🔄 Reintentar";
        }
      });

      // 2. Rellenar días pendientes automáticamente
      sheet.querySelector("#btn-autofill-pending")?.addEventListener("click", () => {
        update(st => {
          let h = st.habits.habits.find(x => x.id === "hb-pasos-salud" || /paso/i.test(x.name || ""));
          if (!h) {
            h = { id: "hb-pasos-salud", name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: iso() };
            st.habits.habits.push(h);
          }
          pendingDays.forEach(pd => {
            setHabitValue(st, h.id, pd.date, 10450);
            const hasGym = st.habits.workouts.some(w => w.date === pd.date && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
            if (!hasGym) {
              st.habits.workouts.push({
                id: `wo-gym-${pd.date}`,
                date: pd.date,
                type: "gym",
                sport: "gym",
                title: "Entrenamiento de fuerza (Hevy)",
                minutes: 60,
                exercises: [],
                note: "Registrado desde sincronización",
                source: "salud"
              });
            }
          });
        });
        toast(`✅ Se han completado ${pendingDays.length} días pendientes en memoria`);
        closeSheet();
      });

      // 3. Botones para ajustar días individuales
      sheet.querySelectorAll("[data-sync-edit-date]").forEach(b => {
        b.addEventListener("click", () => {
          const d = b.dataset.syncEditDate;
          closeSheet();
          openAdjustStepsModal(getState(), d);
        });
      });

      // 4. File input Hevy CSV
      const fileInp = sheet.querySelector("#inp-hevy-csv");
      sheet.querySelector("#btn-trigger-hevy-file")?.addEventListener("click", () => fileInp?.click());
      fileInp?.addEventListener("change", async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const txt = await file.text();
          const workouts = parseHevy(txt);
          let res = null;
          update(st => { res = applyHevy(st, workouts); });
          toast(`✅ ¡Hevy sincronizado! ${res.total} entrenos procesados (${res.added} nuevos)`, { ms: 5000 });
          closeSheet();
        } catch (err) {
          toast(err.message || "Error al procesar el archivo CSV de Hevy", { error: true, ms: 5000 });
        }
      });

      // 5. Copiar enlace de ejemplo
      sheet.querySelector("#btn-copy-sync-url")?.addEventListener("click", () => {
        const url = `${location.origin}${location.pathname}#sync?pasos=10500&fecha=hoy&gym=60`;
        navigator.clipboard.writeText(url).then(() => {
          toast("Enlace copiado al portapapeles");
        }).catch(() => {
          toast("No se pudo copiar el enlace", { error: true });
        });
      });
    }
  });
}


export function mount(root, _state, signal) {
  // Escuchar cambios en el desplegable de días
  root.addEventListener("change", e => {
    const sel = e.target.closest("[data-act=fit-dropdown-select]");
    if (sel) {
      selectFitnessDate(root, sel.value);
    }
  }, { signal });

  // Posicionar la barra solo al cargar inicialmente la app, sin ninguna animación
  const strip = root.querySelector(".fitness-days-strip");
  if (strip && !strip.dataset.initScroll) {
    strip.dataset.initScroll = "true";
    const activeChip = strip.querySelector(".fit-day-chip.selected") || strip.querySelector(".fit-day-chip.is-today");
    if (activeChip) {
      const left = activeChip.offsetLeft - (strip.clientWidth - activeChip.clientWidth) / 2;
      strip.scrollLeft = Math.max(0, left);
    }
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
      if (fitBtn.dataset.act === "fit-prev-day") {
        const cur = fitUI.selectedDate || iso();
        selectFitnessDate(root, iso(addDays(parseISO(cur), -1)));
        return;
      }
      if (fitBtn.dataset.act === "fit-next-day") {
        const cur = fitUI.selectedDate || iso();
        selectFitnessDate(root, iso(addDays(parseISO(cur), 1)));
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
      if (fitBtn.dataset.act === "fit-tomorrow") {
        selectFitnessDate(root, iso(addDays(new Date(), 1)));
        return;
      }
      if (fitBtn.dataset.act === "fit-monthly") {
        openMonthlyFitnessSheet(getState(), fitUI.summaryYm || iso().slice(0, 7));
        return;
      }
      if (fitBtn.dataset.act === "fit-sync-center") {
        openSyncCenterModal(getState());
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