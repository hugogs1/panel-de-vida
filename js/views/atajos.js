// Siri y Salud: tarjeta de Ajustes y guía paso a paso para montar los Atajos del iPhone.

import { getState, update } from "../state.js";
import { openSheet, toast, esc } from "../ui.js";
import { field } from "../forms.js";
import { syncConfigured, shortcutConfig, sendInboxMessage, syncNow } from "../sync.js";

export function atajosCard(state) {
  if (!syncConfigured()) return `
    <section class="card">
      <h2 class="card-h">Siri y Salud</h2>
      <p class="hint" style="margin-top:8px">Para usar Siri y traer tus pasos de Salud, primero activa la <b>sincronización</b>: los Atajos del iPhone envían los datos a través de ella.</p>
    </section>`;
  const accs = state.finance.accounts;
  const sel = state.settings.inboxAccountId || accs[0]?.id || "";
  return `
    <section class="card">
      <h2 class="card-h">Siri y Salud</h2>
      <p class="hint" style="margin:8px 0 12px">Con los Atajos del iPhone puedes apuntar cosas hablando con Siri y traer tus pasos de Salud cada noche. Llegan a la app en la siguiente sincronización.</p>
      ${accs.length ? field("Cuenta para los gastos de Siri", "inbox-acc", `<select class="input" id="inbox-acc">${accs.map(a => `<option value="${a.id}"${a.id === sel ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>`) : `<p class="hint">Crea una cuenta en Finanzas para poder apuntar gastos con Siri.</p>`}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" type="button" id="atajos-guide">Cómo crear los Atajos</button>
        <button class="btn" type="button" id="atajos-test">Enviar mensaje de prueba</button>
      </div>
    </section>`;
}

export function mountAtajosCard(root) {
  root.querySelector("#inbox-acc")?.addEventListener("change", e => {
    update(s => { s.settings.inboxAccountId = e.target.value; });
    toast("Cuenta guardada");
  });
  root.querySelector("#atajos-guide")?.addEventListener("click", openGuide);
  root.querySelector("#atajos-test")?.addEventListener("click", async e => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await sendInboxMessage("tipo: tarea\ntitulo: Prueba de Siri (puedes borrarla)\nfecha: hoy");
      await syncNow();
      toast("Mensaje enviado y recibido: mira la tarea de prueba en Agenda", { ms: 4000 });
    } catch (err) { toast(err.message || "No se pudo enviar", { error: true, ms: 4000 }); }
    b.disabled = false;
  });
}

// ---------- Guía
const copyRow = (label, value, id) => `
  <div class="copy-row"><span class="t"><small>${label}</small><code id="${id}">${esc(value)}</code></span>
  <button class="btn small" type="button" data-copy="${id}">Copiar</button></div>`;

const shortcut = (name, siri, steps) => `
  <details class="sc">
    <summary><b>${name}</b>${siri ? `<small>«Oye Siri, ${siri}»</small>` : ""}</summary>
    <ol>${steps.map(s => `<li>${s}</li>`).join("")}</ol>
  </details>`;

const txt = lines => `<pre class="sc-text">${esc(lines)}</pre>`;
const send = `Acción <b>Ejecutar atajo</b> → elige <b>Enviar al Panel</b> → en <i>Entrada</i> pon la variable <b>Texto</b>.`;

function openGuide() {
  const c = shortcutConfig();
  const sheet = openSheet(`
    <h2>Crear los Atajos</h2>
    <p>Se hacen una sola vez en la app <b>Atajos</b> del iPhone. Los nombres de las acciones pueden variar un poco según tu versión de iOS. Empieza por «Enviar al Panel»: los demás lo usan.</p>
    <p class="hint">Importante: en los textos, lo que va entre corchetes, como <code>[Entrada solicitada]</code>, <b>no se escribe</b>. Es una <b>variable</b>: borra los corchetes y, en ese hueco, insértala desde la barra de variables que aparece encima del teclado. Debe verse como una cápsula de color.</p>
    <div class="copy-box">
      ${copyRow("Dirección (URL)", c.url, "cp-url")}
      ${copyRow("Valor de la cabecera Authorization (incluye tu token: no lo compartas)", c.auth, "cp-auth")}
    </div>

    ${shortcut("1 · Enviar al Panel (el principal)", "", [
      `Nuevo atajo → nómbralo <b>Enviar al Panel</b>. En sus ajustes (ⓘ) activa <b>Recibir</b> entradas de tipo <b>Texto</b> (de «Atajos»).`,
      `Acción <b>Formatear fecha</b>: fecha <b>Fecha actual</b>, formato <b>Personalizado</b>: <code>yyyyMMdd-HHmmss</code>.`,
      `Acción <b>Obtener contenido de URL</b>: pega la <b>Dirección</b> de arriba. Pulsa <i>Mostrar más</i>:
        <br>· <b>Método</b>: PATCH
        <br>· <b>Cabeceras</b>: añade <code>Authorization</code> con el <b>valor</b> copiado de arriba, y <code>Accept</code> con <code>application/vnd.github+json</code>
        <br>· <b>Cuerpo de la solicitud</b>: JSON → añade un campo <b>Diccionario</b> llamado <code>files</code>; dentro, otro <b>Diccionario</b> cuyo nombre sea <code>inbox-</code> + la variable <b>Fecha formateada</b> + <code>.txt</code>; dentro, un campo <b>Texto</b> llamado <code>content</code> con la variable <b>Entrada del atajo</b>.`,
      `(Opcional) Acción <b>Mostrar notificación</b>: «Enviado al panel».`
    ])}

    ${shortcut("2 · Apunta un gasto", "apunta un gasto", [
      `Nuevo atajo llamado <b>Apunta un gasto</b> (ese nombre es lo que le dirás a Siri).`,
      `<b>Solicitar entrada</b> de tipo <b>Número</b>: «¿Cuánto?». <b>Solicitar entrada</b> de tipo <b>Texto</b>: «¿En qué?».`,
      `Acción <b>Texto</b>, escribiendo las variables donde van:` + txt("tipo: gasto\nimporte: [Entrada solicitada 1]\nnota: [Entrada solicitada 2]"),
      send
    ])}

    ${shortcut("3 · Nueva tarea", "nueva tarea", [
      `<b>Solicitar entrada</b> de tipo Texto: «¿Qué tarea?».`,
      `<b>Elegir del menú</b> «¿Para cuándo?» con opciones <b>hoy</b>, <b>mañana</b> y <b>sin fecha</b>. En cada opción pon una acción <b>Texto</b> con:` + txt("tipo: tarea\ntitulo: [Entrada solicitada]\nfecha: hoy") + `(cambiando <code>hoy</code> por <code>mañana</code> o <code>ninguna</code>).`,
      `Después del menú: ${send.replace("la variable <b>Texto</b>", "la variable <b>Resultado del menú</b>")}`
    ])}

    ${shortcut("4 · Marcar un hábito", "he bebido agua", [
      `Un atajo por hábito, con el nombre de la frase que dirás (p. ej. <b>He bebido agua</b>, <b>He leído</b>).`,
      `Acción <b>Texto</b>:` + txt("tipo: habito\nnombre: Agua") + `El nombre debe coincidir (o estar incluido) en el de tu hábito. Si quieres una cantidad distinta a la del botón +, añade una línea <code>cantidad: 0,5</code>.`,
      send
    ])}

    ${shortcut("5 · Apunta tiempo de estudio o trabajo", "apunta estudio", [
      `<b>Solicitar entrada</b> de tipo Número: «¿Cuántas horas?».`,
      `Acción <b>Texto</b>:` + txt("tipo: tiempo\nclase: estudio\nhoras: [Entrada solicitada]") + `Para trabajo, otro atajo igual con <code>clase: trabajo</code>. Puedes añadir <code>proyecto: SQL</code>.`,
      send
    ])}

    ${shortcut("6 · Entrenos", "he ido al gimnasio", [
      `Atajo <b>He ido al gimnasio</b> con una acción <b>Texto</b>:` + txt("tipo: gimnasio\nminutos: 60"),
      `Atajo <b>He jugado al fútbol</b> con:` + txt("tipo: futbol\nminutos: 90") + `Para un partido, añade <code>partido: sí</code>.`,
      send
    ])}

    ${shortcut("7 · Pasos de Salud (automático cada noche)", "", [
      `Crea un atajo <b>Pasos al Panel</b>: acción <b>Buscar muestras de salud</b> → tipo <b>Pasos</b>, <i>Fecha de inicio</i> es <b>Hoy</b>.`,
      `Acción <b>Calcular estadísticas</b> → <b>Suma</b> de las muestras.`,
      `Acción <b>Formatear fecha</b>: Fecha actual, formato personalizado <code>yyyy-MM-dd</code>.`,
      `Acción <b>Texto</b>:` + txt("tipo: pasos\nfecha: [Fecha formateada]\nvalor: [Estadísticas]"),
      send,
      `La primera vez que lo ejecutes, permite el acceso a Salud.`,
      `Pestaña <b>Automatización</b> → <b>+</b> → <b>Hora del día</b> → 23:45, <b>Diariamente</b> → <b>Ejecutar inmediatamente</b> → elige <b>Pasos al Panel</b>.`,
      `En la app aparecerá el hábito <b>Pasos</b> (objetivo 10.000; puedes cambiarlo en Hábitos).`
    ])}

    ${shortcut("8 · Peso cada mañana (con aviso)", "apunta mi peso", [
      `Crea un atajo <b>Apunta mi peso</b>: <b>Solicitar entrada</b> de tipo <b>Número</b> con la pregunta «¿Cuánto pesas hoy?».`,
      `Acción <b>Texto</b>:` + txt("tipo: cuerpo\npeso: [Entrada solicitada]") + `Si algún día quieres más datos, añade líneas <code>grasa: …</code> o <code>cintura: …</code>.`,
      send,
      `Pestaña <b>Automatización</b> → <b>+</b> → <b>Hora del día</b> → <b>06:00</b>, <b>Diariamente</b> → marca <b>Ejecutar tras confirmar</b> (no «inmediatamente»: así te llega la notificación) → elige <b>Apunta mi peso</b>.`,
      `Cada mañana a las 6:00 te llegará la notificación; tócala, escribe el peso y listo. Aparecerá en <b>Hábitos → Cuerpo</b>.`
    ])}

    ${shortcut("9 · Nutrición de Foodvisor (automático 3 veces al día)", "", [
      `En Salud → tu foto → Apps → <b>Foodvisor</b>, deja activados los permisos de escritura (Energía alimentaria, Proteínas, Carbohidratos, Grasas totales, Peso).`,
      `Crea un atajo <b>Nutrición al Panel</b>. Para cada dato repite este par de acciones:<br>· <b>Buscar muestras de salud</b> → tipo <b>Energía alimentaria</b>, filtro <i>Fecha de inicio</i> <b>es hoy</b>.<br>· <b>Calcular estadísticas</b> → <b>Suma</b>.<br>Haz lo mismo con <b>Proteínas</b>, <b>Carbohidratos</b> y <b>Grasas totales</b> (cuatro sumas en total).`,
      `Peso: <b>Buscar muestras de salud</b> → tipo <b>Peso</b>, filtro <i>Fecha de inicio</i> <b>es hoy</b>, <i>Ordenar por</i> <b>Fecha de inicio</b>, <b>Más reciente primero</b>, <i>Limitar</i> a <b>1</b>.`,
      `Acción <b>Texto</b> (cada valor es la variable <b>Estadísticas</b> de su par; mantén pulsada una variable para ver de qué acción viene):` + txt("tipo: nutricion\ncalorias: [Estadísticas de Energía]\nproteinas: [Estadísticas de Proteínas]\ncarbohidratos: [Estadísticas de Carbohidratos]\ngrasas: [Estadísticas de Grasas]\npeso: [Muestras de salud de Peso]"),
      send,
      `Ejecútalo una vez con ▶︎ y permite el acceso a Salud.`,
      `Crea <b>tres automatizaciones</b> de <b>Hora del día</b> (14:00, 18:00 y 23:45), <b>Diariamente</b>, <b>Ejecutar inmediatamente</b>, todas con <b>Nutrición al Panel</b>. Cada envío actualiza el total del día.`,
      `En la app: <b>Hábitos → Nutrición → Objetivos</b> para poner tus calorías y proteína.`
    ])}

    ${shortcut("10 · Aviso del resumen semanal (lunes a las 8:00)", "", [
      `Pestaña <b>Automatización</b> → <b>+</b> → <b>Hora del día</b> → <b>08:00</b>, <b>Semanalmente</b>, deja marcado solo el <b>lunes</b> → <b>Ejecutar inmediatamente</b> → <b>Nuevo atajo en blanco</b>.`,
      `Añade la acción <b>Mostrar notificación</b> con el texto «Ya tienes el resumen de tu semana en Panel de Vida» (y si quieres, título «Resumen semanal»).`,
      `Listo. Al abrir la app el lunes verás la tarjeta <b>Tu semana pasada</b> arriba del Resumen. Las semanas anteriores están en <b>Resumen → Tu semana → Semanas</b>.`,
      `Nota: el iPhone no deja que una notificación de Atajos abra directamente una app web como esta; al tocarla se abre Atajos. Abre Panel de Vida desde su icono.`
    ])}

    <p class="hint">Para comprobar que todo funciona, usa <b>Enviar mensaje de prueba</b> en Ajustes, o ejecuta un atajo y luego abre la app: verás un aviso con lo recibido.</p>
    <button class="btn primary" type="button" data-close>Entendido</button>`);

  sheet.addEventListener("click", async e => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const value = sheet.querySelector("#" + b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(value); toast("Copiado"); }
    catch {
      const r = document.createRange(); r.selectNodeContents(sheet.querySelector("#" + b.dataset.copy));
      getSelection().removeAllRanges(); getSelection().addRange(r);
      toast("Selecciónalo y copia manualmente");
    }
  });
}
