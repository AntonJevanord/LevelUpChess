'use strict';

// Only an owned research snapshot registers these trials. Existing playable
// catalogs, save identities and historical balance runtimes stay unchanged.
const NEW_DEFINITIONS = Object.freeze([
  ...require('./balance-designs-v18-level1').NEW_DEFINITIONS,
  ...require('./balance-designs-v18-l1-followup').NEW_DEFINITIONS,
  ...require('./balance-designs-v18-l2-followup').NEW_DEFINITIONS,
  ...require('./balance-designs-v18-nightrider').NEW_DEFINITIONS,
  ...require('./balance-designs-v18-wraith').NEW_DEFINITIONS,
]);
module.exports = { NEW_DEFINITIONS };
