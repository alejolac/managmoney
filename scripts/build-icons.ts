/**
 * Genera los iconos de la PWA. Uso: npm run build:icons
 *
 * Se corre a mano y el resultado se commitea: son los mismos PNG siempre y no
 * vale la pena rasterizar en cada deploy. Volver a correrlo solo si cambia la
 * marca (el color de abajo o el glifo).
 *
 * Salen tres variantes porque cada plataforma recorta distinto:
 *  - `any`      esquinas redondeadas propias, se muestra tal cual esta.
 *  - `maskable` Android le aplica SU mascara (circulo, gota, squircle segun el
 *               launcher), asi que va a sangre y el glifo entra en el 80%
 *               central: lo de afuera se puede perder.
 *  - apple      iOS redondea solo, y una PNG con transparencia le queda negra.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * El acento emerald de `globals.css`, que es el que usa el logo del sidebar.
 * Ahi vive como `oklch(0.62 0.15 162)`; un PNG necesita sRGB, asi que se
 * convierte aca en vez de dejar un hex suelto que se desincronice en silencio.
 */
const ACCENT_OKLCH = { l: 0.62, c: 0.15, h: 162 };

/** Glifo `Wallet` de lucide-react, el mismo que muestra el encabezado. */
const WALLET_PATHS = [
  "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
  "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
];
const GLYPH_VIEWBOX = 24;

function oklchToHex({ l, c, h }: { l: number; c: number; h: number }): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab -> LMS (cubo) -> sRGB lineal, con las matrices de Bjorn Ottosson.
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);

  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];

  return `#${linear
    .map((v) => {
      // Recorte de gamut: el oklch original puede caer apenas afuera de sRGB.
      const clamped = Math.min(1, Math.max(0, v));
      const gamma =
        clamped <= 0.0031308
          ? 12.92 * clamped
          : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(gamma * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/**
 * @param glyphRatio cuanto del lienzo ocupa el glifo. Bajo en `maskable` para
 *   que sobreviva al recorte del launcher.
 * @param cornerRatio 0 = cuadrado a sangre; el resto redondea el fondo.
 */
function buildSvg(size: number, glyphRatio: number, cornerRatio: number) {
  const background = oklchToHex(ACCENT_OKLCH);
  const glyph = size * glyphRatio;
  const scale = glyph / GLYPH_VIEWBOX;
  const offset = (size - glyph) / 2;
  const radius = size * cornerRatio;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff"` +
      ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      WALLET_PATHS.map((d) => `<path d="${d}"/>`).join("") +
      `</g></svg>`,
  );
}

const ROOT = path.join(import.meta.dirname, "..");

const ICONS = [
  // El manifest los sirve desde /public.
  { file: "public/icon-192.png", size: 192, glyph: 0.52, corner: 0.22 },
  { file: "public/icon-512.png", size: 512, glyph: 0.52, corner: 0.22 },
  { file: "public/icon-maskable.png", size: 512, glyph: 0.4, corner: 0 },
  // Convencion de Next: `app/apple-icon.png` emite el <link rel="apple-touch-icon">.
  { file: "src/app/apple-icon.png", size: 180, glyph: 0.55, corner: 0 },
];

async function main() {
  console.log(`fondo ${oklchToHex(ACCENT_OKLCH)}\n`);

  for (const icon of ICONS) {
    const target = path.join(ROOT, icon.file);
    await mkdir(path.dirname(target), { recursive: true });
    const png = await sharp(buildSvg(icon.size, icon.glyph, icon.corner))
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(target, png);
    console.log(`${icon.file.padEnd(28)} ${icon.size}px  ${png.length} bytes`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
