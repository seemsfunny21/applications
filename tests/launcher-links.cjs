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
console.log('PASS 25 canonical Games URLs in Applications, with no legacy local game references');