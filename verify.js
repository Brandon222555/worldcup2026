const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8') + '\nmodule.exports = WORLDCUP_DATA;';
fs.writeFileSync('/tmp/d.js', code);
const D = require('/tmp/d.js');

let groupTeams = [];
Object.values(D.groups).forEach(t => groupTeams.push(...t));

console.log('Total teams in groups:', groupTeams.length);
console.log('Total teams in teamInfo:', Object.keys(D.teamInfo).length);

const missingInfo = groupTeams.filter(t => !D.teamInfo[t]);
const missingPlayers = groupTeams.filter(t => !D.players[t]);
console.log('Missing teamInfo:', missingInfo);
console.log('Missing players:', missingPlayers);

let totalPlayers = 0;
Object.values(D.players).forEach(r => totalPlayers += r.length);
console.log('Total players:', totalPlayers);
console.log('Groups count:', Object.keys(D.groups).length);
