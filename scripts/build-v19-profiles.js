'use strict';

// Write only the new edition. The full historical profile writer remains
// available for deliberate rebuilds; releasing this roster never invokes it.
const fs = require('node:fs');
const path = require('node:path');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { getPlayableProfiles } = require('./playable-profile');

function buildV19Profiles(root = path.resolve(__dirname, '..')) {
  const profiles = getPlayableProfiles();
  const written = [];
  for (const [index, library] of PLAYABLE_LIBRARIES.entries()) {
    if (library.generation !== 19) continue;
    const profile = profiles[index];
    if (profile.registry.definitions.length > 20) throw new Error('A version-19 library exceeds the custom-letter limit.');
    for (const [file, bytes] of [[library.json, JSON.stringify(profile, null, 2) + '\n'], [library.ini, profile.config]]) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      written.push(file);
    }
  }
  return written;
}

if (require.main === module) console.log(`Wrote ${buildV19Profiles().length} version-19 profile artifacts.`);
module.exports = { buildV19Profiles };
