# sync-live-scores

Edge Function für den manuellen Sofort-Sync der Live-Spielstände (Button in der App,
nur für `profiles.role` = `mod` oder `admin`).

Ablauf: prüft per JWT die Rolle des Aufrufers → holt alle laufenden Spiele aus `matches`
→ fragt API-Football (`v3.football.api-sports.io/fixtures?ids=...`) ab → schreibt
`home_score`, `away_score`, `status` und (falls noch keiner gesetzt ist) den ersten
Torschützen zurück. Punkteverarbeitung/Finalisierung bleibt beim Backend.

## Voraussetzung: Secret setzen (in BEIDEN Projekten)

```bash
supabase secrets set FOOTBALL_API_KEY=dein_api_key --project-ref kuzxrwzydddykliunhvg   # Dev
supabase secrets set FOOTBALL_API_KEY=dein_api_key --project-ref hinedxiclumqsvludqsl   # Prod
```

(`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase automatisch bereitgestellt.)

## Deploy (in BEIDE Projekte)

```bash
supabase functions deploy sync-live-scores --project-ref kuzxrwzydddykliunhvg   # Dev
supabase functions deploy sync-live-scores --project-ref hinedxiclumqsvludqsl   # Prod
```

`verify_jwt` bleibt aktiviert (Standard). Die eigentliche Berechtigung wird zusätzlich
im Function-Body über die Rolle geprüft.
