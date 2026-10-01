const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

function seal(value) {
	const payload = JSON.stringify(value);
	return JSON.stringify({ checksum: crypto.createHash('sha256').update(payload).digest('hex'), payload });
}

function unseal(text) {
	const envelope = JSON.parse(text);
	if (typeof envelope.payload !== 'string' || typeof envelope.checksum !== 'string' ||
		crypto.createHash('sha256').update(envelope.payload).digest('hex') !== envelope.checksum) {
		throw new Error('Training checkpoint checksum mismatch');
	}
	return JSON.parse(envelope.payload);
}

class TrainingStore {
	constructor(directory) {
		this.directory = path.resolve(directory);
		this.matchesFile = path.join(this.directory, 'matches.jsonl');
		this.checkpointFile = path.join(this.directory, 'checkpoint.json');
		this.matchIds = null;
		this.pending = Promise.resolve();
	}

	async readMatches() {
		const rows = [];
		await this.scanMatches(report => { rows.push(report); });
		return rows;
	}

	async scanMatches(onMatch) {
		try { await fs.access(this.matchesFile); }
		catch (error) { if (error.code === 'ENOENT') return; throw error; }
		const input = createReadStream(this.matchesFile, { encoding: 'utf8' });
		const lines = readline.createInterface({ input, crlfDelay: Infinity });
		let pending;
		try {
			for await (const line of lines) {
				if (!line) continue;
				if (pending !== undefined) await onMatch(JSON.parse(pending));
				pending = line;
			}
			if (pending !== undefined) {
				let finalRow;
				try { finalRow = JSON.parse(pending); }
				catch (error) { if (!(error instanceof SyntaxError)) throw error; } // A crash may leave a partial final row.
				if (finalRow !== undefined) await onMatch(finalRow);
			}
		} finally { lines.close(); input.destroy(); }
	}

	async appendMatch(report) {
		const operation = this.pending.then(async () => {
			const id = report?.result?.matchId;
			if (typeof id !== 'string' || !id || report.result.status !== 'complete') throw new TypeError('Invalid complete training result');
			if (report.speedMode === 'max' && report.parityStatus !== 'passed') throw new Error('Accelerated training result has not passed parity');
			if (report.schemaVersion >= 2) {
				if (!['train','selection','final-test'].includes(report.split) ||
					!['schemaHash','environmentHash'].every(key => /^[a-f0-9]{64}$/.test(report[key] || '')) ||
					report.trainingProtocolVersion !== 2 || report.schemaHash !== require('./NeuralSchema').getSchema(report.schemaVersion).schemaHash) throw new Error('Invalid neural match metadata');
				if ((report.trajectory || []).some(row => row.schemaVersion !== report.schemaVersion ||
					row.schemaHash !== report.schemaHash || row.environmentHash !== report.environmentHash ||
					row.trainingProtocolVersion !== 2 || row.policyVersion !== report.evaluation?.candidateVersion)) {
					throw new Error('Incompatible neural match trajectory');
				}
			}
			if (!this.matchIds) {
				const ids = new Set();
				await this.scanMatches(entry => { ids.add(entry.result.matchId); });
				this.matchIds = ids;
			}
			if (this.matchIds.has(id)) return false;
			await fs.mkdir(this.directory, { recursive: true });
			await this._repairTrailingRow();
			await fs.appendFile(this.matchesFile, JSON.stringify(report) + '\n');
			this.matchIds.add(id);
			return true;
		});
		this.pending = operation.catch(() => {});
		return operation;
	}

	async _repairTrailingRow() {
		let file;
		try { file = await fs.open(this.matchesFile, 'r+'); }
		catch (error) { if (error.code === 'ENOENT') return; throw error; }
		try {
			const { size } = await file.stat();
			if (!size) return;

			const lastByte = Buffer.alloc(1);
			await file.read(lastByte, 0, 1, size - 1);
			if (lastByte[0] === 0x0a) return;

			let tailStart = 0;
			let cursor = size;
			while (cursor > 0) {
				const chunkStart = Math.max(0, cursor - 4096);
				const chunk = Buffer.allocUnsafe(cursor - chunkStart);
				await file.read(chunk, 0, chunk.length, chunkStart);
				const newline = chunk.lastIndexOf(0x0a);
				if (newline !== -1) {
					tailStart = chunkStart + newline + 1;
					break;
				}
				cursor = chunkStart;
			}

			const tail = Buffer.allocUnsafe(size - tailStart);
			await file.read(tail, 0, tail.length, tailStart);
			try { JSON.parse(tail.toString('utf8')); }
			catch (error) { await file.truncate(tailStart); return; }

			const newline = Buffer.from('\n');
			const { bytesWritten } = await file.write(newline, 0, 1, size);
			if (bytesWritten !== 1) throw new Error('Could not repair trailing training row');
		} finally { await file.close(); }
	}

	async saveCheckpoint(value) {
		await fs.mkdir(this.directory, { recursive: true });
		const temp = `${this.checkpointFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
		const backup = path.join(this.directory, 'checkpoint.previous.json');
		let existing;
		try { existing = await fs.readFile(this.checkpointFile, 'utf8'); unseal(existing); }
		catch (error) { existing = null; }
		if (existing) await fs.writeFile(backup, existing);
		await fs.writeFile(temp, seal(value));
		try {
			for (let attempt = 0; ; attempt++) {
				try { await fs.rename(temp, this.checkpointFile); break; }
				catch (error) {
					if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 9) throw error;
					await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
				}
			}
		}
		finally { await fs.rm(temp, { force: true }); }
	}

	async loadCheckpoint() {
		for (const file of [this.checkpointFile, path.join(this.directory, 'checkpoint.previous.json')]) {
			try { return unseal(await fs.readFile(file, 'utf8')); }
			catch (error) { if (error.code !== 'ENOENT' && file.endsWith('checkpoint.previous.json')) throw error; }
		}
		return null;
	}
}

module.exports = { TrainingStore };
