// FIFA World Cup 2026 — App Logic

const { tournament, groups, teamInfo, players, wcStats } = WORLDCUP_DATA;

// Helper: get WC tournament goals/assists for a player (0 if none yet)
function wcG(name) { return (wcStats[name] || {}).g || 0; }
function wcA(name) { return (wcStats[name] || {}).a || 0; }

// ── Derived lookups ──────────────────────────────────────────────
const teamToGroup = {};
Object.entries(groups).forEach(([g, teams]) => teams.forEach(t => teamToGroup[t] = g));
const allTeams = Object.keys(teamInfo).sort();
const allConfeds = [...new Set(Object.values(teamInfo).map(t => t.confederation))].sort();

let allPlayers = [];
Object.entries(players).forEach(([team, roster]) => roster.forEach(p => allPlayers.push({ ...p, team })));

// ── Favorites (persisted in localStorage) ────────────────────────
function getFavs() { try { return JSON.parse(localStorage.getItem('wc26_favs') || '[]'); } catch { return []; } }
function saveFavs(f) { try { localStorage.setItem('wc26_favs', JSON.stringify(f)); } catch {} }
function toggleFav(team) {
  const f = getFavs();
  const idx = f.indexOf(team);
  if (idx >= 0) f.splice(idx, 1); else f.push(team);
  saveFavs(f);
}
function isFav(team) { return getFavs().includes(team); }

// ── Live API (football-data.org) ─────────────────────────────────
const API_BASE = 'https://api.football-data.org/v4';
const WC_ID = 2000; // football-data.org competition ID for FIFA World Cup
let liveStandings = {}; // { groupLetter: [ { team, played, won, drawn, lost, goalsFor, goalsAgainst, points } ] }
let liveResults = {};   // { "HomeTeam vs AwayTeam": { homeScore, awayScore, status } }

function getApiKey() { try { return localStorage.getItem('wc26_apikey') || ''; } catch { return ''; } }
function saveApiKey(k) { try { localStorage.setItem('wc26_apikey', k); } catch {} }

async function fetchLiveData() {
  const key = getApiKey();
  if (!key) return;
  try {
    const [standRes, matchRes] = await Promise.all([
      fetch(`${API_BASE}/competitions/${WC_ID}/standings`, { headers: { 'X-Auth-Token': key } }),
      fetch(`${API_BASE}/competitions/${WC_ID}/matches`, { headers: { 'X-Auth-Token': key } })
    ]);
    if (standRes.ok) {
      const data = await standRes.json();
      liveStandings = {};
      (data.standings || []).forEach(s => {
        const letter = s.group?.replace('GROUP_', '') || s.stage;
        if (letter) liveStandings[letter] = s.table.map(r => ({
          team: r.team.name, played: r.playedGames, won: r.won,
          drawn: r.draw, lost: r.lost, goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst, points: r.points
        }));
      });
    }
    if (matchRes.ok) {
      const data = await matchRes.json();
      liveResults = {};
      (data.matches || []).forEach(m => {
        if (m.status === 'FINISHED' || m.status === 'IN_PLAY') {
          const key = `${m.homeTeam.name}|${m.awayTeam.name}`;
          liveResults[key] = {
            homeScore: m.score.fullTime.home ?? m.score.halfTime.home,
            awayScore: m.score.fullTime.away ?? m.score.halfTime.away,
            status: m.status
          };
        }
      });
      renderGroups(); renderFixtures();
    }
  } catch (e) { console.warn('Live data fetch failed:', e); }
}

// ── Helpers ──────────────────────────────────────────────────────
function flagImg(team, size = 'w40') {
  const info = teamInfo[team];
  if (!info) return '';
  return `<img class="flag-img" src="https://flagcdn.com/${size}/${info.code}.png" alt="${team}" loading="lazy">`;
}

function parseFixtureDate(dateStr) {
  // Always parse as LOCAL time to avoid UTC-midnight timezone off-by-one bugs
  const months = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };
  const m = dateStr.match(/(\w+)\s+(\d+),\s+(\d+)/);
  if (m) return new Date(+m[3], months[m[1]], +m[2]); // local midnight, no UTC offset
  return new Date(dateStr); // fallback only for unexpected formats
}

function fixtureStatus(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = parseFixtureDate(dateStr);
  if (d.getTime() === today.getTime()) return 'today';
  if (d < today) return 'past';
  return 'upcoming';
}

// ── Header ───────────────────────────────────────────────────────
document.getElementById('tournament-sub').textContent =
  `${tournament.dates} · ${tournament.teamsCount} teams · ${tournament.groupsCount} groups · ${tournament.format}`;

// ── Navigation + deep linking ─────────────────────────────────────
let _prevView = 'teams';
function showView(name) {
  const current = document.querySelector('.view.active');
  if (current) _prevView = current.id.replace('view-', '');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  // Update URL hash for deep linking
  try { history.replaceState(null, '', '#' + name); } catch {}
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// Back buttons with smart context
document.getElementById('back-from-team').addEventListener('click', () => showView(_prevView === 'view-matchup' ? 'matchup' : 'teams'));
document.getElementById('back-from-matchup').addEventListener('click', () => showView('fixtures'));

// Handle deep-link on load
(function handleHash() {
  const views = ['teams','groups','fixtures','players','bracket'];
  const hash = location.hash.replace('#','');
  if (views.includes(hash)) showView(hash);
})();

// ── Global Search ─────────────────────────────────────────────────
const globalInput = document.getElementById('global-search');
const globalResults = document.getElementById('global-results');

globalInput.addEventListener('input', () => {
  const q = globalInput.value.trim().toLowerCase();
  if (q.length < 2) { globalResults.innerHTML = ''; globalResults.classList.remove('open'); return; }
  const results = [];
  // Teams
  allTeams.filter(t => t.toLowerCase().includes(q)).slice(0,4).forEach(t => {
    results.push({ type: 'Team', label: `${t} — Group ${teamToGroup[t]}`, action: () => showTeamDetail(t), flag: flagImg(t, 'w20') });
  });
  // Players
  allPlayers.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q)).slice(0,6).forEach(p => {
    results.push({ type: 'Player', label: `${p.name} · ${p.team}`, sub: p.club, action: () => { showTeamDetail(p.team); }, flag: flagImg(p.team, 'w20') });
  });
  if (!results.length) results.push({ type: '', label: 'No results found', action: () => {} });
  globalResults.innerHTML = results.map((r, i) => `
    <div class="gr-item" data-idx="${i}">
      ${r.flag || ''} <span>${r.label}</span>
      ${r.type ? `<span class="gr-type">${r.type}</span>` : ''}
    </div>`).join('');
  globalResults.classList.add('open');
  globalResults.querySelectorAll('.gr-item').forEach((el, i) => {
    el.addEventListener('click', () => { results[i].action(); globalResults.classList.remove('open'); globalInput.value = ''; });
  });
});
document.addEventListener('click', e => { if (!globalInput.contains(e.target) && !globalResults.contains(e.target)) globalResults.classList.remove('open'); });

// ── Teams view ────────────────────────────────────────────────────
const teamsGrid = document.getElementById('teams-grid');
const teamSearch = document.getElementById('team-search');
const groupFilter = document.getElementById('group-filter');
const confedFilter = document.getElementById('confed-filter');

Object.keys(groups).sort().forEach(g => {
  const opt = document.createElement('option'); opt.value = g; opt.textContent = `Group ${g}`; groupFilter.appendChild(opt);
});
allConfeds.forEach(c => {
  const opt = document.createElement('option'); opt.value = c; opt.textContent = c; confedFilter.appendChild(opt);
});

function renderTeams() {
  const q = teamSearch.value.trim().toLowerCase();
  const g = groupFilter.value, c = confedFilter.value;
  const favs = getFavs();
  const filtered = allTeams.filter(team => {
    if (q && !team.toLowerCase().includes(q)) return false;
    if (g && teamToGroup[team] !== g) return false;
    if (c && teamInfo[team].confederation !== c) return false;
    return true;
  });
  // Favs first
  filtered.sort((a, b) => (favs.includes(b) ? 1 : 0) - (favs.includes(a) ? 1 : 0));
  if (!filtered.length) { teamsGrid.innerHTML = '<div class="empty-msg">No teams match your filters.</div>'; return; }
  teamsGrid.innerHTML = '';
  filtered.forEach(team => {
    const info = teamInfo[team];
    const fav = isFav(team);
    const card = document.createElement('div');
    card.className = 'team-card' + (fav ? ' is-fav' : '');
    card.innerHTML = `
      <div class="flag">${flagImg(team)}</div>
      <div class="info">
        <h3>${team}</h3>
        <p>${info.confederation}</p>
        <span class="group-tag">Group ${teamToGroup[team]}</span>
      </div>
      <button class="fav-btn" title="${fav ? 'Unfavourite' : 'Favourite'}">${fav ? '⭐' : '☆'}</button>`;
    card.querySelector('.fav-btn').addEventListener('click', e => {
      e.stopPropagation(); toggleFav(team); renderTeams(); renderFixtures();
    });
    card.addEventListener('click', () => showTeamDetail(team));
    teamsGrid.appendChild(card);
  });
}
teamSearch.addEventListener('input', renderTeams);
groupFilter.addEventListener('change', renderTeams);
confedFilter.addEventListener('change', renderTeams);

// ── Team Detail view ──────────────────────────────────────────────
function showTeamDetail(team) {
  const info = teamInfo[team];
  const fav = isFav(team);
  document.getElementById('team-detail-header').innerHTML = `
    <div class="flag">${flagImg(team, 'w80')}</div>
    <div>
      <h2>${team} <button onclick="toggleFav('${team}'); showTeamDetail('${team}')" style="background:none;border:none;font-size:1.3rem;cursor:pointer;vertical-align:middle;">${fav ? '⭐' : '☆'}</button></h2>
      <p>${info.confederation} · Group ${teamToGroup[team]}</p>
    </div>`;
  const tbody = document.getElementById('team-detail-roster');
  tbody.innerHTML = '';
  (players[team] || []).forEach(p => {
    const tr = document.createElement('tr');
    const wg = wcG(p.name), wa = wcA(p.name);
    tr.innerHTML = `<td>${p.name}${wg > 0 ? ' ⚽'.repeat(wg) : ''}</td><td><span class="pos-badge pos-${p.pos}">${p.pos}</span></td><td>${p.age}</td><td>${p.club}</td><td>${p.caps}</td>
      <td style="${wg>0?'font-weight:800;color:var(--red)':''}">${wg}</td>
      <td style="${wa>0?'font-weight:800;color:#0a3d8f':''}">${wa}</td>`;
    tbody.appendChild(tr);
  });
  showView('team-detail');
}

// ── Groups view ───────────────────────────────────────────────────
function renderGroups() {
  const grid = document.getElementById('groups-grid');
  grid.innerHTML = '';
  const hasLive = Object.keys(liveStandings).length > 0;
  Object.entries(groups).forEach(([g, teams]) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    // Build standings rows — use live data if available, else zeros
    const standingMap = {};
    if (liveStandings[g]) liveStandings[g].forEach(r => standingMap[r.team] = r);
    const rows = teams.map(t => {
      const s = standingMap[t] || { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      const gd = (s.goalsFor || 0) - (s.goalsAgainst || 0);
      return `<tr>
        <td class="team-name">${flagImg(t, 'w20')} ${t}</td>
        <td class="num">${s.played}</td>
        <td class="num">${s.won}</td>
        <td class="num">${s.drawn}</td>
        <td class="num">${s.lost}</td>
        <td class="num">${s.goalsFor}:${s.goalsAgainst}</td>
        <td class="num">${gd > 0 ? '+' : ''}${gd}</td>
        <td class="num pts">${s.points}</td>
      </tr>`;
    }).join('');
    card.innerHTML = `
      <h3>Group ${g}${hasLive ? '<span class="live-badge">LIVE</span>' : ''}</h3>
      <table>
        <thead><tr><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF:GA</th><th class="num">GD</th><th class="num">Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${hasLive ? '<div class="api-status">📡 Live data from football-data.org</div>' : '<div class="api-status">⏳ Standings update once matches begin</div>'}`;
    grid.appendChild(card);
  });
}

// API key setup
const banner = document.getElementById('api-key-banner');
const apiInput = document.getElementById('api-key-input');
if (!getApiKey()) banner.style.display = 'flex';
document.getElementById('api-key-save').addEventListener('click', () => {
  const k = apiInput.value.trim();
  if (!k) return;
  saveApiKey(k); banner.style.display = 'none'; fetchLiveData();
});
document.getElementById('api-key-skip').addEventListener('click', () => {
  saveApiKey('SKIP'); banner.style.display = 'none';
});

// ── Fixtures ──────────────────────────────────────────────────────
const { matchdayDates } = WORLDCUP_DATA;

function generateFixtures() {
  const fixtures = [];
  Object.entries(groups).forEach(([g, teams]) => {
    const matchups = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];
    matchups.forEach((pair, i) => {
      const md = Math.floor(i / 2) + 1;
      fixtures.push({ group: g, matchday: md, date: matchdayDates[md][g], home: teams[pair[0]], away: teams[pair[1]] });
    });
  });
  return fixtures.sort((a, b) => new Date(a.date) - new Date(b.date) || a.matchday - b.matchday);
}
const fixtures = generateFixtures();

const { results: staticResults } = WORLDCUP_DATA;

function getLiveScore(home, away) {
  // Prefer live API data, fall back to static results in data.js
  const live = liveResults[`${home}|${away}`] || liveResults[`${away}|${home}`] || null;
  if (live) return live;
  const stat = staticResults[`${home}|${away}`];
  if (stat) return { homeScore: stat.h, awayScore: stat.a, status: 'FINISHED' };
  const statRev = staticResults[`${away}|${home}`];
  if (statRev) return { homeScore: statRev.a, awayScore: statRev.h, status: 'FINISHED' };
  return null;
}

function renderFixtures() {
  const container = document.getElementById('fixtures-container');
  const gFilter = document.getElementById('fixture-group-filter').value;
  const statusFilter = document.getElementById('fixture-status-filter').value;
  const favOnly = document.getElementById('fav-only-toggle').checked;
  const favs = getFavs();

  let filtered = fixtures.filter(f => {
    if (gFilter && f.group !== gFilter) return false;
    const st = fixtureStatus(f.date);
    if (statusFilter && st !== statusFilter) return false;
    if (favOnly && !favs.includes(f.home) && !favs.includes(f.away)) return false;
    return true;
  });

  // Group by date
  const byDate = {};
  filtered.forEach(f => { (byDate[f.date] = byDate[f.date] || []).push(f); });

  container.innerHTML = '';
  if (!Object.keys(byDate).length) {
    container.innerHTML = '<div class="empty-msg">No matches found for your filters.</div>';
    return;
  }

  // Sort date groups chronologically
  const sortedDates = Object.keys(byDate).sort((a, b) => parseFixtureDate(a) - parseFixtureDate(b));

  sortedDates.forEach(date => {
    const dayFixtures = byDate[date];
    const status = fixtureStatus(date);
    const group = document.createElement('div');
    group.className = 'fixture-date-group';
    const label = document.createElement('div');
    label.className = 'fixture-date-label' + (status === 'today' ? ' today-label' : status === 'past' ? ' past-label' : '');
    label.textContent = status === 'today' ? `📅 ${date} — TODAY` : status === 'past' ? `✓ ${date}` : date;
    group.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'fixtures-grid';
    dayFixtures.forEach(f => {
      const st = fixtureStatus(f.date);
      const isFavMatch = favs.includes(f.home) || favs.includes(f.away);
      const liveScore = getLiveScore(f.home, f.away);
      const card = document.createElement('div');
      card.className = 'fixture-card' + (st === 'today' ? ' fixture-today' : st === 'past' ? ' fixture-past' : '') + (isFavMatch ? ' is-fav-match' : '');

      let scoreHtml, statusBadge = '';
      if (liveScore) {
        const hs = liveScore.homeScore, as = liveScore.awayScore;
        const isLive = liveScore.status === 'IN_PLAY';
        scoreHtml = `<span class="score ${isLive ? 'score-live' : ''}">${hs} – ${as}</span>`;
        statusBadge = isLive ? '<span class="badge-live">LIVE</span>' : '<span class="badge-ft">FT</span>';
      } else {
        scoreHtml = `<span class="vs">vs</span>`;
      }

      card.innerHTML = `
        <div class="matchday">
          <span>MD${f.matchday} · Group ${f.group}</span>
          <span>${st === 'today' ? '<span style="color:var(--gold);font-weight:800;">TODAY</span>' : ''}${statusBadge}${isFavMatch ? ' ⭐' : ''}</span>
        </div>
        <div class="teams">
          <span>${flagImg(f.home, 'w20')} ${f.home}</span>
          ${scoreHtml}
          <span>${f.away} ${flagImg(f.away, 'w20')}</span>
        </div>`;
      card.addEventListener('click', () => showMatchup(f));
      grid.appendChild(card);
    });
    group.appendChild(grid);
    container.appendChild(group);
  });
}

// Fixture filter dropdowns
Object.keys(groups).sort().forEach(g => {
  const opt = document.createElement('option'); opt.value = g; opt.textContent = `Group ${g}`;
  document.getElementById('fixture-group-filter').appendChild(opt);
});
document.getElementById('fixture-group-filter').addEventListener('change', renderFixtures);
document.getElementById('fixture-status-filter').addEventListener('change', renderFixtures);
document.getElementById('fav-only-toggle').addEventListener('change', renderFixtures);

// ── Matchup / Tactics view ────────────────────────────────────────
function rosterRows(team) {
  return (players[team] || []).map(p => {
    const wg = wcG(p.name), wa = wcA(p.name);
    return `<tr><td>${p.name}${wg>0?' ⚽'.repeat(wg):''}</td><td><span class="pos-badge pos-${p.pos}">${p.pos}</span></td>
    <td>${p.age}</td><td>${p.club}</td><td>${p.caps}</td>
    <td style="${wg>0?'font-weight:800;color:var(--red)':''}">${wg}</td>
    <td style="${wa>0?'font-weight:800;color:#0a3d8f':''}">${wa}</td></tr>`;
  }).join('');
}

let _currentFixture = null;

function showMatchup(f) {
  _currentFixture = f;
  const status = fixtureStatus(f.date);
  const liveScore = getLiveScore(f.home, f.away);
  const scoreHtml = liveScore ? `<div class="match-score">${liveScore.homeScore} – ${liveScore.awayScore}</div>` : '';
  document.getElementById('matchup-header').innerHTML = `
    <div>${flagImg(f.home, 'w80')}<div class="matchup-meta">${f.home}</div></div>
    <div>
      ${scoreHtml || '<div class="vs-big">VS</div>'}
      <div class="matchup-meta">Group ${f.group} · Matchday ${f.matchday}<br>${f.date}${status === 'today' ? ' · TODAY' : ''}</div>
    </div>
    <div>${flagImg(f.away, 'w80')}<div class="matchup-meta">${f.away}</div></div>`;

  document.getElementById('matchup-home-head').innerHTML = `${flagImg(f.home, 'w20')} ${f.home} — Squad`;
  document.getElementById('matchup-away-head').innerHTML = `${flagImg(f.away, 'w20')} ${f.away} — Squad`;
  document.getElementById('matchup-home-roster').innerHTML = rosterRows(f.home);
  document.getElementById('matchup-away-roster').innerHTML = rosterRows(f.away);

  document.getElementById('pitch-legend').innerHTML = `
    <span><span class="swatch" style="background:var(--red)"></span>${f.home}</span>
    <span><span class="swatch" style="background:#0a3d8f"></span>${f.away}</span>`;

  // Reset formations to 4-3-3
  document.getElementById('home-formation').value = '4-3-3';
  document.getElementById('away-formation').value = '4-3-3';

  renderPitch(f.home, f.away);
  renderStatCompare(f.home, f.away);
  showView('matchup');

  // Update URL for deep link to this fixture
  try { history.replaceState(null, '', `#matchup-${f.group}-${f.matchday}-${f.home}-${f.away}`); } catch {}
}

// Formation selector listeners
document.getElementById('home-formation').addEventListener('change', () => {
  if (_currentFixture) renderPitch(_currentFixture.home, _currentFixture.away);
});
document.getElementById('away-formation').addEventListener('change', () => {
  if (_currentFixture) renderPitch(_currentFixture.home, _currentFixture.away);
});

// ── Pitch diagram ─────────────────────────────────────────────────
// Parse formation string like "4-3-3" → {GK:1, DF:4, MF:3, FW:3}
function parseFormation(str) {
  const parts = str.split('-').map(Number);
  if (parts.length === 3) return { GK: 1, DF: parts[0], MF: parts[1], FW: parts[2] };
  if (parts.length === 4) return { GK: 1, DF: parts[0], MF: parts[1] + parts[2], FW: parts[3] };
  return { GK: 1, DF: 4, MF: 3, FW: 3 };
}

function starting11(roster, formationStr) {
  const targets = parseFormation(formationStr || '4-3-3');
  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  roster.forEach(p => { if (byPos[p.pos]) byPos[p.pos].push(p); });
  const xi = [];
  let deficit = 0;
  ['GK','DF','MF','FW'].forEach(pos => {
    const take = Math.min(targets[pos], byPos[pos].length);
    xi.push(...byPos[pos].slice(0, take));
    deficit += targets[pos] - take;
  });
  if (deficit > 0) {
    const used = new Set(xi.map(p => p.name));
    for (const p of roster) { if (!used.has(p.name)) { xi.push(p); deficit--; if (!deficit) break; } }
  }
  return xi.slice(0, 11);
}

function pitchPositions(roster, isAway, formationStr) {
  const xi = starting11(roster, formationStr);
  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  xi.forEach(p => { if (byPos[p.pos]) byPos[p.pos].push(p); });
  const rowY = isAway
    ? { GK: 93, DF: 80, MF: 67, FW: 56 }
    : { GK:  7, DF: 20, MF: 33, FW: 44 };
  const placed = [];
  Object.entries(byPos).forEach(([pos, list]) => {
    if (!list.length) return;
    const n = list.length;
    list.forEach((p, i) => {
      const x = n === 1 ? 50 : 15 + (i / (n - 1)) * 70;
      placed.push({ player: p, x, y: rowY[pos] });
    });
  });
  return placed;
}

function renderPitch(home, away) {
  const homeFmt = document.getElementById('home-formation').value;
  const awayFmt = document.getElementById('away-formation').value;
  const homeRoster = players[home] || [];
  const awayRoster = players[away] || [];

  function buildPlayers(placed, teamClass, container) {
    container.innerHTML = '';
    placed.forEach(({ player, x, y }) => {
      const wrap = document.createElement('div');
      wrap.className = `pitch-player ${teamClass}`;
      wrap.style.left = x + '%';
      wrap.style.top  = y + '%';
      wrap.innerHTML = `<div class="dot">${player.pos}</div>
        <div class="pname">${player.name.split(' ').slice(-1)[0]}</div>`;

      // Stat tooltip
      const tip = document.createElement('div');
      tip.className = 'player-tooltip';
      tip.style.display = 'none';
      const wg = wcG(player.name), wa = wcA(player.name);
      tip.innerHTML = `
        <div class="pt-name">${player.name}${wg>0?' ⚽'.repeat(wg):''}</div>
        <div class="pt-club">${player.club}</div>
        <div class="pt-stats">
          <div class="pt-stat"><span class="pt-val">${player.age}</span><span class="pt-lbl">Age</span></div>
          <div class="pt-stat"><span class="pt-val">${player.caps}</span><span class="pt-lbl">Intl Caps</span></div>
          <div class="pt-stat"><span class="pt-val" style="${wg>0?'color:var(--gold)':''}">${wg}</span><span class="pt-lbl">WC Goals</span></div>
          <div class="pt-stat"><span class="pt-val" style="${wa>0?'color:#7ec8e3':''}">${wa}</span><span class="pt-lbl">WC Assists</span></div>
        </div>`;
      wrap.appendChild(tip);

      wrap.addEventListener('mouseenter', () => { tip.style.display = 'block'; });
      wrap.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      // Mobile tap
      wrap.addEventListener('click', e => {
        e.stopPropagation();
        const visible = tip.style.display === 'block';
        document.querySelectorAll('.player-tooltip').forEach(t => t.style.display = 'none');
        tip.style.display = visible ? 'none' : 'block';
      });
      container.appendChild(wrap);
    });
  }

  buildPlayers(pitchPositions(homeRoster, false, homeFmt), 'side-home', document.getElementById('pitch-home'));
  buildPlayers(pitchPositions(awayRoster, true, awayFmt),  'side-away', document.getElementById('pitch-away'));

  // Hide all tooltips on pitch click
  document.getElementById('matchup-pitch').addEventListener('click', () => {
    document.querySelectorAll('.player-tooltip').forEach(t => t.style.display = 'none');
  });
}

// ── Stat comparison ───────────────────────────────────────────────
function squadTotals(team) {
  const roster = players[team] || [];
  const n = roster.length || 1;
  return {
    avgAge:  roster.reduce((s, p) => s + p.age, 0) / n,
    caps:    roster.reduce((s, p) => s + p.caps, 0),
    wcGoals:   roster.reduce((s, p) => s + wcG(p.name), 0),
    wcAssists: roster.reduce((s, p) => s + wcA(p.name), 0)
  };
}
function statRow(label, hv, av, fmt = v => v) {
  const total = hv + av || 1;
  return `<div class="stat-row">
    <div class="val">${fmt(hv)}</div>
    <div><div class="label">${label}</div>
      <div class="stat-bar"><div class="home-bar" style="width:${(hv/total)*100}%"></div><div class="away-bar" style="width:${(av/total)*100}%"></div></div>
    </div>
    <div class="val">${fmt(av)}</div>
  </div>`;
}
function renderStatCompare(home, away) {
  const h = squadTotals(home), a = squadTotals(away);
  document.getElementById('matchup-stats').innerHTML = `
    <h3>Squad Comparison</h3>
    ${statRow('Avg Age',      h.avgAge,    a.avgAge,    v => v.toFixed(1))}
    ${statRow('Total Caps',   h.caps,      a.caps)}
    ${statRow('WC Goals ⚽',  h.wcGoals,   a.wcGoals)}
    ${statRow('WC Assists 🅰️', h.wcAssists, a.wcAssists)}`;
}

// ── Players view ──────────────────────────────────────────────────
const playerSearch  = document.getElementById('player-search');
const playerTeamFilter = document.getElementById('player-team-filter');
const playerPosFilter  = document.getElementById('player-pos-filter');
allTeams.forEach(t => {
  const opt = document.createElement('option'); opt.value = t; opt.textContent = t; playerTeamFilter.appendChild(opt);
});
let sortKey = 'name', sortAsc = true;
document.querySelectorAll('#players-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
    renderPlayers();
  });
});
function renderPlayers() {
  const q    = playerSearch.value.trim().toLowerCase();
  const team = playerTeamFilter.value;
  const pos  = playerPosFilter.value;
  let filtered = allPlayers.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !p.club.toLowerCase().includes(q)) return false;
    if (team && p.team !== team) return false;
    if (pos  && p.pos  !== pos)  return false;
    return true;
  });
  filtered.sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });
  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#666;padding:20px;">No players match.</td></tr>'; return; }
  filtered.forEach(p => {
    const tr = document.createElement('tr');
    const wg = wcG(p.name), wa = wcA(p.name);
    tr.innerHTML = `<td>${p.name}${wg>0?' ⚽'.repeat(wg):''}</td><td>${flagImg(p.team, 'w20')} ${p.team}</td>
      <td><span class="pos-badge pos-${p.pos}">${p.pos}</span></td>
      <td>${p.age}</td><td>${p.club}</td><td>${p.caps}</td>
      <td style="${wg>0?'font-weight:800;color:var(--red)':''}">${wg}</td>
      <td style="${wa>0?'font-weight:800;color:#0a3d8f':''}">${wa}</td>`;
    tbody.appendChild(tr);
  });
}
playerSearch.addEventListener('input', renderPlayers);
playerTeamFilter.addEventListener('change', renderPlayers);
playerPosFilter.addEventListener('change', renderPlayers);

// ── Knockout Bracket ──────────────────────────────────────────────
function renderBracket() {
  const tree = document.getElementById('bracket-tree');
  tree.innerHTML = '';
  const rounds = [
    { title: 'Round of 32', slots: 16 },
    { title: 'Round of 16', slots: 8 },
    { title: 'Quarter-Finals', slots: 4 },
    { title: 'Semi-Finals', slots: 2 },
    { title: 'Final', slots: 1 }
  ];
  rounds.forEach((round, ri) => {
    const col = document.createElement('div');
    col.className = 'bracket-round';
    col.innerHTML = `<div class="bracket-round-title">${round.title}</div>`;
    const slots = document.createElement('div');
    slots.className = 'bracket-slots';
    for (let i = 0; i < round.slots; i++) {
      const isFinal = ri === rounds.length - 1;
      const match = document.createElement('div');
      match.className = 'bracket-match' + (isFinal ? ' bracket-final' : '');
      match.innerHTML = `
        <div class="bracket-team"><span class="bt-tbd">TBD</span><span class="bt-score">–</span></div>
        <div class="bracket-team"><span class="bt-tbd">TBD</span><span class="bt-score">–</span></div>`;
      slots.appendChild(match);
    }
    col.appendChild(slots);
    if (ri === rounds.length - 1) {
      const champ = document.createElement('div');
      champ.className = 'bracket-champion';
      champ.textContent = '🏆 Champion TBD';
      col.appendChild(champ);
    }
    tree.appendChild(col);
  });
}

// ── Init ──────────────────────────────────────────────────────────
renderTeams();
renderGroups();
renderFixtures();
renderPlayers();
renderBracket();

// Kick off live data fetch (only if API key is set and not skipped)
if (getApiKey() && getApiKey() !== 'SKIP') fetchLiveData();
// Refresh every 90 seconds during live matches
setInterval(() => { if (getApiKey() && getApiKey() !== 'SKIP') fetchLiveData(); }, 90000);
