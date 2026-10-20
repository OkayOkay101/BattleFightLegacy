// Documentation-only inventory. Reads local evidence; never builds or changes runtime data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const snapshotDate = process.env.BATTLEFIGHT_DOCUMENTATION_DATE || new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate))throw new Error('Documentation date must be YYYY-MM-DD');
const out = path.join(__dirname, 'licenses');
const posix = p => p.replaceAll('\\', '/');
const relative = p => posix(path.relative(root, p));
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const walk = p => !fs.existsSync(p) ? [] : fs.readdirSync(p, {withFileTypes:true}).flatMap(e => {
  const f = path.join(p,e.name); return e.isSymbolicLink() ? [] : e.isDirectory() ? walk(f) : [f];
});
const write = (name, data) => { const p=path.join(out,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data); };
const saveJson = (name, data) => write(name,JSON.stringify(data,null,2)+'\n');
const textNames = /^(licen[cs]es?|copying|notice|copyright|third[-_]party[-_]notices)([._-].*)?$/i;
const safe = s => s.replace(/[^a-zA-Z0-9._-]/g,'_');
function collect(directory, destination) {
  if(!fs.existsSync(directory))return [];
  const files=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isFile()&&textNames.test(e.name)).map(e=>path.join(directory,e.name));
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^licenses?$/i.test(e.name)))files.push(...walk(path.join(directory,entry.name)));
  return [...new Set(files)].map(source=>{const parts=posix(path.relative(directory,source)).split('/');if(parts.length>1&&/^licenses?$/i.test(parts[0]))parts[0]='licenses';const target=destination+'/'+parts.join('/');write(target,fs.readFileSync(source));return {source:relative(source),copy:target,sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')};});
}
const pkg=json(path.join(root,'package.json')),lock=json(path.join(root,'package-lock.json'));
const prepare=fs.readFileSync(path.join(root,'tools/prepare-desktop-package.js'),'utf8');
const vendor=[...prepare.matchAll(/\['node_modules\/([^']+)', '([^']+)'\]/g)].map(m=>({source:'node_modules/'+m[1],destination:m[2],package:m[1].startsWith('@')?m[1].split('/').slice(0,2).join('/'):m[1].split('/')[0]}));
const packagedAsar=path.join(root,'dist/portable/win-unpacked/resources/app.asar');
let archive=[];if(fs.existsSync(packagedAsar))archive=require('@electron/asar').listPackage(packagedAsar).map(p=>posix(p).replace(/^\//,''));
const upstreamIndex=fs.existsSync(path.join(out,'texts/npm-upstream/index.json'))?json(path.join(out,'texts/npm-upstream/index.json')):[];
const packages=[];
for(const [location,item] of Object.entries(lock.packages||{})) {
  if(!location.startsWith('node_modules/'))continue;
  const directory=path.join(root,location),manifest=path.join(directory,'package.json');
  const installed=fs.existsSync(manifest)?json(manifest):null;
  const name=installed?.name||location.slice(location.lastIndexOf('node_modules/')+13);
  const evidence=collect(directory,'texts/npm/'+safe(location)+'@'+safe(item.version||'unknown'));
  const metadataLicense=installed?.license||item.license||null;
  const upstream=evidence.length?null:upstreamIndex.find(u=>u.name===name&&u.version===(installed?.version||item.version));
  const declaredLicense=typeof metadataLicense==='string'?metadataLicense:metadataLicense?JSON.stringify(metadataLicense):'License evidence not found';
  packages.push({name,lockedVersion:item.version||null,installedVersion:installed?.version||null,versionMatches:installed?installed.version===item.version:null,location,
    dependencyRole:location==='node_modules/'+name&&pkg.dependencies?.[name]?'direct runtime':location==='node_modules/'+name&&pkg.devDependencies?.[name]?'direct development':item.dev?'transitive development':'transitive runtime',
    declaredLicense,source:installed?.repository?.url||installed?.repository||installed?.homepage||item.resolved||null,
    evidenceStatus:evidence.length?'Local license/notice text found':upstream?'Collected text: '+upstream.status:metadataLicense?'Metadata only; license text not found':'License evidence not found',
    originalTexts:evidence.length?evidence:upstream?[{source:upstream.source,copy:upstream.copy,sha256:upstream.sha256||null,collected:upstream.status}]:[],browserVendor:location==='node_modules/'+name?vendor.filter(v=>v.package===name):[],
    packagedNodeModule:archive.includes(location+'/package.json'),
    packagedNodeModuleEvidence:archive.length?'Inspected built app.asar':'Built app.asar not available; not confirmed'});
}
const python=[];
const site=path.join(root,'training-python/.venv/Lib/site-packages');
if(fs.existsSync(site))for(const entry of fs.readdirSync(site).filter(n=>n.endsWith('.dist-info'))) {
  const directory=path.join(site,entry),file=path.join(directory,'METADATA');if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8'),field=k=>text.match(new RegExp('^'+k+': (.*)$','m'))?.[1]||null;
  const evidence=collect(directory,'texts/python/'+safe(entry));
  python.push({name:field('Name'),version:field('Version'),declaredLicense:field('License-Expression')||field('License')||'License evidence not found',
    classifiers:[...text.matchAll(/^Classifier: (License :: .*)$/gm)].map(m=>m[1]),source:field('Home-page')||field('Project-URL'),
    evidenceStatus:evidence.length?'Local license/notice text found':'License evidence not found or metadata only',originalTexts:evidence,
    distribution:'Training/development only; excluded from standalone'});
}
const manifest=json(path.join(root,'src/assets/manifest.json'));
const urls=new Map();for(const f of manifest.files||[]){const key=posix(f.path||'');if(!urls.has(key))urls.set(key,[]);urls.get(key).push(f.url);}
const stage=path.join(root,'dist/portable/win-unpacked/resources/desktop-data');
const assetExtensions=/\.(png|jpe?g|gif|svg|webp|ttf|otf|woff2?|mp3|wav|ogg|m4a|flac|aac)$/i;
const assets=[...walk(path.join(root,'assets')),...walk(path.join(root,'src/assets'))].filter(f=>assetExtensions.test(f)).map(f=>{
  const p=relative(f),logical=p.startsWith('src/')?p.slice(4):p;const isVendor=logical.startsWith('assets/desktop-vendor/');
  const vend=vendor.find(v=>v.destination===logical)||(/\/fontawesome\/webfonts\//.test(logical)?{package:'@fortawesome/fontawesome-free'}:null);
  return {path:p,bytes:fs.statSync(f).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
    recordedSourceUrls:urls.get(p)||urls.get(logical)||[],vendorPackage:vend?.package||null,
    licenseStatus:vend?'Consult exact vendor package text and file category':isVendor?'License evidence not found; unmapped vendor file':/arcade.ttf$/.test(logical)?'Arcade Alternate by Abdul Muizz bin Haji Kasim (dafont.com); free for personal and commercial use with credit':/verdana_12pt.png$/.test(logical)?'Bitmap of Verdana glyphs from the Isogenic Engine sample assets; loaded but never rendered; provenance unconfirmed':/.(ttf|otf|woff2?)$/i.test(logical)?'License evidence not found':'Public domain or project-owned, per project owner statement (2026-10-20)',
    standaloneAtSameRelativePath:fs.existsSync(path.join(stage,logical)),distributionEvidence:'Same-path inspection only; transformed/renamed references require asset manifest review'};
});
const embedded=[];
for(const file of [...walk(path.join(root,'engine')),...walk(path.join(root,'assets/js'))].filter(f=>/\.(js|css)$/i.test(f))) {
  const head=fs.readFileSync(file,'utf8').slice(0,12000);
  const lines=head.split(/\r?\n/).filter(line=>/copyright|licensed?\s+(under|by)|license\s*[:=]|SPDX-License-Identifier/i.test(line)).map(line=>line.trim().slice(0,350));
  if(lines.length)embedded.push({path:relative(file),headerEvidence:lines.slice(0,12),status:'Header evidence only; inspect complete file and upstream notice before assigning license'});
}
const engineTexts=collect(root,'texts/taro');
const electronTexts=collect(path.join(root,'node_modules/electron/dist'),'texts/electron-runtime');
const unresolved=[
  {component:'Standalone development Node/Python/Tk interpreter installations',status:'Resolved: notices collected in docs/licenses/texts/tool-runtimes',reason:'Python LICENSE.txt and Tcl/Tk license.terms copied from the installed interpreter; Node.js LICENSE fetched for the installed version. None of these tools is bundled in the standalone EXE.'},
  {component:'BattleFight game content and custom changes',status:'Resolved: owned by the project owner',reason:'Project owner stated on 2026-10-20 that they created and own all BattleFight game content, changes and model weights.'},
  {component:'Imported sprite/tileset/UI assets',status:'Resolved: public domain per project owner',reason:'Project owner stated on 2026-10-20 that the sprites, tilesets and UI images are public domain.'},
  {component:'assets/fonts/arcade.ttf',status:'Resolved: Arcade Alternate, free with credit',reason:'Font name table matches Arcade Alternate by Abdul Muizz bin Haji Kasim (https://www.dafont.com/arcade-alternate.font), marked 100% Free; the author allows personal and commercial use with credit. Credited in THIRD-PARTY-NOTICES.md.'},
  {component:'assets/fonts/verdana_12pt.png',status:'Open: provenance unconfirmed; not rendered',reason:'Bitmap of Verdana glyphs inherited from the Isogenic Engine at the initial commit. ClientScore, its only user, is never instantiated, so removing the load is an option.'},
  {component:'Reimu & Marisa (Touhou Project fan content)',status:'Open: check distribution channel',reason:'Touhou fan creator guidelines require a clear fan-work note (added to THIRD-PARTY-NOTICES.md) and limit distribution to platforms where official content is found or that ZUN permits; GitHub is not listed.'},
  {component:'Sukune and Tenkai (CC BY-SA 4.0)',status:'Open: attribution details needed',reason:'Project owner stated they are CC BY-SA 4.0. Creator name and source link are required for attribution in CHARACTER-CREDITS.md.'},
  {component:'Manish and Visor',status:'Resolved: used with permission',reason:'Project owner stated on 2026-10-20 that permission was granted (Manish sprite by BH_YT; Visor by dol_awp).'},
  {component:'Morphling, Orchid Malevolence and Corkmaster skill names',status:'Open: to be renamed',reason:'Names overlap Dota 2 or conflict with the 13+ rating; the project owner will rename them.'},
  {component:'Dual Assassin',status:'Open: awaiting the co-creator permission',reason:'Created with another player; the project owner will ask them.'},
  {component:'Gemini Flash / ChatGPT Sol credit',status:'Development disclosure, not a software license',reason:'Names supplied by project owner; no provider endorsement or ownership claim.'}
];
const snapshot={date:snapshotDate,sourceCommit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  counts:{npm:packages.length,python:python.length,assets:assets.length,embeddedHeaders:embedded.length,
    npmMetadataOnly:packages.filter(p=>p.evidenceStatus.startsWith('Metadata only')).length,npmCollectedUpstream:packages.filter(p=>p.evidenceStatus.startsWith('Collected text')).length,npmMissing:packages.filter(p=>p.evidenceStatus==='License evidence not found').length},
  scope:'Local lockfile, installed package metadata/original notices, asset manifest, vendored headers and existing packaged resources. No legal clearance or inferred asset grant.'};
const manifestOnly=(manifest.files||[]).filter(f=>!fs.existsSync(path.join(root,f.path||''))).map(f=>({path:f.path,recordedSourceUrl:f.url,status:'Manifest record only; source file not present; license evidence not found'}));
const toolRuntimes={node:{version:process.version,role:'Source server/development; desktop embeds its own Node through Electron',noticeStatus:'Collected: texts/tool-runtimes/node-'+process.version+'/LICENSE'},pythonEnvironment:json(path.join(root,'training-python/environment.json')),tkinter:{role:'Python GUI only; excluded from standalone',noticeStatus:'Collected: texts/tool-runtimes/tcl-9.0.4/license.terms and tk-9.0.4/license.terms; Python: texts/tool-runtimes/python-3.14.7/LICENSE.txt'}};
saveJson('inventory.json',{snapshot,toolRuntimes,engineTexts,electronTexts,packages,python,vendor,embedded,unresolved});saveJson('asset-inventory.json',{date:snapshot.date,assets,manifestOnly});
const clean=s=>String(s??'—').replaceAll('|','/').replace(/[\r\n]/g,' ');
for(const lang of ['en','th']) {
  const thai=lang==='th',title=thai?'ทะเบียนส่วนประกอบและหลักฐาน License':'Component and License Evidence Inventory';
  let md=`# ${title}\n\n[${thai?'English':'ภาษาไทย'}](../${thai?'en':'th'}/license-inventory.md) · [${thai?'คู่มือ License':'License guide'}](licenses.md)\n\n`;
  md+=thai?`ข้อมูลวันที่ ${snapshotDate} จากไฟล์ในเครื่อง คอลัมน์ข้อความ license เป็นหลักฐานที่คัดลอกไว้ เมทาดาทาอย่างเดียวไม่ใช่หลักฐานสิทธิ์ครบถ้วน รายการในตารางนี้ไม่เท่ากับรายการที่ฝังใน EXE ทั้งหมด\n\n`:`Snapshot: ${snapshotDate}, local evidence. Copied license texts are linked below; metadata alone is not complete permission evidence. This source dependency table is not itself the complete executable bill of materials.\n\n`;
  md+='## npm\n\n| Package | Locked / installed | Role | Declared license | Evidence | Standalone node module |\n|---|---|---|---|---|---|\n';
  for(const p of packages)md+=`| ${clean(p.name)} | ${p.lockedVersion} / ${p.installedVersion||'not installed'} | ${p.dependencyRole} | ${clean(p.declaredLicense)} | ${p.originalTexts.length?p.originalTexts.map(e=>`[${path.basename(e.copy)}](../licenses/${e.copy})`).join(', '):p.evidenceStatus} | ${p.packagedNodeModule?'yes':'not found'} |\n`;
  md+='\n## Python\n\nTraining/development only; not included in standalone. / ใช้ในการฝึกและพัฒนา ไม่รวมใน standalone\n\n| Package | Installed version | Declared license | Original text |\n|---|---|---|---|\n';
  for(const p of python)md+=`| ${p.name} | ${p.version} | ${clean(p.declaredLicense)} | ${p.originalTexts.map(e=>`[${path.basename(e.copy)}](../licenses/${e.copy})`).join(', ')||p.evidenceStatus} |\n`;
  md+='\n## Browser vendor mapping\n\n| Package | Original file | Packaged browser file |\n|---|---|---|\n';for(const v of vendor)md+=`| ${v.package} | ${v.source} | ${v.destination} |\n`;
  md+='\n## Embedded engine/browser header evidence\n\n';for(const e of embedded)md+=`- \`${e.path}\`: ${e.headerEvidence.map(clean).join(' / ')}\n`;
  md+='\n## Complete evidence and asset records\n\n- [inventory.json](../licenses/inventory.json)\n- [asset-inventory.json](../licenses/asset-inventory.json)\n- [Original notices index](../licenses/README.md)\n';
  fs.mkdirSync(path.join(__dirname,lang),{recursive:true});fs.writeFileSync(path.join(__dirname,lang,'license-inventory.md'),md);
}
let index=`# Original License and Notice Texts\n\nOriginal files are copied without translation or edits. / คัดลอกต้นฉบับโดยไม่แปลหรือแก้ไข\n\nSnapshot: ${snapshotDate}. Regenerate using \`node docs/generate-license-inventory.cjs\`; this reads local evidence and writes documentation only. The generator does not build, train, install packages, or grant rights.\n\n[English guide](../en/licenses.md) · [คู่มือภาษาไทย](../th/licenses.md)\n\n## Source and runtime\n\n`;
for(const e of [...engineTexts,...electronTexts])index+=`- [${e.source}](${e.copy})\n`;
index+='\n## Package evidence\n\n';for(const p of [...packages,...python])for(const e of p.originalTexts)index+=`- ${p.name}: [${e.source}](${e.copy})\n`;
write('README.md',index);console.log(JSON.stringify(snapshot.counts));
