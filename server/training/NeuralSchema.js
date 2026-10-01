const crypto = require('node:crypto');
const definitions = require('./neural-schema.json');

function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
	return JSON.stringify(value);
}
const schemas = Object.fromEntries(Object.entries(definitions).map(([version, definition]) => [version,
	Object.freeze({ ...definition, actorDimensions: Object.freeze(definition.actorDimensions),
		criticDimensions: Object.freeze(definition.criticDimensions),
		schemaHash: crypto.createHash('sha256').update(canonical(definition)).digest('hex') })]));
function getSchema(version = 1) {
	const schema = schemas[version];
	if (!schema) throw new Error(`Unsupported neural schema ${version}`);
	return schema;
}
module.exports = { getSchema };
