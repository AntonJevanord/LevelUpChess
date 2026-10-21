'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_DESIGN_IDS } = require('../src/playable-library');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');

let compiled;

/** One curated library fits the picker; games never reassign its types. */
function getPlayableProfile() {
  if (!compiled) {
    const squareFor = { pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
    const comparisons = PLAYABLE_DESIGN_IDS.map(id => {
      const design = getDesign(id);
      if (!design) throw new Error(`The playable library contains an unknown design: ${id}.`);
      return {
        armyA: { upgrades: { [squareFor[design.family]]: id } },
        armyB: { upgrades: {} },
      };
    });
    // Use the experiment compiler, including its allocation and role rules.
    // Ordinary pieces stay reserved even if a particular army omits them.
    compiled = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons }));
  }
  return compiled;
}

function writePlayableProfile(root = path.resolve(__dirname, '..')) {
  const profile = getPlayableProfile();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'variants'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/playable-profile.json'), JSON.stringify(profile, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'variants/levelup-playable.ini'), profile.config);
  return profile;
}

if (require.main === module) writePlayableProfile();
module.exports = { getPlayableProfile, writePlayableProfile };
