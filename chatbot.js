// World Cup Assistant — advanced rule-based Q&A over WORLDCUP_DATA.
// No external API calls; answers are generated from the site's own data.
// Features: fuzzy team/player matching, comparisons, top-stat queries,
// confederation lookups, conversational context (follow-ups), and
// clickable links that jump to the relevant view on the site.

(function () {
  const { tournament, groups, teamInfo, players, matchdayDates } = WORLDCUP_DATA;
  const allTeamNames = Object.keys(teamInfo);

  // Flatten all players once for stat queries.
  const allPlayers = [];
  Object.entries(players).forEach(([team, roster]) => {
    roster.forEach(p => allPlayers.push({ ...p, team }));
  });

  // ---------- Fuzzy matching helpers ----------
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  const TEAM_ALIASES = {
    usa: 'United States', us: 'United States', america: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
    uk: 'England', britain: 'England', skorea: 'South Korea', korea: 'South Korea', 'south-korea': 'South Korea',
    ivorycoast: 'Ivory Coast', cotedivoire: 'Ivory Coast', drcongo: 'DR Congo', congo: 'DR Congo',
    bosnia: 'Bosnia and Herzegovina', czech: 'Czech Republic', czechia: 'Czech Republic', capeverde: 'Cape Verde',
    netherlands: 'Netherlands', holland: 'Netherlands', uae: 'United States'
  };

  function findTeam(text) {
    const lower = text.toLowerCase();
    const sorted = [...allTeamNames].sort((a, b) => b.length - a.length);
    for (const team of sorted) {
      if (lower.includes(team.toLowerCase())) return team;
    }
    const compact = lower.replace(/[^a-z]/g, '');
    for (const [alias, team] of Object.entries(TEAM_ALIASES)) {
      if (compact.includes(alias.replace(/[^a-z]/g, ''))) return team;
    }
    // Fuzzy fallback: compare each word against team names (handles minor typos).
    const words = lower.split(/\s+/).filter(w => w.length > 3);
    let best = null, bestDist = 3; // max edit distance tolerance
    for (const team of allTeamNames) {
      const teamLower = team.toLowerCase();
      for (const w of words) {
        const dist = levenshtein(w, teamLower.split(' ')[0]);
        if (dist < bestDist) { bestDist = dist; best = team; }
      }
    }
    return best;
  }

  // Find ALL teams mentioned (for comparisons).
  function findTeams(text, max = 2) {
    const lower = text.toLowerCase();
    const found = [];
    const sorted = [...allTeamNames].sort((a, b) => b.length - a.length);
    let remaining = lower;
    for (const team of sorted) {
      const idx = remaining.toLowerCase().indexOf(team.toLowerCase());
      if (idx !== -1) {
        found.push(team);
        remaining = remaining.slice(0, idx) + ' '.repeat(team.length) + remaining.slice(idx + team.length);
        if (found.length >= max) break;
      }
    }
    return found;
  }

  function findGroup(text) {
    const m = text.toUpperCase().match(/GROUP\s*([A-L])\b/);
    if (m) return m[1];
    const m2 = text.toUpperCase().match(/\b([A-L])\b/);
    return m2 ? m2[1] : null;
  }

  function findPlayer(text) {
    const lower = text.toLowerCase();
    let best = null, bestScore = 0;
    for (const p of allPlayers) {
      const full = p.name.toLowerCase();
      const last = full.split(' ').slice(-1)[0];
      if (lower.includes(full)) return { player: p, team: p.team, score: 100 };
      if (last.length > 2 && lower.includes(last)) {
        if (50 > bestScore) { best = { player: p, team: p.team, score: 50 }; bestScore = 50; }
      }
    }
    return best;
  }

  function findConfederation(text) {
    const confeds = ['UEFA', 'CONCACAF', 'CONMEBOL', 'CAF', 'AFC', 'OFC'];
    const upper = text.toUpperCase();
    return confeds.find(c => upper.includes(c)) || null;
  }

  function flagEmoji(team) {
    return teamInfo[team] ? teamInfo[team].flag : '';
  }

  function teamLink(team) {
    return `<a data-action="team" data-team="${team}">${flagEmoji(team)} ${team}</a>`;
  }
  function groupLink(g) {
    return `<a data-action="group" data-group="${g}">Group ${g}</a>`;
  }

  // ---------- Fixtures ----------
  function buildFixturesForGroup(g) {
    const teams = groups[g];
    const matchups = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
    return matchups.map((pair, i) => {
      const md = Math.floor(i / 2) + 1;
      return {
        matchday: md,
        date: matchdayDates[md][g],
        home: teams[pair[0]],
        away: teams[pair[1]]
      };
    });
  }

  function allFixtures() {
    const out = [];
    Object.keys(groups).forEach(g => buildFixturesForGroup(g).forEach(f => out.push({ ...f, group: g })));
    return out;
  }

  function todaysFixtures() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allFixtures().filter(f => {
      const d = new Date(f.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
  }

  function fixturesOnDate(dateStr) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return allFixtures().filter(f => {
      const fd = new Date(f.date);
      fd.setHours(0, 0, 0, 0);
      return fd.getTime() === d.getTime();
    });
  }

  // Parse natural-language dates like "june 18", "6/18", "tomorrow", "next monday".
  function parseDateMention(text) {
    const lower = text.toLowerCase();
    const today = new Date();
    if (lower.includes('tomorrow')) {
      const d = new Date(today); d.setDate(d.getDate() + 1); return d;
    }
    if (lower.includes('yesterday')) {
      const d = new Date(today); d.setDate(d.getDate() - 1); return d;
    }
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const m = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/);
    if (m) {
      const month = monthNames.indexOf(m[1]);
      const day = parseInt(m[2], 10);
      return new Date(2026, month, day);
    }
    const m2 = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (m2) return new Date(2026, parseInt(m2[1], 10) - 1, parseInt(m2[2], 10));
    return null;
  }

  function fixtureLine(f) {
    return `Matchday ${f.matchday}: ${teamLink(f.home)} vs ${teamLink(f.away)} — ${f.date}`;
  }

  // ---------- Player/stat queries ----------
  function topPlayers(statKey, n = 5, filterFn = null) {
    let pool = allPlayers;
    if (filterFn) pool = pool.filter(filterFn);
    return [...pool].sort((a, b) => b[statKey] - a[statKey]).slice(0, n);
  }

  function statLabel(key) {
    return { goals: 'Goals', assists: 'Assists', caps: 'Caps', age: 'Age' }[key] || key;
  }

  function playerLine(p, statKey) {
    return `${p.name} (${teamLink(p.team)}, ${p.pos}) — ${statLabel(statKey)}: ${p[statKey]}`;
  }

  function squadTotals(team) {
    const roster = players[team] || [];
    const n = roster.length || 1;
    return {
      avgAge: roster.reduce((s, p) => s + p.age, 0) / n,
      caps: roster.reduce((s, p) => s + p.caps, 0),
      goals: roster.reduce((s, p) => s + p.goals, 0),
      assists: roster.reduce((s, p) => s + p.assists, 0)
    };
  }

  // ---------- Conversation context (for follow-up questions) ----------
  let context = { team: null, group: null, player: null };

  // ---------- Main intent router ----------
  function answer(question) {
    const q = question.trim();
    const lower = q.toLowerCase();

    // Greeting / help
    if (/^(hi|hello|hey|yo|sup|good (morning|afternoon|evening))\b/.test(lower)) {
      return `Hi! I can answer questions about the ${tournament.teamsCount} teams, ${tournament.groupsCount} groups, fixtures, dates, players, and stats for ${tournament.name}. Try "Compare Brazil and Argentina", "Who are the top scorers?", or "What's on June 18?"`;
    }
    if (/\b(help|what can you do|commands)\b/.test(lower)) {
      return helpText();
    }

    // Tournament-level info
    if (lower.includes('host') || lower.includes('where is the world cup')) {
      return `${tournament.name} is hosted by ${tournament.hosts.join(', ')}, running ${tournament.dates}.`;
    }
    if (lower.includes('how many teams') || (lower.includes('how many groups'))) {
      return `There are ${tournament.teamsCount} teams across ${tournament.groupsCount} groups. ${tournament.format}`;
    }
    if (lower.includes('format') || lower.includes('how do teams advance') || lower.includes('how does qualification')) {
      return tournament.format;
    }

    // ----- Comparisons: "compare X and Y" (teams or players) -----
    if (lower.includes('compare') || lower.includes(' vs ') || lower.includes(' versus ')) {
      const teamsFound = findTeams(q, 2);
      if (teamsFound.length === 2) return compareTeams(teamsFound[0], teamsFound[1]);

      // Try comparing two players by last name.
      const names = q.split(/ vs | versus |compare| and /i).map(s => s.trim()).filter(Boolean);
      const found = [];
      for (const seg of names) {
        const pm = findPlayer(seg);
        if (pm && !found.some(f => f.player.name === pm.player.name)) found.push(pm);
      }
      if (found.length >= 2) return comparePlayers(found[0], found[1]);
    }

    // ----- Top stats: "top scorers", "best players", "most assists", "oldest player" -----
    if (/(top|best|most|leading|highest)/.test(lower) && /(scor|goal|assist|caps?|cap leader)/.test(lower)) {
      let key = 'goals';
      if (lower.includes('assist')) key = 'assists';
      else if (lower.includes('caps') || lower.includes('cap leader')) key = 'caps';
      const g = findGroup(q);
      const team = findTeam(q);
      let filterFn = null;
      if (team) filterFn = p => p.team === team;
      else if (g && groups[g] && /group/i.test(lower)) filterFn = p => groups[g].includes(p.team);
      const top = topPlayers(key, 5, filterFn);
      const list = top.map((p, i) => `${i + 1}. ${playerLine(p, key)}`).join('<br>');
      const scope = team ? ` in ${teamLink(team)}` : (filterFn ? ` in ${groupLink(g)}` : ' across all sample rosters');
      return `<strong>Top ${statLabel(key)}${scope}:</strong><br>${list}<br><br><em>Based on sample/placeholder rosters.</em>`;
    }
    if (lower.includes('oldest') || lower.includes('youngest')) {
      const sorted = [...allPlayers].sort((a, b) => lower.includes('oldest') ? b.age - a.age : a.age - b.age).slice(0, 5);
      const list = sorted.map((p, i) => `${i + 1}. ${p.name} (${teamLink(p.team)}, ${p.pos}) — Age ${p.age}`).join('<br>');
      return `<strong>${lower.includes('oldest') ? 'Oldest' : 'Youngest'} players (sample data):</strong><br>${list}`;
    }

    // ----- Confederation lookup -----
    const confed = findConfederation(q);
    if (confed && (lower.includes('team') || lower.includes('confederation') || lower.includes('which countries') || lower.includes('which teams'))) {
      const teams = allTeamNames.filter(t => teamInfo[t].confederation === confed);
      return `<strong>${confed} teams (${teams.length}):</strong><br>${teams.map(teamLink).join(', ')}`;
    }

    // ----- Player lookup -----
    const playerMatch = findPlayer(q);
    if (playerMatch && (
      /\b(player|stat|caps|goals|assist|age|club|position|tell me about|who is)\b/.test(lower)
      || (playerMatch.score === 100)
    )) {
      const { player: p, team } = playerMatch;
      context.player = p; context.team = team;
      return `<strong>${p.name}</strong> (${teamLink(team)}) — ${p.pos}, age ${p.age}, plays for ${p.club}.<br>Caps: ${p.caps} · Goals: ${p.goals} · Assists: ${p.assists}`;
    }

    // ----- Group lookup -----
    if (/\bgroup\b/i.test(lower)) {
      const g = findGroup(q);
      if (g && groups[g]) {
        context.group = g;
        if (lower.includes('fixture') || lower.includes('schedule')) {
          const fx = buildFixturesForGroup(g);
          return `<strong>${groupLink(g)} fixtures:</strong><br>${fx.map(fixtureLine).join('<br>')}`;
        }
        const teamList = groups[g].map(teamLink).join('<br>');
        return `<strong>${groupLink(g)}:</strong><br>${teamList}<br><br>Ask "fixtures for group ${g}" for the schedule, or "standings for group ${g}".`;
      }
    }

    // ----- Standings (placeholder note since group stage hasn't produced results) -----
    if (lower.includes('standing') || lower.includes('table') || lower.includes('points')) {
      const g = findGroup(q);
      if (g && groups[g]) {
        return `Group ${g} standings aren't available yet — the group stage runs ${tournament.dates}. All teams currently show 0 points. Check the <a data-action="view" data-view="groups">Group Standings tab</a> once matches kick off.`;
      }
      return `Standings will populate once group-stage matches are played (${tournament.dates}). You can view the table layout in the <a data-action="view" data-view="groups">Group Standings tab</a>.`;
    }

    // ----- Date-based fixture queries -----
    if (lower.includes('today') || lower.includes("what's on") || lower.includes('whats on') || lower.includes('matches today')) {
      const fx = todaysFixtures();
      if (fx.length === 0) return `No group-stage matches are scheduled for today based on the data I have.`;
      return `<strong>Today's matches:</strong><br>${fx.map(f => `${groupLink(f.group)} · ${fixtureLine(f)}`).join('<br>')}`;
    }
    const mentionedDate = parseDateMention(q);
    if (mentionedDate && (lower.includes('match') || lower.includes('fixture') || lower.includes('play') || lower.includes('game'))) {
      const dateStr = mentionedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const fx = fixturesOnDate(dateStr);
      if (fx.length === 0) return `I don't have any group-stage matches scheduled for ${dateStr}.`;
      return `<strong>Matches on ${dateStr}:</strong><br>${fx.map(f => `${groupLink(f.group)} · ${fixtureLine(f)}`).join('<br>')}`;
    }

    // ----- Fixtures / "when does X play" -----
    if (lower.includes('fixture') || lower.includes('schedule') || lower.includes('when does') || lower.includes('when do') || lower.includes('plays') || lower.includes('play')) {
      const team = findTeam(q);
      if (team) {
        context.team = team;
        const g2 = Object.keys(groups).find(gr => groups[gr].includes(team));
        const fx = buildFixturesForGroup(g2).filter(f => f.home === team || f.away === team);
        return `<strong>${teamLink(team)}</strong> (${groupLink(g2)}) fixtures:<br>${fx.map(fixtureLine).join('<br>')}`;
      }
    }

    // ----- Team lookup (roster, group, confederation) -----
    const team = findTeam(q);
    if (team) {
      context.team = team;
      const info = teamInfo[team];
      const g = Object.keys(groups).find(gr => groups[gr].includes(team));

      if (lower.includes('roster') || lower.includes('squad') || lower.includes('player') || lower.includes('lineup') || lower.includes('team sheet')) {
        const roster = players[team] || [];
        const list = roster.map(p => `${p.name} (${p.pos}, ${p.club}) — Caps ${p.caps}, Goals ${p.goals}, Assists ${p.assists}`).join('<br>');
        return `<strong>${teamLink(team)} — sample squad:</strong><br>${list}<br><br><em>Placeholder roster — official squads announced closer to kickoff.</em> <a data-action="team" data-team="${team}">View full team page →</a>`;
      }

      const totals = squadTotals(team);
      return `${flagEmoji(team)} <strong>${team}</strong> is in <strong>${groupLink(g)}</strong> (${info.confederation}).<br>` +
        `Group ${g} also includes: ${groups[g].filter(t => t !== team).map(teamLink).join(', ')}.<br><br>` +
        `Sample squad: avg age ${totals.avgAge.toFixed(1)}, ${totals.caps} total caps, ${totals.goals} goals, ${totals.assists} assists.`;
    }

    // ----- Follow-up handling using context -----
    if (context.team && /\b(roster|squad|fixtures|when|group)\b/.test(lower)) {
      return answer(`${lower} ${context.team}`);
    }

    // Fallback
    return helpText("I'm not sure about that one. Here's what I can help with:");
  }

  function helpText(intro = "Here's what I can help with:") {
    return `${intro}<ul>
      <li>"What group is &lt;team&gt; in?" / "Show me Group A"</li>
      <li>"Fixtures for Ghana" or "Fixtures for Group L"</li>
      <li>"What's on today?" / "Matches on June 18"</li>
      <li>"Compare Brazil and Argentina"</li>
      <li>"Top scorers" / "Most assists in Group L" / "Oldest players"</li>
      <li>"Tell me about &lt;player name&gt;"</li>
      <li>"Roster for &lt;team&gt;"</li>
      <li>"Which UEFA teams are playing?"</li>
    </ul>`;
  }

  function compareTeams(t1, t2) {
    const i1 = teamInfo[t1], i2 = teamInfo[t2];
    const g1 = Object.keys(groups).find(gr => groups[gr].includes(t1));
    const g2 = Object.keys(groups).find(gr => groups[gr].includes(t2));
    const s1 = squadTotals(t1), s2 = squadTotals(t2);
    const sameGroup = g1 === g2;
    return `<strong>${teamLink(t1)} vs ${teamLink(t2)}</strong><br>` +
      `${t1}: ${groupLink(g1)} (${i1.confederation}) — avg age ${s1.avgAge.toFixed(1)}, ${s1.caps} caps, ${s1.goals} goals, ${s1.assists} assists<br>` +
      `${t2}: ${groupLink(g2)} (${i2.confederation}) — avg age ${s2.avgAge.toFixed(1)}, ${s2.caps} caps, ${s2.goals} goals, ${s2.assists} assists<br><br>` +
      (sameGroup
        ? `They're in the same group (${g1}) — check the <a data-action="view" data-view="fixtures">Fixtures tab</a> for their head-to-head, or click a fixture for the visual tactics view.`
        : `They're in different groups, so they'd only meet in the knockout stage.`);
  }

  function comparePlayers(a, b) {
    const p1 = a.player, p2 = b.player;
    const rows = ['age', 'caps', 'goals', 'assists'].map(k => {
      const v1 = p1[k], v2 = p2[k];
      const winner = v1 === v2 ? '' : (v1 > v2 ? ` — ${p1.name} leads` : ` — ${p2.name} leads`);
      return `${statLabel(k)}: ${v1} vs ${v2}${k !== 'age' ? winner : ''}`;
    }).join('<br>');
    return `<strong>${p1.name} (${teamLink(a.team)}) vs ${p2.name} (${teamLink(b.team)})</strong><br>${rows}<br><br><em>Based on sample/placeholder data.</em>`;
  }

  // ---------- UI wiring ----------
  const launcher = document.getElementById('chatbot-launcher');
  const panel = document.getElementById('chatbot-panel');
  const closeBtn = document.getElementById('chatbot-close');
  const messages = document.getElementById('chatbot-messages');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  const suggestionsEl = document.getElementById('chatbot-suggestions');

  const SUGGESTIONS = [
    "What's on today?",
    "Compare Ghana and England",
    "Top scorers",
    "Fixtures for Group L"
  ];

  function addMessage(html, sender) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    // Wire up inline action links (team/group/view navigation).
    div.querySelectorAll('a[data-action]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const action = a.dataset.action;
        if (action === 'team' && typeof showTeamDetail === 'function') {
          showTeamDetail(a.dataset.team);
        } else if (action === 'group' && typeof showView === 'function') {
          showView('groups');
        } else if (action === 'view' && typeof showView === 'function') {
          showView(a.dataset.view);
        }
        panel.classList.remove('open');
      });
    });
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = '';
    SUGGESTIONS.forEach(s => {
      const btn = document.createElement('button');
      btn.textContent = s;
      btn.addEventListener('click', () => {
        addMessage(s, 'user');
        respond(s);
      });
      suggestionsEl.appendChild(btn);
    });
  }

  function respond(q) {
    setTimeout(() => addMessage(answer(q), 'bot'), 250);
  }

  launcher.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && messages.children.length === 0) {
      addMessage(`Hi! I'm your ${WORLDCUP_DATA.tournament.name} assistant. Ask me about teams, groups, fixtures, dates, players, stats, or comparisons.`, 'bot');
      renderSuggestions();
    }
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    addMessage(val, 'user');
    input.value = '';
    respond(val);
  });
})();
