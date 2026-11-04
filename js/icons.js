// Juego de iconos propio: trazo de 1.8 px sobre rejilla de 24, esquinas redondeadas.
// Se colorean con currentColor; el brillo neón lo añade el CSS.

const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" class="ico">${body}</svg>`;

export const icon = {
  // Áreas
  fin: svg('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h2"/><path d="M7 3.5h10"/>'),
  work: svg('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/><path d="M7.5 9l2.5 2-2.5 2M12.5 13h4"/>'),
  hab: svg('<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'),
  ag: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4"/><path d="M9 14.5l2 2 4-4"/>'),

  // Interfaz
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  home: svg('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  flame: svg('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.3 3.6-8.3.4 1.8 1.4 3 2.6 3.6C11.6 7.4 13 4.6 15.2 3c-.3 3 1.1 5 2.2 6.6 1 1.4 1.6 3 1.6 5.1 0 3.7-3 6.3-7 6.3z"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2.5 2.5 0 0 0 3 4M16 6h3a2.5 2.5 0 0 1-3 4"/><path d="M12 13v4M8.5 20.5h7M9.5 17.5h5v3h-5z"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  bolt: svg('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  download: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  upload: svg('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),

  // Menú "+"
  money: svg('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h2"/>'),
  habit: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16 9.6"/>'),
  task: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4"/><path d="M12 12.5v4M10 14.5h4"/>'),
  dumbbell: svg('<path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11"/>'),
  ball: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4z"/><path d="M12 3.5v4M15.5 10l4-1.3M14.2 14l2.4 3.4M9.8 14l-2.4 3.4M8.5 10l-4-1.3"/>'),
  moon: svg('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>')
};
