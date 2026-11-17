// Tipo de cambio observado (Banco Central de Chile) vía mindicador.cl.
// El navegador no puede consultar mindicador.cl directo (CORS), así que Buddy pregunta aquí.
// GET/POST { moneda: 'USD' | 'EUR', fecha: 'YYYY-MM-DD' } → { moneda, fecha, valor, fecha_valor }
// Si el día no tiene valor (fin de semana o feriado) usa el día hábil anterior (hasta 7 días atrás).
// Si mindicador.cl está caído, usa como respaldo el valor de mercado del día (fuente: 'mercado').
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const INDICADOR: Record<string, string> = { USD: "dolar", EUR: "euro" };
const cache = new Map<string, { valor: number; fecha_valor: string; fuente: string }>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let moneda = "", fecha = "";
  try {
    if (req.method === "POST") ({ moneda = "", fecha = "" } = await req.json());
    else { const u = new URL(req.url); moneda = u.searchParams.get("moneda") ?? ""; fecha = u.searchParams.get("fecha") ?? ""; }
  } catch { return json({ error: "Solicitud no válida" }, 400); }
  moneda = String(moneda).toUpperCase();
  const ind = INDICADOR[moneda];
  if (!ind) return json({ error: "Moneda no soportada" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Fecha no válida (YYYY-MM-DD)" }, 400);

  const key = moneda + fecha;
  const hit = cache.get(key);
  if (hit) return json({ moneda, fecha, ...hit });

  const ok = (valor: number, fecha_valor: string, fuente: string) => {
    const out = { valor, fecha_valor, fuente };
    cache.set(key, out);
    return json({ moneda, fecha, ...out });
  };

  // 1) Dólar/euro observado del Banco Central vía mindicador.cl (si el día no tiene valor, el día hábil anterior)
  const d = new Date(fecha + "T12:00:00Z");
  for (let i = 0; i < 7; i++) {
    const dd = `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
    try {
      const r = await fetch(`https://mindicador.cl/api/${ind}/${dd}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) break; // caído: pasar a la fuente de respaldo
      const j = await r.json();
      if (j?.serie?.length) return ok(Number(j.serie[0].valor), String(j.serie[0].fecha).slice(0, 10), "observado");
    } catch (_) { break; }
    d.setUTCDate(d.getUTCDate() - 1);
  }

  // 2) Respaldo: valor de mercado del día (currency-api, gratuito, con historial diario)
  const base = moneda.toLowerCase();
  for (const url of [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${fecha}/v1/currencies/${base}.min.json`,
    `https://${fecha}.currency-api.pages.dev/v1/currencies/${base}.min.json`,
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const j = await r.json();
      const v = Number(j?.[base]?.clp);
      if (v > 0) return ok(Math.round(v * 100) / 100, String(j.date ?? fecha), "mercado");
    } catch (_) { /* siguiente */ }
  }
  return json({ error: "No hay fuente disponible para esa fecha" }, 502);
});
