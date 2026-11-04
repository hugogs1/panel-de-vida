// Cabecera común de las 4 áreas y plantilla provisional mientras se construyen.

import { AREAS, levelFromXp } from "../game.js";
import { int } from "../ui.js";
import { icon } from "../icons.js";

export const homeBtn = () => `<a class="icon-btn home-btn" href="#resumen" aria-label="Volver al inicio">${icon.home}</a>`;

export function areaHeader(state, key) {
  const a = AREAS[key];
  const lv = levelFromXp(state.game.areaXp[key] || 0);
  return `
    <header class="area-head" style="--c:${a.color}">
      <div class="row">
        ${homeBtn()}
        <h1>${a.name}</h1>
        <span class="lv">Nv. ${lv.level}</span>
      </div>
      <div class="mini" style="margin-top:0"><i style="width:${lv.pct}%"></i></div>
      <div class="xpmeta"><span>XP de ${a.short.toLowerCase()}</span><span class="num">${int(lv.into)} / ${int(lv.need)}</span></div>
    </header>`;
}

export function placeholder(state, key, phase, items) {
  const a = AREAS[key];
  return `
    ${areaHeader(state, key)}
    <section class="card" style="--c:${a.color}">
      <h2 class="card-h">En construcción · fase ${phase}</h2>
      <ul class="roadmap">${items.map(i => `<li>${i}</li>`).join("")}</ul>
    </section>`;
}
