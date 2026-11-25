/* Run with Node.js: node tests/run-tests.cjs. Runtime app has no Node dependency. */
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const html=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
const source=html.split('<script>')[1].split('</script>')[0];
new vm.Script(source); // Parse the exact shipped JavaScript.
let writes=0,downloaded=[];
const nodes=new Map();
function element(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',open:false,classList:{toggle(){},add(){},remove(){}},showModal(){this.open=true},close(){this.open=false},click(){},remove(){},append(){},replaceChildren(){},focus(){},select(){},querySelectorAll(){return []}});return nodes.get(id);}
const listeners={};
const sandbox={console,Date,Math,Map,Set,JSON,Number,String,Object,Array,Error,RegExp,crypto:{randomUUID:()=>require('node:crypto').randomUUID()},document:{getElementById:element,querySelectorAll:()=>[],addEventListener:(t,fn)=>listeners[t]=fn,createElement:()=>element('download'),body:{append(){}}},localStorage:{getItem:()=>null,setItem(){writes++}},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){},confirm:()=>true,Blob,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},navigator:{clipboard:{writeText:async()=>{}}}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
let passed=0;
function run(name,test){test();passed++;console.log('PASS '+name);}
function exec(code){return vm.runInContext(code,sandbox);}
run('new install is empty and all six views render',()=>{assert.equal(exec('state.goals.length'),0);for(const view of ['overview','goals','priority','tasks','reviews','settings'])exec('currentView='+JSON.stringify(view)+';render()');});
run('import rejects wrong formats, invalid goals and duplicate goal IDs',()=>{for(const code of ['cleanState({})','cleanState({format:"life-ai-100",version:99,goals:[]})','cleanState({format:"life-ai-100",version:2,goals:[{}]})','cleanState({format:"life-ai-100",version:2,goals:[{id:"x",title:"a"},{id:"x",title:"b"}]})'])assert.throws(()=>exec(code));});
run('cost is inverted and importance weights influence ranking',()=>{assert.equal(exec('score(cleanGoal({title:"a",ratings:{value:5,interest:5,ai:5,cost:1,feasibility:5,month:5}}))'),100);assert.equal(exec('score(cleanGoal({title:"b",ratings:{value:1,interest:1,ai:1,cost:5,feasibility:1,month:1}}))'),20);assert.ok(exec('score(cleanGoal({title:"a",ratings:{cost:1}})) > score(cleanGoal({title:"b",ratings:{cost:5}}))'));});
run('completed and paused goals stay outside the priority list',()=>{exec('state.goals=[cleanGoal({title:"a",stage:"已完成"}),cleanGoal({title:"b",stage:"暂缓"}),cleanGoal({title:"c",stage:"进行中"})]');assert.equal(exec('ranked().length'),1);assert.equal(exec('ranked()[0].title'),'c');});
run('task completion persists and preserves a draft review',()=>{exec('state.goals=[cleanGoal({id:"task-goal",title:"a",tasks:[{id:"t",title:"first",done:false}]})];document.getElementById("detailDialog").open=true;document.getElementById("reviewInput").value="draft";toggleTask("task-goal","t",true)');assert.equal(exec('state.goals[0].tasks[0].done'),true);assert.equal(exec('document.getElementById("reviewInput").value'),'draft');assert.ok(writes>0);});
run('JSON backup round trip preserves tasks, reviews and ratings',()=>{exec('state.goals[0].reviews.push({id:"r",date:now(),content:"reflection"});var round=cleanState(JSON.parse(JSON.stringify(state)))');assert.equal(exec('round.goals[0].tasks[0].done'),true);assert.equal(exec('round.goals[0].reviews[0].content'),'reflection');assert.equal(exec('round.goals[0].ratings.cost'),3);});
run('merge preserves newer local goals and unrelated data',()=>{exec('state.goals=[cleanGoal({id:"same",title:"new",updatedAt:"2026-11-25T00:00:00Z"}),cleanGoal({id:"local",title:"keep"})];pendingImport=cleanState({format:"life-ai-100",version:2,goals:[{id:"same",title:"old",updatedAt:"2026-01-01T00:00:00Z"},{id:"remote",title:"add"}]});mergeImport()');assert.equal(exec('state.goals.length'),3);assert.equal(exec('goalById("same").title'),'new');exec('pendingImport=cleanState({format:"life-ai-100",version:2,goals:[{id:"same",title:"newest",updatedAt:"2027-01-01T00:00:00Z"}]});mergeImport()');assert.equal(exec('goalById("same").title'),'newest');});
run('unsafe imported text is escaped in cards and details',()=>{exec('var hostile=cleanGoal({title:"<img src=x onerror=alert(1)>",description:"<script>alert(1)</"+"script>"})');assert.ok(exec('card(hostile)').includes('&lt;img'));assert.ok(!exec('card(hostile)').includes('<img'));});
run('AI prompt includes completed tasks and latest review only for selected goal',()=>{exec('var pg=cleanGoal({title:"selected",tasks:[{title:"done",done:true}],reviews:[{content:"latest"}]})');const prompt=exec('promptFor(pg)');assert.ok(prompt.includes('[已完成] done'));assert.ok(prompt.includes('latest'));assert.ok(!prompt.includes('newest'));});
run('offline app contains no external runtime resources or requests',()=>{assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html));assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source));assert.ok(html.includes("connect-src 'none'"));});
console.log(passed+' checks passed.');
