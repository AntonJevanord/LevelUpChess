'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_LIBRARIES } = require('../src/playable-library');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');

let compiled;

/** Each curated library fits the picker; games never reassign its types. */
function getPlayableProfiles() {
  if (!compiled) {
    const squareFor = { pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
    compiled = Object.freeze(PLAYABLE_LIBRARIES.map(library => {
      const comparisons = library.designIds.map(id => {
        const design = getDesign(id);
        if (!design) throw new Error(`The playable library contains an unknown design: ${id}.`);
        return {
          armyA: { upgrades: { [squareFor[design.family]]: id } },
          armyB: { upgrades: {} },
        };
      });
      // Use the experiment compiler, including its allocation and role rules.
      // Ordinary pieces stay reserved even if a particular army omits them.
      return compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons }));
    }));
  }
  return compiled;
}

function getPlayableProfile(variant = getPlayableProfiles()[0].variant) {
  return getPlayableProfiles().find(profile => profile.variant === variant);
}

function getPlayableArtifacts(variant = getPlayableProfiles()[0].variant) {
  const index = getPlayableProfiles().findIndex(profile => profile.variant === variant);
  if (index === -1) return undefined;
  const { json, ini } = PLAYABLE_LIBRARIES[index];
  return { json, ini };
}

function writePlayableProfile(root = path.resolve(__dirname, '..')) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'variants'), { recursive: true });
  for (const profile of getPlayableProfiles()) {
    const artifact = getPlayableArtifacts(profile.variant);
    fs.writeFileSync(path.join(root, artifact.json), JSON.stringify(profile, null, 2) + '\n');
    fs.writeFileSync(path.join(root, artifact.ini), profile.config);
  }
  return getPlayableProfile();
}

if (require.main === module) writePlayableProfile();
module.exports = { getPlayableProfile, getPlayableProfiles, getPlayableArtifacts, writePlayableProfile };
