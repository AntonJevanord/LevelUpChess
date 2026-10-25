'use strict';

// The pinned completed parent is committed data; fixtures need no external book.
const { createRevisionPlan, getRevisionProtocol } = require('../scripts/balance/revision-plan');
let pending;
function getPlan() { return pending ||= createRevisionPlan(); }
function getParent() { const library = getRevisionProtocol(); return { manifest: library.parentManifest, records: library.parentRecords }; }
module.exports = { getPlan, getParent };
