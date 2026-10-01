'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function initializeUserPolicyData (root, userDataDirectory) {
	const sourceDirectory = path.join(root, 'training-data', 'policies');
	const userTrainingDirectory = path.join(userDataDirectory, 'training-data');
	const userPolicyDirectory = path.join(userTrainingDirectory, 'policies');
	if (!fs.existsSync(sourceDirectory)) {
		throw new Error(`Desktop policy seeds are missing: ${sourceDirectory}`);
	}
	const seeds = fs.readdirSync(sourceDirectory).filter(name => /^n-\d+\.json$/.test(name));
	if (!seeds.length) throw new Error(`No desktop policy seeds were found in ${sourceDirectory}`);
	fs.mkdirSync(userPolicyDirectory, { recursive: true });
	for (const name of seeds) {
		const source = path.join(sourceDirectory, name);
		const destination = path.join(userPolicyDirectory, name);
		if (!fs.existsSync(destination)) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
	}
	const registryFile = path.join(userTrainingDirectory, 'registry.json');
	const manifestFile = path.join(root, 'training-data', 'approved-seed-manifest.json');
	if (!fs.existsSync(registryFile) && fs.existsSync(manifestFile)) {
		const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
		for (const key of ['championVersion', 'previousVersion', 'activeVersion']) {
			if (manifest[key] !== 'baseline' && !seeds.includes(`${manifest[key]}.json`)) throw new Error(`Invalid approved seed pointer: ${key}`);
		}
		const payload = JSON.stringify({ autoUpdate: true, championVersion: manifest.championVersion,
			previousVersion: manifest.previousVersion, activeVersion: manifest.activeVersion });
		fs.writeFileSync(registryFile, JSON.stringify({ payload, checksum: crypto.createHash('sha256').update(payload).digest('hex') }), { flag: 'wx' });
	}
	return {
		trainingDirectory: userTrainingDirectory,
		selectionFile: path.join(userDataDirectory, 'desktop-selection.json')
	};
}

module.exports = { initializeUserPolicyData };
