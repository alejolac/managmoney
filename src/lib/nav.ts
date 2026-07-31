import {
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  Repeat,
  Settings,
  Wallet,
  Wallet2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Para la barra del celular, donde cada item tiene un quinto de la pantalla. */
  shortLabel?: string;
  icon: LucideIcon;
  /**
   * Si va en la barra de abajo del celular.
   *
   * Ahi entran cinco y no mas: con siete cada uno queda en 50 px y se toca el
   * de al lado. Las secciones que quedan afuera estan igual en el menu de
   * escritorio y en los accesos del inicio.
   */
  primary?: boolean;
};

/** Fuente unica de la navegacion: la usan el sidebar y la barra del celular. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, primary: true },
  {
    href: "/movimientos",
    label: "Movimientos",
    shortLabel: "Movim.",
    icon: ArrowLeftRight,
    primary: true,
  },
  { href: "/sobres", label: "Sobres", icon: Wallet2, primary: true },
  { href: "/cuentas", label: "Cuentas", icon: Wallet, primary: true },
  { href: "/cuotas", label: "Cuotas", icon: CreditCard },
  {
    href: "/compromisos",
    label: "Compromisos",
    shortLabel: "Fijos",
    icon: Repeat,
  },
  { href: "/configuracion", label: "Ajustes", icon: Settings, primary: true },
];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);

/** Las que no entran abajo: se muestran como accesos en el inicio. */
export const SECONDARY_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.primary);

/**
 * "/" solo esta activo en la raiz exacta; el resto tambien cuando estas en una
 * subpagina, para que "Ajustes" siga marcado dentro de "Ajustes > Seguridad".
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
