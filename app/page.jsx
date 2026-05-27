'use client'; // Zwingend erforderlich für Next.js!

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js'; // Normaler Import
import { Trophy, Home, PenTool, User, AlertCircle, ChevronRight, CheckCircle2, XCircle, Users } from 'lucide-react';

// Init mit Environment Variables (Sicher!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback-ID
const TEMP_USER_ID = '11111111-1111-1111-1111-111111111111'; 

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState({ id: null, name: 'Lade...', points: 0, rank: '-' });
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // --- DATEN FETCHING ---
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setErrorMsg(null);
      
      try {
        // 1. Hole Profile für Leaderboard & aktuellen Nutzer
        const { data: profilesData, error: profError } = await supabase
          .from('profiles')
          .select('id, display_name, total_points')
          .order('total_points', { ascending: false });
        
        if (profError) throw profError;
        
        const sortedLeaderboard = profilesData || [];
        setLeaderboard(sortedLeaderboard);

        // Defensive Logik: Suche den Test-User. Wenn nicht gefunden, nimm den ersten verfügbaren.
        let myProfile = sortedLeaderboard.find(p => p.id === TEMP_USER_ID);
        if (!myProfile && sortedLeaderboard.length > 0) {
          myProfile = sortedLeaderboard[0];
          console.warn("Spezifische Test-UUID nicht gefunden. Fallback auf den ersten DB-Nutzer:", myProfile.id);
        }

        if (myProfile) {
          const myRank = sortedLeaderboard.findIndex(p => p.id === myProfile.id) + 1;
          setCurrentUserProfile({ 
            id: myProfile.id,
            name: myProfile.display_name || 'Unbenannt', // Verhindert null-pointer bei .split()
            points: myProfile.total_points || 0, 
            rank: myRank 
          });
        } else {
          setCurrentUserProfile({ id: null, name: 'Kein Nutzer', points: 0, rank: '-' });
        }

        // 2. Hole alle Spieler für das Torschützen Modal
        const { data: playersData, error: pError } = await supabase
          .from('players')
          .select('id, name, is_in_starting_xi, team_id, teams(name)');
        
        if (pError) throw pError;
        setPlayers(playersData || []);

        // 3. Hole alle Spiele inkl. phase
        const { data: matchesData, error: mError } = await supabase
          .from('matches')
          .select(`
            id, phase, kickoff_time, status, home_score, away_score, first_goalscorer_id,
            home_team:teams!home_team_id(id, name, flag_url),
            away_team:teams!away_team_id(id, name, flag_url),
            bets(id, user_id, home_score, away_score, first_goalscorer_id, points_awarded, profiles(display_name))
          `)
          .order('kickoff_time', { ascending: true });

        if (mError) throw mError;

        // Sicherstellen, dass matchesData ein Array ist (Fallout-Schutz)
        const safeMatchesData = matchesData || [];

        const activeUserId = myProfile ? myProfile.id : null;

        const formattedMatches = safeMatchesData.map(match => {
          const myBet = match.bets?.find(b => b.user_id === activeUserId);
          const otherBets = match.bets?.filter(b => b.user_id !== activeUserId) || [];
          
          return {
            id: match.id,
            phase: match.phase || 'Unsortiert', // Fallback, falls DB-Feld leer ist
            homeTeam: match.home_team?.name || 'Unbekannt',
            homeFlag: match.home_team?.flag_url || '🏳️',
            awayTeam: match.away_team?.name || 'Unbekannt',
            awayFlag: match.away_team?.flag_url || '🏳️',
            kickoff: match.kickoff_time,
            status: match.status,
            homeScore: match.home_score,
            awayScore: match.away_score,
            firstScorerId: match.first_goalscorer_id, 
            userTip: myBet ? { 
              id: myBet.id,
              home: myBet.home_score, 
              away: myBet.away_score, 
              scorerId: myBet.first_goalscorer_id,
              points: myBet.points_awarded || 0
            } : null,
            otherTips: otherBets.map(b => ({
               user: b.profiles?.display_name || 'Unbenannt',
               home: b.home_score,
               away: b.away_score,
               scorerId: b.first_goalscorer_id
            }))
          };
        });

        setMatches(formattedMatches);
      } catch (error) {
        console.error("Datenbank-Fehler beim Init:", error);
        setErrorMsg(error.message || "Unbekannter Fehler beim Laden der Daten.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-medium animate-pulse">Lade Spieldaten...</div>;
  
  if (errorMsg) return (
    <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 text-sm max-w-md w-full shadow-sm">
        <strong className="block mb-2 flex items-center gap-2"><AlertCircle size={18}/> Datenbank-Fehler</strong>
        <p className="break-words">{errorMsg}</p>
        <button onClick={() => window.location.reload()} className="mt-4 bg-red-100 text-red-800 px-4 py-2 rounded font-semibold text-xs w-full">Neu laden</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="text-yellow-400" size={24} />
          WM 2026
        </h1>
        <div className="text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700 max-w-[100px] truncate">
          {(currentUserProfile.name || '').split(' ')[0]}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {currentView === 'dashboard' && <DashboardView onNavigate={setCurrentView} matches={matches} userProfile={currentUserProfile} leaderboard={leaderboard} players={players} />}
        {currentView === 'tippen' && <BettingView matches={matches} setMatches={setMatches} players={players} currentUser={currentUserProfile} />}
        {currentView === 'uebersicht' && <OverviewView matches={matches} players={players} currentUser={currentUserProfile} />}
        {currentView === 'bonus' && <BonusView />}
      </main>

      <nav className="bg-white border-t border-gray-200 fixed bottom-0 w-full flex justify-around items-center h-16 px-2 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
        <NavItem icon={<Home />} label="Home" isActive={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
        <NavItem icon={<PenTool />} label="Tippen" isActive={currentView === 'tippen'} onClick={() => setCurrentView('tippen')} />
        <NavItem icon={<Users />} label="Übersicht" isActive={currentView === 'uebersicht'} onClick={() => setCurrentView('uebersicht')} />
        <NavItem icon={<Trophy />} label="Bonus" isActive={currentView === 'bonus'} onClick={() => setCurrentView('bonus')} />
      </nav>
    </div>
  );
}

// --- VIEWS ---

function DashboardView({ onNavigate, matches, userProfile, leaderboard, players }) {
  const nextMatch = matches.find(m => new Date(m.kickoff) > new Date() && m.status !== 'FINISHED') || matches[0];

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl shadow-lg flex justify-between items-center">
        <div>
          <p className="text-blue-100 text-sm font-medium mb-1">Deine Platzierung</p>
          <div className="text-3xl font-bold flex items-baseline gap-1">
            Platz {userProfile.rank} <span className="text-lg font-normal text-blue-200">/ {leaderboard.length}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-blue-100 text-sm font-medium mb-1">Punkte</p>
          <p className="text-3xl font-bold">{userProfile.points}</p>
        </div>
      </div>

      {nextMatch ? (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800">Nächstes Spiel</h3>
            {nextMatch.status === 'FINISHED' ? (
              <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">Beendet</span>
            ) : (
              <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-1 rounded-full animate-pulse">Bald</span>
            )}
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <div className="text-center w-1/3">
              <div className="text-3xl mb-1">{nextMatch.homeFlag}</div>
              <div className="text-xs font-semibold truncate">{nextMatch.homeTeam}</div>
            </div>
            <div className="text-center text-sm font-bold bg-gray-100 px-3 py-1 rounded-lg">
              {nextMatch.status === 'FINISHED' ? `${nextMatch.homeScore} : ${nextMatch.awayScore}` : (nextMatch.kickoff ? new Date(nextMatch.kickoff).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'TBA')}
            </div>
            <div className="text-center w-1/3">
              <div className="text-3xl mb-1">{nextMatch.awayFlag}</div>
              <div className="text-xs font-semibold truncate">{nextMatch.awayTeam}</div>
            </div>
          </div>

          {nextMatch.status !== 'FINISHED' && !nextMatch.userTip && (
            <button onClick={() => onNavigate('tippen')} className="w-full bg-green-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition">
              Jetzt Tipp abgeben <ChevronRight size={18} />
            </button>
          )}
          {nextMatch.status !== 'FINISHED' && nextMatch.userTip && (
            <div className="bg-gray-50 p-3 rounded-lg text-center text-sm border border-gray-200">
              Dein Tipp: <strong className="text-lg">{nextMatch.userTip.home} : {nextMatch.userTip.away}</strong>
              <div className="text-gray-500 text-xs mt-1">
                Torschütze: {players.find(p => p.id === nextMatch.userTip.scorerId)?.name || 'Kein Torschütze'}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500 text-sm">
          Keine Spiele in der Datenbank gefunden.
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Gesamtwertung</h3>
        <div className="space-y-3">
          {leaderboard.map((user, idx) => (
            <div key={user.id} className={`flex justify-between items-center p-3 rounded-lg ${user.id === userProfile.id ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-6 text-center font-bold ${idx === 0 ? 'text-yellow-500' : 'text-gray-500'}`}>
                  {idx + 1}.
                </div>
                <div className="font-medium text-sm">{user.display_name || 'Unbenannt'}</div>
              </div>
              <div className="font-bold">{user.total_points || 0} <span className="text-xs font-normal text-gray-500">Pkt</span></div>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="text-xs text-gray-400 text-center">Noch keine Profile vorhanden.</p>}
        </div>
      </div>
    </div>
  );
}

function BettingView({ matches, setMatches, players, currentUser }) {
  // Extrahiere alle einzigartigen Phasen aus den Spielen
  const phases = useMemo(() => {
    const uniquePhases = [...new Set(matches.map(m => m.phase))].filter(Boolean);
    return uniquePhases.length > 0 ? uniquePhases : ['Alle Spiele'];
  }, [matches]);

  const [activeTab, setActiveTab] = useState(phases[0]);

  // Stelle sicher, dass der aktive Tab existiert
  useEffect(() => {
    if (!phases.includes(activeTab) && phases.length > 0) {
      setActiveTab(phases[0]);
    }
  }, [phases, activeTab]);

  const displayMatches = activeTab === 'Alle Spiele' 
    ? matches 
    : matches.filter(m => m.phase === activeTab);

  const handleSaveTip = async (matchId, tipData) => {
    if (!currentUser.id) {
        alert("Fehler: Kein aktiver Nutzer gefunden.");
        return;
    }

    try {
      const payload = {
        user_id: currentUser.id,
        match_id: matchId,
        home_score: tipData.home,
        away_score: tipData.away,
        first_goalscorer_id: tipData.scorerId,
        updated_at: new Date().toISOString()
      };

      if (tipData.id) {
          payload.id = tipData.id;
      }

      const { data, error } = await supabase
        .from('bets')
        .upsert(payload, { onConflict: 'user_id, match_id' })
        .select()
        .single();

      if (error) throw error;

      setMatches(prev => prev.map(m => m.id === matchId ? { 
        ...m, 
        userTip: { id: data.id, home: data.home_score, away: data.away_score, scorerId: data.first_goalscorer_id, points: data.points_awarded || 0 } 
      } : m));

      const btn = document.getElementById(`save-btn-${matchId}`);
      if(btn) {
          const originalText = btn.innerText;
          btn.innerText = "✓ Gespeichert";
          btn.classList.replace('bg-slate-900', 'bg-green-600');
          setTimeout(() => {
              btn.innerText = originalText;
              btn.classList.replace('bg-green-600', 'bg-slate-900');
          }, 2000);
      }
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
      alert("Fehler beim Speichern: " + err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Dynamische Tabs basierend auf der DB Spalte 'phase' */}
      <div className="flex overflow-x-auto p-4 gap-2 no-scrollbar bg-white shadow-sm sticky top-0 z-0">
        {phases.map(phase => (
          <button 
            key={phase}
            onClick={() => setActiveTab(phase)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition ${activeTab === phase ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {phase}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {displayMatches.map(match => (
          <MatchBetCard key={match.id} match={match} onSave={handleSaveTip} players={players} />
        ))}
        {displayMatches.length === 0 && <p className="text-center text-gray-500 mt-10">Keine Spiele gefunden.</p>}
      </div>
    </div>
  );
}

function MatchBetCard({ match, onSave, players }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localTip, setLocalTip] = useState(match.userTip || { id: undefined, home: '', away: '', scorerId: null });
  
  const isLocked = !match.kickoff || new Date(match.kickoff) <= new Date();

  const resolvePlayerName = (id) => {
      if (!id) return null;
      return players.find(p => p.id === id)?.name;
  };

  if (match.status === 'FINISHED') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative">
        <div className="bg-slate-800 px-4 py-2 text-xs font-semibold text-white flex justify-between">
          <span>{match.kickoff ? new Date(match.kickoff).toLocaleDateString('de-DE') : 'Unbekannt'}</span>
          <span>Beendet</span>
        </div>
        <div className="p-4">
          <div className="absolute top-10 right-0 bg-yellow-400 text-yellow-900 font-black px-4 py-1 rounded-l-full shadow-md z-0">
            +{match.userTip?.points || 0} Pkt.
          </div>
          
          <div className="flex justify-between items-center mb-4 mt-2 relative z-10">
            <div className="text-center w-1/3">
               <div className="text-3xl mb-1">{match.homeFlag}</div>
               <div className="text-sm font-semibold truncate">{match.homeTeam}</div>
            </div>
            <div className="w-1/3 text-center px-2">
              <div className="text-3xl font-black text-slate-900 tracking-wider">
                {match.homeScore ?? '-'}:{match.awayScore ?? '-'}
              </div>
            </div>
            <div className="text-center w-1/3">
               <div className="text-3xl mb-1">{match.awayFlag}</div>
               <div className="text-sm font-semibold truncate">{match.awayTeam}</div>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg text-center mb-4 border border-gray-100">
             <div className="text-xs text-gray-400 font-semibold mb-1 uppercase">Offizieller Torschütze</div>
             <div className="text-sm font-bold text-gray-800">⚽ {resolvePlayerName(match.firstScorerId) || 'Kein Torschütze'}</div>
          </div>

          <div className="border-t border-gray-100 pt-3 flex flex-col gap-1">
             <div className="text-xs text-gray-400">Dein Tipp war:</div>
             <div className="text-sm font-medium text-slate-700">
                 {match.userTip 
                    ? `${match.userTip.home}:${match.userTip.away} (${resolvePlayerName(match.userTip.scorerId) || 'Keiner'})` 
                    : 'Kein Tipp abgegeben'}
             </div>
          </div>
        </div>
      </div>
    );
  }

  const handleScoreChange = (team, value) => {
    if(isLocked) return;
    const num = parseInt(value);
    setLocalTip(prev => ({ ...prev, [team]: isNaN(num) ? '' : num }));
  };

  const handleScorerSelect = (playerId) => {
    setLocalTip(prev => ({ ...prev, scorerId: playerId }));
    setIsModalOpen(false);
  };

  const saveAction = () => {
    if (localTip.home === '' || localTip.away === '') {
        alert("Bitte tippe zumindest das Ergebnis!");
        return;
    }
    onSave(match.id, localTip);
  };

  const matchPlayers = players.filter(p => p.team_id === match.home_team?.id || p.team_id === match.away_team?.id || true); 

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 flex justify-between border-b border-gray-100">
        <span>{match.kickoff ? `${new Date(match.kickoff).toLocaleDateString('de-DE')} - ${new Date(match.kickoff).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Termin TBA'}</span>
        {isLocked ? <span className="text-red-600 flex items-center gap-1"><AlertCircle size={12}/> Gesperrt</span> : <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> Offen</span>}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="text-center flex-1">
             <div className="text-3xl mb-1">{match.homeFlag}</div>
             <div className="text-sm font-semibold truncate">{match.homeTeam}</div>
          </div>
          
          <div className="flex gap-2 items-center px-4">
            <input 
              type="number" min="0" disabled={isLocked}
              value={localTip.home} onChange={(e) => handleScoreChange('home', e.target.value)}
              className="w-12 h-14 text-center text-xl font-bold bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="font-bold text-gray-400">:</span>
            <input 
              type="number" min="0" disabled={isLocked}
              value={localTip.away} onChange={(e) => handleScoreChange('away', e.target.value)}
              className="w-12 h-14 text-center text-xl font-bold bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="text-center flex-1">
             <div className="text-3xl mb-1">{match.awayFlag}</div>
             <div className="text-sm font-semibold truncate">{match.awayTeam}</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Erster Torschütze</label>
          <button 
            disabled={isLocked}
            onClick={() => setIsModalOpen(true)}
            className="w-full p-3 text-left bg-gray-50 border border-gray-200 rounded-lg text-sm flex justify-between items-center active:bg-gray-100 disabled:opacity-50"
          >
            <span className={localTip.scorerId ? 'text-gray-900 font-semibold' : 'text-gray-400'}>
              {resolvePlayerName(localTip.scorerId) || 'Torschütze auswählen...'}
            </span>
            {!isLocked && <ChevronRight size={16} className="text-gray-400" />}
          </button>
        </div>

        {!isLocked && (
            <button id={`save-btn-${match.id}`} onClick={saveAction} className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg active:scale-95 transition">
                Tipp speichern
            </button>
        )}
      </div>

      {isModalOpen && (
        <GoalscorerModal onClose={() => setIsModalOpen(false)} onSelect={handleScorerSelect} players={matchPlayers} />
      )}
    </div>
  );
}

function GoalscorerModal({ onClose, onSelect, players }) {
    const starters = players.filter(p => p.is_in_starting_xi);
    const bench = players.filter(p => !p.is_in_starting_xi);

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex-1 w-full" onClick={onClose} />
            
            <div className="bg-white w-full rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl max-w-md mx-auto">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-3xl z-10">
                    <h3 className="font-bold text-lg">Torschütze wählen</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full active:bg-gray-200">
                        <XCircle size={20} className="text-gray-600" />
                    </button>
                </div>
                
                <div className="overflow-y-auto p-4 space-y-6 pb-safe">
                    <button onClick={() => onSelect(null)} className="w-full text-left p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 font-semibold text-gray-700 active:bg-gray-50 transition">
                        Kein Torschütze (oder Eigentor)
                    </button>

                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Wahrscheinliche Startelf / Bekannt</h4>
                        <div className="space-y-2">
                            {starters.length > 0 ? starters.map(player => (
                                <button 
                                    key={player.id} onClick={() => onSelect(player.id)}
                                    className="w-full text-left p-3 rounded-lg bg-gray-50 border border-gray-100 active:bg-blue-50 active:border-blue-200 transition flex justify-between items-center"
                                >
                                    <span className="font-medium text-gray-900">{player.name}</span>
                                    <span className="text-xs font-semibold text-gray-500 px-2 py-1 bg-gray-200 rounded">{player.teams?.name || 'Unbekannt'}</span>
                                </button>
                            )) : <p className="text-sm text-gray-400">Keine Startelf-Daten verfügbar.</p>}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Restlicher Kader</h4>
                        <div className="space-y-2">
                            {bench.map(player => (
                                <button 
                                    key={player.id} onClick={() => onSelect(player.id)}
                                    className="w-full text-left p-3 rounded-lg bg-white border border-gray-200 active:bg-blue-50 transition flex justify-between items-center"
                                >
                                    <span className="text-gray-700">{player.name}</span>
                                    <span className="text-xs text-gray-400">{player.teams?.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function OverviewView({ matches, players, currentUser }) {
  const phases = useMemo(() => {
    const uniquePhases = [...new Set(matches.map(m => m.phase))].filter(Boolean);
    return uniquePhases.length > 0 ? uniquePhases : ['Alle Spiele'];
  }, [matches]);

  const [activeTab, setActiveTab] = useState(phases[0]);

  useEffect(() => {
    if (!phases.includes(activeTab) && phases.length > 0) {
      setActiveTab(phases[0]);
    }
  }, [phases, activeTab]);

  const displayMatches = activeTab === 'Alle Spiele' 
    ? matches 
    : matches.filter(m => m.phase === activeTab);

  const resolvePlayerName = (id) => {
    if (!id) return 'Keiner';
    return players.find(p => p.id === id)?.name?.split(' ').pop() || 'Unbekannt'; 
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="flex overflow-x-auto p-4 gap-2 no-scrollbar bg-white shadow-sm sticky top-0 z-0">
        {phases.map(phase => (
          <button 
            key={phase}
            onClick={() => setActiveTab(phase)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition ${activeTab === phase ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {phase}
          </button>
        ))}
      </div>
      
      <div className="p-4 space-y-4">
        {displayMatches.map(match => {
          const isLocked = !match.kickoff || new Date(match.kickoff) <= new Date();
          
          const allTips = [];
          if (match.userTip) {
            allTips.push({ user: currentUser.name, ...match.userTip });
          }
          if (match.otherTips) {
            allTips.push(...match.otherTips);
          }

          return (
            <div key={match.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-800 text-white px-3 py-2 flex justify-between items-center text-sm">
                <div className="font-semibold flex items-center gap-2">
                  <span>{match.homeFlag} {match.homeTeam.substring(0,3).toUpperCase()}</span>
                  <span className="text-gray-400 font-normal">-</span>
                  <span>{match.awayFlag} {match.awayTeam.substring(0,3).toUpperCase()}</span>
                </div>
                <div className="text-xs font-mono bg-slate-900 px-2 py-1 rounded border border-slate-700">
                  {match.status === 'FINISHED' ? `${match.homeScore ?? '-'}:${match.awayScore ?? '-'}` : (isLocked ? 'LIVE' : (match.kickoff ? new Date(match.kickoff).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'TBA'))}
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {allTips.length > 0 ? allTips.map((tip, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-2 text-sm ${tip.user === currentUser.name ? 'bg-blue-50/40' : ''}`}>
                    <span className={`w-1/3 truncate ${tip.user === currentUser.name ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>
                      {tip.user}
                    </span>
                    
                    {(!isLocked && tip.user !== currentUser.name) ? (
                       <span className="w-2/3 text-right text-gray-400 italic text-xs">Tipp abgegeben (verdeckt)</span>
                    ) : (
                      <>
                        <span className="w-1/4 text-center font-bold font-mono text-gray-900">
                          {tip.home}:{tip.away}
                        </span>
                        <span className="w-5/12 text-right text-xs text-gray-500 truncate" title={resolvePlayerName(tip.scorerId)}>
                          {resolvePlayerName(tip.scorerId)}
                        </span>
                      </>
                    )}
                  </div>
                )) : (
                  <div className="p-3 text-center text-xs text-gray-400">Noch keine Tipps vorhanden.</div>
                )}
              </div>
            </div>
          )
        })}
        {displayMatches.length === 0 && <p className="text-center text-gray-500 mt-10">Keine Spiele gefunden.</p>}
      </div>
    </div>
  );
}

function BonusView() {
    return (
        <div className="p-4 max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-4">Bonusfragen</h2>
            <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl border border-yellow-200 text-sm mb-4">
               <strong>Achtung:</strong> In deinem Datenbank-Schema fehlt aktuell noch eine Tabelle (z.B. <code>bonus_bets</code>), um diese Information zu speichern. Dies ist nur ein UI-Platzhalter.
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg">Wer wird Weltmeister?</h3>
                    <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded">+5 Pkt</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">Muss vor Beginn des Turniers getippt werden.</p>
                <select className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Bitte wählen...</option>
                    <option value="GER">Deutschland</option>
                    <option value="ESP">Spanien</option>
                    <option value="ARG">Argentinien</option>
                </select>
                <button className="w-full bg-slate-900 text-white font-semibold py-3 rounded-lg mt-4 active:scale-95 transition opacity-50 cursor-not-allowed">Speichern (Deaktiviert)</button>
            </div>
        </div>
    );
}

function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
      <div className={isActive ? 'transform scale-110 transition-transform' : 'transition-transform'}>
        {React.cloneElement(icon, { size: 22 })}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
