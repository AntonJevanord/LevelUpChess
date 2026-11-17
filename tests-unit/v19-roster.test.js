'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const roster = require('../src/designs-v19-selected');
const { getDesign } = require('../src/design-catalog');
const root = path.resolve(__dirname, '..');
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

test('accepted identities retain exact tested roles, prices, movements and pinned search policies', () => {
  assert.equal(hash(roster.ROSTER_FILE), roster.ROSTER_SHA256);
  assert.equal(hash(roster.VALUES_FILE), roster.VALUES_SHA256);
  assert.deepEqual(roster.TIERS.map(tier => [tier.level, tier.bodies.length, tier.referenceIds.length]), [[1, 11, 3], [2, 12, 3], [3, 11, 4]]);
  assert.equal(new Set(roster.ALL_BODIES.map(body => body.id)).size, 34);
  const values = new Map(roster.VALUE_POLICY.values.map(value => [value.id, value]));
  for (const source of roster.VALUE_POLICY.sources) assert.equal(hash(source.file), source.sha256, source.file);
  for (const tier of roster.TIERS) {
    assert.equal(new Set(tier.bodies.map(body => body.key)).size, tier.bodies.length);
    assert.deepEqual(tier.bodies.filter(body => body.reference).map(body => body.id), tier.referenceIds);
    assert.equal(tier.bodies.filter(body => body.placement === 'reserve').length, 1);
    for (const body of tier.bodies) {
      const design = getDesign(body.id);
      for (const key of ['movement', 'family', 'level', 'roles', 'placement']) assert.deepEqual(design[key], body[key], `${body.id}: ${key}`);
      assert.deepEqual(values.get(body.id).applied, body.prior);
      assert.ok(body.prior.mg > 0 && body.prior.eg > 0);
    }
  }
  assert.deepEqual(roster.getTierRoster(2).filter(body => body.family === 'knight').map(body => body.movement), ['N0', 'NDmW']);
  assert.deepEqual(roster.getTierRoster(3).filter(body => body.family === 'knight').map(body => body.movement), ['NC', 'NAD']);
  assert.equal(getDesign('knight.level2-nd-quiet-king@1'), undefined);
  assert.equal(getDesign('knight.level3-nad-quiet-king@1'), undefined);
  assert.throws(() => roster.getTier(4));
});
