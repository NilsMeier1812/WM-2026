import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Nutzt den Service Role Key für Admin-Rechte (wird nicht an den Client geleakt)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
    console.log(`[${new Date().toISOString()}] Starte API-Sync via Vercel...`);

    try {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);

        const { data: activeMatches, error: matchFetchError } = await supabase
            .from('matches')
            .select('id, api_id, status')
            .not('status', 'in', '("FT", "AET", "PEN")')
            .lte('kickoff_time', now.toISOString());

        if (matchFetchError) throw new Error(`DB Fetch Error: ${matchFetchError.message}`);

        if (!activeMatches || activeMatches.length === 0) {
            return NextResponse.json({ success: true, message: "Keine laufenden Spiele." });
        }

        const apiIds = activeMatches.map(m => m.api_id).filter(Boolean);
        if (apiIds.length === 0) {
             return NextResponse.json({ success: false, message: "Fehlende api_ids" });
        }

        const idsString = apiIds.join('-');
        
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${idsString}`, {
            method: 'GET',
            headers: {
                'x-apisports-key': process.env.API_SPORTS_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });

        if (!response.ok) throw new Error(`API-Football HTTP Error: ${response.status}`);
        const apiData = await response.json();

        // Verarbeite die Antwort (Logik wie vorher)
        for (const fixtureData of apiData.response) {
            const apiFixtureId = fixtureData.fixture.id;
            const dbMatch = activeMatches.find(m => m.api_id === apiFixtureId);
            if (!dbMatch) continue;

            const fixtureStatus = fixtureData.fixture.status.short;
            const homeScore = fixtureData.goals.home;
            const awayScore = fixtureData.goals.away;

            let firstScorerApiId = null;
            if (fixtureData.events && fixtureData.events.length > 0) {
                const firstGoalEvent = fixtureData.events.find(e => e.type === 'Goal' && e.detail !== 'Missed Penalty');
                if (firstGoalEvent && firstGoalEvent.player) firstScorerApiId = firstGoalEvent.player.id;
            }

            let internalPlayerId = null;
            if (firstScorerApiId) {
                const { data: playerData } = await supabase
                    .from('players')
                    .select('id').eq('api_id', firstScorerApiId).single();
                if (playerData) internalPlayerId = playerData.id;
            }

            await supabase.from('matches').update({
                status: fixtureStatus,
                home_score: homeScore,
                away_score: awayScore,
                first_goalscorer_id: internalPlayerId,
                updated_at: new Date().toISOString()
            }).eq('id', dbMatch.id);
        }

        return NextResponse.json({ success: true, message: "Sync erfolgreich abgeschlossen." });
    } catch (error) {
        console.error("Fataler Fehler im Sync-Skript:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
