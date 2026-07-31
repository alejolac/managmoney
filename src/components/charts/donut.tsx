import type { ReactNode } from "react";

export type DonutSlice = {
  key: string;
  name: string;
  color: string;
  /** Porcentaje del total, 0 a 100. */
  share: number;
};

/**
 * Dona en SVG, sin libreria de graficos.
 *
 * Se dibuja con `stroke-dasharray` sobre un circulo: cada porcion pinta el
 * tramo que le toca de la circunferencia y se corre con `stroke-dashoffset`.
 * Son doce lineas de matematica contra los ~100 kB que pesa cualquier libreria
 * de charts, en una app que se va a abrir del celular con datos moviles.
 *
 * No lleva links a proposito: los tramos de una dona son chicos y dificiles de
 * acertar con el dedo. Lo clickeable son las barras de al lado, que ademas
 * dicen cuanto es cada cosa.
 */
export function Donut({
  slices,
  size = 176,
  thickness = 22,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Cada porcion arranca donde termino la anterior. Se calcula todo de una,
  // antes de dibujar, en vez de ir acumulando dentro del map.
  const arcs = slices.reduce<
    { slice: DonutSlice; length: number; offset: number }[]
  >((acc, slice) => {
    const previous = acc.at(-1);
    const start = previous ? previous.offset + previous.length : 0;
    return [
      ...acc,
      { slice, length: (slice.share / 100) * circumference, offset: start },
    ];
  }, []);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        slices.length > 0
          ? `Gasto por categoria: ${slices
              .map((slice) => `${slice.name} ${slice.share}%`)
              .join(", ")}`
          : "Sin gastos en el periodo"
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-surface-2"
        />

        {arcs.map((arc) => (
          <circle
            key={arc.slice.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.slice.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>

      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
