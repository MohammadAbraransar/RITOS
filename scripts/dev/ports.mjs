// Dev service ports in one place. Override with DESK_PORT / API_PORT / SHOP_PORT.
// They must match the URLs the apps use (frontend VITE_API_URL, shopflow RITOS_BASE_URL / SHOPFLOW_BASE_URL, backend SHOPFLOW_BASE_URL).
export const ports = {
  desk: Number(process.env.DESK_PORT || 5173),
  api: Number(process.env.API_PORT || 8000),
  shop: Number(process.env.SHOP_PORT || 3000),
};
export const allPorts = [ports.desk, ports.api, ports.shop];
