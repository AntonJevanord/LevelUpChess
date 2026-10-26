'use strict';

const { createSimplePlan, getSimpleProtocol } = require('../scripts/balance/simple-plan');
let pending;
function getPlan() { return pending ||= createSimplePlan(); }
function getParent() { const library = getSimpleProtocol(); return { manifest: library.parentManifest, records: library.parentRecords }; }
module.exports = { getPlan, getParent };
