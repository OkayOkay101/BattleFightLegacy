// Documentation acceptance checks; no game tests, training or build.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),docs=__dirname;
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const failures=[];
const en=fs.readdirSync(path.join(docs,'en')).filter(x=>x.endsWith('.md')).sort();
const th=fs.readdirSync(path.join(docs,'th')).filter(x=>x.endsWith('.md')).sort();
if(JSON.stringify(en)!==JSON.stringify(th))failures.push('English/Thai page sets differ');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
const original=cp.execFileSync('git',['show','HEAD:README.md'],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
if(!readme.replaceAll('\r\n','\n').endsWith(original))failures.push('Upstream README body changed');
const english='BattleFight was developed with assistance from Gemini Flash and ChatGPT Sol.';
const thai='BattleFight พัฒนาโดยใช้ Gemini Flash และ ChatGPT Sol ช่วยในการพัฒนา';
for(const [file,text] of [['README.md',english],['README.md',thai],['docs/en/credits.md',english],['docs/th/credits.md',thai]])if(!fs.readFileSync(path.join(root,file),'utf8').includes(text))failures.push('Missing AI credit in '+file);
let links=0;
const pages=[...en.map(f=>path.join(docs,'en',f)),...th.map(f=>path.join(docs,'th',f)),path.join(docs,'licenses/README.md')];
for(const file of [...pages,path.join(root,'README.md')]) {
  let text=fs.readFileSync(file,'utf8');if(file.endsWith('README.md')&&path.dirname(file)===root)text=text.split('## Original upstream documentation')[0];
  for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    let target=match[1].replace(/^<|>$/g,'');if(/^(https?:|mailto:|#)/.test(target))continue;
    target=decodeURIComponent(target.split('#')[0]);links++;
    if(!fs.existsSync(path.resolve(path.dirname(file),target)))failures.push('Broken link: '+path.relative(root,file)+' -> '+target);
  }
}
for(const file of en){if(!fs.readFileSync(path.join(docs,'en',file),'utf8').includes('../th/'+file)||!fs.readFileSync(path.join(docs,'th',file),'utf8').includes('../en/'+file))failures.push('Missing language switch '+file);}
const inventory=JSON.parse(fs.readFileSync(path.join(docs,'licenses/inventory.json'),'utf8'));
const texts=[...inventory.engineTexts,...inventory.electronTexts,...inventory.packages.flatMap(x=>x.originalTexts),...inventory.python.flatMap(x=>x.originalTexts)];
for(const record of texts){const bytes=fs.readFileSync(path.join(docs,'licenses',record.copy));if(crypto.createHash('sha256').update(bytes).digest('hex')!==record.sha256)failures.push('Original notice copy changed: '+record.copy);}
const locked=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')).packages).filter(x=>x.startsWith('node_modules/'));
if(locked.length!==inventory.packages.length)failures.push('Incomplete lockfile inventory');
if(inventory.packages.some(p=>p.versionMatches===false))failures.push('Installed/locked package version mismatch');
if(!inventory.electronTexts.some(x=>x.source.endsWith('LICENSES.chromium.html')))failures.push('Missing Chromium notice');
for(const lang of ['en','th']) {
 const text=fs.readFileSync(path.join(docs,lang,'ai-training.md'),'utf8');
 for(const row of ['86 | 17 | 16','149 | 18 | 32','184 | 27 | 32'])if(!text.includes(row))failures.push('Schema table mismatch in '+lang);
 const player=fs.readFileSync(path.join(docs,lang,'player-guide.md'),'utf8');
 for(const formula of ['max(1, deaths)','wins + 0.5 × draws'])if(!player.includes(formula))failures.push('Demo stat formula mismatch in '+lang);
}
console.log(JSON.stringify({languagePairs:en.length,localLinksChecked:links,originalNoticesChecked:texts.length,npmEntries:locked.length,failures},null,2));
if(failures.length)process.exitCode=1;
