import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA: lo que hace que el celular ofrezca "instalar" y que
 * despues abra sin barra de direcciones, como una app cualquiera.
 *
 * Se sirve en /manifest.webmanifest y es publico a proposito: el navegador lo
 * pide antes de que exista sesion. No lleva nada privado, solo la marca.
 *
 * Ojo con `start_url`: apunta a la raiz, que si no hay sesion redirige al
 * login. Es lo que queremos —la app arranca donde corresponda— pero significa
 * que abrir el icono no saltea la autenticacion.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Managoney",
    short_name: "Managoney",
    description: "Gestion de finanzas personales",
    lang: "es",
    dir: "ltr",
    categories: ["finance"],

    start_url: "/",
    scope: "/",
    display: "standalone",

    // Colores de la pantalla de arranque, antes de que pinte el primer HTML.
    // Van en claro fijo: el manifiesto no entiende de `prefers-color-scheme`,
    // y el `themeColor` del layout ya cubre las dos variantes una vez cargada.
    background_color: "#fbfbfc",
    theme_color: "#fbfbfc",

    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android le recorta la forma que quiera el launcher; este tiene el
      // glifo mas chico para que no le coma los bordes.
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    // Accesos rapidos al mantener apretado el icono. El gasto se carga muchas
    // veces por dia y es la razon principal de tener esto en el celular.
    shortcuts: [
      {
        name: "Nuevo movimiento",
        short_name: "Movimiento",
        url: "/movimientos/nuevo",
      },
      {
        name: "Ver movimientos",
        short_name: "Movimientos",
        url: "/movimientos",
      },
    ],
  };
}
