import { environment } from '../../environments/environment';

/** Event details printed on every Home Coming & Housewarming card. */
export const HC_EVENT = {
  hosts: `${environment.brideName} & ${environment.groomName}`,
  weekday: 'Tuesday',
  day: '15',
  month: 'December',
  year: '2026',
  time: '6:30 PM',
  venueLines: ['315/2, Welipenna Road,', 'Aluthgama']
};

export const HC_COLORS = {
  paper: '#fbf7ee',
  red: '#9b1c2c',
  redDeep: '#6e0b18',
  gold: '#a9823f',
  goldLight: '#d8bd85',
  ink: '#3b2a2a'
};

/** Card layout units; the canvas is scaled up from these for print quality. */
const CARD_W = 1200;
const CARD_H = 1697; // A-series ratio (1 : √2)
const CARD_SCALE = 1.5;

type Ctx = CanvasRenderingContext2D;

const FONT_SCRIPT = '"Great Vibes", "Brush Script MT", cursive';
const FONT_CAPS = '"Cinzel", "Cormorant Garamond", Georgia, serif';
const FONT_BODY = '"Cormorant Garamond", Georgia, serif';

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

let fontsReady: Promise<unknown> | null = null;

/** Canvas text only uses web fonts that are already loaded, so load them first. */
export function loadCardFonts(): Promise<unknown> {
  const fonts = (document as any).fonts;
  if (!fonts || typeof fonts.load !== 'function') {
    return Promise.resolve();
  }
  fontsReady ??= Promise.race([
    Promise.all(
      [
        `1em ${FONT_SCRIPT}`,
        `500 1em ${FONT_CAPS}`,
        `600 1em ${FONT_CAPS}`,
        `500 1em ${FONT_BODY}`,
        `600 1em ${FONT_BODY}`,
        `italic 400 1em ${FONT_BODY}`,
      ].map((f) => fonts.load(f).catch(() => undefined))
    ),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  return fontsReady;
}

/* ------------------------------------------------------------------ */
/* Roses                                                               */
/* ------------------------------------------------------------------ */

/** One petal in local space, pointing up (-y) from the rose centre. */
function petal(ctx: Ctx, angle: number, len: number, width: number, inner: string, outer: string): void {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-width * 0.95, -len * 0.08, -width * 1.15, -len * 0.82, -width * 0.38, -len * 0.98);
  ctx.quadraticCurveTo(0, -len * 1.05, width * 0.38, -len * 0.98);
  ctx.bezierCurveTo(width * 1.15, -len * 0.82, width * 0.95, -len * 0.08, 0, 0);
  ctx.closePath();

  const g = ctx.createRadialGradient(0, 0, len * 0.05, 0, -len * 0.2, len * 1.05);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, outer);
  g.addColorStop(1, lighten(outer, 0.22));
  ctx.fillStyle = g;
  ctx.fill();

  // Pale rim and a curled-edge highlight give the petal some depth.
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, len * 0.022);
  ctx.strokeStyle = 'rgba(255, 214, 214, 0.35)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-width * 0.55, -len * 0.9);
  ctx.quadraticCurveTo(0, -len * 0.78, width * 0.55, -len * 0.9);
  ctx.lineWidth = Math.max(1, len * 0.035);
  ctx.strokeStyle = 'rgba(255, 228, 228, 0.28)';
  ctx.stroke();
  ctx.restore();
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** A top-down rose: layered petal rings around a swirled centre. */
export function drawRose(ctx: Ctx, x: number, y: number, r: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  const layers = [
    { n: 5, len: 1.0, w: 0.64, off: 0, inner: '#7c0f1c', outer: '#c1293b' },
    { n: 5, len: 0.8, w: 0.6, off: 0.63, inner: '#760d1a', outer: '#b32234' },
    { n: 4, len: 0.6, w: 0.62, off: 0.25, inner: '#6e0b18', outer: '#a51d2f' },
    { n: 3, len: 0.42, w: 0.66, off: 1.05, inner: '#640916', outer: '#97182a' }
  ];
  layers.forEach((layer, li) => {
    if (li === 0) {
      ctx.shadowColor = 'rgba(80, 10, 20, 0.28)';
      ctx.shadowBlur = r * 0.18;
      ctx.shadowOffsetY = r * 0.05;
    } else {
      ctx.shadowColor = 'transparent';
    }
    for (let i = 0; i < layer.n; i++) {
      const a = layer.off + (i * Math.PI * 2) / layer.n + Math.sin(i * 2.3 + li) * 0.12;
      petal(ctx, a, r * layer.len, r * layer.len * layer.w, layer.inner, layer.outer);
    }
  });
  ctx.shadowColor = 'transparent';

  // Swirled heart of the rose.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#5c0814';
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    const rr = r * 0.2 * (1 - k * 0.22);
    const a0 = k * 1.9;
    ctx.beginPath();
    ctx.arc(r * 0.02 * k, -r * 0.015 * k, rr, a0, a0 + 3.9);
    ctx.lineWidth = Math.max(1, r * 0.028);
    ctx.strokeStyle = `rgba(232, 120, 132, ${0.55 - k * 0.08})`;
    ctx.stroke();
  }
  ctx.restore();
}

/** A gold leaf pointing along `angle`. */
function drawLeaf(ctx: Ctx, x: number, y: number, len: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -len * 0.3, len, 0);
  ctx.quadraticCurveTo(len * 0.45, len * 0.3, 0, 0);
  const g = ctx.createLinearGradient(0, -len * 0.2, len, len * 0.2);
  g.addColorStop(0, '#c9a565');
  g.addColorStop(0.5, '#ddc28c');
  g.addColorStop(1, '#a27c40');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(len * 0.04, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.04, len * 0.95, 0);
  ctx.lineWidth = Math.max(1, len * 0.018);
  ctx.strokeStyle = 'rgba(255, 246, 225, 0.75)';
  ctx.stroke();
  ctx.restore();
}

/** A fine gold sprig: a curved stem with small berries. */
function drawSprig(ctx: Ctx, x: number, y: number, len: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = HC_COLORS.gold;
  ctx.fillStyle = HC_COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.18, len, -len * 0.05);
  ctx.stroke();
  for (let i = 1; i <= 5; i++) {
    const t = i / 5.4;
    const px = len * t;
    const py = -len * 0.18 * 4 * t * (1 - t) * 0.5 - len * 0.05 * t * t;
    const side = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + len * 0.04, py + side * len * 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + len * 0.04, py + side * len * 0.07, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A rose bud: a closed cup of petals with gold sepals. */
function drawBud(ctx: Ctx, x: number, y: number, r: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawLeaf(ctx, 0, r * 0.2, r * 1.1, Math.PI * 0.62);
  drawLeaf(ctx, 0, r * 0.2, r * 1.1, Math.PI * 0.38);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.4);
  ctx.bezierCurveTo(-r * 0.9, r * 0.1, -r * 0.6, -r * 0.9, 0, -r);
  ctx.bezierCurveTo(r * 0.6, -r * 0.9, r * 0.9, r * 0.1, 0, r * 0.4);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#c1293b');
  g.addColorStop(1, '#6e0b18');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.1, -r * 0.2, r * 0.05, r * 0.3);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = 'rgba(255, 210, 214, 0.4)';
  ctx.stroke();
  ctx.restore();
}

/**
 * The corner bouquet, laid out from a corner at (0, 0) and growing into +x / +y.
 * Rotate the context by 180° to use it in the opposite corner.
 */
export function drawRoseCluster(ctx: Ctx): void {
  drawLeaf(ctx, 160, 150, 190, 0.2);
  drawLeaf(ctx, 150, 160, 190, 1.35);
  drawLeaf(ctx, 250, 110, 150, -0.15);
  drawLeaf(ctx, 110, 250, 150, 1.72);
  drawLeaf(ctx, 230, 230, 120, 0.8);
  drawSprig(ctx, 300, 120, 170, 0.05);
  drawSprig(ctx, 120, 300, 170, Math.PI / 2 - 0.05);
  drawBud(ctx, 330, 205, 30, 2.1);
  drawBud(ctx, 205, 330, 30, -0.55);
  drawRose(ctx, 280, 72, 74, 0.7);
  drawRose(ctx, 72, 280, 74, 1.4);
  drawRose(ctx, 212, 212, 50, 2.2);
  drawRose(ctx, 112, 112, 118, 0.2);
}

/** Loose petals scattered faintly across the paper. */
function drawScatteredPetals(ctx: Ctx, w: number, h: number, alpha: number): void {
  const spots = [
    [0.86, 0.12, 0.6], [0.93, 0.36, 2.1], [0.07, 0.62, 1.2], [0.12, 0.86, 2.8],
    [0.8, 0.58, 0.3], [0.2, 0.42, 1.9], [0.55, 0.95, 2.5], [0.45, 0.04, 1.1]
  ];
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [fx, fy, rot] of spots) {
    ctx.save();
    ctx.translate(fx * w, fy * h);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-16, -6, -14, -30, 0, -32);
    ctx.bezierCurveTo(14, -30, 16, -6, 0, 0);
    ctx.fillStyle = '#b32234';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Letter-spaced text (canvas letterSpacing is not supported everywhere). */
function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number): number {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  ctx.save();
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.restore();
  return total;
}

/** Set the largest font (up to `size`) at which `text` fits in `maxWidth`. */
function fitFont(ctx: Ctx, text: string, style: string, size: number, family: string, maxWidth: number): void {
  let s = size;
  do {
    ctx.font = `${style} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return;
    s -= 2;
  } while (s > 18);
}

function goldRule(ctx: Ctx, x1: number, x2: number, y: number, width = 2): void {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.lineWidth = width;
  ctx.strokeStyle = HC_COLORS.gold;
  ctx.stroke();
}

function diamond(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fillStyle = HC_COLORS.gold;
  ctx.fill();
}

/** Gold divider with a small rose in the middle. */
function roseDivider(ctx: Ctx, cx: number, y: number, half: number): void {
  goldRule(ctx, cx - half, cx - 40, y, 1.5);
  goldRule(ctx, cx + 40, cx + half, y, 1.5);
  diamond(ctx, cx - half - 8, y, 5);
  diamond(ctx, cx + half + 8, y, 5);
  drawLeaf(ctx, cx - 6, y + 2, 34, Math.PI - 0.35);
  drawLeaf(ctx, cx + 6, y + 2, 34, 0.35);
  drawRose(ctx, cx, y, 20, 0.4);
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/** "Mr. & Mrs. X" / "Mr. X & Family" / "Ms. X", as on the wedding invitation. */
export function formatInviteeName(g: { title?: string; inviteeType?: string; name?: string }): string {
  const title = (g.title ?? '').trim();
  const type = (g.inviteeType ?? '').trim().toLowerCase() || 'single';
  const name = (g.name ?? '').trim();
  if (type === 'couple') return `Mr. & Mrs. ${name}`.trim();
  if (type === 'family') return [title || 'Mr.', name, '& Family'].filter(Boolean).join(' ');
  return [title, name].filter(Boolean).join(' ');
}

/** Draw the personalised invitation card onto a new canvas. */
export function renderCard(guestName: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_W * CARD_SCALE);
  canvas.height = Math.round(CARD_H * CARD_SCALE);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(CARD_SCALE, CARD_SCALE);
  const W = CARD_W;
  const H = CARD_H;
  const cx = W / 2;

  // Paper
  const bg = ctx.createRadialGradient(cx, H * 0.45, H * 0.1, cx, H * 0.5, H * 0.75);
  bg.addColorStop(0, '#fdfaf3');
  bg.addColorStop(1, '#f5eedf');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawScatteredPetals(ctx, W, H, 0.1);

  // Gold double frame
  ctx.strokeStyle = HC_COLORS.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 38, W - 76, H - 76);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(52, 52, W - 104, H - 104);

  // Rose bouquets in opposite corners
  ctx.save();
  ctx.translate(-6, -6);
  drawRoseCluster(ctx);
  ctx.restore();
  ctx.save();
  ctx.translate(W + 6, H + 6);
  ctx.rotate(Math.PI);
  drawRoseCluster(ctx);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Hosts
  ctx.fillStyle = HC_COLORS.red;
  ctx.font = `136px ${FONT_SCRIPT}`;
  ctx.fillText(HC_EVENT.hosts, cx, 515);

  ctx.fillStyle = HC_COLORS.ink;
  ctx.font = `italic 400 50px ${FONT_BODY}`;
  ctx.fillText('warmly invite', cx, 610);

  // Guest
  ctx.fillStyle = HC_COLORS.redDeep;
  fitFont(ctx, guestName, '600', 54, FONT_BODY, 820);
  ctx.fillText(guestName, cx, 685);
  goldRule(ctx, cx - 230, cx + 230, 712, 1);

  ctx.fillStyle = HC_COLORS.ink;
  ctx.font = `italic 400 48px ${FONT_BODY}`;
  ctx.fillText('to join us as we celebrate our', cx, 775);

  // Occasion
  ctx.fillStyle = HC_COLORS.red;
  ctx.font = `600 70px ${FONT_CAPS}`;
  spaced(ctx, 'HOME COMING', cx, 875, 8);
  ctx.fillStyle = HC_COLORS.gold;
  ctx.font = `76px ${FONT_SCRIPT}`;
  ctx.fillText('&', cx, 945);
  ctx.fillStyle = HC_COLORS.red;
  ctx.font = `600 50px ${FONT_CAPS}`;
  spaced(ctx, 'HOUSEWARMING', cx, 1008, 8);

  roseDivider(ctx, cx, 1068, 210);

  // Date, laid out as on the wedding invitation:
  //   ON TUESDAY
  //   DECEMBER | 15 | 2026   (side labels between rules)
  ctx.fillStyle = HC_COLORS.ink;
  ctx.font = `600 30px ${FONT_CAPS}`;
  spaced(ctx, `ON ${HC_EVENT.weekday.toUpperCase()}`, cx, 1155, 7);

  const ruleTop = 1192;
  const ruleBottom = 1258;
  for (const [x1, x2] of [[cx - 290, cx - 80], [cx + 80, cx + 290]]) {
    goldRule(ctx, x1, x2, ruleTop, 1.5);
    goldRule(ctx, x1, x2, ruleBottom, 1.5);
  }
  ctx.fillStyle = HC_COLORS.ink;
  ctx.font = `600 32px ${FONT_CAPS}`;
  spaced(ctx, HC_EVENT.month.toUpperCase(), cx - 185, 1237, 6);
  spaced(ctx, HC_EVENT.year, cx + 185, 1237, 6);

  ctx.fillStyle = HC_COLORS.red;
  ctx.font = `600 96px ${FONT_CAPS}`;
  ctx.fillText(HC_EVENT.day, cx, 1260);

  // Time, written as on the wedding invitation (8:45 AM style)
  ctx.fillStyle = HC_COLORS.gold;
  ctx.font = `600 36px ${FONT_CAPS}`;
  spaced(ctx, `${HC_EVENT.time} ONWARDS`, cx, 1332, 5);

  // Venue
  ctx.fillStyle = HC_COLORS.gold;
  ctx.font = `600 32px ${FONT_CAPS}`;
  spaced(ctx, 'AT', cx, 1418, 6);
  diamond(ctx, cx - 50, 1407, 5);
  diamond(ctx, cx + 50, 1407, 5);
  ctx.fillStyle = HC_COLORS.ink;
  ctx.font = `600 42px ${FONT_BODY}`;
  HC_EVENT.venueLines.forEach((line, i) => ctx.fillText(line, cx, 1478 + i * 50));

  return canvas;
}

/** Build the JPG invitation for one guest. */
export async function buildInvitationJpeg(guestName: string): Promise<Blob> {
  await loadCardFonts();
  const canvas = renderCard(guestName);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92)
  );
}

/** Render a corner bouquet on its own transparent canvas (for page decoration). */
export function renderClusterImage(size = 420): string {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  drawRoseCluster(ctx);
  return canvas.toDataURL('image/png');
}
