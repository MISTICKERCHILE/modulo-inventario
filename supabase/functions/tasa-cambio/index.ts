// Tipo de cambio observado (Banco Central de Chile) vía mindicador.cl.
// El navegador no puede consultar mindicador.cl directo (CORS), así que Buddy pregunta aquí.
// GET/POST { moneda: 'USD' | 'EUR', fecha: 'YYYY-MM-DD' } → { moneda, fecha, valor, fecha_valor }
// Si el día no tiene valor (fin de semana o feriado) usa el día hábil anterior (hasta 7 días atrás).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const INDICADOR: Record<string, string> = { USD: "dolar", EUR: "euro" };
const cache = new Map<string, { valor: number; fecha_valor: string }>();

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

  const d = new Date(fecha + "T12:00:00Z");
  for (let i = 0; i < 7; i++) {
    const dd = `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
    try {
      const r = await fetch(`https://mindicador.cl/api/${ind}/${dd}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const j = await r.json();
        if (j?.serie?.length) {
          const out = { valor: Number(j.serie[0].valor), fecha_valor: String(j.serie[0].fecha).slice(0, 10) };
          cache.set(key, out);
          return json({ moneda, fecha, ...out });
        }
      }
    } catch (_) { return json({ error: "mindicador.cl no responde" }, 502); }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return json({ error: "Sin valor para esa fecha" }, 404);
});
