// Tendencia del peso (media de 7 días) y tarjeta «Peso vs calorías», para Cuerpo y Nutrición.

import { int } from "../ui.js";
import { parseISO, addDays } from "../stats.js";
import { trendChart } from "../charts.js";
import { weightTrend, nutritionWeeks, maintenance } from "../trends.js";

const num1 = n => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
const kg1 = n => `${num1(n)} kg`;
const signedKg = d => `${d > 0.04 ? "+" : d < -0.04 ? "−" : "±"}${num1(Math.abs(d))} kg`;
const tone = d => d < -0.04 ? "var(--fin)" : d > 0.04 ? "var(--agenda)" : "var(--muted)";
const shortDate = d => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(d).replace(".", "");

/** Gráfica de peso con media de 7 días y el cambio en 7 y 30 días (pestaña Cuerpo) */
export function weightTrendBlock(state) {
  const tr = weightTrend(state, 90);
  if (tr.points.length < 2) return "";
  const perWeek = tr.change30 != null ? tr.change30 / 30 * 7 : null;
  return `
    <div class="week-stats">
      <div><b class="num" style="color:var(--hab)">${kg1(tr.last.avg)}</b><small>media de 7 días</small></div>
      <div><b class="num" style="color:${tr.change7 != null ? tone(tr.change7) : ""}">${tr.change7 != null ? signedKg(tr.change7) : "—"}</b><small>en 7 días</small></div>
      <div><b class="num" style="color:${tr.change30 != null ? tone(tr.change30) : ""}">${tr.change30 != null ? signedKg(tr.change30) : "—"}</b><small>en 30 días</small></div>
    </div>
    ${trendChart(tr.points, { color: "#e88fb4", format: kg1, from: tr.points[0].date, to: tr.today })}
    <div class="legend"><span style="--c:var(--hab)">Media de 7 días</span><span class="dot-faint">Peso de cada día</span>${perWeek != null ? `<span class="no-dot">Ritmo: <b class="num" style="color:${tone(perWeek)}">${signedKg(perWeek)}/semana</b></span>` : ""}</div>`;
}

/** Tarjeta «Peso vs calorías»: semanas con kcal y proteína medias, cambio de peso y mantenimiento estimado */
export function nutriWeightCard(state) {
  const weeks = nutritionWeeks(state, 6);
  if (!weeks.some(w => w.kcal != null) || !weeks.some(w => w.weight != null)) return `
    <section class="card">
      <h2 class="card-h">Peso vs calorías</h2>
      <div class="empty">Aquí verás, semana a semana, tus calorías medias de Foodvisor junto a cómo cambia tu peso. Hace falta que lleguen calorías y que apuntes el peso.</div>
    </section>`;
  const mt = maintenance(weeks);
  return `
    <section class="card">
      <h2 class="card-h">Peso vs calorías</h2>
      <div class="nw-table" role="table">
        <div class="nw-row head" role="row"><span>Semana</span><span>kcal/día</span><span>Proteína</span><span>Peso</span></div>
        ${weeks.map(w => `
        <div class="nw-row${w.current ? " cur" : ""}" role="row">
          <span>${w.current ? "Esta" : `${shortDate(parseISO(w.start))}–${shortDate(addDays(parseISO(w.start), 6))}`}</span>
          <span class="num">${w.kcal != null ? int(w.kcal) : "—"}${w.kcal != null && w.kcalDays < 7 ? `<small>${w.kcalDays} d</small>` : ""}</span>
          <span class="num">${w.protein != null ? `${int(w.protein)} g` : "—"}</span>
          <span class="num" style="color:${w.delta != null ? tone(w.delta) : ""}">${w.delta != null ? signedKg(w.delta) : w.weight != null ? kg1(w.weight) : "—"}</span>
        </div>`).join("")}
      </div>
      ${mt ? `<div class="kv big"><span>Mantenimiento estimado</span><b class="num">≈ ${int(mt.kcal)} kcal/día</b></div>
      <p class="hint">Calculado con ${mt.weeks} semanas: calorías medias menos lo que cambió tu peso (1 kg ≈ 7.700 kcal). Es aproximado y mejora con más semanas completas.</p>`
      : `<p class="hint">El cambio de peso compara la media de cada semana con la anterior. Con 2 semanas de calorías (al menos 4 días cada una) y peso, verás tus calorías de mantenimiento estimadas.</p>`}
    </section>`;
}
