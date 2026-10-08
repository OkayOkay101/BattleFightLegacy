'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {catalog}=require('../server/custom-units/CustomUnitStore');
test('Electron decodes all 44 local prototype sprite sheets', {timeout:20000},async()=>{
 const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
 const entries=catalog(game);assert.equal(entries.length,44);
 const temp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'sprite-audit-'));
 const files=entries.map(entry=>{assert.ok(entry.image.startsWith('/assets/'),entry.image);return{name:entry.name,path:path.join(root,entry.image.slice(1))};});
 const result=path.join(dir,'result.json');
 fs.writeFileSync(path.join(dir,'main.js'),`const {app,nativeImage}=require('electron'),fs=require('fs');app.whenReady().then(()=>{const entries=${JSON.stringify(files)};fs.writeFileSync(${JSON.stringify(result)},JSON.stringify(entries.map(entry=>{const image=nativeImage.createFromPath(entry.path);return{name:entry.name,empty:image.isEmpty(),size:image.getSize()};})));app.quit();});`);
 const child=spawn(require('electron'),[path.join(dir,'main.js')],{stdio:'ignore',windowsHide:true,timeout:15000});
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0);const images=JSON.parse(fs.readFileSync(result));assert.equal(images.length,44);assert.ok(images.every(x=>!x.empty&&x.size.width>0&&x.size.height>0),JSON.stringify(images.filter(x=>x.empty)));fs.writeFileSync(path.join(root,'build/custom-sprite-audit.json'),JSON.stringify(images,null,2));}
 finally{child.kill();fs.rmSync(dir,{recursive:true,force:true});}
});
