'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const AUDIO = new Set(['.aac', '.aif', '.aiff', '.caf', '.flac', '.m4a', '.mid', '.midi', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.weba', '.wma']);
const IMAGE = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const HOSTS = new Set(['cache.modd.io', 'modd.s3.amazonaws.com']);
const TRAINING_RUNTIME = new Set(['DemoRuntime.js', 'NeuralActions.js', 'NeuralController.js', 'NeuralInference.js', 'NeuralObservation.js', 'PolicyRegistry.js', 'TrainingMatch.js', 'TrainingRoster.js', 'TrainingStats.js']);
const VENDOR = [
	['node_modules/jquery/dist/jquery.min.js', 'assets/desktop-vendor/jquery/dist/jquery.min.js'],
	['node_modules/jquery-ui-dist/jquery-ui.min.js', 'assets/desktop-vendor/jquery-ui/jquery-ui.min.js'],
	['node_modules/jquery-contextmenu/dist/jquery.contextMenu.min.js', 'assets/desktop-vendor/jquery-contextmenu/dist/jquery.contextMenu.min.js'],
	['node_modules/jquery-contextmenu/dist/jquery.contextMenu.min.css', 'assets/desktop-vendor/jquery-contextmenu/dist/jquery.contextMenu.min.css'],
	['node_modules/jquery-contextmenu/dist/jquery.ui.position.min.js', 'assets/desktop-vendor/jquery-contextmenu/dist/jquery.ui.position.min.js'],
	['node_modules/@popperjs/core/dist/umd/popper.min.js', 'assets/desktop-vendor/popper/umd/popper.min.js'],
	['node_modules/bootstrap/dist/css/bootstrap.min.css', 'assets/desktop-vendor/bootstrap/css/bootstrap.min.css'],
	['node_modules/bootstrap/dist/js/bootstrap.min.js', 'assets/desktop-vendor/bootstrap/js/bootstrap.min.js'],
	['node_modules/lz-string/libs/lz-string.min.js', 'assets/desktop-vendor/lz-string/libs/lz-string.min.js'],
	['node_modules/lodash/lodash.min.js', 'assets/desktop-vendor/lodash/lodash.min.js'],
	['node_modules/sweetalert2/dist/sweetalert2.min.js', 'assets/desktop-vendor/sweetalert2/sweetalert2.min.js'],
	['node_modules/pixi.js-legacy/dist/browser/pixi-legacy.min.js', 'assets/desktop-vendor/pixi/pixi-legacy.min.js'],
	['node_modules/@fortawesome/fontawesome-free/css/all.min.css', 'assets/desktop-vendor/fontawesome/css/all.min.css']
];

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let crc = i;
		for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
		table[i] = crc >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function makePng(width, height, pixel) {
	const rows = [];
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(1 + width * 4);
		for (let x = 0; x < width; x++) {
			const rgba = pixel(x, y);
			const offset = 1 + x * 4;
			row[offset] = rgba[0]; row[offset + 1] = rgba[1]; row[offset + 2] = rgba[2]; row[offset + 3] = rgba[3];
		}
		rows.push(row);
	}
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const chunk = (type, data) => {
		const tag = Buffer.from(type, 'ascii');
		const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
		const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
		return Buffer.concat([size, tag, data, sum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
	return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function validImage(data, ext) {
	if (ext === '.png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	if (ext === '.jpg' || ext === '.jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
	if (ext === '.gif') return /^GIF8[79]a$/.test(data.toString('ascii', 0, 6));
	if (ext === '.webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
	if (ext === '.svg') return /<svg[\s>]/i.test(data.toString('utf8', 0, Math.min(data.length, 4096)));
	return false;
}

function optimizePng(input) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	if (input.length < 20 || !input.subarray(0, 8).equals(signature)) return { buffer: input, saved: 0, malformed: true };
	const chunks = []; const idat = [];
	let offset = 8; let firstIdat = -1;
	try {
		while (offset < input.length) {
			if (offset + 12 > input.length) throw new Error('Truncated PNG chunk');
			const size = input.readUInt32BE(offset); const end = offset + 12 + size;
			if (end > input.length) throw new Error('PNG chunk exceeds file size');
			const type = input.toString('ascii', offset + 4, offset + 8);
			const data = input.subarray(offset + 8, offset + 8 + size);
			if (input.readUInt32BE(offset + 8 + size) !== crc32(input.subarray(offset + 4, offset + 8 + size))) throw new Error('PNG CRC mismatch');
			if (type === 'IDAT') { if (firstIdat === -1) firstIdat = chunks.length; idat.push(data); }
			else chunks.push({ type, data: Buffer.from(data) });
			offset = end;
			if (type === 'IEND') break;
		}
		if (offset !== input.length || firstIdat === -1 || !chunks.some(c => c.type === 'IEND')) throw new Error('Incomplete PNG');
		const compressed = zlib.deflateSync(zlib.inflateSync(Buffer.concat(idat)), { level: 9 });
		chunks.splice(Math.min(firstIdat, chunks.length), 0, { type: 'IDAT', data: compressed });
		const output = [signature];
		for (const chunk of chunks) {
			const tag = Buffer.from(chunk.type, 'ascii'); const size = Buffer.alloc(4); size.writeUInt32BE(chunk.data.length);
			const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([tag, chunk.data])));
			output.push(size, tag, chunk.data, sum);
		}
		const result = Buffer.concat(output);
		return result.length < input.length ? { buffer: result, saved: input.length - result.length, malformed: false } : { buffer: input, saved: 0, malformed: false };
	} catch (error) { return { buffer: input, saved: 0, malformed: true }; }
}

function inside(root, candidate) {
	const relative = path.relative(root, candidate);
	return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function audioRef(value) {
	try { return AUDIO.has(path.extname(new URL(value, 'https://local.invalid').pathname).toLowerCase()); } catch (error) { return false; }
}

function imageUrl(value) {
	if (typeof value !== 'string' || audioRef(value)) return false;
	return IMAGE.has(path.extname(value.split(/[?#]/)[0]).toLowerCase());
}

function normalizeUrl(value) {
	try {
		const url = value.startsWith('/assets/')
			? new URL('https://' + value.slice('/assets/'.length))
			: new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
		if (!HOSTS.has(url.hostname)) return null;
		return { host: url.hostname, path: decodeURIComponent(url.pathname), key: url.hostname + decodeURIComponent(url.pathname) };
	} catch (error) { return null; }
}

function safeRelative(value) {
	const relative = path.normalize(value);
	return !path.isAbsolute(relative) && !relative.split(path.sep).includes('..') ? relative : null;
}

function sourceByManifest(entry, repoRoot) {
	if (!entry || typeof entry.path !== 'string') return null;
	const relative = safeRelative(entry.path);
	if (!relative || !relative.startsWith('assets' + path.sep)) return null;
	const absolute = path.resolve(repoRoot, relative);
	if (!inside(path.resolve(repoRoot, 'assets'), absolute) || !fs.existsSync(absolute)) return null;
	const stat = fs.lstatSync(absolute);
	return stat.isFile() && !stat.isSymbolicLink() ? absolute : null;
}

function sourceByUrl(reference, repoRoot) {
	const filename = reference.path.split('/').filter(Boolean).map(part => part.replace(/[^A-Za-z0-9._-]/g, '_')).join(path.sep);
	const candidate = path.resolve(repoRoot, 'assets', reference.host, filename);
	if (!inside(path.resolve(repoRoot, 'assets'), candidate) || !fs.existsSync(candidate)) return null;
	const stat = fs.lstatSync(candidate);
	return stat.isFile() && !stat.isSymbolicLink() ? candidate : null;
}

function makeManifestIndex(manifest, repoRoot) {
	const index = new Map();
	for (const item of manifest.files || []) {
		const ref = normalizeUrl(item.url || '');
		if (!ref) {
			if (/^https?:/i.test(item.url || '') && imageUrl(item.url)) throw new Error('Unsupported image origin in manifest: ' + item.url);
			continue;
		}
		const entries = index.get(ref.key) || [];
		entries.push({ item, source: sourceByManifest(item, repoRoot) });
		index.set(ref.key, entries);
	}
	return index;
}

function resolveImage(value, context) {
	if (!imageUrl(value)) return null;
	if (value.startsWith('/assets/images/') || value.startsWith('/assets/fonts/')) {
		const relative = path.join('assets', value.slice('/assets/'.length).split('/').join(path.sep));
		const source = path.resolve(context.repoRoot, relative);
		if (inside(path.resolve(context.repoRoot, 'assets'), source) && fs.existsSync(source) &&
			validImage(fs.readFileSync(source), path.extname(source).toLowerCase())) return { source, relative, key: 'local:' + relative };
		return { missing: true, expected: relative, key: 'local:' + relative };
	}
	const ref = normalizeUrl(value);
	if (!ref) {
		if (value.startsWith('/assets/')) {
			const expected = path.join('assets', value.slice('/assets/'.length).split('/').join(path.sep));
			return { missing: true, expected, key: 'unsupported:' + value, unsupported: true };
		}
		if (/^https?:/i.test(value)) throw new Error('Game references an image from an unsupported host: ' + value);
		return null;
	}
	const candidates = context.manifestIndex.get(ref.key) || [];
	for (const item of candidates) {
		if (item.source && validImage(fs.readFileSync(item.source), path.extname(item.source).toLowerCase())) {
			return { source: item.source, relative: path.relative(context.repoRoot, item.source), key: ref.key };
		}
	}
	const derived = sourceByUrl(ref, context.repoRoot);
	if (derived && validImage(fs.readFileSync(derived), path.extname(derived).toLowerCase())) {
		return { source: derived, relative: path.relative(context.repoRoot, derived), key: ref.key };
	}
	const manifestEntry = candidates.find(item => item.item && item.item.path);
	return { missing: true, expected: manifestEntry ? manifestEntry.item.path : path.join('assets', ref.host, ref.path.slice(1)), key: ref.key, ref };
}

function removeAudioData(game) {
	function clean(node) {
		if (Array.isArray(node)) {
			return node.filter(item => {
				if (typeof item === 'string') return !audioRef(item);
				if (!item || typeof item !== 'object') return true;
				if (item.key && /^sound$/i.test(item.key)) return false;
				if (typeof item.type === 'string' && /^(play|stop)(sound|music)/i.test(item.type)) return false;
				return !audioRef(item.url || '');
			}).map(clean);
		}
		if (!node || typeof node !== 'object') return typeof node === 'string' && audioRef(node) ? undefined : node;
		const result = {};
		for (const [key, value] of Object.entries(node)) {
			if (/^(sound|sounds|music|audio|audios)$/i.test(key)) continue;
			if (typeof value === 'string' && audioRef(value)) continue;
			if (key === 'type' && typeof value === 'string' && /^(play|stop)(sound|music)/i.test(value)) continue;
			result[key] = clean(value);
		}
		return result;
	}
	const output = clean(game);
	output.enableVideoChat = false;
	if (output.data && output.data.defaultData) output.data.defaultData.enableVideoChat = false;
	if (output.data && output.data.settings && output.data.settings.images) delete output.data.settings.images.cover;
	return output;
}

function rewriteGameAssets(game, context, stats) {
	const missingUnits = new Set();
	const missingCellSheets = new Set();
	function rewrite(node, parts) {
		if (Array.isArray(node)) return node.map((child, index) => rewrite(child, parts.concat(String(index))));
		if (node && typeof node === 'object') {
			for (const [key, child] of Object.entries(node)) {
				const updated = rewrite(child, parts.concat(key));
				if (updated === undefined) delete node[key]; else node[key] = updated;
			}
			return node;
		}
		if (typeof node !== 'string') return node;
		const resolved = resolveImage(node, context);
		if (!resolved) return node;
		if (resolved.source) {
			context.resolvedAssets.set(resolved.key, resolved);
			return '/' + resolved.relative.split(path.sep).join('/');
		}
		const pointers = context.missingAssets.get(resolved.expected) || new Set();
		pointers.add(parts.join('.'));
		context.missingAssets.set(resolved.expected, pointers);
		const unitIndex = parts.indexOf('unitTypes');
		if (unitIndex !== -1 && parts[unitIndex + 2] === 'cellSheet' && parts[unitIndex + 3] === 'url') {
			const id = parts[unitIndex + 1];
			missingUnits.add(id);
			missingCellSheets.add(id);
			return '/assets/desktop-fallback/units/' + id + '.svg';
		}
		if (unitIndex !== -1) {
			const id = parts[unitIndex + 1];
			missingUnits.add(id);
			return '/assets/desktop-fallback/units/' + id + '.svg';
		}
		if (parts.includes('particleTypes')) return '/assets/desktop-fallback/particle.svg';
		if (parts.includes('tilesets')) return '/assets/desktop-fallback/tileset.svg';
		return '/assets/desktop-fallback/visual.svg';
	}
	const output = rewrite(game, []);
	for (const id of missingCellSheets) {
		const unit = output.data && output.data.unitTypes && output.data.unitTypes[id];
		if (!unit || !unit.cellSheet) continue;
		unit.cellSheet.rowCount = 1; unit.cellSheet.columnCount = 1;
		for (const animation of Object.values(unit.animations || {})) if (animation && Array.isArray(animation.frames)) animation.frames = [1];
	}
	stats.missingVisuals = Array.from(context.missingAssets.entries()).map(([expected, refs]) => ({
		expected, referenceCount: refs.size, references: Array.from(refs).slice(0, 8)
	}));
	stats.fallbackUnitCount = missingUnits.size;
	context.missingUnits = missingUnits;
	return output;
}

function copyAsset(source, relativePath, stageRoot, stats, optimize = true) {
	const relative = safeRelative(relativePath);
	const destination = path.resolve(stageRoot, relative || '');
	if (!relative || !inside(stageRoot, destination)) throw new Error('Asset destination escaped staging root: ' + relativePath);
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const original = fs.readFileSync(source);
	let output = original; let saved = 0; let malformed = false;
	if (path.extname(relative).toLowerCase() === '.png' && optimize) {
		const result = optimizePng(original); output = result.buffer; saved = result.saved; malformed = result.malformed;
	}
	fs.writeFileSync(destination, output);
	const record = { path: relative.split(path.sep).join('/'), sourceBytes: original.length, stagedBytes: output.length, pngBytesSaved: saved, malformedPng: malformed };
	stats.files.push(record); stats.sourceBytes += original.length; stats.stagedBytes += output.length; stats.pngBytesSaved += saved;
	return record;
}

function unitFallback(id) {
	const palette = ['#e05d5d', '#5e9de0', '#df9c43', '#9a70d6', '#43a987', '#d46da6', '#a2b24c'];
	let hash = 0;
	for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	const fill = palette[hash % palette.length];
	return '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" shape-rendering="crispEdges">'
		+ '<path fill="#111827" d="M32 2 52 10 61 28 56 50 44 60 20 60 8 50 3 28 12 10z"/>'
		+ '<path fill="' + fill + '" d="M32 6 49 13 56 29 51 47 41 55 23 55 13 47 8 29 15 13z"/>'
		+ '<path fill="#17212f" d="M17 22 23 14 41 14 47 22 46 33 41 37 42 48 34 53 30 53 22 48 23 37 18 33z"/>'
		+ '<path fill="#e7edf2" d="M20 25h8v6h-8zm16 0h8v6h-8z"/>'
		+ '<path fill="#f3c865" d="M22 27h4v3h-4zm16 0h4v3h-4z"/>'
		+ '<path fill="#263548" d="M26 36h12v4H26z"/><path fill="#111827" d="M12 29 4 38 9 42 19 35zm40 0 8 9-5 5-10-8z"/>'
		+ '</svg>';
}

function createFallbackAssets(stageRoot, missingUnits, stats) {
	const fallbackRoot = path.join(stageRoot, 'assets', 'desktop-fallback');
	fs.mkdirSync(fallbackRoot, { recursive: true });
	const empty = makePng(1, 1, () => [0, 0, 0, 0]);
	fs.writeFileSync(path.join(fallbackRoot, 'empty.png'), empty);
	stats.files.push({ path: 'assets/desktop-fallback/empty.png', sourceBytes: 0, stagedBytes: empty.length, pngBytesSaved: 0, malformedPng: false, generated: true });
	stats.stagedBytes += empty.length;
	const coin = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#9b5d14"/><circle cx="16" cy="15" r="12" fill="#f5bf47" stroke="#ffdf83" stroke-width="2"/><path d="M19.7 10.2c-.8-.8-2-1.2-3.8-1.2-2.8 0-4.6 1.4-4.6 3.6 0 2.1 1.5 3.1 4.3 3.7 2 .4 2.7.8 2.7 1.7s-.9 1.5-2.4 1.5c-1.4 0-2.7-.5-3.8-1.5l-1.6 2.1c1.2 1.1 2.8 1.7 4.7 1.9v2h2v-2c3-.3 4.8-1.7 4.8-4.1 0-2.1-1.3-3.1-4.3-3.8-2.1-.5-2.7-.8-2.7-1.6s.8-1.3 2.2-1.3c1.2 0 2.2.4 3.1 1.1z" fill="#75410d"/></svg>';
	fs.mkdirSync(path.join(stageRoot, 'assets', 'images'), { recursive: true });
	fs.writeFileSync(path.join(stageRoot, 'assets', 'images', 'coin.svg'), coin, 'utf8');
	stats.files.push({ path: 'assets/images/coin.svg', sourceBytes: 0, stagedBytes: Buffer.byteLength(coin), pngBytesSaved: 0, malformedPng: false, generated: true });
	stats.stagedBytes += Buffer.byteLength(coin);
	for (const id of missingUnits) {
		const svg = unitFallback(id); const relative = path.join('assets', 'desktop-fallback', 'units', id + '.svg');
		fs.mkdirSync(path.dirname(path.join(stageRoot, relative)), { recursive: true });
		fs.writeFileSync(path.join(stageRoot, relative), svg, 'utf8');
		stats.files.push({ path: relative.split(path.sep).join('/'), sourceBytes: 0, stagedBytes: Buffer.byteLength(svg), pngBytesSaved: 0, malformedPng: false, generated: true });
		stats.stagedBytes += Buffer.byteLength(svg);
	}
	const generated = [
		['particle.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop stop-color="#fff2a8"/><stop offset=".3" stop-color="#ffb84d" stop-opacity=".9"/><stop offset="1" stop-color="#ff7b30" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/></svg>'],
		['visual.svg', unitFallback('desktop')],
		['tileset.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048"><defs><pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#5c7654"/><path d="M0 32h64M32 0v64" stroke="#718a63" stroke-width="3"/><path d="M4 6h22v20H4zm34 33h21v20H38z" fill="#786951"/></pattern></defs><rect width="2048" height="2048" fill="url(#p)"/></svg>']
	];
	for (const [name, contents] of generated) {
		const relative = path.join('assets', 'desktop-fallback', name);
		fs.writeFileSync(path.join(stageRoot, relative), contents, 'utf8');
		stats.files.push({ path: relative.split(path.sep).join('/'), sourceBytes: 0, stagedBytes: Buffer.byteLength(contents), pngBytesSaved: 0, malformedPng: false, generated: true });
		stats.stagedBytes += Buffer.byteLength(contents);
	}
}

function stripBlock(source, marker) {
	let start = source.indexOf(marker);
	while (start !== -1) {
		const open = source.indexOf('{', start);
		if (open === -1) throw new Error('Unclosed audio block: ' + marker);
		let depth = 0; let quote = null; let lineComment = false; let blockComment = false; let escaped = false; let end = -1;
		for (let i = open; i < source.length; i++) {
			const char = source[i]; const next = source[i + 1];
			if (lineComment) { if (char === '\n') lineComment = false; continue; }
			if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i++; } continue; }
			if (quote) {
				if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = null;
				continue;
			}
			if (char === '/' && next === '/') { lineComment = true; i++; continue; }
			if (char === '/' && next === '*') { blockComment = true; i++; continue; }
			if (char === '"' || char === "'" || char.charCodeAt(0) === 96) { quote = char; continue; }
			if (char === '{') depth++;
			else if (char === '}' && --depth === 0) { end = i + 1; break; }
		}
		if (end === -1) throw new Error('Unclosed audio block: ' + marker);
		while (end < source.length && /[\r\n\t ]/.test(source[end])) end++;
		source = source.slice(0, start) + source.slice(end);
		start = source.indexOf(marker, start);
	}
	return source;
}

function stripAudioCode(source) {
	const patterns = [
		[/^[ \t]*['"]\/gameClasses\/components\/SoundComponent(?:\.js)?['"],?[ \t]*$/gm, ''],
		[/^[ \t]*\{[^\r\n]*name:\s*['"](?:Sound|VideoChat)Component['"][^\r\n]*\},?[ \t]*$/gm, ''],
		[/^\s*\['csap',\s*'IgeAudio(?:Component)?',\s*'components\/audio\/[^']+'\],?\s*$/gm, ''],
		[/^\s*if \(!window\.isDesktopApp\) ige\.addComponent\(SoundComponent\);\s*$/gm, ''],
		[/^\s*if \(!window\.isDesktopApp\) ige\.network\.define\('sound', this\._onSound\);\s*$/gm, ''],
		[/^\s*if \(!window\.isDesktopApp\) ige\.network\.define\('videoChat', this\._onVideoChat\);\s*$/gm, ''],
		[/^\s*if \(!window\.isDesktopApp\) \{\s*\r?\n\s*ige\.sound\.preLoadSound\(\);\s*\r?\n\s*ige\.sound\.preLoadMusic\(\);\s*\r?\n\s*\}\s*$/gm, ''],
		[/^\s*ige\.addComponent\(SoundComponent\);\s*$/gm, ''],
		[/^\s*ige\.network\.define\('sound',\s*self\._onSomeBullshit\);\s*$/gm, ''],
		[/^\s*ige\.network\.define\('videoChat',\s*self\._onSomeBullshit\);\s*$/gm, ''],
		[/^\s*'sound',\s*$/gm, '']
	];
	for (const [pattern, replacement] of patterns) source = source.replace(pattern, replacement);
	const handlers = [
		['\t_onSound: function (data) {', '\n\t_onParticle:'],
		['\t_onVideoChat: function (data) {', '\n\t_']
	];
	for (const [startMarker, endMarker] of handlers) {
		const start = source.indexOf(startMarker);
		if (start === -1) continue;
		const end = source.indexOf(endMarker, start + 1);
		if (end === -1) throw new Error('Could not find end of handler: ' + startMarker);
		source = source.slice(0, start) + source.slice(end + 1);
	}
	for (const marker of ['for (soundId in data.sound) {', 'if (newState.sound) {', 'if (this.isPlayingSound) {', 'if (effect.sound) {']) {
		source = stripBlock(source, marker);
	}
	source = source.replace(/^\s*\/\/.*ige\.sound.*(?:\r?\n|$)/gm, '');
	const actionStart = source.indexOf('/* Sound */');
	if (actionStart !== -1) {
		const actionEnd = source.indexOf("case 'showMenuAndSelectCurrentServer':", actionStart);
		if (actionEnd === -1) throw new Error('Could not find end of sound action cases');
		source = source.slice(0, actionStart) + source.slice(actionEnd);
	}
	const stopStart = source.indexOf("case 'stopMusicForPlayer':");
	if (stopStart !== -1) {
		const stopEnd = source.indexOf('/* Entity */', stopStart);
		if (stopEnd === -1) throw new Error('Could not find end of stopMusicForPlayer case');
		source = source.slice(0, stopStart) + source.slice(stopEnd);
	}
	return source;
}

function copyRuntime(repoRoot, stageRoot) {
	function skip(relative, entry) {
		const parts = relative.split(/[\\/]/); const name = parts[parts.length - 1]; const ext = path.extname(name).toLowerCase();
		if (AUDIO.has(ext) || ext === '.pyc' || ext === '.pyo' || /\.(log|pid|tmp)$/i.test(name)) return true;
		if (parts.some(part => ['.git', 'node_modules', '__pycache__', 'backups'].includes(part))) return true;
		if (relative === path.join('src', 'assets') || relative.startsWith(path.join('src', 'assets') + path.sep)) return true;
		if ([path.join('src', 'game.js'), path.join('src', 'game.json.gz'), path.join('src', 'gameClasses', 'components', 'SoundComponent.js'),
			path.join('src', 'gameClasses', 'components', 'ui', 'VideoChatComponent.js'), path.join('src', 'templates', 'videochat.ejs')].includes(relative)) return true;
		if (relative === path.join('engine', 'components', 'physics', 'crash', 'switch.js')) return true;
		if (relative === path.join('engine', 'components', 'audio') || relative.startsWith(path.join('engine', 'components', 'audio') + path.sep)) return true;
		if (parts[0] === 'server' && parts[1] === 'training') {
			if (parts.length <= 2) return false;
			return parts.length !== 3 || !TRAINING_RUNTIME.has(name);
		}
		if (entry.isDirectory() && relative === 'assets') return true;
		return false;
	}
	function visit(source, destination, relative) {
		const stat = fs.lstatSync(source);
		if (stat.isSymbolicLink()) throw new Error('Refusing symbolic link in runtime source: ' + source);
		if (relative && skip(relative, stat)) return;
		if (stat.isDirectory()) {
			fs.mkdirSync(destination, { recursive: true });
			for (const name of fs.readdirSync(source)) visit(path.join(source, name), path.join(destination, name), path.join(relative, name));
		} else {
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.copyFileSync(source, destination);
		}
	}
	for (const name of ['server', 'engine', 'src']) visit(path.join(repoRoot, name), path.join(stageRoot, name), name);
}

function transformSources(stageRoot) {
	const files = ['src/ClientConfig.js', 'server/ServerConfig.js', 'engine/CoreConfig.js', 'src/client.js',
		'src/gameClasses/ClientNetworkEvents.js', 'src/gameClasses/components/EffectComponent.js',
		'src/gameClasses/Unit.js', 'src/gameClasses/components/script/ActionComponent.js', 'engine/core/IgeEntity.js', 'server/server.js'];
	for (const relative of files) {
		const file = path.join(stageRoot, relative);
		if (!fs.existsSync(file)) continue;
		let source = stripAudioCode(fs.readFileSync(file, 'utf8'));
		if (relative === 'src/ClientConfig.js') {
			source = source.replace(/^[ \t]*['"][^'"]*(?:SoundComponent|VideoChatComponent)\.js['"],?[ \t]*$/gm, '');
		}
		if (relative === 'server/ServerConfig.js') {
			source = source.replace(/^[ \t]*\{[^\r\n]*name:\s*['"](?:Sound|VideoChat)Component['"][^\r\n]*\},?[ \t]*$/gm, '');
		}
		if (relative === 'server/server.js') source = source.replace(/^\s*if \(ige\.game\.data\.defaultData\.enableVideoChat\) \{\s*\r?\n\s*ige\.addComponent\(VideoChatComponent\);\s*\r?\n\s*\}\s*$/gm, '');
		if (relative === 'src/client.js') {
			source = source.replace(/^[ \t]*ige\.addComponent\(VideoChatComponent\);.*(?:\r?\n|$)/gm, '');
			source = source.replace(/,\s*['"]sound['"]/g, '');
			source = source.replace(/\s*src:\s*[^\n,]*coin\.png,/g, "\n\t\t\t\tsrc: '/assets/images/coin.svg',");
			source = source.replace(/\/assets\/cache\.modd\.io\/asset\/spriteImage\/1560747844626_dot\.png\?version=\$\{version\}/g, '/assets/desktop-fallback/empty.png');
		}
		if (relative === 'server/server.js') source = source.replace(/,\s*['"]sound['"]/g, '');
		fs.writeFileSync(file, source, 'utf8');
	}
	const shop = path.join(stageRoot, 'src/gameClasses/components/ShopComponent.js');
	if (fs.existsSync(shop)) fs.writeFileSync(shop, fs.readFileSync(shop, 'utf8').replace(/\/assets\/images\/coin\.png/g, '/assets/images/coin.svg'), 'utf8');
}

function copyCss(repoRoot, stageRoot, context, stats) {
	const sourceDir = path.join(repoRoot, 'assets', 'css');
	const targetDir = path.join(stageRoot, 'assets', 'css');
	fs.mkdirSync(targetDir, { recursive: true });
	for (const name of fs.readdirSync(sourceDir)) {
		if (path.extname(name).toLowerCase() !== '.css') continue;
		const source = path.join(sourceDir, name); const original = fs.readFileSync(source, 'utf8');
		const css = original.replace(/^\s*@import\s+url\(['"]?https?:\/\/[^'")]+['"]?\);?\s*$/gmi, '').replace(/\bCabin\b/g, 'Arial');
		const relative = path.join('assets', 'css', name);
		fs.writeFileSync(path.join(stageRoot, relative), css, 'utf8');
		stats.files.push({ path: relative.split(path.sep).join('/'), sourceBytes: fs.statSync(source).size, stagedBytes: Buffer.byteLength(css), pngBytesSaved: 0, malformedPng: false });
		stats.sourceBytes += fs.statSync(source).size; stats.stagedBytes += Buffer.byteLength(css);
		for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
			const value = match[1].trim();
			if (!value.startsWith('/assets/') || !imageUrl(value)) continue;
			const resolved = resolveImage(value, context);
			if (resolved && resolved.source) context.resolvedAssets.set(resolved.key, resolved);
		}
	}
}

function copyAssets(context, stats) {
	for (const item of context.resolvedAssets.values()) {
		const relative = item.relative.split(path.sep).join('/');
		if (!stats.files.some(file => file.path === relative)) copyAsset(item.source, relative, context.stageRoot, stats);
	}
}

function copyVendor(repoRoot, stageRoot, stats) {
	for (const [sourceRelative, destination] of VENDOR) {
		const source = path.join(repoRoot, sourceRelative);
		if (!fs.existsSync(source)) throw new Error('Missing browser dependency: ' + source);
		copyAsset(source, destination, stageRoot, stats, false);
	}
	const sourceDir = path.join(repoRoot, 'node_modules/@fortawesome/fontawesome-free/webfonts');
	if (!fs.existsSync(sourceDir)) throw new Error('Missing Font Awesome webfonts: ' + sourceDir);
	const targetDir = path.join(stageRoot, 'assets/desktop-vendor/fontawesome/webfonts');
	fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: false });
	for (const name of fs.readdirSync(sourceDir)) {
		const source = path.join(sourceDir, name);
		if (!fs.statSync(source).isFile()) continue;
		const size = fs.statSync(source).size;
		stats.files.push({ path: 'assets/desktop-vendor/fontawesome/webfonts/' + name, sourceBytes: size, stagedBytes: size, pngBytesSaved: 0, malformedPng: false });
		stats.sourceBytes += size; stats.stagedBytes += size;
	}
}

function copyPolicies(repoRoot, stageRoot, stats) {
	const sourceDir = path.join(repoRoot, 'training-data', 'policies');
	if (!fs.existsSync(sourceDir)) throw new Error('Seed policies are missing: ' + sourceDir);
	const files = fs.readdirSync(sourceDir).filter(name => /^n-\d+\.json$/.test(name)).sort();
	if (files.length !== 26) throw new Error('Expected 26 seed policies, found ' + files.length);
	const targetDir = path.join(stageRoot, 'training-data', 'policies');
	fs.mkdirSync(targetDir, { recursive: true }); stats.policyFileCount = files.length; stats.policyBytes = 0;
	for (const name of files) {
		const target = path.join(targetDir, name); fs.copyFileSync(path.join(sourceDir, name), target); stats.policyBytes += fs.statSync(target).size;
	}
}

function assertNoAudio(stageRoot, game) {
	const found = [];
	function files(dir, relative) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const name = path.join(relative, entry.name); const full = path.join(dir, entry.name);
			if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link in stage: ' + name);
			if (entry.isDirectory()) files(full, name); else if (AUDIO.has(path.extname(entry.name).toLowerCase())) found.push(name);
		}
	}
	files(stageRoot, '');
	if (found.length) throw new Error('Audio files reached stage: ' + found.join(', '));
	function scan(value, pointer) {
		if (Array.isArray(value)) return value.forEach((child, index) => scan(child, pointer + '[' + index + ']'));
		if (!value || typeof value !== 'object') return;
		for (const [key, child] of Object.entries(value)) {
			if (/^(sound|sounds|music|audio|audios)$/i.test(key)) throw new Error('Audio field remains: ' + pointer + '.' + key);
			if (typeof child === 'string' && audioRef(child)) throw new Error('Audio reference remains: ' + pointer + '.' + key);
			scan(child, pointer ? pointer + '.' + key : key);
		}
	}
	scan(game, '');
}

function prepareDesktopPackage(options = {}) {
	const repoRoot = path.resolve(options.repoRoot || path.resolve(__dirname, '..'));
	const expected = path.resolve(repoRoot, 'build', 'desktop-resources');
	const stageRoot = path.resolve(options.stagingRoot || expected);
	if (stageRoot !== expected) throw new Error('Refusing staging path outside build/desktop-resources: ' + stageRoot);
	const buildRoot = path.dirname(expected);
	if (fs.existsSync(buildRoot) && fs.lstatSync(buildRoot).isSymbolicLink()) throw new Error('Refusing symlink staging parent: ' + buildRoot);
	if (fs.existsSync(stageRoot)) {
		if (fs.lstatSync(stageRoot).isSymbolicLink() || !inside(buildRoot, stageRoot)) throw new Error('Refusing to clear unsafe stage path: ' + stageRoot);
		fs.rmSync(stageRoot, { recursive: true, force: true });
	}
	fs.mkdirSync(stageRoot, { recursive: true });
	const stats = { files: [], sourceBytes: 0, stagedBytes: 0, pngBytesSaved: 0, missingVisuals: [], fallbackUnitCount: 0 };
	copyRuntime(repoRoot, stageRoot);
	transformSources(stageRoot);
	const sourceManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/assets/manifest.json'), 'utf8'));
	const context = {
		repoRoot, stageRoot, stats, manifestIndex: makeManifestIndex(sourceManifest, repoRoot),
		resolvedAssets: new Map(), missingAssets: new Map()
	};
	const sourceGame = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/game.json'), 'utf8'));
	const game = rewriteGameAssets(removeAudioData(sourceGame), context, stats);
	for (const relative of ['assets/images/favicon.png', 'assets/fonts/arcade.ttf', 'assets/fonts/verdana_12pt.png']) {
		const source = path.join(repoRoot, relative);
		if (!fs.existsSync(source)) throw new Error('Missing required UI file: ' + source);
		if (relative.endsWith('.png') && !validImage(fs.readFileSync(source), '.png')) throw new Error('Invalid UI image: ' + source);
		context.resolvedAssets.set('fixed:' + relative, { source, relative, key: 'fixed:' + relative });
	}
	copyCss(repoRoot, stageRoot, context, stats);
	copyAssets(context, stats);
	createFallbackAssets(stageRoot, context.missingUnits, stats);
	copyVendor(repoRoot, stageRoot, stats);
	copyPolicies(repoRoot, stageRoot, stats);

	const gamePath = path.join(stageRoot, 'src/game.json');
	const gameText = JSON.stringify(game);
	fs.writeFileSync(gamePath, gameText, 'utf8');
	fs.writeFileSync(gamePath + '.gz', zlib.gzipSync(gameText, { level: 9 }));
	assertNoAudio(stageRoot, game);

	const visualFiles = stats.files.filter(file => file.path.startsWith('assets/') && !file.path.includes('/desktop-vendor/'));
	const manifest = {
		generatedAt: new Date().toISOString(), mode: 'offline-desktop', audioFilesIncluded: 0,
		sourceVisualFileCount: visualFiles.filter(file => !file.generated).length,
		stagedVisualFileCount: visualFiles.length,
		sourceVisualBytes: visualFiles.reduce((sum, file) => sum + file.sourceBytes, 0),
		stagedVisualBytes: visualFiles.reduce((sum, file) => sum + file.stagedBytes, 0),
		pngBytesSaved: visualFiles.reduce((sum, file) => sum + file.pngBytesSaved, 0),
		fallbackUnitCount: context.missingUnits.size,
		missingSourceVisuals: stats.missingVisuals,
		files: visualFiles.map(file => ({ path: file.path, sourceBytes: file.sourceBytes, stagedBytes: file.stagedBytes, pngBytesSaved: file.pngBytesSaved, malformedPng: file.malformedPng, generated: !!file.generated }))
	};
	fs.writeFileSync(path.join(stageRoot, 'assets/desktop-asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
	stats.visualFileCount = visualFiles.length;
	stats.missingUnitCount = context.missingUnits.size;
	return stats;
}

if (require.main === module) {
	try {
		const result = prepareDesktopPackage();
		const visuals = result.files.filter(file => file.path.startsWith('assets/') && !file.path.includes('/desktop-vendor/'));
		console.log(JSON.stringify({
			stageRoot: path.resolve(__dirname, '..', 'build', 'desktop-resources'),
			visualFileCount: result.visualFileCount,
			sourceVisualBytes: visuals.reduce((sum, file) => sum + file.sourceBytes, 0),
			stagedVisualBytes: visuals.reduce((sum, file) => sum + file.stagedBytes, 0),
			pngBytesSaved: visuals.reduce((sum, file) => sum + file.pngBytesSaved, 0),
			policyFileCount: result.policyFileCount,
			policyBytes: result.policyBytes,
			fallbackUnitCount: result.missingUnitCount,
			missingSourceVisualCount: result.missingVisuals.length
		}, null, 2));
	} catch (error) {
		console.error(error.stack || error.message);
		process.exitCode = 1;
	}
}

module.exports = { prepareDesktopPackage, optimizePng, crc32 };
