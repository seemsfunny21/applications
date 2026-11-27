'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const gameRoutes={
 sudokufunny:'sudokufunny',reversifunny:'reversifunny',
 minesweeperfunny:'minesweeperfunny',solitairefunny:'solitairefunny',
 chessfunny:'chessfunny',tavlifunny:'tavlifunny',
 tichufunny:'tichufunny',tichufunnyonline:'tichufunnyonline',
 quizfunny:'quizfunny',monopolyfunny:'monopolyfunny',
 battleship:'battleship',pyramidsolitaire:'pyramid-solitaire',
 blackjack:'blackjack',mahjong:'mahjong',flowconnect:'flow-connect',watersort:'water-sort',
 puzzle15:'puzzle-15',fallingblocks:'falling-blocks',
 brickbreaker:'brick-breaker',spaceinvaders:'space-invaders',
 mazechase:'maze-chase',frogger:'frogger',wordsearch:'word-search',
 hangman:'hangman',memorymatch:'memory-match'
};
for(const [route,folder] of Object.entries(gameRoutes)){
 const match=html.match(new RegExp(route+":\\{name:'[^']+',url:'([^']+)'"));
 assert.ok(match,'Launcher contains '+route);
 const url=new URL(match[1]);
 assert.equal(url.origin,'https://seemsfunny21.github.io','Game origin remains shared');
 assert.equal(url.pathname,'/games/'+folder+'/','Only central Games hosts '+route);
}
assert.equal(Object.keys(gameRoutes).length,25);
for(const folder of ['chessfunny','tavlifunny','solitairefunny','minesweeperfunny','tichufunny','tichufunnyonline'])
 assert.ok(!html.includes("url:'./"+folder+"/"),'No old local game reference '+folder);
assert.ok(!/willtheycome|will-they-come/.test(html),'No duplicate arrival game in launcher');
assert.equal((html.match(/data-game="/g)||[]).length,25,'25 game choices');
assert.equal((html.match(/data-app="/g)||[]).length,11,'Eleven home application tiles');
assert.match(html,/id="tab-predictions"[^>]*data-app="predictions"/);
assert.match(html,/predictions:\{name:'Προβλέψεις',url:'https:\/\/seemsfunny21\.github\.io\/predictions\/'\}/);
assert.ok(!/data-game="predictions"/.test(html),'Predictions is not a duplicate game');
console.log('PASS standalone Predictions tile');
console.log('PASS 25 canonical Games URLs in Applications, with no legacy local game references');
assert.match(html,/class="app-grid"/);
assert.match(html,/repeat\(3,minmax\(0,1fr\)\)/);
assert.match(html,/let current='home'/);
assert.match(html,/id="homeBack"/);
assert.match(html,/addEventListener\('popstate'/);

assert.match(html,/id="tab-apothiki"[^>]*data-app="apothiki"/);
assert.match(html,/apothiki:\{name:"Αποθήκη",url:"https:\/\/seemsfunny21\.github\.io\/Apothiki\/"\}/);
assert.match(html,/id="editAppOrder"/);
assert.match(html,/applications:tile-order:v1/);
assert.match(html,/function moveTile\(/);
assert.match(html,/pointerup/);
assert.match(html,/function persistOrder\(/);
console.log('PASS warehouse tile and personal order controls');

for(const [id,name] of [['adeies','Άδειες'],['staff','Προσωπικό']]){
 assert.ok(html.includes('id="tab-'+id+'" data-app="'+id+'"'),'Standalone '+id+' tile');
 assert.ok(html.includes(id+':{name:"'+name+'",url:"https://seemsfunny21.github.io/'+id+'/"}'),'Correct '+id+' URL');
}
console.log('PASS standalone leave and staff tiles');
