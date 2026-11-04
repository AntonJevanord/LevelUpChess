'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { FILE, DECLARATION_SHA256, getLevel2ReferenceSelection } = require('../scripts/balance/level2-reference-selection');
const old = require('../scripts/balance/level2-references');
const { getDesign } = require('../src/design-catalog');
const { NEW_DEFINITIONS } = require('../src/balance-designs-knight-pawn-followup');

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the second reference selection freezes the approved pawn while retaining both other L2 references', () => {
  const selected = getLevel2ReferenceSelection(), previous = old.getLevel2References();
  assert.equal(selected.protocol.id, 'selected-level2-references-v17-002');
  assert.equal(selected.protocol.supersedes, previous.protocol.id);
  assert.equal(selected.protocol.status, 'frozen-reference-selection');
  assert.equal(selected.protocol.selectedDate, '2026-11-03');
  assert.deepEqual(selected.roster.map(row => row.id), ['pawn.knight-tall-quiet@1', 'pawn.rank-current@1', 'king.reserve-bishop@1']);
  const pawn = selected.roster[0], definition = NEW_DEFINITIONS.find(row => row.id === pawn.id);
  assert.equal(pawn.movement, 'ifmnDfmWfceFfsNfmN');
  assert.equal(pawn.level, 2); assert.equal(pawn.placement, 'replace');
  assert.deepEqual(pawn.roles, { pawn: true, castlingRook: false, enPassant: true });
  assert.deepEqual(pawn.engineValue, { mg: 536, eg: 592 });
  assert.equal(pawn.valueAnchor, 'pawn.orange@3');
  assert.equal(pawn.definitionSource, 'src/balance-designs-knight-pawn-followup.js');
  for (const key of ['family', 'movement', 'placement', 'level', 'roles']) assert.deepEqual(pawn[key], definition[key]);
  assert.deepEqual(selected.roster.slice(1), previous.roster.slice(1));
  assert.deepEqual(selected.protocol.calibration, previous.protocol.calibration);
});

test('reading the selection preserves the previous declaration and the explicitly activated version-18 definition', () => {
  const bytes = fs.readFileSync(old.FILE), before = old.getLevel2References();
  assert.equal(sha(JSON.parse(bytes)), '0dd869972d1b82027340ff194e86d1ab6c95bc2b4a1a3a7b9cae2e5af7634dc7');
  assert.equal(before.roster[0].id, 'pawn.orange@3');
  assert.equal(before.roster[0].movement, 'fmWfceFifmnDfhN');
  const activated = getDesign('pawn.knight-tall-quiet@1');
  assert.deepEqual(activated, NEW_DEFINITIONS.find(row => row.id === 'pawn.knight-tall-quiet@1'));
  assert.equal(getDesign('pawn.knight-tall-capture@1'), undefined);
  getLevel2ReferenceSelection();
  assert.deepEqual(old.getLevel2References(), before);
  assert.deepEqual(fs.readFileSync(old.FILE), bytes);
  assert.strictEqual(getDesign('pawn.knight-tall-quiet@1'), activated);
  assert.equal(getDesign('pawn.knight-tall-capture@1'), undefined);
});

test('each read returns detached deeply frozen selection data', () => {
  const first = getLevel2ReferenceSelection(), second = getLevel2ReferenceSelection();
  assert.notStrictEqual(first, second); assert.notStrictEqual(first.protocol, second.protocol);
  assert.notStrictEqual(first.roster, second.roster); assert.notStrictEqual(first.roster[0], second.roster[0]);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.protocol)); assert.ok(Object.isFrozen(first.roster));
  assert.ok(Object.isFrozen(first.roster[0].roles)); assert.ok(Object.isFrozen(first.roster[0].engineValue));
  assert.ok(Object.isFrozen(first.protocol.selectionEvidence.partners[0]));
  assert.throws(() => { first.roster[0].engineValue.mg = 999; }, TypeError);
  assert.throws(() => { first.protocol.selectionEvidence.partners.push({}); }, TypeError);
  assert.deepEqual(getLevel2ReferenceSelection(), second);
});

test('the semantic pin tolerates checkout line endings but rejects changed moves, values and selection policy', () => {
  const original = fs.readFileSync(FILE, 'utf8');
  const portable = getLevel2ReferenceSelection({ read: () => original.replace(/\r?\n/g, '\r\n') });
  assert.equal(portable.declarationSha256, DECLARATION_SHA256);
  assert.equal(sha(portable.protocol), DECLARATION_SHA256);
  for (const change of [row => { row.roster[0].movement = 'N'; }, row => { row.roster[0].engineValue.mg++; },
    row => { row.roster[1].level = 3; }, row => { row.policy.activation = 'switch immediately'; },
    row => { row.roster[0].roles.enPassant = false; }]) {
    const changed = JSON.parse(original); change(changed);
    assert.throws(() => getLevel2ReferenceSelection({ read: () => JSON.stringify(changed) }), /Declare a new roster revision/);
  }
});

test('the selection records contextual evidence without treating outcome scores as material or automatic activation', () => {
  const { protocol } = getLevel2ReferenceSelection(), evidence = protocol.selectionEvidence;
  assert.equal(evidence.games, 768); assert.equal(evidence.wins, 327); assert.equal(evidence.draws, 113); assert.equal(evidence.losses, 328);
  assert.equal(evidence.scorePoints, evidence.wins + evidence.draws / 2);
  assert.equal(evidence.score, evidence.scorePoints / evidence.games);
  assert.equal(evidence.openingCases, 16); assert.equal(evidence.nodes, 20000);
  assert.equal(evidence.partners.length, 3);
  assert.equal(evidence.fixedHalves.reduce((sum, row) => sum + row.games * row.score, 0), evidence.scorePoints);
  assert.equal(evidence.partners.reduce((sum, row) => sum + row.games * row.score, 0), evidence.scorePoints);
  assert.match(protocol.policy.activation, /after the active version-17 panel finishes/);
  assert.match(protocol.policy.activation, /No automatic live-catalog or UI switch/);
  assert.match(protocol.policy.evaluation, /not estimated material values/);
  assert.match(protocol.policy.outcome, /not an intrinsic pawn value/);
  assert.equal(protocol.evidence, 'experiments/balance/results/v17-targeted-followups-001.audit.json');
});

test('the frozen selection agrees with the report reproduced from all uploaded games', () => {
  const { protocol, roster } = getLevel2ReferenceSelection();
  const audit = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', protocol.evidence), 'utf8'));
  const source = audit.studies.find(row => row.study === 'knight-pawn');
  const report = source.report.reports[0], selected = report.bodies.find(row => row.key === protocol.selectionEvidence.bodyKey);
  const evidence = protocol.selectionEvidence;
  for (const field of ['games', 'wins', 'draws', 'losses', 'score']) assert.equal(selected[field], evidence[field]);
  assert.equal(selected.openingCoverage.shared, evidence.openingCases);
  assert.equal(report.nodes, evidence.nodes);
  assert.deepEqual(source.stages[0].evaluation.pieceValues[roster[0].id], roster[0].engineValue);
  for (const [index, half] of report.cohorts.entries()) {
    const body = half.bodies.find(row => row.key === evidence.bodyKey);
    assert.equal(body.games, evidence.fixedHalves[index].games);
    assert.ok(Math.abs(body.score - evidence.fixedHalves[index].score) < 1e-12);
  }
  for (const partner of evidence.partners) {
    const team = report.teams.find(row => row.bodyKey === evidence.bodyKey && row.partnerKey === partner.key);
    assert.equal(team.games, partner.games);
    assert.ok(Math.abs(team.score - partner.score) < 1e-12);
  }
});
