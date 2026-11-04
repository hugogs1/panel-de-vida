// Menú lateral para pantallas anchas (ordenador). En el móvil se oculta y se usa la barra inferior.

import { AREAS, ACHIEVEMENTS, levelFromXp, titleFor } from "./game.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { openQuickAdd } from "./quickadd.js";

// Atajos 1-5 en el mismo orden que el menú
export const SHORTCUT_ROUTES = ["resumen", "finanzas", "trabajo", "habitos", "agenda"];

export function renderSidebar(state, route) {
  const el = document.getElementById("sidebar");
  const lv = levelFromXp(state.game.xp);
  const link = (r, ico, label, extra = "", c = null, key = null) => `
    <a class="nav" href="#${r}"${route === r ? ' aria-current="page"' : ""}${c ? ` style="--c:${c}"` : ""}>
      ${ico}<span class="nav-label">${label}</span>${extra}${key ? `<kbd>${key}</kbd>` : ""}
    </a>`;
  el.innerHTML = `
    <a class="brand" href="#resumen">
      <span class="logo" aria-hidden="true">PV</span>
      <span class="brand-t"><b>${esc(state.profile.alias)}</b><small>${titleFor(lv.level)} · Nv. ${lv.level}</small></span>
    </a>
    <button class="btn primary side-new" type="button" id="side-new">${icon.plus} Nuevo <kbd>N</kbd></button>
    <nav class="side-nav">
      ${link("resumen", icon.home, "Resumen", "", null, "1")}
      ${Object.values(AREAS).map((a, i) => link(a.route, icon[a.key], a.short, `<span class="nav-lv">Nv. ${levelFromXp(state.game.areaXp[a.key] || 0).level}</span>`, a.color, String(i + 2))).join("")}
      ${link("logros", icon.trophy, "Logros", `<span class="nav-lv">${(state.game.achievements || []).length}/${ACHIEVEMENTS.length}</span>`)}
    </nav>
    <div class="side-bottom">
      ${link("ajustes", icon.gear, "Ajustes")}
      <div class="side-status" id="side-status"></div>
    </div>`;
  el.querySelector("#side-new").onclick = openQuickAdd;
}
