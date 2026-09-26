var ScriptComponent = IgeEntity.extend({
	classId: 'ScriptComponent',
	componentId: 'script',

	init: function () {
		var self = this;

		// self.logStr = "";
		self.entryCount = 0;
		self.showLog = false;
		self.errorLogs = {};
		self.currentScript = undefined;
		self.currentActionName = '';
		self.scriptCache = {};
		self.scriptTime = {};
		self.scriptRuns = {};
		self.last50Actions = [];

		ScriptComponent.prototype.log('initializing Script Component');
	},

	runScript: function (scriptId, localVariables, scriptEntity) {
		// console.log("running script", scriptId)
		var timings = false;
		if (timings) var started = new Date();
		var self = this;

		var previousScriptId = self.currentScriptId;
		var previousEntity = self.currentScriptEntity;
		self.currentScriptId = scriptId;
		self.currentScriptEntity = scriptEntity;
		try {
			var actions = self.getScriptActions(scriptId, timings, scriptEntity);
			if (actions) return ige.action.run(actions, localVariables || {});
			self.errorLog('script not found: ' + scriptId);
		} finally {
			self.currentScriptId = previousScriptId;
			self.currentScriptEntity = previousEntity;
		}

		if (timings) {
			var now = new Date();
			var elapsed = now - started;
			self.scriptRuns[scriptId] = self.scriptRuns[scriptId] || 0;
			self.scriptRuns[scriptId]++;
			self.scriptTime[scriptId] = self.scriptTime[scriptId] || 0;
			if (self.scriptRuns[scriptId] > 1) {
				self.scriptTime[scriptId] += elapsed;
				var avg = self.scriptTime[scriptId] / (self.scriptRuns[scriptId] - 1);
				if (self.scriptRuns[scriptId] % 100 == 0) {
					console.log(`runScript: ${scriptId} [${avg} ms avg in ${self.scriptRuns[scriptId]}x]`);
				}
			}
		}
	},

	getEntityScripts: function (entity) {
		return (entity && entity._stats && entity._stats.scripts) || {};
	},

	// Entity script IDs are only unique inside their owning type.
	getScriptActions: function (scriptId, timings, scriptEntity) {
		var self = this;
		if (scriptEntity) {
			var entityScript = self.getEntityScripts(scriptEntity)[scriptId];
			return entityScript && entityScript.actions;
		}
		if (self.scriptCache[scriptId] && (typeof mode === 'undefined' || (typeof mode === 'string' && mode != 'sandbox'))) {
			return self.scriptCache[scriptId];
		} else {
			var script = (ige.game && ige.game.data && ige.game.data.scripts && ige.game.data.scripts[scriptId]);
			if (!script || !script.actions) return null;
			if (script) {
				if (timings) {
					var started = new Date();
					for (var i = 0; i < 1000; i++) {
						self.scriptCache[scriptId] = JSON.parse(JSON.stringify(script.actions));
					}
					var now = new Date();
					var elapsed = (now - started) / 1000;
					console.log(`parse time: ${elapsed} ms ${script.name}`);
					console.log('*************************************');
					console.log(script.actions);
				} else {
					self.scriptCache[scriptId] = JSON.parse(JSON.stringify(script.actions));
				}
				return self.scriptCache[scriptId];
			}
		}
		return null;
	},

	triggerEntity: function (entity, eventName, triggeredBy) {
		if (!ige.isServer || !entity || entity._alive === false) return 0;
		var scripts = this.getEntityScripts(entity);
		var count = 0;
		var context = { thisEntity: entity, triggeredBy: Object.assign({}, triggeredBy) };
		for (var id in scripts) {
			var script = scripts[id];
			if (!script || script.disabled || !script.actions || !(script.triggers || []).some(function (t) { return t.type === eventName; })) continue;
			if (ige.condition.run(script.conditions, context)) {
				this.runScript(id, context, entity);
				count++;
			}
		}
		return count;
	},

	entityCreated: function (entity) {
		if (!ige.isServer || !entity || entity._scriptCreated) return;
		entity._scriptCreated = true;
		var by = {};
		by[entity._category + 'Id'] = entity.id();
		if (entity._category === 'item') by.unitId = entity._stats.ownerUnitId;
		this.triggerEntity(entity, 'entityCreated', by);
	},

	scriptLog: function (str, tabCount) {
		if (this.entryCount > 50000)
			return;

		this.entryCount++;

		tabs = '';
		for (i = 0; i < tabCount; i++) {
			tabs += '    ';
		}

		// if (ige.server.isScriptLogOn)
		// console.log(tabs+str)

		// this.logStr = this.logStr  + tabs + str

		// if (this.entryCount > 50000)
		// {

		// 	var filename = "logs/"+ige.server.serverId+"script.log"

		// 	fs.writeFile(filename, this.logStr, function(err) {
		// 	    if(err) {
		// 	        return ScriptComponent.prototype.log(err);
		// 	    }
		// 	});

		// 	ScriptComponent.prototype.log("file saved: ", filename)
		// 	this.logStr = ""
		// 	// this.entryCount = 0
		// }
	},
	recordLast50Action: function (action) {
		var self = this;

		if (self.last50Actions.length > 50) {
			self.last50Actions.shift();
		}

		var scriptName = '[scriptName undefined]';
		if (ige.game.data.scripts[this.currentScriptId]) {
			scriptName = ige.game.data.scripts[this.currentScriptId].name;
		}

		var record = `script '${scriptName}' in Action '${action}'`;
		self.last50Actions.push(record);
	},
	errorLog: function (message) {
		var script = this.currentScriptEntity ? this.getEntityScripts(this.currentScriptEntity)[this.currentScriptId] : ige.game.data.scripts[this.currentScriptId];
		var log = `Script error '${(script) ? script.name : ''}' in Action '${this.currentActionName}' : ${message}`;
		this.errorLogs[this.currentActionName] = log;
		ige.devLog('script errorLog', log, message);
		ScriptComponent.prototype.log(log);
		return log;
	}

});

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') { module.exports = ScriptComponent; }
