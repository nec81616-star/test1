/* Reproducible role-economy benchmark using the game's actual graph, navigation,
   movement and traffic signals. Run from any directory with Node.js.
   Reference: 300 active driving seconds, 40 km/h, sunny/clear, main route,
   one car (no ambient congestion), no incidents or quiz money. All 12 spawns.
   This bounds baseline role advantage; it is not a claim of equal outcomes
   under every speed, route, accident sequence or classroom duration. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../risk-engine.js');
const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'teacher-core.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'teacher-v8.js'), 'utf8');
let clock = 0;
const elements = new Map();
function element() {
  return {style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},after(){},before(){},
    querySelector(){return element()},querySelectorAll(){return []},addEventListener(){},dataset:{}};
}
const context = {
  console, RISK_GAME:rules,
  window:{addEventListener(){},location:{href:'http://localhost/'}},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},querySelector(){return element()},querySelectorAll(){return []}},
  Date:class extends Date {static now(){return clock}},
  Math:Object.assign(Object.create(Math),{random:()=>.5}),
  localStorage:{getItem(){return null}},requestAnimationFrame(){},setInterval(){},clearInterval(){},
  setTimeout(){},clearTimeout(){},performance:{now:()=>clock},URL,URLSearchParams,
};
vm.createContext(context);
const initialization = core.lastIndexOf('showMapMarks();init();');
assert.ok(initialization >= 0,'locate browser-only initialization');
vm.runInContext(core.slice(0, initialization), context);
vm.runInContext("const Engine=RISK_GAME;const routeId=x=>x||'main';",context);
const navigationStart = host.indexOf('  edgeDistance = function');
const navigationEnd = host.indexOf('  missionArrival = function');
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart,'locate shared navigation functions');
vm.runInContext(host.slice(navigationStart,navigationEnd),context);
// Persistence is synchronous in this isolated physical benchmark. The same
// arrival gates are evaluated, then the actor advances to the next real goal.
vm.runInContext(`let visitTimes=[];let workSeconds=9;missionArrival=function(a,node){
 if(a.status!=='driving'||!a.stops?.[a.stage]||a.stops[a.stage].node!==node)return false;
 if(a.driveElapsedMs-a.lastVisitDriveMs<Math.max(9,workSeconds)*1000||a.distanceSinceVisit+.01<(a.minVisitDistance??18))return false;
 visitTimes.push(Date.now());a.stage++;a.pauseUntil=Date.now()+1500;a.lastVisitDriveMs=a.driveElapsedMs;a.distanceSinceVisit=0;a.minVisitDistance=18;
 if(a.stage===a.stops.length){a.run++;a.stops=missionPlan(players[a.id],a.run);a.stage=0}
 return true;
};`,context);
function simulate(roleId,spawn) {
  const role = rules.roleFor(roleId);
  clock=0;
  vm.runInContext(`players={p:{ready:true,roleId:${JSON.stringify(roleId)},speed:40,vehicleType:'car',status:'driving',routeChoice:'main'}};
    sim={p:makeActor('p',players.p,${spawn},false)};ambient=[];currentEnvironment={roadKey:'clear',weatherKey:'sunny'};
    workSeconds=${role.workSeconds};visitTimes=[];sim.p.stops=missionPlan(players.p);sim.p.stage=0;sim.p.run=1;sim.p.routeMode='main';sim.p.t=[.18,.46,.74][${spawn}%3];
    sim.p.minVisitDistance=sim.p.to===goalFor(sim.p)?Math.min(18,nodeVec(sim.p.from,sim.p.to).len*(1-sim.p.t)):18;`,context);
  for(let time=0;time<300000;time+=50){clock=time;vm.runInContext('advanceActors(50)',context)}
  return vm.runInContext('visitTimes.length',context);
}
assert.equal(typeof rules.roleFor,'function','role economy API exists');
const results=[];
for(const roleId of ['office','delivery','caregiver','sales','student','public']) {
  const role=rules.roleFor(roleId);
  assert.ok(role.startingWealth>0 && role.stationIncome>0 && role.workSeconds>=9);
  const visits=Array.from({length:12},(_,spawn)=>simulate(roleId,spawn));
  const ends=visits.map(count=>role.startingWealth+count*role.stationIncome);
  results.push({role:roleId,start:role.startingWealth,pay:role.stationIncome,minimumWorkSeconds:role.workSeconds,
    minimumVisits:Math.min(...visits),maximumVisits:Math.max(...visits),minimumWealth:Math.min(...ends),maximumWealth:Math.max(...ends),
    averageWealth:Math.round(ends.reduce((sum,value)=>sum+value,0)/ends.length)});
}
const allEnds=results.flatMap(row=>[row.minimumWealth,row.maximumWealth]);
const min=Math.min(...allEnds),max=Math.max(...allEnds);
assert.ok((max-min)/min<=.10,`five-minute baseline wealth spread ${min}..${max} exceeds 10%`);
const initialGap=rules.roleFor('caregiver').startingWealth-rules.roleFor('delivery').startingWealth;
assert.ok(initialGap>0,'high-start and low-start roles differ');
assert.ok(results.find(row=>row.role==='delivery').averageWealth>rules.roleFor('delivery').startingWealth,'low-start role earns through completed work');
console.table(results);
console.log(`PASS: 72 five-minute driving runs; terminal wealth ${min}..${max} (spread ${((max-min)/min*100).toFixed(2)}%).`);
