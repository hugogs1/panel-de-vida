// Logros: nivel y títulos, XP por área, logros desbloqueados y bloqueados, y tabla de XP.

import { AREAS, ACHIEVEMENTS, TITLES, XP_RULES, levelFromXp, titleFor, computeXP } from "../game.js";
import { esc, int } from "../ui.js";
import { icon } from "../icons.js";
import { homeBtn } from "./area.js";

const AREA_LABEL = { all: "General", ...Object.fromEntries(Object.values(AREAS).map(a => [a.key, a.name])) };
const AREA_COLOR = { all: "#7cc4e4", ...Object.fromEntries(Object.values(AREAS).map(a => [a.key, a.hex])) };
const fmtDate = d => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d));

export function render(state) {
  const { total, areas, stats } = computeXP(state);
  const lv = levelFromXp(total);
  const unlocked = new Map((state.game.achievements || []).map(a => [a.id, a.unlockedAt]));
  const nextTitle = TITLES.find(([l]) => l > lv.level);

  const achCard = a => {
    const at = unlocked.get(a.id);
    const [cur, goal] = a.progress(stats);
    const pct = Math.min(100, Math.round(Math.min(cur, goal) / goal * 100));
    return `<div class="ach${at ? " on" : ""}" style="--c:${AREA_COLOR[a.area]}">
      <span class="ach-ico">${at ? icon.trophy : icon.lock}</span>
      <span class="t"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        ${at ? `<small class="ach-date">Desbloqueado el ${fmtDate(at)}</small>`
          : goal > 1 ? `<span class="hb-track"><i style="width:${Math.max(2, pct)}%"></i></span><small class="num">${int(Math.min(cur, goal))} / ${int(goal)}</small>` : ""}
      </span>
    </div>`;
  };

  return `
    <header class="topbar">
      ${homeBtn()}
      <h1 class="page-h">Logros</h1>
      <span class="count-pill num">${unlocked.size}/${ACHIEVEMENTS.length}</span>
    </header>

    <section class="card player">
      <div class="player-top">
        <div class="lvl-badge"><small>Nivel</small><b class="num">${lv.level}</b></div>
        <div class="t">
          <b class="alias">${esc(state.profile.alias)}</b>
          <span class="ptitle">${titleFor(lv.level)}</span>
          <small class="num">${int(total)} XP en total</small>
        </div>
      </div>
      <div class="xpmeta" style="margin-top:12px"><span>Siguiente nivel</span><span class="num">${int(lv.into)} / ${int(lv.need)}</span></div>
      <div class="xpbar"><i style="width:${lv.pct}%"></i></div>
      ${nextTitle ? `<p class="hint" style="margin-top:8px">Próximo título: <b>${nextTitle[1]}</b> en el nivel ${nextTitle[0]}.</p>` : `<p class="hint" style="margin-top:8px">Has alcanzado el título máximo.</p>`}
      <div class="area-xp">${Object.values(AREAS).map(a => {
        const al = levelFromXp(areas[a.key]);
        return `<a href="#${a.route}" class="area-xp-row" style="--c:${a.color}">
          <span class="h-dot"></span><span class="name">${a.short}</span><b>Nv. ${al.level}</b>
          <span class="mini"><i style="width:${al.pct}%"></i></span><small class="num">${int(areas[a.key])} XP</small>
        </a>`;
      }).join("")}</div>
    </section>

    <section class="card">
      <h2 class="card-h">Títulos</h2>
      <div class="titles">${TITLES.map(([l, name]) => `<span class="title-step${lv.level >= l ? " on" : ""}${titleFor(lv.level) === name ? " cur" : ""}"><b>${name}</b><small>Nv. ${l}</small></span>`).join("")}</div>
    </section>

    ${["all", ...Object.keys(AREAS)].map(area => {
      const list = ACHIEVEMENTS.filter(a => a.area === area);
      const n = list.filter(a => unlocked.has(a.id)).length;
      // desbloqueados primero; los bloqueados, por cercanía
      list.sort((a, b) => (unlocked.has(b.id) - unlocked.has(a.id)) || (prog(b, stats) - prog(a, stats)));
      return `<section class="card">
        <h2 class="card-h"><span class="h-dot" style="--c:${AREA_COLOR[area]}"></span>${AREA_LABEL[area]}<span class="spacer"></span><span class="count num">${n}/${list.length}</span></h2>
        <div class="achs">${list.map(achCard).join("")}</div>
      </section>`;
    }).join("")}

    <section class="card">
      <h2 class="card-h">Cómo se gana XP</h2>
      <p class="hint" style="margin-top:8px">La experiencia se calcula a partir de lo que tienes apuntado. Si borras algo o desmarcas una tarea, la XP se ajusta sola.</p>
      ${Object.values(AREAS).map(a => `
        <div class="day-h" style="color:${a.hex}"><span>${a.name}</span></div>
        <div class="list tight">${XP_RULES.filter(r => r[0] === a.key).map(r => `<div class="kv"><span>${r[1]}</span><b class="num">+${r[2]}</b></div>`).join("")}</div>`).join("")}
      <p class="hint" style="margin-top:12px">Cada nivel pide 50 XP más que el anterior: 100 para pasar al 2, 150 para el 3, 200 para el 4…</p>
    </section>`;
}

const prog = (a, stats) => { const [c, g] = a.progress(stats); return Math.min(1, c / g); };
