'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('weapon editor has accessible tabs, fields and equal English/Thai coverage',()=>{
 const messages=require('../src/localization/messages'),template=fs.readFileSync(path.join(__dirname,'../src/templates/custom-units.ejs'),'utf8');
 for(const key of ['weapon.title','weapon.damage','weapon.range','weapon.single','weapon.spread','weapon.burst','weapon.replaceWarning','weapon.capacity'])for(const lang of ['en','th'])assert.ok(messages[lang][key],lang+': '+key);
 assert.ok(template.includes('role="tablist"'));for(const field of ['name','pattern','damage','speed','range','cooldown','pellets','spread','shots','interval'])assert.ok(template.includes('custom-weapon-'+field),field);
 assert.ok(template.includes('/src/custom-units/CustomWeaponEditor.js'));
});
