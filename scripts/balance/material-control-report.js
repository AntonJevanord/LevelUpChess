'use strict';

const number = value => Number.isFinite(value) ? value.toFixed(4) : 'unavailable';

function formatControlReport(report) {
  const { dataset, analysis } = report;
  const lines = ['# Offline ordinary-material control check', '',
    '**Existing control histories only; no new engine games or adopted material values.**', '',
    `Replayed ${dataset.games.length} records and retained ${dataset.sampleCount} material-stable positions. `
      + 'Duplicate physical histories are removed before fitting. The automatic-value policy remains separate from the eight-point policy.', '',
    '## Selection and provenance', '',
    `- Full source journal: ${report.sourceSelection?.sourceRecords ?? 'unavailable'} records.`,
    `- Selected controls: ${report.sourceSelection?.selectedRecords ?? dataset.games.length} records.`,
    `- Distinct physical histories: ${analysis.selection?.uniqueHistories ?? 'unavailable'}.`,
    `- Duplicate records excluded from fits: ${analysis.selection?.duplicatedRecords ?? analysis.selection?.duplicateRecords ?? 'unavailable'}.`,
    '- Original full registry and profile are used for replay; inactive Blink features do not become invented observations.',
    '- Archived checksums and recorded settings are checked. Actual original engine/source identities remain unverified without the missing execution manifests.', '',
    '## Ordinary baseline, Amazon support and phase sensitivity', ''];
  for (const [id, item] of Object.entries(analysis.analyses)) {
    const fit = item.analysis;
    lines.push(`### ${id}`, '',
      `- Sampled histories: ${fit.coverage.games}; positions: ${fit.coverage.samples}; opening families: ${fit.coverage.groups}.`,
      `- Rank: ${fit.rank.rank}/${fit.rank.columns}; converged: ${fit.fit.converged}.`,
      `- Held-out Brier error: ${number(fit.validation.metrics?.brier)}; training-only constant baseline: ${number(fit.validation.baselineMetrics?.brier)}.`,
      `- Normalized material table available: ${fit.normalized.available}${fit.normalized.reason ? ` (${fit.normalized.reason})` : ''}.`, '',
      '| Feature | Raw coefficient | Games with nonzero feature | Families with nonzero feature |',
      '| --- | ---: | ---: | ---: |');
    for (const feature of fit.coverage.features) lines.push(`| ${feature.name} | ${number(fit.fit.coefficients[feature.name])} | ${feature.nonzeroGames} | ${feature.groupsWithNonzero} |`);
    lines.push('', 'Raw coefficients predict recorded final scores on a logistic scale; they are not centipawns. '
      + 'Phase fits reuse the same histories and are sensitivity checks, not independent confirmations.', '');
    if (item.ordinaryRatios?.available) {
      lines.push('Arithmetic ratios for inspection only:', '', '| Ordinary feature | Raw slope / pawn slope |', '| --- | ---: |');
      for (const [name, value] of Object.entries(item.ordinaryRatios.values)) lines.push(`| ${name} | ${number(value)} |`);
      lines.push('', `Queen-minus-rook arithmetic ratio: ${number(item.ordinaryRatios.queenMinusRook)}.`);
      lines.push('');
    } else lines.push(`Ordinary ratios unavailable: ${item.ordinaryRatios?.reason ?? 'unsupported'}.`, '');
    if (item.amazonBonus) lines.push(`Amazon bonus support: ${item.amazonBonus.reason ?? (item.amazonBonus.available ? 'exploratory coefficient only' : 'unsupported')}.`, '');
  }
  lines.push('## Interpretation and stopping point', '',
    'The retained controls have no Amazon-count imbalance. A zero fitted coefficient under ridge for a zero column expresses missing information, not a zero-value upgrade. '
      + 'No sampling window, feature target or opening label was changed to force an estimate.', '',
    'Ordinary values are checked first; grouped prediction performance cannot validate an Amazon price when its feature never varies. '
      + 'Any phase differences are conditional on this small set of histories. Draws remain 0.5, each retained history has unit total weight, '
      + 'and whole related opening families stay together in validation/resampling.', '');
  const warnings = [...new Set([...(dataset.limitations || []), ...(analysis.warnings || [])])];
  for (const warning of warnings) lines.push(`- ${warning}`);
  if (analysis.decision) {
    const decision = analysis.decision;
    if (typeof decision === 'string') lines.push('', decision, '');
    else lines.push('', `- Ordinary baseline numerically identifiable: ${decision.ordinaryBaselineIdentified}.`,
      `- Ordinary material table supported: ${decision.ordinaryMaterialTableSupported}.`,
      `- Amazon bonus: ${decision.amazonBonusStatus}${decision.amazonBonusReason ? ` (${decision.amazonBonusReason})` : ''}.`,
      '', decision.interpretation, '');
  }
  lines.push('Close this bounded offline check. Keep playing values unchanged and the previous handicap pilot closed. '
    + 'The normalized-reporting threshold is not a reason to relabel openings or generate another automatic batch.', '',
    'Detailed selection, history fingerprints, active columns, per-phase weights, source hashes and fits are saved in the JSON artifacts.', '');
  return lines.join('\n');
}

module.exports = { formatControlReport };
