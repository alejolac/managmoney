import type { Currency, TxType } from "@/generated/prisma/enums";

/**
 * Filtros de la lista de movimientos, en la URL.
 *
 * Van en la URL y no en estado del componente a proposito: asi una busqueda se
 * puede compartir, guardar en favoritos y volver con el boton de atras. Y sobre
 * todo, el dashboard puede linkear directo a "los gastos de supermercado de
 * julio" sin inventar otro mecanismo.
 */

export type TransactionFilters = {
  q: string | null;
  type: TxType | null;
  accountId: string | null;
  categoryId: string | null;
  currency: Currency | null;
  from: string | null;
  to: string | null;
  planId: string | null;
  envelopeId: string | null;
  page: number;
};

export const EMPTY_FILTERS: TransactionFilters = {
  q: null,
  type: null,
  accountId: null,
  categoryId: null,
  currency: null,
  from: null,
  to: null,
  planId: null,
  envelopeId: null,
  page: 1,
};

/** Nombres de los parametros, en castellano como el resto de la app. */
export const PARAM = {
  q: "q",
  type: "tipo",
  accountId: "cuenta",
  categoryId: "categoria",
  currency: "moneda",
  from: "desde",
  to: "hasta",
  planId: "plan",
  envelopeId: "sobre",
  page: "pagina",
} as const;

/**
 * Valor especial para "los que no tienen categoria".
 *
 * Hace falta porque en la base eso es un `categoryId` nulo, y un nulo en los
 * filtros significa lo contrario: "no filtres por categoria". Sin este
 * centinela, entrar a la porcion "Sin categorizar" del grafico abria la lista
 * con TODOS los gastos.
 */
export const UNCATEGORIZED = "sin-categoria";

const TYPES: TxType[] = ["EXPENSE", "INCOME", "TRANSFER"];
const CURRENCIES: Currency[] = ["UYU", "USD", "EUR", "BRL", "ARS"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RawParams = Record<string, string | string[] | undefined>;

function one(params: RawParams, key: string): string | null {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Lee los filtros de la URL descartando cualquier cosa que no reconozca.
 *
 * Nada de lo que llega por la URL se cree: un `tipo=DROP` queda en null y la
 * consulta sale igual, sin ese filtro.
 */
export function parseFilters(params: RawParams): TransactionFilters {
  const type = one(params, PARAM.type);
  const currency = one(params, PARAM.currency);
  const from = one(params, PARAM.from);
  const to = one(params, PARAM.to);
  const page = Number(one(params, PARAM.page) ?? 1);

  return {
    q: one(params, PARAM.q)?.slice(0, 80) ?? null,
    type: type && TYPES.includes(type as TxType) ? (type as TxType) : null,
    accountId: one(params, PARAM.accountId),
    categoryId: one(params, PARAM.categoryId),
    currency:
      currency && CURRENCIES.includes(currency as Currency)
        ? (currency as Currency)
        : null,
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    planId: one(params, PARAM.planId),
    envelopeId: one(params, PARAM.envelopeId),
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** Cuantos filtros hay puestos, sin contar la paginacion. */
export function countActiveFilters(filters: TransactionFilters): number {
  return [
    filters.q,
    filters.type,
    filters.accountId,
    filters.categoryId,
    filters.currency,
    filters.from,
    filters.to,
    filters.planId,
    filters.envelopeId,
  ].filter(Boolean).length;
}

/** Arma el query string, salteando lo vacio y la pagina 1. */
export function toQueryString(filters: Partial<TransactionFilters>): string {
  const params = new URLSearchParams();

  const entries: [string, string | number | null | undefined][] = [
    [PARAM.q, filters.q],
    [PARAM.type, filters.type],
    [PARAM.accountId, filters.accountId],
    [PARAM.categoryId, filters.categoryId],
    [PARAM.currency, filters.currency],
    [PARAM.from, filters.from],
    [PARAM.to, filters.to],
    [PARAM.planId, filters.planId],
    [PARAM.envelopeId, filters.envelopeId],
    [PARAM.page, filters.page && filters.page > 1 ? filters.page : null],
  ];

  for (const [key, value] of entries) {
    if (value !== null && value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Primer y ultimo dia del mes de `date`, en el formato del input date. */
export function monthRange(date: Date): { from: string; to: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

export type DatePreset = {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
};

/** Los rangos que uno quiere el 90% de las veces, sin abrir el calendario. */
export function datePresets(today: Date): DatePreset[] {
  const thisMonth = monthRange(today);
  const previous = monthRange(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
  );
  const year = today.getUTCFullYear();

  return [
    { key: "todo", label: "Todo", from: null, to: null },
    { key: "mes", label: "Este mes", from: thisMonth.from, to: thisMonth.to },
    {
      key: "mes-pasado",
      label: "Mes pasado",
      from: previous.from,
      to: previous.to,
    },
    {
      key: "ano",
      label: "Este año",
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    },
  ];
}
