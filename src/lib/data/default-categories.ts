/**
 * Catalogo inicial de categorias.
 *
 * El sistema NUNCA crea categorias solo: ni el OCR, ni el import de CSV, ni
 * las reglas de auto-categorizacion. Esto es lo que existe al arrancar; a
 * partir de ahi las editas vos desde configuracion.
 *
 * `system: true` marca las que no se pueden borrar porque el codigo depende
 * de ellas.
 */

export type CategorySeed = {
  name: string;
  color: string;
  icon?: string;
  system?: boolean;
  children?: { name: string; icon?: string }[];
};

export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  {
    name: "Vivienda",
    color: "#f97316",
    icon: "house",
    children: [
      { name: "Alquiler" },
      { name: "Gastos comunes" },
      { name: "UTE" },
      { name: "OSE" },
      { name: "Internet y cable" },
      { name: "Mantenimiento" },
    ],
  },
  {
    name: "Comida",
    color: "#22c55e",
    icon: "utensils",
    children: [
      { name: "Supermercado" },
      { name: "Delivery" },
      { name: "Restaurantes" },
      { name: "Cafe y snacks" },
    ],
  },
  {
    name: "Transporte",
    color: "#3b82f6",
    icon: "bus",
    children: [
      { name: "STM y omnibus" },
      { name: "Nafta" },
      { name: "Taxi y apps" },
      { name: "Estacionamiento y peajes" },
      { name: "Mantenimiento del auto" },
    ],
  },
  {
    name: "Salud",
    color: "#ef4444",
    icon: "heart-pulse",
    children: [
      { name: "Mutualista" },
      { name: "Farmacia" },
      { name: "Consultas y estudios" },
      { name: "Dentista y optica" },
    ],
  },
  {
    name: "Salidas y ocio",
    color: "#a855f7",
    icon: "party-popper",
    children: [
      { name: "Bares y boliches" },
      { name: "Cine y teatro" },
      { name: "Eventos y recitales" },
      { name: "Deporte" },
    ],
  },
  {
    name: "Suscripciones",
    color: "#06b6d4",
    icon: "repeat",
    children: [
      { name: "Streaming" },
      { name: "Software y apps" },
      { name: "Gimnasio" },
    ],
  },
  {
    name: "Compras",
    color: "#ec4899",
    icon: "shopping-bag",
    children: [
      { name: "Ropa y calzado" },
      { name: "Electronica" },
      { name: "Hogar" },
      { name: "Regalos" },
    ],
  },
  {
    name: "Educacion",
    color: "#8b5cf6",
    icon: "graduation-cap",
    children: [{ name: "Cursos" }, { name: "Libros y material" }],
  },
  {
    name: "Finanzas",
    color: "#64748b",
    icon: "landmark",
    children: [
      { name: "Comisiones bancarias" },
      { name: "Intereses" },
      { name: "Impuestos" },
      { name: "Seguros" },
    ],
  },
  {
    name: "Personal",
    color: "#f59e0b",
    icon: "user",
    children: [{ name: "Peluqueria" }, { name: "Cuidado personal" }],
  },
  { name: "Mascotas", color: "#84cc16", icon: "paw-print" },
  { name: "Viajes", color: "#14b8a6", icon: "plane" },
  {
    // Destino de todo lo que el OCR o el import no logran mapear.
    name: "Sin categorizar",
    color: "#94a3b8",
    icon: "circle-help",
    system: true,
  },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { name: "Sueldo", color: "#22c55e", icon: "wallet" },
  { name: "Aguinaldo", color: "#16a34a", icon: "gift" },
  { name: "Freelance", color: "#0ea5e9", icon: "laptop" },
  { name: "Ventas", color: "#f59e0b", icon: "tag" },
  { name: "Rendimientos", color: "#8b5cf6", icon: "trending-up" },
  { name: "Reintegros", color: "#06b6d4", icon: "undo" },
  {
    name: "Otros ingresos",
    color: "#94a3b8",
    icon: "circle-help",
    system: true,
  },
];
