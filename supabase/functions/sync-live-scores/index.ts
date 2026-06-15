import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Status, die als endgültig vorbei gelten -> NICHT mehr synchronisieren
const DONE = ["FT", "AET", "PEN", "CANC", "PST", "ABD", "AWD", "WO", "TBD"];

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("FOOTBALL_API_KEY");
    if (!apiKey) return json({ error: "FOOTBALL_API_KEY ist nicht gesetzt." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Nicht autorisiert." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Aufrufer verifizieren + Rolle prüfen (nur mod/admin)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Ungültige Session." }, 401);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    const role = prof?.role;
    if (role !== "mod" && role !== "admin") return json({ error: "Keine Berechtigung." }, 403);

    // Laufende Spiele (angepfiffen, noch nicht endgültig vorbei, in den letzten 6h)
    const nowIso = new Date().toISOString();
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const { data: liveMatches, error: lmErr } = await admin
      .from("matches")
      .select("id, api_id, status, first_goalscorer_id")
      .lte("kickoff_time", nowIso)
      .gte("kickoff_time", sixHoursAgo)
      .not("status", "in", `(${DONE.join(",")})`);
    if (lmErr) return json({ error: lmErr.message }, 500);

    const targets = (liveMatches || []).filter((m: any) => m.api_id);
    if (targets.length === 0) return json({ updated: 0, checked: 0, message: "Keine laufenden Spiele." });

    // API-Football: Fixtures per ids (max 20 pro Request) abfragen
    const apiIds: number[] = targets.map((m: any) => Number(m.api_id));
    let fixtures: any[] = [];
    for (let i = 0; i < apiIds.length; i += 20) {
      const chunk = apiIds.slice(i, i + 20);
      const url = `https://v3.football.api-sports.io/fixtures?ids=${chunk.join("-")}`;
      const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
      if (!r.ok) return json({ error: `API-Football Fehler: ${r.status}` }, 502);
      const body = await r.json();
      fixtures = fixtures.concat(body.response || []);
    }

    let updated = 0;
    for (const fx of fixtures) {
      const match = targets.find((m: any) => Number(m.api_id) === Number(fx.fixture?.id));
      if (!match) continue;

      const patch: Record<string, unknown> = {
        home_score: fx.goals?.home ?? null,
        away_score: fx.goals?.away ?? null,
        status: fx.fixture?.status?.short ?? match.status,
        updated_at: new Date().toISOString(),
      };

      // Ersten Torschützen nur setzen, wenn noch keiner gesetzt ist (Backend nicht überschreiben)
      if (!match.first_goalscorer_id && Array.isArray(fx.events)) {
        const goals = fx.events
          .filter((e: any) => e.type === "Goal" && e.detail !== "Own Goal" && e.player?.id)
          .sort((a: any, b: any) =>
            ((a.time?.elapsed ?? 0) + (a.time?.extra ?? 0)) -
            ((b.time?.elapsed ?? 0) + (b.time?.extra ?? 0)));
        const scorerApiId = goals[0]?.player?.id;
        if (scorerApiId) {
          const { data: pl } = await admin
            .from("players").select("id").eq("api_id", scorerApiId).maybeSingle();
          if (pl?.id) patch.first_goalscorer_id = pl.id;
        }
      }

      const { error: upErr } = await admin.from("matches").update(patch).eq("id", match.id);
      if (!upErr) updated++;
    }

    return json({ updated, checked: targets.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
