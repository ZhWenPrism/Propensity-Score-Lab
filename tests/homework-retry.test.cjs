const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
test('an online failure keeps homework editable and enables retry',async()=>{
 const elements=new Map();function el(){return {value:'Synthetic Student',textContent:'',disabled:false,addEventListener(){},scrollIntoView(){}};}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id);}};
 const state={agency:'fda',decisions:{},hw:{name:'',answers:{q1:{layers:['evidence'],reason:'a complete reason'}}}};
 const context={document,state,$:id=>document.getElementById(id),save(){},renderHomework(){},confirm:()=>true,
   HOMEWORK:[{id:'q1'}],NDD_ANALYSES:[],DD_ANALYSES:[],fetch:async()=>({ok:false}),Date};
 const source=fs.readFileSync(path.join(__dirname,'../roxadustat/homework.js'),'utf8');
 const view=vm.runInNewContext(source+'\napiOnline=true;({submitHomework,hw})',context);
 await view.submitHomework();
 assert.equal(view.hw().submitted,false);
 assert.equal(document.getElementById('hw-submit').disabled,false);
 assert.equal(view.hw().submittedAt,null);
 assert.match(document.getElementById('hw-msg').textContent,/重试/);
});
