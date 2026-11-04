# Panel de Vida

Panel personal minimalista (estilo «Grafito», oscuro) para el iPhone: **finanzas**, **trabajo y estudios**, **hábitos y deporte**, y **agenda y tareas**, más una pantalla de **resumen** con niveles y experiencia (XP).

- Es una app web instalable (PWA): se añade a la pantalla de inicio y se abre a pantalla completa, como una app normal.
- Funciona sin conexión.
- **Tus datos se guardan solo en tu móvil** (IndexedDB). Nunca se suben a ningún servidor, ni siquiera a GitHub.
- No tiene dependencias: HTML, CSS y JavaScript.

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Mockups de la pantalla principal (elegida la variante A, HUD compacto) | ✅ |
| 1 | Estructura: PWA, navegación, almacenamiento, copias de seguridad | ✅ |
| 2 | Estilo completo y pantalla de resumen | ✅ |
| 3 | Finanzas | ✅ |
| 4 | Trabajo y estudios | ✅ |
| 5 | Hábitos y deporte | ✅ |
| 6 | Agenda y tareas | ✅ |
| 7 | Gamificación (XP, logros, celebraciones) y avisos en el Calendario | ✅ |

## Usarla en el ordenador (Windows)

1. Abre la misma dirección en **Chrome** o **Edge**.
2. Para tenerla como app, con su propia ventana y acceso directo, pulsa el icono de **Instalar** al final de la barra de direcciones. Si no aparece, ve a menú ⋮ → *Enviar, guardar y compartir* → *Instalar página como aplicación* en Chrome, o a menú … → *Aplicaciones* → *Instalar este sitio como aplicación* en Edge.
3. Con la ventana ancha aparece el **diseño de escritorio**:
   - Menú lateral y resumen en tres columnas.
   - Los formularios se abren en una ventana central.
   - Atajos de teclado: **N** para apuntar algo, **1–5** para cambiar de sección (Resumen, Finanzas, Trabajo, Hábitos, Agenda) y **Esc** para cerrar.

Para tener los mismos datos que en el iPhone, activa la sincronización (ver abajo).

## Sincronización entre dispositivos (cifrada, con GitHub)

Los datos se guardan **cifrados** en un Gist secreto de tu cuenta de GitHub. Se cifran en el propio dispositivo con AES-256-GCM, usando una clave derivada de tu contraseña con PBKDF2 (310.000 iteraciones). GitHub solo guarda texto ilegible.

**Configurarla (en cada dispositivo):**

1. **Ajustes → Sincronización entre dispositivos → Configurar sincronización.**
2. Crea un token en GitHub desde el enlace que aparece (ya viene marcado solo el permiso `gist`). Elige la caducidad y pulsa *Generate token*. Copia el código `ghp_…`.
3. Pega el token y elige una **contraseña de cifrado**. En el segundo dispositivo usa **la misma contraseña**; el token puede ser el mismo u otro.

**Cómo funciona:**

- **Cuándo sincroniza:** sola, al abrir la app, al volver a ella, cada 2 minutos mientras está abierta y unos segundos después de cada cambio. Sin conexión, los cambios quedan pendientes y se suben al volver.
- **Dónde ver el estado:** en Ajustes y, en el ordenador, en el menú lateral.
- **Conflictos:** si cambias datos en los dos dispositivos antes de que se sincronicen, la app pregunta cuál conservar. La versión descartada se guarda aparte y se puede exportar desde Ajustes.
- **Seguridad:** el token y la contraseña se quedan en cada dispositivo. Nunca se suben ni se incluyen en las copias de seguridad.
- **Si olvidas la contraseña:** los datos de GitHub no se pueden descifrar. Los de tus dispositivos y tus copias siguen intactos. Para empezar de nuevo, borra el Gist «Panel de Vida» en gist.github.com y vuelve a configurar.
- **Desconectar:** en Ajustes deja de sincronizar este dispositivo. No borra nada.

## Siri y Salud (Atajos del iPhone)

Requiere tener activada la sincronización. Los Atajos del iPhone no pueden abrir la app instalada, así que **dejan mensajes en tu Gist** (el «buzón»). La app los recoge en la siguiente sincronización, los apunta y los borra del Gist. Si dos dispositivos recogen el mismo mensaje, no se duplica.

- **Siri:** «Apunta un gasto», «Nueva tarea», «He bebido agua» (o cualquier hábito), «Apunta estudio», «He ido al gimnasio»…
- **Salud:** una automatización diaria a las 23:45 envía los **pasos** del día al hábito «Pasos» (se crea solo, con objetivo de 10.000).
- **Cómo montarlo:** en **Ajustes → Siri y Salud → Cómo crear los Atajos** está la guía paso a paso, con botones para copiar la dirección y la cabecera. El botón **Enviar mensaje de prueba** comprueba el circuito completo.
- **Privacidad:** los Atajos no pueden cifrar, así que los mensajes del buzón están **sin cifrar** en tu Gist secreto desde que se envían hasta que la app los recoge. El resto de tus datos sigue cifrado.

Formato de un mensaje: una línea por campo, `clave: valor`. Los tipos son `gasto` / `ingreso` (importe, nota), `tarea` (titulo, fecha: hoy, mañana, ninguna o AAAA-MM-DD), `habito` (nombre, cantidad), `tiempo` (clase: estudio o trabajo, horas o minutos, proyecto), `gimnasio` / `futbol` (minutos, partido: sí), `pasos` (fecha, valor) y `cuerpo` (peso, grasa, cintura).

**Aviso diario de peso:** una automatización de Atajos a las 6:00 con *Ejecutar tras confirmar* envía una notificación. Al tocarla, el atajo «Apunta mi peso» pregunta el peso y lo envía al panel (Hábitos → Cuerpo).

## Nutrición (Foodvisor)

Foodvisor escribe en Apple Salud las calorías, los macros y el peso, pero **no el agua**. El atajo **Nutrición al Panel** lee de Salud los totales del día y el último peso, y los envía por el buzón. Una automatización lo ejecuta a las **14:00, 18:00 y 23:45**, y cada envío sustituye el total del día. La guía está en Ajustes → Siri y Salud, apartado 9.

- **Hábitos → Nutrición:**
  - Hoy: calorías frente al objetivo con lo que te queda, barra de proteína y reparto de macros.
  - Últimos 14 días: gráfico con la línea del objetivo y medias de 7 días.
- **Objetivos:** calorías ("no pasarme" o "llegar") y proteína. Cada uno es un hábito automático con racha y XP. En modo "no pasarme", el día cuenta cuando termina.
- **Peso:** el que registras en Foodvisor llega solo a Cuerpo.
- **Peso vs calorías** (en Nutrición y en Cuerpo): las últimas 6 semanas con calorías y proteína medias (solo días terminados con registro) y el cambio de la media del peso respecto a la semana anterior. Con al menos 2 semanas completas (≥ 4 días de calorías) estima tus **calorías de mantenimiento**: kcal medias − cambio de peso semanal × 7.700 / 7.

## Tendencia del peso

En **Hábitos → Cuerpo**, la gráfica de los últimos 90 días muestra cada pesaje como un punto suave y, encima, la **media de 7 días**, que filtra las subidas y bajadas diarias. Arriba: la media actual y su cambio en 7 y 30 días; debajo, el ritmo en kg por semana.

## Resumen semanal

- **Cada lunes**, arriba del Resumen, aparece la tarjeta **Tu semana pasada** (lunes a domingo): gasto frente a la semana anterior, horas de estudio y de trabajo, entrenos de gimnasio y fútbol, días con todos los hábitos cumplidos, calorías y proteína medias, peso (media de 7 días) y su cambio, y tareas hechas. Se puede cerrar; el cierre se sincroniza.
- **Semanas** (desde la tarjeta o desde *Resumen → Tu semana → Semanas*): cualquier semana anterior con flechas.
- **Aviso del lunes a las 8:00:** automatización de Atajos con *Mostrar notificación* (apartado 10 de la guía). iOS no deja que la notificación abra directamente una app web, así que se abre el panel desde su icono.

## Hevy (entrenos de gimnasio)

Si apuntas el gimnasio en **Hevy**, el panel importa tus entrenos con todos sus ejercicios, series, pesos y repeticiones, a partir del CSV que exporta Hevy. Funciona con la versión gratuita.

1. En Hevy: **Perfil → Ajustes → Exportar e importar datos → Exportar entrenamientos** → *Guardar en Archivos*.
2. En el panel: **Ajustes → Hevy → Importar CSV de Hevy** → elige el archivo.

- **Qué se importa:** los entrenos nuevos se añaden y los que editaste en Hevy se actualizan. Nunca se duplican, así que puedes importar el historial completo cada vez.
- **Récords:** las series de calentamiento se guardan, pero no cuentan como récord. Los récords, la XP, el hábito de gimnasio y los logros se calculan con los entrenos importados.
- **Rutinas:** tras importar, el panel deja de mostrar "Entrenar" y "Rutinas", porque se usa Hevy para eso. Para volver a apuntar en el panel, desmarca *Apunto el gimnasio solo en Hevy* en Ajustes → Hevy.
- **Hábitos → Gimnasio** tiene dos zonas:
  - **Últimos entrenos:** agrupados por mes, con el total del mes y "Ver más" para ir hacia atrás.
  - **Récords:** con buscador de ejercicios y ordenados por los más recientes. Al tocar un ejercicio se abre su **progreso**: récord, 1RM estimado y mejor volumen; una gráfica con selector (**peso máximo**, **1RM estimado** con la fórmula de Epley, o **volumen** = kg × reps sin calentamientos), por meses si hay 3 o más (si no, por sesión), y la lista de sesiones con su serie más pesada.
- **Formatos que reconoce:** fechas en inglés ("21 Oct 2026, 18:05"), en español o ISO, y peso en kg o libras (se convierte).

## Instalarla en el iPhone

1. Abre la dirección de la app en **Safari** (otros navegadores de iPhone no permiten instalarla).
2. Pulsa **Compartir** (el cuadrado con una flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio** y confirma.
4. Ábrela siempre desde ese icono. Los datos de la app instalada están separados de los de Safari.

## Finanzas

- **Cuentas:** banco, efectivo, ahorro, inversión, tarjeta… cada una con su saldo inicial. El saldo actual es el inicial más todos sus movimientos.
- **Tarjeta de saldo:** con el selector de arriba (*Total* o una cuenta) ves el saldo, los ingresos, gastos y balance del mes y la gráfica de los últimos 6 meses de todas las cuentas juntas o de una sola. Las transferencias no cuentan como ingreso ni gasto; en una cuenta aparecen aparte como «Transferencias del mes».
- **Movimientos:** gastos, ingresos y transferencias entre cuentas. Se pueden apuntar con el botón **+**. Tocar un movimiento lo abre para editarlo o borrarlo.
- **Importes:** valen `12,50`, `1.234,56` o `12.5`.
- **Categorías:** hay una lista inicial con subcategorías y se puede cambiar en *Gastos → Categorías*. Al borrar una subcategoría, sus movimientos pasan a la categoría principal.
- **Fijos:** se repiten cada mes, semana o año y se apuntan solos el día que toca, aunque la app lleve días sin abrirse.
- **Metas de ahorro:** objetivo, aportaciones y, si les pones fecha límite, cuánto tienes que ahorrar al mes para llegar.

## Trabajo y estudios

- **Tiempo:** apuntas a mano las horas de trabajo o de estudio, con botones rápidos de +15 min, +30 min, +1 h y +2 h y un proyecto opcional. Arriba ves la semana día a día y puedes ir a semanas anteriores. Debajo, las horas de las últimas 8 semanas.
- **Proyectos y objetivos:** se dividen en hitos. El porcentaje de avance sale de los hitos completados. Cada proyecto puede tener fecha límite y muestra las horas que le has dedicado. Los terminados se pueden archivar.
- **Aprendizaje:** cursos, libros y habilidades con su progreso (p. ej. 12/40 lecciones). Con **+1** avanzas una unidad.

## Hábitos y deporte

- **Hábitos:**
  - Cada hábito tiene un objetivo con cantidad (p. ej. 2 L) y lo que suma cada toque de **+** (p. ej. 0,5 L).
  - La frecuencia puede ser diaria, en días concretos o X veces por semana.
  - Un hábito puede **marcarse solo** al apuntar un entreno de gimnasio, de fútbol o cualquiera.
- **Rachas:** días seguidos cumpliendo (o semanas, en los hábitos semanales). Si no cumples un día que tocaba, la racha vuelve a 0. Mientras el día de hoy no termina, no rompe la racha.
- **Mapa de calor:** uno general de 17 semanas y otro dentro de cada hábito. Toca un hábito para verlo junto con su mejor racha y su % de cumplimiento.
- **Gimnasio:** rutinas guardadas. Al entrenar, cada ejercicio sale relleno con lo que hiciste la última vez, y el peso de la primera serie se copia a las siguientes. Avisa de los récords nuevos y muestra la evolución de cada ejercicio con su 1RM estimado (fórmula de Epley).
- **Fútbol:** entrenamientos y partidos con sus minutos.
- **Cuerpo:** peso, % de grasa y cintura, con gráfico.
- **Bienestar:** horas y calidad del sueño, y estado de ánimo (de Fatal a Genial) de los últimos 14 días.
- **Botón +:** *Hábito, sueño o ánimo* abre el registro rápido del día, y *Entreno o tiempo* incluye Gimnasio y Fútbol.

## Agenda y tareas

- **Tareas:** fecha y hora opcionales, prioridad, etiquetas y nota. Se agrupan en Atrasadas, Hoy, Mañana, Esta semana, Más adelante y Sin fecha. Se pueden filtrar por pendientes o completadas y por etiqueta.
- **Repetición:** cada día, entre semana, cada semana, cada 2 semanas, cada mes o cada año. Al completar una tarea recurrente se crea la siguiente. Si la desmarcas, la siguiente desaparece.
- **Eventos:** todo el día o con hora de inicio y fin, lugar, nota y aviso previo.
- **Calendario:** vista mensual con puntos de colores (eventos, tareas, atrasadas). Al tocar un día ves lo que tiene y puedes añadir algo en esa fecha.

### Avisos en el iPhone (Calendario)

Una web no puede enviar notificaciones programadas por sí sola, así que los avisos los da el Calendario de iOS:

1. **Agenda → Exportar al Calendario del iPhone → Abrir en Calendario.**
2. El iPhone muestra los eventos del archivo. Pulsa **Añadir todo** y elige un calendario.
3. Los eventos se exportan con el aviso que elegiste. Las tareas con hora avisan a esa hora y las de todo el día, a las 9:00. Las tareas recurrentes se exportan con su repetición.

La opción **Solo lo nuevo** exporta únicamente lo creado o cambiado desde la última exportación, para no duplicar. Si cambias o borras algo que ya habías exportado, cámbialo también en el Calendario.

Si **Abrir en Calendario** no muestra el botón *Añadir todo*, usa **Compartir archivo** → *Guardar en Archivos*. Después, en la app Archivos, toca el `.ics` para importarlo.

## Navegación

En cualquier pantalla que no sea el resumen, el botón de la casita (arriba a la izquierda) te devuelve al inicio.

## Datos de ejemplo

Para ver cómo queda el panel con datos antes de apuntar los tuyos: **Ajustes → Cargar datos de ejemplo**. Esta opción solo aparece si el panel está vacío. Con **Quitar datos de ejemplo** vuelve a quedar vacío y se mantiene tu alias.

## Copias de seguridad (importante en iPhone)

iOS puede borrar los datos de una web si pasa mucho tiempo sin abrirse. Para no perder nada:

- **Exportar:** Ajustes (rueda dentada en el resumen) → **Exportar copia** → **Guardar en Archivos** (mejor en iCloud Drive). Se genera un archivo `panel-de-vida-AAAA-MM-DD.json`.
- **Importar:** Ajustes → **Importar copia** → elige el archivo. Sustituye todos los datos actuales, y la app te pide confirmación antes.
- Si llevas 7 días sin exportar, el resumen muestra un aviso.

## Publicarla con GitHub Pages

1. En GitHub, abre el repositorio → **Settings** → **General**. Comprueba que es **público**.
2. **Settings** → **Pages** → en *Build and deployment*, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)` → **Save**.
3. En un par de minutos la app estará en `https://<tu-usuario>.github.io/panel-de-vida/`.

### Al publicar cambios

Con conexión, la app siempre pide primero la última versión de cada archivo; sin conexión, usa la copia guardada. Así los cambios publicados se ven al volver a abrirla.

Aun así, sube el número de `VERSION` en `sw.js` (por ejemplo, de `v0.3.1` a `v0.3.2`) cada vez que añadas o quites archivos, para que se renueve la copia que se usa sin conexión.

## Probarla en el ordenador

Los módulos de JavaScript no funcionan abriendo `index.html` con doble clic: hace falta un pequeño servidor local.

```bash
cd panel-de-vida
python3 -m http.server 8000
# y abre http://localhost:8000
```

En Chrome o Safari, activa la vista de móvil de las herramientas de desarrollo para verla a tamaño iPhone.

## Estructura del código

```
index.html              Página única: contenedor de vistas y barra inferior
manifest.webmanifest    Datos de la app instalable (nombre, icono, colores)
sw.js                   Service worker: modo sin conexión
css/
  tokens.css            Colores, tipografía y medidas (cambia aquí el estilo)
  base.css              Reset, fondo grafito y estructura
  components.css        Tarjetas, barras de XP, barra inferior, hojas, botones…
  desktop.css           Diseño de escritorio (≥ 1024 px): menú lateral, columnas, ventanas centrales
fonts/inter-latin.woff2 Tipografía Inter (incluida para funcionar sin conexión)
icons/                  Icono de la app (SVG y PNG)
js/
  app.js                Arranque y navegación entre pantallas (#resumen, #finanzas…)
  db.js                 Acceso a IndexedDB
  state.js              Estructura de los datos, guardado y migraciones de versión
  game.js               XP calculada, niveles, títulos y logros
  celebrate.js          Celebraciones: +XP, aviso de subida de nivel, avisos de logro
  backup.js             Exportar e importar copias
  quickadd.js           Menú del botón +
  sidebar.js            Menú lateral del escritorio y atajos 1-5
  sync.js               Sincronización cifrada con un Gist de GitHub (cifrado, versiones, conflictos)
  inbox.js              Buzón de Atajos: convierte los mensajes de Siri y Salud en datos
  hevy.js               Importación de entrenos desde el CSV de Hevy
  views/nutricion.js    Pestaña Nutrición y objetivos (datos de Foodvisor vía Salud)
  views/tendencia.js    Gráfica de tendencia del peso y tarjeta «Peso vs calorías»
  views/semana.js       Tarjeta del lunes y pantalla «Semanas» (resumen semanal)
  stats.js              Cálculos del resumen (hoy, hábitos, dinero, semana, racha)
  charts.js             Gráficos SVG propios (barras + línea semanal, anillos)
  icons.js              Juego de iconos
  demo.js               Datos de ejemplo (se cargan y se quitan desde Ajustes)
  ui.js                 Utilidades: formatos, hoja inferior, avisos
  trends.js             Media de 7 días del peso, semanas de nutrición, mantenimiento y resumen semanal
  finance.js            Lógica de finanzas: categorías, saldos, fijos automáticos
  work.js               Lógica de trabajo y estudios: horas por semana, proyectos, aprendizaje
  forms.js              Piezas de formulario compartidas
  habits.js             Lógica de hábitos: rachas, cumplimiento, mapa de calor
  sport.js              Lógica de deporte: récords, fútbol, sueño y ánimo
  agenda.js             Lógica de agenda: repeticiones, agrupación, calendario, exportación .ics
  views/                Una vista por pantalla (resumen, finanzas, trabajo, hábitos, agenda, ajustes)
                        y sus formularios (p. ej. finanzas-forms.js)
```

### Cómo se guardan los datos

Todo el estado es un único objeto JSON (ver `defaultState()` en `js/state.js`) guardado en IndexedDB. Ese mismo objeto es el que se exporta como copia. Cada cambio de formato sube `SCHEMA_VERSION` y añade una migración, para que las copias antiguas sigan funcionando.

### Gamificación

- **La XP se calcula a partir de tus datos** (ver `computeXP()` en `js/game.js`) en vez de sumarse en cada acción. Si borras algo o desmarcas una tarea, la XP se ajusta sola, y marcar y desmarcar no la infla. Solo se guardan los logros desbloqueados, con su fecha, y el último nivel celebrado.
- **Tabla de XP:** está en la pantalla **Logros** (toca la tarjeta de XP del resumen) y en `XP` / `XP_RULES` de `js/game.js`. Cambia ahí los valores si quieres otro ritmo.
- **Niveles:** pasar del nivel *n* al *n+1* cuesta `100 + 50·(n−1)` XP. Hay un nivel global (la suma) y uno por área.
- **Títulos según el nivel global:** Novato (1), Iniciado (3), Runner (5), Netrunner (10), Operador (15), Ciberninja (20), Arquitecto (30) y Leyenda neón (40).
- **Logros:** 35, en `ACHIEVEMENTS` de `js/game.js`. Los bloqueados muestran su progreso.
- **Celebraciones:**
  - Al ganar XP aparece una burbuja "+XP".
  - Al subir de nivel global, una tarjeta centrada con el nuevo nivel y el título.
  - Al subir de nivel en un área o desbloquear un logro, un aviso arriba.
  - Si el iPhone tiene activado *Reducir movimiento*, se muestran sin animación.
  - Importar una copia o cargar los datos de ejemplo no lanza celebraciones.
