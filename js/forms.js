// Piezas de formulario compartidas por todas las secciones.

/** Selector segmentado con radios: seg("type", { a: "Uno", b: "Dos" }, "a") */
export const seg = (name, options, value) => `<div class="seg-toggle" role="radiogroup">${Object.entries(options).map(([v, l]) =>
  `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}><span>${l}</span></label>`).join("")}</div>`;

/** Campo con etiqueta */
export const field = (label, id, inner) => `<div class="field"><label for="${id}">${label}</label>${inner}</div>`;

/** Muestra solo los [data-show] cuyo valor (lista separada por espacios) incluye `value` */
export function showFor(root, value) {
  root.querySelectorAll("[data-show]").forEach(el => { el.hidden = !el.dataset.show.split(" ").includes(value); });
}
