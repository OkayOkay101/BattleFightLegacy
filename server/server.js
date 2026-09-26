// var appInsights = require("applicationinsights");
// appInsights.setup("db8b2d10-212b-4e60-8af0-2482871ccf1d").start();
const publicIp = require('public-ip');
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const cluster = require('cluster');
const { RateLimiterMemory } = require('rate-limiter-flexible');
_ = require('lodash');

const config = require('../config');
const Console = console.constructor;
// redirect global console object to log file

function logfile (file) {
	var con = new Console(fs.createWriteStream(file));
	Object.keys(Console.prototype).forEach(function (name) {
		console[name] = function () {
			con[name].apply(con, arguments);
		};
	});
}

module.exports = logfile;

Error.stackTraceLimit = Infinity; // debug console.trace() to infinite lines

global.rollbar = {
	log: function () {
		// do nothing in non prod env
	},
	error: function () {

	},
	configure: function () {
		
	},
};

if (process.env.ENV == 'production') {
	var Rollbar = require('rollbar');
	global.rollbar = new Rollbar({
		accessToken: '326308ea71e041dc87e30fce4eb48d99',
		captureUncaught: true,
		captureUnhandledRejections: true
	});

	process.on('uncaughtException', function (err) {
		global.rollbar.log(err);
		console.log(`server.js uncaughtException: ${err.stack}`);
		process.exit(0);
	});
}

process.on('exit', function () {
	console.log('process exit called.');
	console.trace();
});

var Server = IgeClass.extend({
	classId: 'Server',
	Server: true,

	init: function (options) {
		var self = this;

		self.gameServerPort = process.env.PORT || 2001;
		self.buildNumber = 466;
		self.request = require('request');
		self.status = 'stopped';
		self.totalUnitsCreated = 0;
		self.totalWallsCreated = 0;
		self.totalItemsCreated = 0;
		self.totalPlayersCreated = 0;
		self.totalProjectilesCreated = 0;
		self.retryCount = 0;
		self.maxRetryCount = 3;
		self.postReqTimestamps = []
		self.started_at = new Date();
		self.lastSnapshot = [];

		self.logTriggers = {

		};

		ige.env = process.env.ENV || 'production';
		self.config = config[ige.env];

		if (!self.config) {
			self.config = config.default;
		}

		self.tier = process.env.TIER || 2;
		self.region = process.env.REGION || 'apocalypse';
		self.isScriptLogOn = process.env.SCRIPTLOG == 'on';
		self.gameLoaded = false;
		self.coinUpdate = {};

		self.socketConnectionCount = {
			connected: 0,
			disconnected: 0,
			immediatelyDisconnected: 0
		};

		self.serverStartTime = new Date();// record start time

		self.bandwidthUsage = {
			unit: 0,
			debris: 0,
			item: 0,
			player: 0,
			projectile: 0,
			region: 0,
			sensor: 0
		};

		self.serverStartTime = new Date();// record start time
		global.isDev = ige.env == 'dev' || ige.env == 'local' || ige.env === 'standalone' || ige.env === 'standalone-remote';
		global.myIp = process.env.IP;
		global.beUrl = self.config.BE_URL;

		console.log('environment', ige.env, self.config);
		console.log('isDev =', global.isDev);

		self.internalPingCount = 0;

		ige.debugEnabled(global.isDev);

		var rateLimiterOptions = {
			points: 20, // 6 points
			duration: 60 // Per second
		};
		ige.rateLimiter = new RateLimiterMemory(rateLimiterOptions);

		self.keysToRemoveBeforeSend = [
			'abilities', 'animations', 'bodies', 'body', 'cellSheet',
			'defaultData.rotation', 'defaultData.translate',
			'buffTypes', 'bonus', 'bulletStartPosition', 'canBePurchasedBy', 'carriedBy', 'damage',
			'description', 'handle', 'hits', 'inventoryImage', 'isGun', 'isStackable', 'maxQuantity',
			'texture', 'sound', 'states', 'frames', 'inventorySize', 'particles', 'price', 'skin',
			'variables', 'canBuyItem', 'canBePurchasedBy', 'inventoryImage', 'isPurchasable', 'oldState',
			'raycastCollidesWith', 'effects', 'defaultProjectile', 'currentBody',
			'penetration', 'bulletDistance', 'bulletType', 'ammoSize', 'ammo', 'ammoTotal', 'reloadRate',
			'recoilForce', 'fireRate', 'knockbackForce', 'canBeUsedBy', 'spawnChance', 'consumeBonus',
			'isConsumedImmediately', 'lifeSpan', 'removeWhenEmpty', 'spawnPosition', 'baseSpeed', 'bonusSpeed',
			'flip', 'fadingTextQueue', 'points', 'highscore', 'jointsOn', 'totalTime', 'email', 'isEmailVerified',
			'isUserAdmin', 'isUserMod', 'newHighscore', 'streamedOn', 'controls'
		];

		// for debugging reasons
		global.isServer = ige.isServer;

		if (typeof HttpComponent != 'undefined') {
			ige.addComponent(HttpComponent);
		}
		console.log('cluster.isMaster', cluster.isMaster);
		if (cluster.isMaster) {
			if (process.env.ENV === 'standalone') {
				self.gameId = process.env.npm_config_game;
				self.ip = '127.0.0.1';
				self.startWebServer();
				self.start();
				self.startGame();
			} else if (typeof ClusterServerComponent != 'undefined') {
				ige.addComponent(ClusterServerComponent);
			}
		} else {
			if (typeof ClusterClientComponent != 'undefined') {
				ige.addComponent(ClusterClientComponent); // backend component will retrieve "start" command from BE
			}

			// if production, then get ip first, and then start
			if (['production', 'staging', 'standalone-remote'].includes(ige.env)) {
				console.log('getting IP address');
				publicIp.v4().then(ip => { // get public ip of server
					self.ip = ip;
					self.start();
				});
			} else // use 127.0.0.1 if dev env
			{
				self.ip = '127.0.0.1';
				self.start();
			}
		}

		// periodicaly update user coins to db for inapp purchase
		setInterval(function () {
			if (Object.keys(self.coinUpdate || {}).length > 0) {
				self.postConsumeCoinsForUsers();
			}
		}, 10000);
	},

	// start server
	start: function () {
		var self = this;
		console.log('ip', self.ip);

		if (self.gameLoaded) {
			console.log('Warning: Game already loaded in this server!!');
			return;
		}

		// Add the server-side game methods / event handlers
		this.implement(ServerNetworkEvents);
		ige.addComponent(IgeNetIoComponent);
	},

	loadGameJSON: function (gameUrl) {
		var self = this;
		console.log('loading game JSON');
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				self.retryCount++;

				if (self.retryCount > self.maxRetryCount) {
					return reject(new Error('Could not load game'));
				}

				this.request(`${gameUrl}?num=${self.retryCount}`, (error, response, body) => {
					if (error) {
						console.log('LOADING GAME-JSON ERROR', gameUrl);
						console.log('retry #', self.retryCount);
						console.log('error', error);
						return self.loadGameJSON(gameUrl)
							.then((data) => resolve(data))
							.catch((err) => reject(err));
					}

					if (response.statusCode == 200) {
						return resolve(JSON.parse(body));
					} else {
						console.log('LOADING GAME-JSON ERROR', gameUrl);
						console.log('retry #', self.retryCount);
						console.log('response', response.statusCode, body);
						return self.loadGameJSON(gameUrl)
							.then((data) => resolve(data))
							.catch((err) => reject(err));
					}
				});
			}, self.retryCount * 5000);
		});
	},
	startWebServer: function () {
		const app = express();
		const port = 80;

		app.use(bodyParser.urlencoded({ extended: false }));
		// parse application/json
		app.use(bodyParser.json());

		app.set('view engine', 'ejs');
		app.set('views', path.resolve('src'));
		app.use('/engine', express.static(path.resolve('./engine/')));

		// Frameguard protects the site from clickjacking
		app.use(helmet.frameguard({ action: 'DENY' }));

		const FILES_TO_CACHE = [
			'pixi-legacy.js',
			'stats.js',
			'dat.gui.min.js',
			'msgpack.min.js'
		];
		// Fast loading: serve pre-compressed gzip game.json (280KB instead of 12MB)
		app.get('/src/game.json', (req, res) => {
			const acceptEncoding = req.headers['accept-encoding'] || '';
			const gzPath = path.resolve('./src/game.json.gz');
			if (acceptEncoding.includes('gzip') && fs.existsSync(gzPath)) {
				res.setHeader('Content-Type', 'application/json');
				res.setHeader('Content-Encoding', 'gzip');
				return res.sendFile(gzPath);
			}
			return res.sendFile(path.resolve('./src/game.json'));
		});

		const SECONDS_IN_A_WEEK = 7 * 24 * 60 * 60;
		app.use('/src', express.static(path.resolve('./src/'), {
			setHeaders: (res, path, stat) => {
				let shouldCache = FILES_TO_CACHE.some((filename) => path.endsWith(filename));

				// cache minified file
				shouldCache = shouldCache || path.endsWith('.min.js');

				if (shouldCache) {
					res.set('Cache-Control', `public, max-age=${SECONDS_IN_A_WEEK}`);
				}
			}
		}));

		app.use('/assets', express.static(path.resolve('./assets/'), { cacheControl: 7 * 24 * 60 * 60 * 1000 }));

		// Proxy CDN assets: serve local file first, then fall back to real CDN
		const http = require('http');
		const https = require('https');
		const makeCdnProxy = (cdnHost) => {
			const localDir = path.resolve(`./assets/${cdnHost}`);
			return (req, res, next) => {
				const localFile = path.join(localDir, req.path);
				// try local first
				if (fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
					return res.sendFile(localFile);
				}
				// fallback: proxy from real CDN
				const cdnUrl = `https://${cdnHost}${req.path}`;
				const client = cdnUrl.startsWith('https') ? https : http;
				const proxyReq = client.get(cdnUrl, (proxyRes) => {
					res.writeHead(proxyRes.statusCode, proxyRes.headers);
					proxyRes.pipe(res);
				});
				proxyReq.on('error', () => res.status(404).send('Not found'));
			};
		};
		app.use('/cache.modd.io', makeCdnProxy('cache.modd.io'));
		app.use('/modd.s3.amazonaws.com', makeCdnProxy('modd.s3.amazonaws.com'));

		const trainingCli = require('./training/TrainingCli');
		const { PolicyRegistry } = require('./training/PolicyRegistry');
		const trainingDataDir = path.resolve(__dirname, '../training-data');

		app.get('/api/training/status', async (req, res) => {
			try {
				const currentStatus = await trainingCli.status({ dataDir: trainingDataDir });
				const registry = new PolicyRegistry(trainingDataDir);
				res.json({
					ok: true,
					training: currentStatus,
					registry: registry.status(),
					serverPolicy: (ige.trainingPolicy && ige.trainingPolicy.version) || 'baseline'
				});
			} catch (error) {
				res.status(500).json({ ok: false, error: error.message });
			}
		});

		app.get('/api/training/policies', (req, res) => {
			try {
				const policiesDir = path.join(trainingDataDir, 'policies');
				let list = ['baseline'];
				if (fs.existsSync(policiesDir)) {
					const files = fs.readdirSync(policiesDir)
						.filter(name => /^n-\d+\.json$/.test(name))
						.map(name => name.slice(0, -5))
						.sort().reverse();
					list = [...files, 'baseline'];
				}
				const registry = new PolicyRegistry(trainingDataDir);
				res.json({ ok: true, policies: list, registry: registry.status() });
			} catch (error) {
				res.status(500).json({ ok: false, error: error.message });
			}
		});

		app.post('/api/training/start', async (req, res) => {
			try {
				const workers = req.body && req.body.workers ? Number(req.body.workers) : 2;
				const neural = req.body && req.body.neural === false ? 'off' : 'on';
				const speed = req.body && req.body.speed ? req.body.speed : 'max';
				const result = await trainingCli.start({
					dataDir: trainingDataDir,
					workers,
					neural,
					speed
				});
				res.json({ ok: true, result });
			} catch (error) {
				res.status(400).json({ ok: false, error: error.message });
			}
		});

		app.post('/api/training/stop', async (req, res) => {
			try {
				const result = await trainingCli.stop({ dataDir: trainingDataDir });
				res.json({ ok: true, result });
			} catch (error) {
				res.status(400).json({ ok: false, error: error.message });
			}
		});

		app.post('/api/training/workers', async (req, res) => {
			try {
				const count = Number(req.body?.workers);
				if (!Number.isInteger(count) || count < 1 || count > 8) {
					return res.status(400).json({ ok: false, error: 'workers must be 1..8' });
				}
				const lockFile = path.join(trainingDataDir, 'supervisor.lock.json');
				let lock = null;
				try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch (e) {}
				if (!lock || !lock.runId) {
					return res.status(400).json({ ok: false, error: 'Training not running' });
				}
				const controlFile = path.join(trainingDataDir, 'control.json');
				fs.writeFileSync(controlFile, JSON.stringify({ runId: lock.runId, workers: count, updatedAt: Date.now() }));
				res.json({ ok: true, workers: count });
			} catch (error) {
				res.status(500).json({ ok: false, error: error.message });
			}
		});

		app.post('/api/training/activate', (req, res) => {
			try {
				const version = req.body && req.body.version;
				if (!version) return res.status(400).json({ ok: false, error: 'Version required' });
				const registry = new PolicyRegistry(trainingDataDir);
				registry.activate(version);
				const pol = registry.policy(version);
				if (pol) {
					ige.trainingPolicy = pol;
					if (ige.training) ige.training.policy = pol;
				}
				res.json({ ok: true, registry: registry.status(), active: version });
			} catch (error) {
				res.status(400).json({ ok: false, error: error.message });
			}
		});

		app.post('/api/training/auto', (req, res) => {
			try {
				const enabled = Boolean(req.body && req.body.enabled);
				const registry = new PolicyRegistry(trainingDataDir);
				registry.setAutoUpdate(enabled);
				res.json({ ok: true, registry: registry.status() });
			} catch (error) {
				res.status(400).json({ ok: false, error: error.message });
			}
		});

		// Export matches.jsonl or sync bundle for Kaggle
		app.get('/api/training/sync/export-bundle', (req, res) => {
			try {
				const matchesFile = path.join(trainingDataDir, 'matches.jsonl');
				const regFile = path.join(trainingDataDir, 'registry.json');
				const policiesDir = path.join(trainingDataDir, 'policies');
				
				const policies = {};
				if (fs.existsSync(policiesDir)) {
					for (const file of fs.readdirSync(policiesDir)) {
						if (file.endsWith('.json')) {
							policies[file] = fs.readFileSync(path.join(policiesDir, file), 'utf8');
						}
					}
				}

				let matchesSnippet = '';
				if (fs.existsSync(matchesFile)) {
					matchesSnippet = fs.readFileSync(matchesFile, 'utf8');
				}

				let registryData = null;
				if (fs.existsSync(regFile)) {
					registryData = fs.readFileSync(regFile, 'utf8');
				}

				res.json({
					ok: true,
					source: 'local',
					timestamp: Date.now(),
					registry: registryData,
					policies,
					matchesCount: matchesSnippet.split('\n').filter(Boolean).length,
					matches: matchesSnippet
				});
			} catch (error) {
				res.status(500).json({ ok: false, error: error.message });
			}
		});

		// Import / Merge matches and policies from Kaggle
		app.post('/api/training/sync/import-bundle', (req, res) => {
			try {
				const bundle = req.body;
				if (!bundle || typeof bundle !== 'object') {
					return res.status(400).json({ ok: false, error: 'Invalid bundle payload' });
				}

				let importedPolicies = 0;
				if (bundle.policies && typeof bundle.policies === 'object') {
					const policiesDir = path.join(trainingDataDir, 'policies');
					fs.mkdirSync(policiesDir, { recursive: true });
					for (const [filename, content] of Object.entries(bundle.policies)) {
						if (/^[a-zA-Z0-9_.-]+\.json$/.test(filename)) {
							fs.writeFileSync(path.join(policiesDir, filename), typeof content === 'string' ? content : JSON.stringify(content));
							importedPolicies++;
						}
					}
				}

				let mergedMatches = 0;
				if (bundle.matches && typeof bundle.matches === 'string') {
					const matchesFile = path.join(trainingDataDir, 'matches.jsonl');
					fs.appendFileSync(matchesFile, bundle.matches.endsWith('\n') ? bundle.matches : bundle.matches + '\n');
					mergedMatches = bundle.matches.split('\n').filter(Boolean).length;
				}

				if (bundle.registry) {
					const regFile = path.join(trainingDataDir, 'registry.json');
					const regContent = typeof bundle.registry === 'string' ? bundle.registry : JSON.stringify(bundle.registry);
					fs.writeFileSync(regFile, regContent);
				}

				res.json({
					ok: true,
					importedPolicies,
					mergedMatches,
					message: 'Bundle imported & merged successfully!'
				});
			} catch (error) {
				res.status(500).json({ ok: false, error: error.message });
			}
		});

		if (global.isDev) {
			// needed for source maps
			app.use('/ts', express.static(path.resolve('./ts/')));
		}

		app.get('/', (req, res) => {

			const videoChatEnabled = ige.game.data && ige.game.data.defaultData && ige.game.data.defaultData.enableVideoChat ? ige.game.data.defaultData.enableVideoChat : false;
			const game = {
				_id: global.standaloneGame.defaultData._id,
				title: global.standaloneGame.defaultData.title,
				tier: global.standaloneGame.defaultData.tier,
				gameSlug: global.standaloneGame.defaultData.gameSlug,
				videoChatEnabled: videoChatEnabled
			};

			const options = {
				isAuthenticated: false,
				env: process.env.ENV,
				gameId: process.env.npm_config_game,
				user: {},
				isOpenedFromIframe: false,
				gameSlug: game.gameSlug,
				referAccessDenied: true,
				ads: false,
				showSideBar: false,
				gameDetails: {
					name: game.title,
					tier: game.tier,
					gameSlug: game.gameSlug,
					videoChatEnabled: game.videoChatEnabled
				},
				highScores: null,
				hostedGames: null,
				currentUserScore: null,
				err: undefined,
				selectedServer: null,
				servers: [{
					ip: '127.0.0.1',
					port: 2001,
					playerCount: 0,
					maxPlayers: 32,
					acceptingPlayers: true
				}],
				createdBy: '',
				menudiv: false,
				trainingDemoPolicy: (ige.trainingPolicy && ige.trainingPolicy.version) || process.env.BATTLEFIGHT_DEMO_POLICY || '',
				gameTitle: game.title,
				currentUserPresentInHighscore: false,
				discordLink: null,
				facebookLink: null,
				twitterLink: null,
				youtubeLink: null,
				androidLink: null,
				iosLink: null,
				share: {
					url: ''
				},
				domain: req.get('host'),
				version: Math.floor((Math.random() * 10000000) + 1),
				constants: {
					appName: 'Modd.io   ',
					appUrl: 'http://www.modd.io/',
					noAds: true,
					assetsProvider: ''
				},
				purchasables: null,
				timers: {
					smallChest: 0,
					bigChest: 0
				},
				analyticsUrl: '/'
			};

			return res.render('index.ejs', options);
		});
		app.listen(port, () => console.log(`Express listening on port ${port}!`));
	},

	// run a specific game in this server
	startGame: function (gameJson) {
		console.log('ige.server.startGame()');
		var self = this;

		if (self.gameLoaded) {
			console.log('Warning: Game already loaded in this server!!');
			return;
		}

		this.socket = {};
		var port = process.env.PORT || 2001;

		self.url = `http://${self.ip}:${port}`;

		this.duplicateIpCount = {};
		this.bannedIps = [];

		self.maxPlayers = self.maxPlayers || 32;
		this.maxPlayersAllowed = self.maxPlayers || 32;

		console.log('maxPlayersAllowed', this.maxPlayersAllowed);

		// Define an object to hold references to our player entities
		this.clients = {};

		// Add the networking component
		ige.network.debug(self.isDebugging);
		// Start the network server
		ige.network.start(self.port, function (data) {

			var domain = global.beUrl;

			console.log('connecting to BE:', global.beUrl);

			var promise;

			if (gameJson) {
				promise = Promise.resolve(gameJson);
			} else if (ige.server.gameId) {
				var gameUrl = `${domain}/api/game-client/${ige.server.gameId}`;
				console.log('gameUrl', gameUrl);
				promise = self.loadGameJSON(gameUrl);
			} else {
				promise = new Promise(function (resolve, reject) {
					var game = fs.readFileSync(`${__dirname}/../src/game.json`);
					game = JSON.parse(game);
					game.defaultData = game;
					var data = { data: {} };
					for (let [key, value] of Object.entries(game)) {
						data.data[key] = value;
					}
					for (let [key, value] of Object.entries(game.data)) {
						data.data[key] = value;
					}
					resolve(data);
				});
			}

			promise.then((game) => {
				ige.addComponent(GameComponent);
				self.gameStartedAt = new Date();

				ige.game.data = game.data;
				ige.game.cspEnabled = !!ige.game.data.defaultData.clientSidePredictionEnabled;

				global.standaloneGame = game.data;
				var baseTilesize = 64;

				// I'm assuming that both tilewidth and tileheight have same value
				// tilesize ratio is ratio of base tile size over tilesize of current map
				var tilesizeRatio = baseTilesize / game.data.map.tilewidth;

				var engineTickFrameRate = 15;
				if (game.data.defaultData && !isNaN(game.data.defaultData.frameRate)) {
					engineTickFrameRate = Math.max(15, Math.min(parseInt(game.data.defaultData.frameRate), 60)); // keep fps range between 15 and 60
				}

				ige._physicsTickRate = engineTickFrameRate;

				// /*
				//  * Significant changes below
				//  * Let's test loading PhysicsConfig here
				// */
				// var igePhysicsConfig = require('../engine/PhysicsConfig');
				// igePhysicsConfig.loadSelectPhysics(game.data.defaultData.physicsEngine);
				// igePhysicsConfig.loadPhysicsGameClasses();
				// /*
				//  * Significant changes above
				// */

				// Add physics and setup physics world
				ige.addComponent(PhysicsComponent)
					.physics.sleep(true)
					.physics.tilesizeRatio(tilesizeRatio);

				if (game.data.settings) {
					var gravity = game.data.settings.gravity;
					if (gravity) {
						// console.log('setting gravity', gravity);
						ige.physics.gravity(gravity.x, gravity.y);
					}
				}

				ige.physics.createWorld();
				ige.physics.start();

				// console.log("game data", game)
				// mapComponent needs to be inside IgeStreamComponent, because debris' are created and streaming is enabled which requires IgeStreamComponent
				console.log('initializing components');

				ige.network.on('connect', self._onClientConnect);
				ige.network.on('disconnect', self._onClientDisconnect);

				// Networking has started so start the game engine
				ige.start(function (success) {
					// Check if the engine started successfully
					if (success) {
						console.log('IgeNetIoComponent started successfully');

						self.defineNetworkEvents();
						// console.log("game data", ige.game.data.settings)

						// Add the network stream component
						ige.network.addComponent(IgeStreamComponent)
							.stream.sendInterval(1000 / engineTickFrameRate)
							.stream.start(); // Start the stream

						// Accept incoming network connections
						ige.network.acceptConnections(true);

						ige.addGraph('IgeBaseScene');

						ige.addComponent(MapComponent);
						ige.addComponent(ShopComponent);
						ige.addComponent(IgeChatComponent);
						ige.addComponent(ItemComponent);
						ige.addComponent(TimerComponent);
						ige.addComponent(TriggerComponent);
						ige.addComponent(VariableComponent);
						ige.addComponent(GameTextComponent);
						ige.addComponent(ScriptComponent);
						ige.addComponent(ConditionComponent);
						ige.addComponent(ActionComponent);
						ige.addComponent(AdComponent);
						ige.addComponent(SoundComponent);
						ige.addComponent(RegionManager);

						if (ige.game.data.defaultData.enableVideoChat) {
							ige.addComponent(VideoChatComponent);
						}

						let map = ige.scaleMap(_.cloneDeep(ige.game.data.map));
						ige.map.load(map);

						// if (ige.physics.engine === 'CRASH') {
						// 	ige.physics.addBorders();
						// }

						try {
							var registry = new (require('./training/PolicyRegistry').PolicyRegistry)();
							if (!(ige.training && ige.training.isTrainingMode)) {
								var demo = require('./training/DemoRuntime');
								var requestedPolicy = process.env.BATTLEFIGHT_DEMO_POLICY || 'latest';
								ige.trainingPolicy = demo.resolveDemoPolicy(registry, requestedPolicy);
								demo.installDemo(ige, ige.trainingPolicy);
								console.log('BattleFight active neural exhibition: 3v3, policy ' + ige.trainingPolicy.version);
							} else {
								ige.trainingPolicy = registry.policyForNewMatch();
							}
						} catch (error) {
							if (process.env.BATTLEFIGHT_DEMO_POLICY) throw error;
							console.warn('Training policy unavailable; battle bots will use baseline tactics:', error.message);
						}
						ige.game.start();

						self.gameLoaded = true;

						// send dev logs to developer every second
						var logInterval = setInterval(function () {
							// send only if developer client is connect
							if (ige.isServer && ((self.developerClientId && ige.server.clients[self.developerClientId]) || process.env.ENV == 'standalone')) {
								ige.variable.devLogs.status = ige.server.getStatus();
								ige.network.send('devLogs', ige.variable.devLogs, self.developerClientId);

								if (ige.script.errorLogs != {}) {
									ige.network.send('errorLogs', ige.script.errorLogs, self.developerClientId);
									ige.script.errorLogs = {};
								}
							}
							ige.physicsTickCount = 0;
							ige.unitBehaviourCount = 0;
						}, 1000);

						setInterval(function () {
							var copyCount = Object.assign({}, self.socketConnectionCount);
							self.socketConnectionCount = {
								connected: 0,
								disconnected: 0,
								immediatelyDisconnected: 0
							};

							ige.clusterClient && ige.clusterClient.recordSocketConnections(copyCount);
						}, 900000);
					}
				});
			})
				.catch((err) => {
					console.log('got error while loading game json', err);
					ige.clusterClient && ige.clusterClient.kill('got error while loading game json');
				});
		});
	},

	defineNetworkEvents: function () {
		var self = this;

		console.log('server.js: defineNetworkEvents');
		ige.network.define('joinGame', self._onJoinGameWrapper);
		ige.network.define('gameOver', self._onGameOver);

		ige.network.define('setStreamSendInterval', self._onSetStreamSendInterval);

		ige.network.define('makePlayerSelectUnit', self._onPlayerSelectUnit);
		ige.network.define('playerUnitMoved', self._onPlayerUnitMoved);
		ige.network.define('playerKeyDown', self._onPlayerKeyDown);
		ige.network.define('playerKeyUp', self._onPlayerKeyUp);
		ige.network.define('playerMouseMoved', self._onPlayerMouseMoved);
		ige.network.define('playerCustomInput', self._onPlayerCustomInput);
		ige.network.define('playerAbsoluteAngle', self._onPlayerAbsoluteAngle);
		ige.network.define('playerDialogueSubmit', self._onPlayerDialogueSubmit);

		ige.network.define('buyItem', self._onBuyItem);
		ige.network.define('buyUnit', self._onBuyUnit);
		ige.network.define('buySkin', self._onBuySkin);

		ige.network.define('equipSkin', self._onEquipSkin);
		ige.network.define('unEquipSkin', self._onUnEquipSkin);

		ige.network.define('swapInventory', self._onSwapInventory);

		// bullshit that's necessary for sending data to client
		ige.network.define('makePlayerCameraTrackUnit', self._onSomeBullshit);
		ige.network.define('changePlayerCameraPanSpeed', self._onSomeBullshit);

		ige.network.define('hideUnitFromPlayer', self._onSomeBullshit);
		ige.network.define('showUnitFromPlayer', self._onSomeBullshit);
		ige.network.define('hideUnitNameLabelFromPlayer', self._onSomeBullshit);
		ige.network.define('showUnitNameLabelFromPlayer', self._onSomeBullshit);

		ige.network.define('createPlayer', self._onSomeBullshit);
		ige.network.define('updateUiText', self._onSomeBullshit);
		ige.network.define('updateUiTextForTime', self._onSomeBullshit);
		ige.network.define('alertHighscore', self._onSomeBullshit);
		ige.network.define('addShopItem', self._onSomeBullshit);
		ige.network.define('removeShopItem', self._onSomeBullshit);
		ige.network.define('gameState', self._onSomeBullshit);

		// ige.network.define('updateEntity', self._onSomeBullshit);
		ige.network.define('updateEntityAttribute', self._onSomeBullshit);
		ige.network.define('updateAllEntities', self._onSomeBullshit);
		ige.network.define('teleport', self._onSomeBullshit);
		ige.network.define('itemHold', self._onSomeBullshit);
		ige.network.define('item', self._onSomeBullshit);
		ige.network.define('clientConnect', self._onSomeBullshit);
		ige.network.define('clientDisconnect', self._onSomeBullshit);
		ige.network.define('killStreakMessage', self._onSomeBullshit);
		ige.network.define('insertItem', self._onSomeBullshit);
		ige.network.define('playAd', self._onSomeBullshit);
		ige.network.define('ui', self._onSomeBullshit);
		ige.network.define('updateShopInventory', self._onSomeBullshit);
		ige.network.define('errorLogs', self._onSomeBullshit);
		ige.network.define('devLogs', self._onSomeBullshit);
		ige.network.define('sound', self._onSomeBullshit);
		ige.network.define('particle', self._onSomeBullshit);
		ige.network.define('camera', self._onSomeBullshit);
		ige.network.define('videoChat', self._onSomeBullshit);

		ige.network.define('gameSuggestion', self._onSomeBullshit);
		ige.network.define('minimap', self._onSomeBullshit);

		ige.network.define('createFloatingText', self._onSomeBullshit);

		ige.network.define('openShop', self._onSomeBullshit);
		ige.network.define('openDialogue', self._onSomeBullshit);
		ige.network.define('closeDialogue', self._onSomeBullshit);
		ige.network.define('userJoinedGame', self._onSomeBullshit);

		ige.network.define('kick', self._onKick);
		ige.network.define('ban-user', self._onBanUser);
		ige.network.define('ban-ip', self._onBanIp);
		ige.network.define('ban-chat', self._onBanChat);

		ige.network.define('setOwner', self._setOwner);

		ige.network.define('trade', self._onTrade);
	},

	unpublish: function (msg) {
		console.log('unpublishing...');
		if (ige.clusterClient) {
			ige.clusterClient.unpublish(msg);
		}
		
		process.exit(0);
	},

	saveLastPlayedTime: function (data) {
		console.log('temp', data);
	},

	kill: function (log) {
		if (ige.clusterClient && ige.clusterClient.markedAsKilled) {
			return;
		}

		// send a message to master cluster
		if (ige.env != 'dev' && process && process.send) {
			process.send({ chat: 'kill server called' });
		}
		// ige.clusterClient.disconnect();

		ige.clusterClient && ige.clusterClient.kill(log);
	},

	// get client with _id from BE
	getClientByUserId: function (_id) {
		var self = this;

		for (i in ige.server.clients) {
			if (ige.server.clients[i]._id == _id) {
				return ige.server.clients[i];
			}
		}
	},

	giveCoinToUser: function (player, coin, itemName) {
		if (coin && player._stats && player._stats.userId && (ige.game.data.defaultData.tier == 3 || ige.game.data.defaultData.tier == 4)) {
			
			ige.clusterClient && ige.clusterClient.giveCoinToUser({
				creatorId: ige.game.data.defaultData.owner,
				userId: player._stats.userId,
				coins: coin,
				game: ige.game.data.defaultData._id,
				itemName
			});
		}
	},
	postConsumeCoinsForUsers: function () {
		var self = this;
		ige.clusterClient && ige.clusterClient.postConsumeCoinsForUsers(self.coinUpdate);
	},
	consumeCoinFromUser: function (player, coins, boughtItemId) {
		var self = this;
		if (player && coins && (ige.game.data.defaultData.tier == 3 || ige.game.data.defaultData.tier == 4)) {
			if (ige.game.data.defaultData.owner != player._stats.userId) {
				if (!self.coinUpdate[player._stats.clientId]) {
					self.coinUpdate[player._stats.clientId] = {
						creatorId: ige.game.data.defaultData.owner,
						userId: player._stats.userId,
						coins: coins,
						game: ige.game.data.defaultData._id,
						boughtItems: []
					};
				} else {
					self.coinUpdate[player._stats.clientId].coins += coins;
				}
				if (self.coinUpdate[player._stats.clientId].boughtItems) {
					self.coinUpdate[player._stats.clientId].boughtItems.push({
						itemId: boughtItemId,
						date: new Date(),
						userId: player._stats.userId
					});
				}
			}
		}
	},
	getStatus: function () {
		var self = this;

		var cpuDelta = null;
		if (ige._lastCpuUsage) {
			// console.log('before',ige._lastCpuUsage);
			cpuDelta = process.cpuUsage(ige._lastCpuUsage);
			ige._lastCpuUsage = process.cpuUsage();
		} else {
			ige._lastCpuUsage = cpuDelta = process.cpuUsage();
		}

		if (ige.physics && ige.physics.engine != 'CRASH') {
			// console.log('ige stream',ige.stream);

			var jointCount = 0;
			var jointList = ige.physics._world && ige.physics._world.getJointList();
			while (jointList) {
				jointCount++;
				jointList = jointList.getNext();
			}
			var returnData = {
				clientCount: Object.keys(ige.network._socketById).length,
				entityCount: {
					player: ige.$$('player').filter(function (player) {
						return player._stats.controlledBy == 'human';
					}).length,
					unit: ige.$$('unit').length,
					item: ige.$$('item').length,
					debris: ige.$$('debris').length,
					projectile: ige.$$('projectile').length,
					sensor: ige.$$('sensor').length,
					region: ige.$$('region').length
				},
				bandwidth: self.bandwidthUsage,
				heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
				currentTime: ige._currentTime,
				physics: {
					engine: ige.physics.engine,
					bodyCount: ige.physics._world.m_bodyCount,
					contactCount: ige.physics._world.m_contactCount,
					jointCount: ige.physics._world.m_jointCount,
					stepDuration: ige.physics.avgPhysicsTickDuration.toFixed(2),
					stepsPerSecond: ige._physicsFPS,
					totalBodiesCreated: ige.physics.totalBodiesCreated
				},
				etc: {
					totalPlayersCreated: ige.server.totalPlayersCreated,
					totalUnitsCreated: ige.server.totalUnitsCreated,
					totalItemsCreated: ige.server.totalItemsCreated,
					totalProjectilesCreated: ige.server.totalProjectilesCreated,
					totalWallsCreated: ige.server.totalWallsCreated
				},
				cpu: cpuDelta,
				lastSnapshotLength: JSON.stringify(ige.server.lastSnapshot).length
			};

			self.bandwidthUsage = {
				unit: 0,
				debris: 0,
				item: 0,
				player: 0,
				projectile: 0,
				region: 0,
				sensor: 0
			};

			return returnData;
		}
		//temprorary for testing crash engine
		// else {
		// 	ige.physics.getInfo();
		// 	var returnData = {
		// 		clientCount: Object.keys(ige.network._socketById).length,
		// 		entityCount: {
		// 			player: ige.$$('player').filter(function (player) {
		// 				return player._stats.controlledBy == 'human';
		// 			}).length,
		// 			unit: ige.$$('unit').length,
		// 			item: ige.$$('item').length,
		// 			debris: ige.$$('debris').length,
		// 			projectile: ige.$$('projectile').length,
		// 			sensor: ige.$$('sensor').length,
		// 			region: ige.$$('region').length
		// 		},
		// 		bandwidth: self.bandwidthUsage,
		// 		heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
		// 		currentTime: ige._currentTime,
		// 		physics: {
		// 			engine: ige.physics.engine,
		// 			bodyCount: ige.physics._world.m_bodyCount,
		// 			contactCount: ige.physics._world.m_contactCount,
		// 			jointCount: ige.physics._world.m_jointCount,
		// 			stepDuration: ige.physics.avgPhysicsTickDuration.toFixed(2),
		// 			stepsPerSecond: ige._physicsFPS,
		// 			totalBodiesCreated: ige.physics.totalBodiesCreated
		// 		},
		// 		etc: {
		// 			totalPlayersCreated: ige.server.totalPlayersCreated,
		// 			totalUnitsCreated: ige.server.totalUnitsCreated,
		// 			totalItemsCreated: ige.server.totalItemsCreated,
		// 			totalProjectilesCreated: ige.server.totalProjectilesCreated,
		// 			totalWallsCreated: ige.server.totalWallsCreated
		// 		},
		// 		cpu: cpuDelta,
		// 		lastSnapshotLength: JSON.stringify(ige.server.lastSnapshot).length
		// 	};

		// 	self.bandwidthUsage = {
		// 		unit: 0,
		// 		debris: 0,
		// 		item: 0,
		// 		player: 0,
		// 		projectile: 0,
		// 		region: 0,
		// 		sensor: 0
		// 	};

		// 	return returnData;
		// }
	}
});

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') {
	module.exports = Server;
}
