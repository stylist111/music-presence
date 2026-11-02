const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('reads lower player, time and pause from DOM',()=>{
 let poll, sent;
 const nodes={
 '.playbackSoundBadge__titleLink':{getAttribute:()=> 'Мой трек',href:'https://soundcloud.com/artist/song'},
 '.playbackSoundBadge__lightLink':{getAttribute:()=> 'Исполнитель'},
 '.playControl.playing':{},
 '.playbackTimeline__timePassed':{querySelector:()=>({textContent:'1:02'})},
 '.playbackTimeline__duration':{querySelector:()=>({textContent:'3:11'})}
 };
 vm.runInNewContext(fs.readFileSync('preload.js','utf8'),{require:()=>({ipcRenderer:{send:(_event,data)=>sent=data}}),location:{origin:'https://soundcloud.com'},document:{querySelector:s=>nodes[s]},setInterval:fn=>poll=fn});
 poll();assert.equal(sent.title,'Мой трек');assert.equal(sent.position,62);assert.equal(sent.duration,191);assert.equal(sent.playing,true);
 delete nodes['.playControl.playing'];poll();assert.equal(sent.playing,false);
});
