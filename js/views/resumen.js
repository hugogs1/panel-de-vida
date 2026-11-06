// Pantalla Principal: Agenda Diaria, Bento Grid, Pulso de Salud y Cartera Inteligente.

import { AREAS, levelFromXp, titleFor } from "../game.js";
import { esc, int, money as eur, longDate, monthName, toast } from "../ui.js";
import { icon } from "../icons.js";
import { backupDue } from "../backup.js";
import { update } from "../state.js";
import { todayItems, streak, iso, parseISO, addDays } from "../stats.js";
import { habitsToday, habitValue, setHabitValue, AUTO_LABEL } from "../habits.js";
import { toggleTask } from "../agenda.js";
import { ring, fitnessDial, fitnessActivityRings } from "../charts.js";
import { getWalletBudget } from "../finance.js";
import { weeklyBanner, closeWeekly } from "./semana.js";

const PRI = { alta: ["Alta", "var(--danger)"], media: ["Media", "var(--agenda)"], baja: ["Baja", "var(--muted)"] };
const num1 = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n);
const signed = n => n > 0 ? `+${eur(n)}` : eur(n);

const fitUI = { selectedDate: null };

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
  const { pending, done, total } = todayItems(state);
  const events = state.agenda.events.filter(e => e.date === iso()).sort((a, b) => (a.allDay ? "00" : a.start.slice(11)).localeCompare(b.allDay ? "00" : b.start.slice(11)));

  const header = `
    <h2 class="card-h">
      <span class="h-dot" style="--c:var(--agenda)"></span>Agenda · Hoy
      <span class="spacer"></span>
      ${total ? `<span class="count num">${done.length}/${total}</span>` : ""}
      <a href="#agenda">Abrir agenda →</a>
    </h2>`;

  return `
    <section class="card bento-card today-agenda-card">
      ${header}

      <!-- Eventos de hoy -->
      ${events.length ? `
        <div class="today-events-box">
          <span class="sub-label">Eventos programados hoy</span>
          <div class="list tight">${events.map(e => `
            <a class="item tap today-ev-item" href="#agenda">
              <span class="ev-time num">${e.allDay ? "Todo el día" : e.start.slice(11, 16)}</span>
              <span class="t"><b>${esc(e.title)}</b>${e.place ? `<small>📍 ${esc(e.place)}</small>` : ""}</span>
            </a>`).join("")}
          </div>
        </div>
      ` : ""}

      <!-- Tareas pendientes de hoy -->
      <div class="today-tasks-box">
        <span class="sub-label">${pending.length ? "Tareas para hoy" : "Sin tareas pendientes para hoy"}</span>
        ${pending.length ? `
          <div class="list tight">${pending.slice(0, 6).map(t => `
            <div class="item task">
              <button class="tick-btn" type="button" data-task="${t.id}" aria-label="Completar ${esc(t.title)}"><span class="tick" style="--c:${PRI[t.priority]?.[1] || "var(--agenda)"}">${icon.check}</span></button>
              <span class="t">${esc(t.title)}${t.time ? `<small>${t.time}</small>` : ""}</span>
              ${t.priority === "alta" ? `<span class="tag" style="--c:var(--danger)">Alta</span>` : ""}
            </div>`).join("")}
          </div>
        ` : `
          <div class="today-all-done">
            <span class="done-check">✓</span>
            <p>¡Todo al día! No tienes tareas pendientes hoy.</p>
          </div>
        `}
      </div>

      <div class="card-footer-link">
        <a class="btn small" href="#agenda">Gestionar agenda y eventos →</a>
      </div>
    </section>`;
}

// ---------- 2. Tarjeta de Salud y Diales Fitness (Pasos y Gimnasio)
function healthCard(state) {
  const today = iso();
  const yesterday = iso(addDays(new Date(), -1));
  const activeDate = fitUI.selectedDate || today;
  const isToday = activeDate === today;
  const isYesterday = activeDate === yesterday;

  // Hábito de pasos
  const stepHabit = state.habits.habits.find(h => h.id === "hb-pasos-salud" || /paso/i.test(h.name || "") || /paso/i.test(h.unit || ""))
    || { id: "hb-pasos-salud", name: "Pasos", target: 10000, unit: "pasos" };
  const stepVal = habitValue(state, stepHabit, activeDate) || 0;
  const stepTgt = stepHabit.target || 10000;
  const stepPct = Math.round((stepVal / stepTgt) * 100);
  const stepKm = (stepVal * 0.00075).toFixed(1);
  const stepKcal = Math.round(stepVal * 0.04);
  const stepRemaining = Math.max(0, stepTgt - stepVal);

  // Entrenos de Gimnasio en activeDate
  const gymWorkouts = (state.habits.workouts || []).filter(w => w.date === activeDate && (w.type === "gym" || !w.type));
  const gymMinutes = gymWorkouts.reduce((s, w) => s + (w.minutes || 0), 0);
  const gymDone = gymWorkouts.length > 0;
  const gymPct = gymDone ? Math.max(100, Math.round((gymMinutes / 60) * 100)) : 0;
  const gymTitle = gymWorkouts[0]?.title || (gymDone ? "Entreno completado" : "Día de descanso");

  // Tira de los últimos 7 días
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const dStr = iso(addDays(new Date(), i - 6));
    const dVal = habitValue(state, stepHabit, dStr) || 0;
    const dPct = Math.round((dVal / stepTgt) * 100);
    const dGym = (state.habits.workouts || []).some(w => w.date === dStr && (w.type === "gym" || !w.type));
    const dateObj = parseISO(dStr);
    const dNum = dateObj.getDate();
    let name = new Intl.DateTimeFormat("es-ES", { weekday: "narrow" }).format(dateObj).toUpperCase();
    if (dStr === today) name = "Hoy";
    else if (dStr === yesterday) name = "Ayer";
    return {
      date: dStr,
      name,
      dayNum: dNum,
      stepsPct: dPct,
      gymPct: dGym ? 100 : 0,
      isSelected: dStr === activeDate
    };
  });

  const activeDateLabel = isToday ? "Hoy" : (isYesterday ? "Ayer" : new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(parseISO(activeDate)));

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
          <button class="pill-btn${isYesterday ? " active" : ""}" type="button" data-act="fit-yesterday">Ayer</button>
          <button class="pill-btn${isToday ? " active" : ""}" type="button" data-act="fit-today">Hoy</button>
        </div>
      </div>

      <!-- Tira interactiva de días con mini-anillos de actividad Apple Fitness -->
      <div class="fitness-days-strip">
        ${last7Days.map(d => `
          <button class="fit-day-chip${d.isSelected ? " selected" : ""}" type="button" 
            data-act="fit-select-day" data-date="${d.date}" aria-label="Ver actividad del ${d.name} ${d.dayNum}">
            <span class="fit-d-name">${d.name}</span>
            <div class="fit-mini-ring">
              ${fitnessActivityRings({ movePct: d.stepsPct, exercisePct: d.gymPct, size: 34, stroke: 4, gap: 2 })}
            </div>
            <span class="fit-d-num num">${d.dayNum}</span>
          </button>
        `).join("")}
      </div>

      <!-- Diales principales estilo Apple Fitness -->
      <div class="fitness-dials-row">
        <!-- Dial 1: Pasos (Movimiento) -->
        <div class="fitness-dial-card steps-card">
          <div class="fdc-header">
            <span class="fdc-badge" style="--c:#FA114F">👟 Pasos</span>
            <span class="fdc-target num">${num1(stepVal)} / ${num1(stepTgt)}</span>
          </div>
          <div class="fdc-body">
            ${fitnessDial({
              pct: stepPct,
              kind: "steps",
              size: 104,
              stroke: 10,
              icon: "👟",
              label: stepPct >= 100 ? "¡Superado!" : `${num1(stepRemaining)} rest.`
            })}
            <div class="fdc-stats">
              <div class="fdc-stat"><small>Distancia</small><b class="num">${stepKm} km</b></div>
              <div class="fdc-stat"><small>Energía</small><b class="num">${stepKcal} kcal</b></div>
            </div>
          </div>
        </div>

        <!-- Dial 2: Gimnasio (Ejercicio) -->
        <div class="fitness-dial-card gym-card">
          <div class="fdc-header">
            <span class="fdc-badge" style="--c:#A1F524">🏋️ Gimnasio</span>
            <span class="fdc-target">${gymDone ? `${gymMinutes} min` : "Descanso"}</span>
          </div>
          <div class="fdc-body">
            ${fitnessDial({
              pct: gymPct,
              kind: "gym",
              size: 104,
              stroke: 10,
              icon: "🏋️",
              label: gymDone ? "Entrenado" : (isToday ? "Pendiente" : "Descanso")
            })}
            <div class="fdc-stats">
              <div class="fdc-stat"><small>Tiempo</small><b class="num">${gymMinutes} min</b></div>
              <div class="fdc-stat"><small>Sesión</small><b class="truncate" title="${esc(gymTitle)}">${esc(gymTitle)}</b></div>
            </div>
          </div>
        </div>
      </div>

      ${!isToday ? `
        <div class="fitness-viewing-alert">
          <span>📅 Viendo datos de <b>${esc(activeDateLabel)}</b></span>
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

// ---------- Interacción: marcar tareas, hábitos y navegar fitness
export function mount(root, _state, signal) {
  root.addEventListener("click", e => {
    const wc = e.target.closest("[data-act=weekly-close]");
    if (wc) { closeWeekly(wc.dataset.ws); toast("Lo tienes cuando quieras en «Semanas»"); return; }
    
    // Acciones de Fitness / Diales
    const fitBtn = e.target.closest("[data-act]");
    if (fitBtn) {
      if (fitBtn.dataset.act === "fit-select-day") {
        fitUI.selectedDate = fitBtn.dataset.date;
        window.dispatchEvent(new Event("pv:render"));
        return;
      }
      if (fitBtn.dataset.act === "fit-yesterday") {
        fitUI.selectedDate = iso(addDays(new Date(), -1));
        window.dispatchEvent(new Event("pv:render"));
        return;
      }
      if (fitBtn.dataset.act === "fit-today") {
        fitUI.selectedDate = null;
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
