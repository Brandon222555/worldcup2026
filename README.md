# 🏆 FIFA World Cup 2026

An interactive single-page website for the 2026 FIFA World Cup — the first 48-team edition hosted across the USA, Canada, and Mexico.

Built with **pure vanilla HTML/CSS/JavaScript** — no framework, no build step. Just open `index.html` in your browser.

---

## ✨ Features

- **Teams** — All 48 teams with flags, confederation info, and full 23-player squads
- **Group Standings** — Live standings via football-data.org API, auto-refreshed every 90s
- **Fixtures** — Grouped by date with real FT scores, LIVE badges, and favourite-team filter
- **Tactics View** — Side-by-side pitch diagram per match with selectable formations (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2). Hover any player for WC goals & assists tooltip
- **Players** — Searchable table of all 1,104 players with 2026 WC tournament stats
- **Bracket** — Round of 32 → R16 → QF → SF → Final knockout tree
- **Global Search** — Instant search across teams and players
- **Feedback** — Star-rating feedback modal with localStorage persistence
- **AI Chatbot** — Floating World Cup assistant
- **Mobile responsive** — Works down to 380px

---

## 🚀 Getting Started

🌐 **Live site:** https://brandon222555.github.io/worldcup2026/

```bash
git clone https://github.com/Brandon222555/worldcup2026.git
cd worldcup2026
# Open index.html in your browser — no server needed
```

### Optional: Live Scores
1. Get a free API key from [football-data.org](https://www.football-data.org/)
2. Click the **Live Scores** banner on the site and enter your key
3. Standings and results will auto-update every 90 seconds

---

## 📁 Project Structure

```
worldcup2026/
├── index.html     # All markup + CSS (~430 lines of CSS)
├── app.js         # All UI logic — views, fixtures, pitch, search, feedback
├── data.js        # Static data — 48 teams, 1,104 players, schedule, results, WC stats
├── chatbot.js     # Floating AI assistant
├── .gitignore
└── README.md
```

---

## 🗂️ Data

- **48 teams** across 12 groups (A–L), drawn December 5 2025
- **23-player squads** for every team with position, age, club, international caps
- **72 group stage fixtures** with confirmed dates and venues
- **Real 2026 WC goalscorer data** updated through June 19 (MD1 complete)

---

## 🎨 Design

Ghana-flag colour theme: Red `#ce1126` · Gold `#fcd116` · Green `#006b3f`

---

## 📜 License

MIT — free to use and modify.
