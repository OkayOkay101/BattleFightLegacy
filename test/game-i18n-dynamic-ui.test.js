const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameI18n } = require('../src/localization/GameI18n');
const messages = require('../src/localization/messages');

function liveText(i18n, key, values) {
  const getValues = typeof values === 'function' ? values : () => values;
  const output = { textContent: i18n.t(key, getValues()) };
  const unsubscribe = i18n.subscribe(() => { output.textContent = i18n.t(key, getValues()); });
  return { output, unsubscribe };
}

test('generated spectator, match-stat, and trade text refresh when the locale changes', () => {
  const i18n = createGameI18n({ messages });
  const following = liveText(i18n, 'spectator.following', () => ({ team: i18n.t('feed.team.red'), player: 'Bot 1' }));
  const stats = liveText(i18n, 'training.teamSummary', {
    rate: '75%', wins: 3, losses: 1, draws: 0, kda: '2.00', kills: 6, deaths: 3, assists: 0, dealt: 1200, taken: 900
  });
  const trade = liveText(i18n, 'trade.request', { player: 'Kai' });

  assert.equal(following.output.textContent, 'Following Red: Bot 1');
  assert.match(stats.output.textContent, /Wins 75%/);
  assert.equal(trade.output.textContent, 'Kai wants to trade with you. Trade?');

  i18n.setLanguage('th');
  assert.equal(following.output.textContent, 'กำลังติดตามทีมแดง: Bot 1');
  assert.match(stats.output.textContent, /ชนะ 75%/);
  assert.equal(trade.output.textContent, 'Kai ต้องการแลกเปลี่ยนกับคุณ ต้องการแลกเปลี่ยนหรือไม่?');
  following.unsubscribe();
  stats.unsubscribe();
  trade.unsubscribe();
});
