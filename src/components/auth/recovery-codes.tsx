import { AlertTriangle } from "lucide-react";

/**
 * Los codigos se muestran una unica vez, aca. En la base solo queda su hash,
 * asi que si se cierran sin copiarlos no hay forma de recuperarlos.
 */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium">Guarda estos codigos ahora</p>
          <p className="text-muted">
            Son de un solo uso y sirven para entrar si perdes el celular. No se
            vuelven a mostrar.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-surface p-3 font-mono text-sm tabular">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}
