const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTrainingTelemetry } = require('../src/localization/TrainingTelemetry');
const { createGameI18n } = require('../src/localization/GameI18n');
const messages = require('../src/localization/messages');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');

test('web and desktop menu scripts compile with requested model and schema telemetry controls', () => {
	const source = fs.readFileSync(path.join(__dirname, '../src/templates/menu.ejs'), 'utf8');
	for (const desktopMode of [false, true]) {
		const html = ejs.render(source, { desktopMode, trainingDemoPolicy: 'n-000001' });
		for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
		assert.match(html, /TrainingTelemetry.js/);
		assert.match(html, /requestedModels/);
		assert.match(html, /schemaVersion: 3/);
	}
});

test('V2 telemetry renders schema, eligible samples and per opponent outcomes in both languages', () => {
	const i18n = createGameI18n({ messages });
	const train = { schemaVersion: 2, trainingProtocolVersion: 2, phase: 'final-test', pendingDecisions: 8500,
		pendingMultiOptionDecisions: 8200, opponentMetrics: { 'n-000001': { wins: 40, draws: 10, losses: 10, games: 60, lowerBound: .61 } } };
	const en = formatTrainingTelemetry(train, i18n.t.bind(i18n));
	assert.match(en, /Schema 2/);
	assert.match(en, /8200/);
	assert.match(en, /40\/10\/10/);
	assert.match(en, /61.0%/);
	i18n.setLanguage('th');
	const th = formatTrainingTelemetry(train, i18n.t.bind(i18n));
	assert.match(th, /สคีมา 2/);
	assert.match(th, /ชนะ\/เสมอ\/แพ้/);
	assert.match(th, /ทดสอบสุดท้าย/);
	assert.doesNotMatch(formatTrainingTelemetry({}, i18n.t.bind(i18n)), /undefined|NaN/);
});

test('training phase retains the previous completed evaluation in telemetry', () => {
	const i18n = createGameI18n({messages});
	const text = formatTrainingTelemetry({phase:'train',opponentMetrics:{},perOpponent:{},lastEvaluation:{
		opponents:{champion:{version:'n-000027',wins:31,draws:1,losses:28,games:60,lowerBound:.4}}}},i18n.t.bind(i18n));
	assert.match(text,/31\/1\/28/);
});
