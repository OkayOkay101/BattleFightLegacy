(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrainingTelemetry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function formatTrainingTelemetry(train, tr) {
    const lines = [tr('training.schemaSummary', { schema: train.schemaVersion || 1,
      protocol: train.trainingProtocolVersion || 1, phase: train.phase ? tr('training.phase.' + train.phase) : '—' }),
    tr('training.sampleSummary', { total: train.pendingDecisions || 0, eligible: train.pendingMultiOptionDecisions || 0 })];
    const metrics = train.updateMetrics || train.metrics || {};
    const diagnostics = Object.entries(metrics).filter(([key, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([key, value]) => key + ': ' + value.toFixed(4));
    if (diagnostics.length) lines.push('PPO · ' + diagnostics.join(' · '));
    const opponents = [train.opponentMetrics, train.perOpponent, train.lastEvaluation?.opponents]
      .find(value => value && Object.keys(value).length) || {};
    for (const [opponent, result] of Object.entries(opponents)) {
      lines.push(tr('training.opponentSummary', { opponent: result.version ? opponent + ' · ' + result.version : opponent, wins: result.wins || 0, draws: result.draws || 0,
        losses: result.losses || 0, games: result.games || 0,
        lower: Number.isFinite(result.lowerBound) ? (result.lowerBound * 100).toFixed(1) + '%' : '—' }));
    }
    return lines.join('\n');
  }
  return { formatTrainingTelemetry };
});
