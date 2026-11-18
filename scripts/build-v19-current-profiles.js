'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { getPlayableProfiles } = require('./playable-profile');

function buildV19CurrentProfiles(root = path.resolve(__dirname, '..')) {
  const profiles = getPlayableProfiles(), written = [];
  for (const [index, library] of PLAYABLE_LIBRARIES.entries()) {
    if (library.rosterRevision !== 'v19-003') continue;
    const profile = profiles[index];
    if (profile.registry.definitions.length > 20) throw new Error('A current tier library exceeds twenty custom types.');
    for (const [file, bytes] of [[library.json, JSON.stringify(profile, null, 2) + '\n'], [library.ini, profile.config]]) {
      const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes); written.push(file);
    }
  }
  return written;
}
if (require.main === module) console.log(`Wrote ${buildV19CurrentProfiles().length} current profile artifacts.`);
module.exports = { buildV19CurrentProfiles };
