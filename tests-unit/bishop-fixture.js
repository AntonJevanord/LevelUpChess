'use strict';
const { createBishopPlan, getBishopProtocol } = require('../scripts/balance/bishop-plan');
let pending;
const getPlan = () => pending ||= createBishopPlan();
function getParent() { const p = getBishopProtocol(); return { manifest: p.parentManifest, records: p.parentRecords }; }
function getSource() { const p = getBishopProtocol(); return { manifest: p.sourceManifest, records: p.sourceRecords }; }
module.exports = { getPlan, getParent, getSource };
