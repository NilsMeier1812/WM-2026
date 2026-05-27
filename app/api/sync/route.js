import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// KEINE Initialisierung hier oben! Nur die Funktion selbst.
export async function GET() {
    // Hole die Variablen erst HIER, wenn die Funktion tatsächlich aufgerufen wird
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Variablen fehlen" }, { status: 500 });
    }

    // Initialisierung erst jetzt, wenn wir die Daten wirklich brauchen
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log(`[${new Date().toISOString()}] Starte API-Sync via Vercel...`);
        
        // ... ab hier dein restlicher Sync-Code ...
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);

        const { data: activeMatches, error: matchFetchError } = await supabase
            .from('matches')
            .select('id, api_id, status')
            .not('status', 'in', '("FT", "AET", "PEN")')
            .lte('kickoff_time', now.toISOString());

        if (matchFetchError) throw new Error(`DB Fetch Error: ${matchFetchError.message}`);

        return NextResponse.json({ success: true, message: "Sync Logik läuft" });
        
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
