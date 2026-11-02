const {test} = require('node:test');
const assert = require('node:assert/strict');
const {frame,Decoder}=require('../rpc');
test('fragmented RPC packets and UTF-8',()=>{
 const d=new Decoder(), packet=frame(1,{title:'Гори твоё фото'});
 assert.deepEqual(d.push(packet.subarray(0,5)),[]);
 assert.deepEqual(d.push(packet.subarray(5,10)),[]);
 assert.deepEqual(d.push(packet.subarray(10)),[[1,{title:'Гори твоё фото'}]]);
});
test('coalesced frames including ping',()=>{assert.deepEqual(new Decoder().push(Buffer.concat([frame(3,{x:1}),frame(1,{evt:'READY'})])),[[3,{x:1}],[1,{evt:'READY'}]]);});
test('oversize frames rejected',()=>{const head=Buffer.alloc(8);head.writeUInt32LE(2000000,4);assert.throws(()=>new Decoder().push(head));});
