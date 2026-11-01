'use strict';

// Research brackets are immutable behaviors. Prices are experimental purchase
// costs; engine MG/EG values are a separate policy declared by each campaign.
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const additions = [];
function add(id, family, level, movement, placement = 'replace') {
  additions.push({ id, family, level, revision: 1, movement, legacyType: 'a', legacySlot: 1, placement,
    roles: { pawn: family === 'pawn', castlingRook: family === 'rook', enPassant: family === 'pawn' },
    inheritLegacyProbes: false });
  return id;
}
function bracket(key, label, family, level, movements, currentId, placement = 'replace', valueGroup = key) {
  const variants = ['reduced', 'current', 'expanded'].map((version, index) => ({
    key: version, label: `${label}: ${version}`, movement: movements[index],
    id: index === 1 && currentId ? currentId : add(`${family}.${key}-${version}@1`, family, level, movements[index], placement),
  }));
  return { key, label, family, level, baseId: variants[1].id, valueGroup, variants };
}
const L1_BRACKETS = [
  bracket('positional', 'Positional knight', 'knight', 1, ['NsmR2', 'NsmR', 'NmR'], 'knight.blue@2'),
  bracket('climbing', 'Climbing knight', 'knight', 1, ['NfW', 'NvW', 'NvWvD'], 'knight.blue@3'),
  bracket('hopping', 'Hopping bishop', 'bishop', 1, ['BmA', 'BgmB', 'BgmB0'], 'bishop.blue@2'),
  bracket('wazzap', 'Wazzap bishop', 'bishop', 1, ['BsmW', 'BsW', 'BsW2'], 'bishop.blue@3'),
  bracket('ghost', 'Ghost rook', 'rook', 1, ['RgmR', 'RgmR0', 'RgmQ0'], 'rook.blue@2'),
  bracket('pawn-rook', 'Pawn rook', 'rook', 1, ['RfceF', 'RceF', 'RceF2'], 'rook.blue@3'),
  bracket('advancing', 'Advancing queen', 'queen', 1, ['QimfhN', 'QmfhN', 'QmN'], 'queen.blue@2'),
];
const L2_PAWN_BRACKETS = [
  bracket('bishop-step', 'Bishop pawn', 'pawn', 2, ['fmWfcFifmnDifmF', 'fmWfeFifmnD', 'fmW2feFifmnD']),
  bracket('forward-knight', 'Forward Knight pawn', 'pawn', 2, ['fmWfceFifmnDmfhN', 'fmWfceFifmnDfhN', 'fmWfceFifmnDfhNmbW'], 'pawn.orange@3'),
  bracket('full-knight', 'Full Knight pawn', 'pawn', 2, ['fmWfceFifmnDmNcfN', 'fmWfceFifmnDN', 'fmWfceFifmnDNsmW']),
  bracket('rank', 'Rank pawn', 'pawn', 2, ['ifmnDmfWfceFsR2', 'ifmnDmfWfceFsR', 'ifmnDmfW2fceFsR']),
  bracket('rook-step', 'Rook pawn', 'pawn', 2, ['fceFmR', 'fceF2mR', 'fceF3mR']),
];
// The diagonal range ladder deliberately shares F and F2. Their price, roles
// and applied values must also match before campaign planning deduplicates them.
const diagonalForward = add('king.grant-diagonal-forward@1', 'king', 2, 'fF', 'reserve');
const diagonalTwo = add('king.grant-diagonal-two@1', 'king', 2, 'F2', 'reserve');
const diagonalThree = add('king.grant-diagonal-three@1', 'king', 2, 'F3', 'reserve');
function diagonal(key, label, entries) {
  const variants = entries.map(([id, movement], index) => ({ id, movement, key: ['reduced', 'current', 'expanded'][index],
    label: `${label}: ${['reduced', 'current', 'expanded'][index]}` }));
  return { key, label, family: 'king', level: 2, baseId: variants[1].id,
    valueGroup: 'grant-diagonal', valueBaseId: 'king.reserve-bishop@1', variants };
}
const L2_GRANT_BRACKETS = [
  diagonal('grant-diagonal', 'Diagonal grant', [[diagonalForward, 'fF'], ['king.reserve-bishop@1', 'F'], [diagonalTwo, 'F2']]),
  diagonal('grant-long-diagonal', 'Long diagonal grant', [['king.reserve-bishop@1', 'F'], [diagonalTwo, 'F2'], [diagonalThree, 'F3']]),
  bracket('grant-orthogonal', 'Orthogonal grant', 'king', 2, ['W', 'W2', 'W3'], null, 'reserve'),
  bracket('grant-forward', 'Forward grant', 'king', 2, ['fW', 'fW2', 'fW3'], null, 'reserve'),
  bracket('grant-pawnlike', 'Pawn-like grant', 'king', 2, ['fceF', 'fmWfceF', 'fmW2fceF'], null, 'reserve'),
];
const L3_NEW = [
  { key: 'quiet-archbishop', label: 'Quiet-knight Archbishop', family: 'bishop', level: 3,
    id: add('bishop.quiet-archbishop@1', 'bishop', 3, 'BmN'), movement: 'BmN', valueGroup: 'archbishop', baseId: 'bishop.purple@16' },
  { key: 'quiet-camel-grid', label: 'Quiet-camel Grid bishop', family: 'bishop', level: 3,
    id: add('bishop.quiet-camel-grid@1', 'bishop', 3, 'BDmC'), movement: 'BDmC', valueGroup: 'grid-bishop', baseId: 'bishop.purple@19' },
];
const NEW_DEFINITIONS = additions;
freeze({ NEW_DEFINITIONS, L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS, L3_NEW });
module.exports = { NEW_DEFINITIONS, L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS, L3_NEW };
