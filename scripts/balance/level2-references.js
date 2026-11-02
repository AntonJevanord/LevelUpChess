'use strict';

// Selected anchors for new studies. Existing runs retain their own declarations.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getDesign } = require('../../src/design-catalog');
const { getBracketEvaluation, getBracketValueReceipt } = require('./v17-bracket-values');

const FILE = path.resolve(__dirname, '../../experiments/designs/level2-references-v17.json');
const DECLARATION_SHA256 = '0dd869972d1b82027340ff194e86d1ab6c95bc2b4a1a3a7b9cae2e5af7634dc7';
const sha = value => createHash('sha256').update(value).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function getLevel2References() {
  const protocol = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (sha(JSON.stringify(protocol)) !== DECLARATION_SHA256) throw new Error('The selected level-two roster changed. Declare a new roster revision.');
  const receipt = getBracketValueReceipt();
  if (protocol.calibration.file !== receipt.file || protocol.calibration.sha256 !== receipt.sha256) throw new Error('The selected level-two evaluation policy changed.');
  const evaluation = getBracketEvaluation(protocol.roster.map(row => row.id));
  for (const row of protocol.roster) {
    const design = getDesign(row.id);
    if (!design || ['family', 'movement', 'placement', 'level'].some(field => row[field] !== design[field])
      || !isDeepStrictEqual(row.roles, design.roles)
      || !isDeepStrictEqual(row.engineValue, evaluation.pieceValues[row.id])) {
      throw new Error(`Selected level-two reference behavior or valuation changed: ${row.id}.`);
    }
  }
  return freeze({ protocol, roster: protocol.roster, declarationSha256: DECLARATION_SHA256 });
}

module.exports = { FILE, DECLARATION_SHA256, getLevel2References };
