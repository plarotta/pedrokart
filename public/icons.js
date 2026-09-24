// Item artwork for the HUD (inline SVG, 100×100 viewBox).
const svg = (body) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS = {
  mushroom: svg(`
    <path d="M36 58 h28 v22 a8 8 0 0 1 -8 8 h-12 a8 8 0 0 1 -8 -8z" fill="#fbe9cf" stroke="#3b2414" stroke-width="4"/>
    <ellipse cx="44" cy="70" rx="3" ry="6" fill="#1b1b1b"/><ellipse cx="56" cy="70" rx="3" ry="6" fill="#1b1b1b"/>
    <path d="M10 58 C10 22 90 22 90 58 Z" fill="#e8202a" stroke="#3b2414" stroke-width="4"/>
    <circle cx="50" cy="32" r="10" fill="#fff"/><circle cx="24" cy="48" r="8" fill="#fff"/><circle cx="76" cy="48" r="8" fill="#fff"/>`),
  banana: svg(`
    <path d="M22 20 C14 55 40 88 82 80 C86 79 86 73 82 72 C52 72 36 52 34 22 C33 16 24 14 22 20Z" fill="#ffd92e" stroke="#5a3b07" stroke-width="4"/>
    <path d="M30 26 C34 52 50 68 74 74" fill="none" stroke="#e9a800" stroke-width="4"/>
    <rect x="18" y="10" width="10" height="12" rx="3" fill="#5a3b07"/>`),
  shell: svg(`
    <ellipse cx="50" cy="66" rx="40" ry="14" fill="#fff" stroke="#22331f" stroke-width="4"/>
    <path d="M12 62 C12 22 88 22 88 62 Z" fill="#2fbf4a" stroke="#22331f" stroke-width="4"/>
    <path d="M50 30 l12 8 v12 l-12 8 l-12 -8 v-12z" fill="#8ff0a0" stroke="#1d7f31" stroke-width="3"/>
    <path d="M26 44 l8 -6 M74 44 l-8 -6" stroke="#1d7f31" stroke-width="3"/>`),
  blueshell: svg(`
    <path d="M8 48 C0 30 18 22 30 34 Z" fill="#fff" stroke="#123" stroke-width="3"/>
    <path d="M92 48 C100 30 82 22 70 34 Z" fill="#fff" stroke="#123" stroke-width="3"/>
    <ellipse cx="50" cy="68" rx="38" ry="13" fill="#fff" stroke="#0b2a55" stroke-width="4"/>
    <path d="M14 64 C14 26 86 26 86 64 Z" fill="#1f6fff" stroke="#0b2a55" stroke-width="4"/>
    <path d="M30 40 l-4 -14 l10 10z M50 34 l0 -16 l7 14z M70 40 l4 -14 l-10 10z" fill="#fff" stroke="#0b2a55" stroke-width="2"/>
    <path d="M50 42 l10 7 v10 l-10 7 l-10 -7 v-10z" fill="#8fc2ff" stroke="#0b3f9e" stroke-width="3"/>`),
  bullet: svg(`
    <path d="M18 30 h40 a26 20 0 0 1 0 40 h-40z" fill="#23232b" stroke="#000" stroke-width="4"/>
    <rect x="10" y="26" width="12" height="48" rx="3" fill="#3a3a44" stroke="#000" stroke-width="4"/>
    <ellipse cx="62" cy="44" rx="7" ry="9" fill="#fff"/><ellipse cx="64" cy="45" rx="3" ry="4" fill="#000"/>
    <path d="M52 34 l18 4" stroke="#fff" stroke-width="4"/>
    <circle cx="54" cy="66" r="7" fill="#fff" stroke="#000" stroke-width="3"/>`),
};

export const ICON_ORDER = ['mushroom', 'banana', 'shell', 'blueshell', 'bullet'];
