/**
 * Catalogo inicial de categorias.
 *
 * Es plano a proposito. La version anterior tenia 12 madres con ~40 hijas y
 * cargar un gasto se volvia un acertijo: ¿el super va en "Comida >
 * Supermercado"? ¿el cafe en "Comida > Cafe y snacks" o en "Salidas y ocio"?
 * Categorizar tiene que ser una decision de un segundo, y para eso conviene
 * tener pocas cajas obvias antes que muchas cajas exactas.
 *
 * El sistema NUNCA crea categorias solo: ni el OCR, ni el import de CSV, ni
 * las reglas de auto-categorizacion. Esto es lo que existe al arrancar; a
 * partir de ahi las editas vos desde configuracion (incluso creando
 * subcategorias, que la UI sigue soportando; solo no vienen de fabrica).
 *
 * `system: true` marca las que no se pueden borrar porque el codigo depende
 * de ellas.
 */

export type CategorySeed = {
  name: string;
  color: string;
  icon?: string;
  system?: boolean;
};

// El orden es el de la lista al cargar un gasto: primero lo que se repite
// todas las semanas, al final lo raro.
export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: "Supermercado", color: "#22c55e", icon: "shopping-cart" },
  // Comer afuera: restaurante, delivery, cafe, el pancho de la esquina.
  { name: "Comida", color: "#f97316", icon: "utensils" },
  { name: "Transporte", color: "#6366f1", icon: "bus" },
  // Alquiler, gastos comunes, arreglos.
  { name: "Casa", color: "#14b8a6", icon: "house" },
  // UTE, OSE, internet, celular.
  { name: "Servicios", color: "#0ea5e9", icon: "plug" },
  { name: "Salidas", color: "#a855f7", icon: "party-popper" },
  { name: "Salud", color: "#ef4444", icon: "heart-pulse" },
  { name: "Deporte", color: "#84cc16", icon: "dumbbell" },
  // Facultad, cursos, libros, materiales. Se paga en tandas grandes y en
  // meses puntuales: mezclarlo con Compras escondia el bulto.
  { name: "Estudio", color: "#3b82f6", icon: "graduation-cap" },
  // Ropa, electronica, cosas para la casa.
  { name: "Compras", color: "#eab308", icon: "shopping-bag" },
  // Aparte de Compras: no es plata que gastas en vos y en diciembre se
  // dispara, asi que mezclarla tapaba las dos cosas.
  { name: "Regalos", color: "#d946ef", icon: "gift" },
  { name: "Suscripciones", color: "#ec4899", icon: "repeat" },
  // Impuestos, comisiones del banco, seguros: la plata que se va sola.
  { name: "Impuestos", color: "#475569", icon: "landmark" },
  // Plata que le prestaste a alguien. Contablemente no es un gasto (es algo
  // que te deben), pero tratarlo como gasto y anotar la devolucion en "Me
  // devolvieron" cierra la cuenta sin inventar un modulo de deudas.
  { name: "Prestar plata", color: "#b45309", icon: "hand-coins" },
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
  // La contracara de "Prestar plata".
  { name: "Me devolvieron", color: "#f59e0b", icon: "hand-coins" },
  {
    name: "Otros ingresos",
    color: "#94a3b8",
    icon: "circle-help",
    system: true,
  },
];
