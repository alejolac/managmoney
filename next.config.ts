import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saca el badge "N" de la esquina. Es el indicador de Next en desarrollo:
  // no existe en produccion, pero molesta mientras trabajas.
  devIndicators: false,
};

export default nextConfig;
