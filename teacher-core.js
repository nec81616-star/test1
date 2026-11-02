
let db,auth,room='',roomRef=null,heartbeatTimer=null,environmentTimer=null,players={},sim={},ambient=[],running=false,paused=false,lastTs=0,lastSideRender=0,lastMissionAward=0,accidentEligibleAt=0,accidentDeadlineAt=0,collisionDone=false,collisionIds=[],collisionNode='A',collisionAmbientId=null,collisionMeta=null,currentQuestion=null,affectedCount=0,currentEnvironment=null,usedQuestionIds=new Set(),questionSerial=0,accidentsThisRound=0,lastPersonalScan=0,roundSerial=0,environmentChangedAt=0,overspeedPending=new Set(),nextQuestionAt=0;
let starting=false,roomMutationPending=false,watchedRoomRef=null,roomWatchGeneration=0;
const QUESTION_INTERVAL_MS=30000;
const $=id=>document.getElementById(id);
const NODES={
 W1:{x:-7,y:26,boundary:true},A:{x:25,y:26,signal:true},M1:{x:50,y:26},B:{x:75,y:26,signal:true},E1:{x:107,y:26,boundary:true},
 W2:{x:-7,y:74,boundary:true},C:{x:25,y:74,signal:true},M2:{x:50,y:74},D:{x:75,y:74,signal:true},E2:{x:107,y:74,boundary:true},
 N1:{x:25,y:-7,boundary:true},H:{x:25,y:50},S1:{x:25,y:107,boundary:true},N2:{x:75,y:-7,boundary:true},J:{x:75,y:50},S2:{x:75,y:107,boundary:true},I:{x:50,y:50}
};
const EDGES=[['W1','A'],['A','M1'],['M1','B'],['B','E1'],['W2','C'],['C','M2'],['M2','D'],['D','E2'],['N1','A'],['A','H'],['H','C'],['C','S1'],['N2','B'],['B','J'],['J','D'],['D','S2'],['M1','I'],['I','M2'],['H','I'],['I','J']];
const ADJ={};for(const [a,b] of EDGES){(ADJ[a]||(ADJ[a]=[])).push(b);(ADJ[b]||(ADJ[b]=[])).push(a)}
const VISIT_LIBRARY={
 office:[['M1','銀行：交付文件'],['B','合作據點：簽收'],['J','商圈分店：巡查'],['D','外勤窗口：交件']],
 delivery:[['J','商店街：外送站'],['D','商圈：訂單送達'],['B','辦公區：訂單送達'],['M1','銀行旁：預約配送']],
 caregiver:[['A','學校：接送家人'],['B','診所：接送家人'],['C','社區：生活採買'],['D','商圈：家庭事務']],
 sales:[['M1','金融街：客戶會面'],['B','辦公大樓：商務拜訪'],['J','商店街：店家拜訪'],['D','商圈：客戶拜訪']],
 student:[['A','學校：專題採訪'],['C','社區：問卷調查'],['M2','圖書館：資料蒐集'],['J','商店街：店家訪查']],
 public:[['H','住宅區：第一戶家訪'],['C','社區：第二戶家訪'],['J','住宅商圈：第三戶家訪'],['D','社區外圍：第四戶家訪']]
};
const MAP_MARKS=[{x:17,y:18,label:'🏫 校園'},{x:83,y:18,label:'🏥 醫院'},{x:17,y:82,label:'🏠 社區'},{x:84,y:82,label:'🛒 商圈'},{x:51,y:18,label:'🏦 金融街'},{x:51,y:83,label:'📚 圖書館'},{x:16,y:52,label:'🏡 住宅區'},{x:84,y:52,label:'🏪 商店街'}];
const TOTAL_QUESTIONS_PER_BRIEF=3;const RUN_BUDGET_SECONDS={urgent:105,medium:120,leisure:140};
function safeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function missionPlan(p,run=1){let arr=VISIT_LIBRARY[p.roleId]||VISIT_LIBRARY.office,count=3,shift=(run-1)%arr.length;
 return Array.from({length:count},(_,i)=>{let v=arr[(shift+i)%arr.length];return{node:v[0],label:v[1]}})}
function goalFor(a){return a.stops?.[a.stage]?.node||null}
function alleyEdge(a,b){return a==='I'||b==='I'}
function edgeDistance(a,b,mode){let len=nodeVec(a,b).len;if(!alleyEdge(a,b))return len;return len*(mode==='shortcut'?.62:3.3)}
function remainingDistance(start,goal,mode){if(start===goal)return 0;let dist={[start]:0},seen=new Set(),q=[start];while(q.length){q.sort((a,b)=>dist[a]-dist[b]);let at=q.shift();if(seen.has(at))continue;if(at===goal)return dist[at];seen.add(at);for(const nx of ADJ[at]||[]){let newD=dist[at]+edgeDistance(at,nx,mode);if(newD<(dist[nx]??Infinity)){dist[nx]=newD;q.push(nx)}}}return Infinity}
function nextMissionStep(actor,node,prev){let goal=goalFor(actor);if(!goal)return nextNode(actor,node,prev);let mode='main';let opts=ADJ[node]||[];let ranked=opts.map(n=>({node:n,score:edgeDistance(node,n,mode)+remainingDistance(n,goal,mode)+(n===prev?4:0)}));ranked.sort((a,b)=>a.score-b.score);return ranked[0]?.node||nextNode(actor,node,prev)}
function showMapMarks(){$('destinationPins').innerHTML=MAP_MARKS.map(x=>`<div class="mapPin" style="left:${x.x}%;top:${x.y}%">${x.label}</div>`).join('')}
function announce(text){if($('gameTicker'))$('gameTicker').textContent=text}
const MIN_VISIT_DRIVE_MS=9000;     // Real active driving time, not wall-clock time or number of frames.
const MIN_VISIT_ROAD_DISTANCE=18; // Road-coordinate units moved since the last paid destination.
function missionArrival(a,node){
 // Return false until a physical trip is complete. The car waits at the current target instead of teleporting to the next one.
 if(a.arrivalBusy||!running||paused||a.status!=='driving')return false;
 const p=players[a.id];
 if(!p||p.status!=='driving'||!a.stops?.[a.stage]||a.stops[a.stage].node!==node)return false;
 if(isDangerouslyFast(p)||a.driveElapsedMs-a.lastVisitDriveMs<MIN_VISIT_DRIVE_MS||a.distanceSinceVisit<MIN_VISIT_ROAD_DISTANCE)return false;
 let current=a.stops[a.stage],wasFinal=a.stage===a.stops.length-1,run=a.run||1;
 a.arrivalBusy=true;a.stage++;a.pauseUntil=Date.now()+1500;
 a.lastVisitDriveMs=a.driveElapsedMs;a.distanceSinceVisit=0;
 if(wasFinal){a.run=run+1;a.stops=missionPlan(p,a.run);a.stage=0}
 let updates={missionStops:a.stops,missionIndex:a.stage,missionRound:a.run||run,visitCount:Number(p.visitCount||0)+1,completedRuns:Number(p.completedRuns||0)+(wasFinal?1:0),lastVisitName:current.label,lastVisitAt:firebase.database.ServerValue.TIMESTAMP,currentEvent:wasFinal?`🎉 完成第 ${run} 趟任務！拜訪＋15／整趟＋25`:`📍 完成 ${current.label}，拜訪＋15 分`};
 announce(`📍 ${p.name||'玩家'}完成 ${current.label}${wasFinal?'｜整趟任務達成＋25！':''}`);
 roomRef.child(`players/${a.id}`).update(updates).then(()=>roomRef.child(`players/${a.id}/score`).transaction(s=>Number(s||0)+15+(wasFinal?25:0))).catch(e=>console.warn('拜訪獎勵失敗',e)).finally(()=>{a.arrivalBusy=false});
 return true;
}
function handleAccident(){
 // Ordinary collisions may occur during driving, but do not affect the fixed 30s quiz clock.
 accidentsThisRound++;
 let victims=[...new Set(collisionIds.filter(id=>id!=='__NPC__'))];
 announce(`💥 第 ${accidentsThisRound} 起交通事件｜繼續行車；全班保險題每30秒出現一次`);
 for(const id of victims){
  let actor=sim[id];if(actor)actor.pauseUntil=Date.now()+1200;
  if(roomRef)roomRef.child(`players/${id}/currentEvent`).set('💥 發現交通事故，交通已恢復，分數保留').catch(()=>{});
 }
 startAccidentCycle();
}
function startQuestionClock(){nextQuestionAt=Date.now()+QUESTION_INTERVAL_MS}
function stopQuestionClock(){nextQuestionAt=0}

const MAIN_SIGNALS=new Set(['A','B','C','D']);
const SIGNAL_OFFSET={A:0,B:6000,C:6000,D:0};
const ROAD_STATES=[{key:'clear',name:'暢通',icon:'🟢',offset:8},{key:'congested',name:'壅塞',icon:'🔴',offset:-8}];
const WEATHER_STATES=[{key:'sunny',name:'晴天',icon:'☀️',offset:0},{key:'cloudy',name:'陰天',icon:'☁️',offset:-5},{key:'rainy',name:'雨天',icon:'🌧️',offset:-10}];
function randomEnvironment(){let r=pick(ROAD_STATES),w=pick(WEATHER_STATES);return{roadKey:r.key,roadName:r.name,roadIcon:r.icon,roadOffset:r.offset,weatherKey:w.key,weatherName:w.name,weatherIcon:w.icon,weatherOffset:w.offset}}
function drivingScoreRange(env){
 if(!env)return null;
 let cap=Math.min(env.roadKey==='congested'?30:50,env.weatherKey==='rainy'?35:env.weatherKey==='cloudy'?45:50);
 return {min:Math.max(15,cap-15),max:cap};
}
const OVERSPEED_MARGIN=10;
const OVERSPEED_PENALTY=50;
const OVERSPEED_STOP_MS=4000;
const ENVIRONMENT_ADJUST_MS=3000;
const OVERSPEED_OBSTACLES=[{name:'路燈',icon:'💡'},{name:'電線桿',icon:'⚡'},{name:'中央分隔島',icon:'🚧'}];
function dangerousSpeedLimit(){let r=drivingScoreRange(currentEnvironment);return r?r.max+OVERSPEED_MARGIN:null}
function isDangerouslyFast(p){let limit=dangerousSpeedLimit(),speed=Number(p?.speed);return limit!==null&&Number.isFinite(speed)&&speed>limit}
function checkOverspeedDrivers(){
 if(!running||paused||!roomRef||Date.now()-environmentChangedAt<ENVIRONMENT_ADJUST_MS)return;
 const limit=dangerousSpeedLimit();if(limit===null)return;
 const now=Date.now();
 for(const [id,p] of Object.entries(players)){
  const a=sim[id];if(!a||!p.ready||p.status!=='driving'||a.status!=='driving'||overspeedPending.has(id))continue;
  if(!isDangerouslyFast(p))continue;
  overspeedPending.add(id);
  const obstacle=pick(OVERSPEED_OBSTACLES),event=`💥 超速撞上${obstacle.name}！扣 ${OVERSPEED_PENALTY} 分，停車 4 秒`;
  a.status='overspeed';a.pauseUntil=now+OVERSPEED_STOP_MS;a.crashObstacle=`${obstacle.icon} ${obstacle.name}`;a.speed=limit;
  announce(`💥 ${p.name||'玩家'}時速 ${Number(p.speed)} km/h，撞上${obstacle.name}！扣 ${OVERSPEED_PENALTY} 分`);
  log(`${p.name||'玩家'}超速撞上${obstacle.name}，扣${OVERSPEED_PENALTY}分`,'acc');
  const pref=roomRef.child(`players/${id}`),until=a.pauseUntil;
  // First mark the penalty state so other score mechanics stop immediately.
  pref.update({status:'overspeed',safeStreak:0,currentEvent:event,lastFeedback:event,overspeedUntil:until,lastOverspeedCrashAt:firebase.database.ServerValue.TIMESTAMP}).then(()=>
   // Atomic score subtraction prevents concurrently earned +3/+15/+30 from being overwritten.
   pref.child('score').transaction(cur=>Math.max(0,Number(cur||0)-OVERSPEED_PENALTY))
  ).then(()=>
   // Atomic speed correction prevents stale values from reusing 160 km/h after impact.
   pref.child('speed').transaction(cur=>Math.min(Math.max(0,Number(cur)||0),limit))
  ).catch(e=>{console.error('超速事故同步失敗',e);a.status='driving';a.pauseUntil=0;a.crashObstacle=null}).finally(()=>overspeedPending.delete(id));
 }
}
function resumeOverspeedDrivers(){
 const now=Date.now();
 for(const [id,a] of Object.entries(sim)){
  if(a.status!=='overspeed'||now<(a.pauseUntil||0)||overspeedPending.has(id))continue;
  if(!roomRef)continue;
  overspeedPending.add(id);
  const pref=roomRef.child(`players/${id}`),currentLimit=dangerousSpeedLimit()??50;
  // Weather may have changed during the four-second stop; recheck before releasing controls.
  pref.child('speed').transaction(cur=>Math.min(Math.max(0,Number(cur)||0),currentLimit))
   .then(()=>pref.update({status:'driving',overspeedUntil:null,lastFeedback:null,currentEvent:'🚗 已恢復行車，請遵守目前得分速域'}))
   .then(()=>{a.status='driving';a.pauseUntil=0;a.crashObstacle=null})
   .catch(e=>console.warn('恢復行車失敗',e))
   .finally(()=>overspeedPending.delete(id));
 }
}
function renderEnvironment(){let e=currentEnvironment;if(!e){$('roadDisplay').textContent='尚未開始';$('weatherDisplay').textContent='尚未開始';$('targetDisplay').textContent='—';return}$('roadDisplay').textContent=`${e.roadIcon||''} ${e.roadName||''}`;$('weatherDisplay').textContent=`${e.weatherIcon||''} ${e.weatherName||''}`;let r=drivingScoreRange(e);$('targetDisplay').textContent=`${r.min}～${r.max} km/h`}
async function changeOneEnvironmentVariable(){
 if(!running||!roomRef)return;
 let next={...(currentEnvironment||randomEnvironment())};
 if(Math.random()<.5){
  let pool=ROAD_STATES.filter(x=>x.key!==next.roadKey),r=pick(pool.length?pool:ROAD_STATES);
  next.roadKey=r.key;next.roadName=r.name;next.roadIcon=r.icon;next.roadOffset=r.offset;
 }else{
  let pool=WEATHER_STATES.filter(x=>x.key!==next.weatherKey),w=pick(pool.length?pool:WEATHER_STATES);
  next.weatherKey=w.key;next.weatherName=w.name;next.weatherIcon=w.icon;next.weatherOffset=w.offset;
 }
 currentEnvironment=next;environmentChangedAt=Date.now();renderEnvironment();
 await roomRef.child('environment').set(next)
}
function startEnvironmentCycle(){
 stopEnvironmentCycle();
 environmentTimer=setInterval(()=>{if(running)changeOneEnvironmentVariable()},13000)
}
function stopEnvironmentCycle(){
 if(environmentTimer){clearInterval(environmentTimer);environmentTimer=null}
}

function configOK(){return window.LOCAL_DEMO||window.GAME_FIREBASE_CONFIG&&!String(GAME_FIREBASE_CONFIG.apiKey).includes('PASTE_')}
async function init(){if(!configOK()){$('setupMsg').textContent='請先完成 Firebase 設定';$('createBtn').disabled=true;return}firebase.initializeApp(GAME_FIREBASE_CONFIG);auth=firebase.auth();db=firebase.database();await auth.signInAnonymously()}
function rand(a,b){return a+Math.random()*(b-a)}function pick(a){return a[Math.floor(Math.random()*a.length)]}function log(msg,type=''){ /* 事件紀錄已取消顯示 */ }
function nodeVec(a,b){let A=NODES[a],B=NODES[b],dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy)||1;return{dx,dy,len,ux:dx/len,uy:dy/len}}
function axisFor(a,b){let v=nodeVec(a,b);return Math.abs(v.dx)>Math.abs(v.dy)?'EW':'NS'}
function signalPhase(nodeId,now=Date.now()){let cycle=12000,t=(now+SIGNAL_OFFSET[nodeId])%cycle;if(t<5000)return{NS:'green',EW:'red'};if(t<6000)return{NS:'yellow',EW:'red'};if(t<11000)return{NS:'red',EW:'green'};return{NS:'red',EW:'yellow'}}
function renderSignals(){document.querySelectorAll('.signalGroup').forEach(g=>{let ph=signalPhase(g.dataset.node);for(const side of g.querySelectorAll('.signalSide')){let ax=side.classList.contains('ns')?'NS':'EW';for(const lamp of side.querySelectorAll('.lamp'))lamp.classList.remove('active');let c=(ph[ax]||'red').toLowerCase();let target=c==='green'?side.querySelector('.greenLamp'):c==='yellow'?side.querySelector('.yellowLamp'):side.querySelector('.redLamp');if(target)target.classList.add('active')}})}
function chooseTurn(prev,node,cands){if(cands.length===1)return cands[0];let vin=nodeVec(prev,node),scored=cands.map(n=>{let v=nodeVec(node,n),dot=vin.ux*v.ux+vin.uy*v.uy,cross=vin.ux*v.uy-vin.uy*v.ux;let kind=dot>.65?'straight':cross>0?'right':'left';let w=kind==='straight'?5:kind==='right'?3:2;return{n,w,kind}}),total=scored.reduce((s,x)=>s+x.w,0),r=Math.random()*total;for(const x of scored){r-=x.w;if(r<=0)return x.n}return scored[0].n}
function nextNode(actor,nodeId,prevId){let c=(ADJ[nodeId]||[]).filter(n=>n!==prevId);if(!c.length)c=ADJ[nodeId]||[];return chooseTurn(prevId,nodeId,c)}
function laneOffset(actor,from,to){let v=nodeVec(from,to),alley=(from==='I'||to==='I'||['M1','M2','H','J'].includes(from)&&['M1','M2','H','J'].includes(to));let mag=actor.vehicleType==='moto'?(alley?1.55:2.7):(alley?.8:1.45);return{x:-v.uy*mag,y:v.ux*mag}}
function actorPos(actor){
 if(actor.forcePos)return actor.forcePos;
 let A=NODES[actor.from],B=NODES[actor.to],t=Math.max(0,Math.min(1,Number(actor.t)||0));
 let off=laneOffset(actor,actor.from,actor.to);
 // Smooth the lateral lane shift when entering a new road; keep the sprite at the previous edge's exit point.
 if(actor.entryLaneOffset){let f=Math.max(0,Math.min(1,t/.25));off={x:actor.entryLaneOffset.x*(1-f)+off.x*f,y:actor.entryLaneOffset.y*(1-f)+off.y*f}}
 return{x:A.x+(B.x-A.x)*t+off.x,y:A.y+(B.y-A.y)*t+off.y,rot:Math.atan2(B.y-A.y,B.x-A.x)*180/Math.PI+90};
}
function createCar(id,p,isAmbient=false){let el=document.getElementById('car_'+id);if(el)return el;el=document.createElement('div');el.id='car_'+id;el.className='car '+(p.vehicleType==='moto'?'moto ':'')+(isAmbient?'ambient':'');el.innerHTML='<div class="name"></div><div class="sprite"></div><div class="boom">💥</div><div class="crashObstacle"></div>';el.style.setProperty('--c',p.color||'#3b82f6');$('cars').appendChild(el);return el}
function renderCars(){let now=Date.now();for(const [id,p] of Object.entries(players)){if(!p.ready)continue;let a=sim[id];if(!a)continue;let el=createCar(id,p,false),pos=actorPos(a);el.style.left=pos.x+'%';el.style.top=pos.y+'%';el.style.setProperty('--rot',pos.rot+'deg');el.style.setProperty('--c',p.color||'#3b82f6');el.className='car '+(p.vehicleType==='moto'?'moto ':'')+(a.status==='accident'?'accident ':'')+(a.status==='overspeed'?'overspeed ':'')+(a.hiddenUntil&&now<a.hiddenUntil?'offstage':'');el.querySelector('.name').textContent=p.name||'玩家';el.querySelector('.crashObstacle').textContent=a.crashObstacle||''}
 for(const a of ambient){let el=createCar(a.id,a,true),pos=actorPos(a);el.style.left=pos.x+'%';el.style.top=pos.y+'%';el.style.setProperty('--rot',pos.rot+'deg');el.style.setProperty('--c',a.color);el.className='car '+(a.vehicleType==='moto'?'moto ':'')+'ambient '+(a.status==='accident'?'accident ':'')+(a.hiddenUntil&&now<a.hiddenUntil?'offstage':'')}
}
function makeActor(id,p,index,isAmbient=false){let starts=[['W1','A'],['E1','B'],['N1','A'],['S1','C'],['W2','C'],['E2','D'],['N2','B'],['S2','D'],['A','M1'],['C','M2'],['H','I'],['J','I']];let [from,to]=starts[index%starts.length];return{id,from,to,t:.05+(index%3)*.22,status:'driving',speed:isAmbient?rand(32,64):Math.max(5,Number(p.speed||40)),vehicleType:p.vehicleType||'car',color:p.color||'#b8c2cf',forcePos:null,hiddenUntil:0,boundaryWait:0,isAmbient,entryLaneOffset:null,driveElapsedMs:0,lastVisitDriveMs:0,distanceSinceVisit:0,arrivalBusy:false}}
function setupAmbient(){ambient=[];for(let i=0;i<10;i++){let v=i%4===0?'moto':'car',a=makeActor('amb'+i,{vehicleType:v,color:['#b8c2cf','#f5a623','#7f8cff','#ef7373','#56c596','#d88ce8'][i%6],speed:rand(30,62)},i+3,true);ambient.push(a);createCar(a.id,a,true)}}
function allActors(){let out=[];for(const [id,p] of Object.entries(players)){let a=sim[id];if(a&&p.ready)out.push(a)}return out.concat(ambient)}
function speedUnits(actor){let live=actor.isAmbient?Number(actor.speed||40):Number(players[actor.id]?.speed??actor.speed??40);actor.speed=live;let safePhysicalSpeed=actor.isAmbient?live:Math.min(live,dangerousSpeedLimit()??50);let factor=(!actor.isAmbient&&alleyEdge(actor.from,actor.to))?.78:1;return (3.6+Math.min(160,Math.max(0,safePhysicalSpeed))*.11)*factor}
function edgeKey(a){return a.from+'>'+a.to}
function minGapUnits(a,b){return(a.vehicleType==='moto'&&b.vehicleType==='moto')?4.0:(a.vehicleType==='moto'||b.vehicleType==='moto')?5.0:6.2}
function nodeBusy(nodeId,selfId){return allActors().some(a=>a.id!==selfId&&a.status==='driving'&&a.from===nodeId&&a.t<.16)}
function canEnterSignal(actor){let node=actor.to;if(!MAIN_SIGNALS.has(node))return true;let ph=signalPhase(node),ax=axisFor(actor.from,node);return ph[ax]==='green'}
function advanceActors(dt){
 const actors=allActors(),now=Date.now();
 // In the old version nextT could survive a road transition or stop, causing visible jumps and repeated stop rewards.
 for(const a of actors)a.nextT=a.t;
 for(const a of actors){
  if(a.status!=='driving'||(a.pauseUntil&&now<a.pauseUntil)||(a.boundaryWait&&now<a.boundaryWait))continue;
  if(a.boundaryWait&&now>=a.boundaryWait){a.boundaryWait=0;a.hiddenUntil=now+120}
  let v=nodeVec(a.from,a.to),step=speedUnits(a)*(dt/1000)/v.len,aNext=Math.min(1,a.t+step);
  if(aNext>.88&&MAIN_SIGNALS.has(a.to)&&!canEnterSignal(a))aNext=Math.min(aNext,.88);
  if(aNext>.92&&ADJ[a.to]?.length>=3&&nodeBusy(a.to,a.id))aNext=Math.min(aNext,.90);
  a.nextT=aNext;
 }
 const groups={};
 for(const a of actors){if(a.status==='driving')(groups[edgeKey(a)]||(groups[edgeKey(a)]=[])).push(a)}
 for(const g of Object.values(groups)){
  g.sort((a,b)=>b.t-a.t);let front=null;
  for(const a of g){
   let nt=a.nextT;
   if(front){let len=nodeVec(a.from,a.to).len,gap=minGapUnits(a,front)/len;nt=Math.min(nt,front.t-gap)}
   let previous=a.t;
   a.t=Math.max(previous,Math.min(1,nt));
   if(!a.isAmbient&&a.status==='driving'&&(!a.pauseUntil||now>=a.pauseUntil)&&(!a.boundaryWait||now>=a.boundaryWait)){
    const moved=Math.max(0,a.t-previous)*nodeVec(a.from,a.to).len;
    a.distanceSinceVisit=(a.distanceSinceVisit||0)+moved;
    if(Number(players[a.id]?.speed||0)>0)a.driveElapsedMs=(a.driveElapsedMs||0)+dt;
   }
   front=a;
  }
 }
 for(const a of actors){
  if(a.status!=='driving'||a.t<1)continue;
  // Do not chain another road transition while temporarily stopped or awaiting destination confirmation.
  if((a.pauseUntil&&now<a.pauseUntil)||(a.boundaryWait&&now<a.boundaryWait)){a.t=.999;continue}
  let prev=a.from,node=a.to;
  if(!a.isAmbient&&goalFor(a)===node&&!missionArrival(a,node)){
   a.t=.999;continue;
  }
  let enteringOffset=laneOffset(a,prev,node);
  if(NODES[node].boundary){
   a.from=node;a.to=(ADJ[node]||[])[0];a.t=0;
   a.entryLaneOffset=enteringOffset;a.boundaryWait=now+rand(550,1100);a.hiddenUntil=a.boundaryWait+120;
  }else{
   let nxt=a.isAmbient?nextNode(a,node,prev):nextMissionStep(a,node,prev);
   a.from=node;a.to=nxt;a.t=0;
   a.entryLaneOffset=enteringOffset;
  }
  a.nextT=a.t;
 }
}
function scoreRank(){return Object.entries(players).filter(([,p])=>p.ready).sort((a,b)=>RISK_GAME.getWealth(b[1])-RISK_GAME.getWealth(a[1])||String(a[1].name||'').localeCompare(String(b[1].name||''),'zh-Hant')||a[0].localeCompare(b[0]))}
function renderSide(){
  let arr=Object.entries(players),ready=arr.filter(([,p])=>p.ready).length;
  $('mPlayers').textContent=arr.length;$('mReady').textContent=ready;$('mAcc').textContent=affectedCount;
  $('ranking').innerHTML=scoreRank().map(([id,p],i)=>`<div class="rank"><div class="no">${i+1}</div><div><b>${safeText(p.name||'玩家')}</b><small>時速 ${p.speed??'-'} km/h｜🔥 連擊 ${Number(p.safeStreak||0)}</small><span class="missionMeta">📍 拜訪 ${Number(p.visitCount||0)} 站 · ${Number(p.completedRuns||0)} 趟</span></div><div class="score">${p.score||0}</div></div>`).join('');
  if($('membersBtn')) $('membersBtn').textContent=`👥 成員名單 (${arr.length})`;
  renderMemberList();
  let all=arr.length>0&&ready===arr.length&&!running&&!collisionDone;$('startBtn').disabled=!all;
  $('mapStatus').textContent=paused?'全班保險題：已暫停':running?`自動跑點｜達標 ${arr.filter(([,p])=>p.ready&&isTaskSpeedOnTarget(p)).length}/${ready} 人｜事故 ${accidentsThisRound} 起`:arr.length?`${ready}/${arr.length} READY`:'等待學生加入';
}
function causeWeight(p){
 let s=Number(p.speed||0),w=s<=20?.35:s<=30?.55:s<=50?1:s<=60?1.8:s<=80?3.6:s<100?6:9;
 return Math.max(.15,w+Number(p.scenarioPressure||0)*.22+Number(p.scenarioDistraction||0)*.45)
}
function victimWeight(p){
 let s=Number(p.speed||0),w=s<=20?6:s<=30?4.4:s<=40?2.8:s<=50?1.7:s<=60?1.15:s<=80?.8:.55;
 return Math.max(.15,w+Number(p.scenarioDistraction||0)*.18)
}
function selfWeight(p){
 let s=Number(p.speed||0),w=s<=30?.45:s<=50?.8:s<=60?1.3:s<=80?2.6:s<100?4.4:6.5;
 return Math.max(.2,w+Number(p.scenarioDistraction||0)*.65)
}
function weightedPick(entries,fn){
 if(!entries.length)return null;
 let total=entries.reduce((sum,[,p])=>sum+fn(p),0),r=Math.random()*total;
 for(const e of entries){r-=fn(e[1]);if(r<=0)return e}
 return entries[entries.length-1]
}
function chooseCrashPattern(a,b){
 let d=Math.abs(Number(a.speed||0)-Number(b.speed||0));
 if(d>=25)return 'rear';
 return pick(['cross','leftTurn','merge'])
}
function nearestSignalForPos(pos){
 let ids=['A','B','C','D'],best='A',bestD=Infinity;
 for(const id of ids){let n=NODES[id],d=Math.hypot(pos.x-n.x,pos.y-n.y);if(d<bestD){bestD=d;best=id}}
 return best
}
function startAccidentCycle(){
 collisionDone=false;collisionIds=[];collisionMeta=null;collisionAmbientId=null;affectedCount=0;
 let now=Date.now();accidentEligibleAt=now+7000;accidentDeadlineAt=now+30000
}
function tryPlayerCollision(){
 if(collisionDone||paused||Date.now()<accidentEligibleAt)return false;
 let entries=Object.entries(players).filter(([id,p])=>p.ready&&sim[id]?.status==='driving');
 if(entries.length<2)return false;
 let candidates=[];
 for(let i=0;i<entries.length;i++){
  for(let j=i+1;j<entries.length;j++){
   let [idA,pA]=entries[i],[idB,pB]=entries[j],a=sim[idA],b=sim[idB];
   if(!a||!b)continue;
   let pa=actorPos(a),pb=actorPos(b),d=Math.hypot(pa.x-pb.x,pa.y-pb.y);
   if(d<=5.4)candidates.push({idA,pA,idB,pB,pa,pb,d})
  }
 }
 if(!candidates.length)return false;
 candidates.sort((x,y)=>x.d-y.d);
 let c=candidates[0];
 let ab=causeWeight(c.pA)*victimWeight(c.pB),ba=causeWeight(c.pB)*victimWeight(c.pA);
 let aCauses=Math.random()<(ab/(ab+ba));
 let causerId=aCauses?c.idA:c.idB,victimId=aCauses?c.idB:c.idA;
 let causer=aCauses?c.pA:c.pB,victim=aCauses?c.pB:c.pA;
 collisionNode=nearestSignalForPos({x:(c.pa.x+c.pb.x)/2,y:(c.pa.y+c.pb.y)/2});
 collisionIds=[causerId,victimId];
 collisionMeta={kind:'player',causerId,victimId,pattern:chooseCrashPattern(causer,victim)};
 affectedCount=2;
 handleAccident();
 return true
}
function forcePlayerQuestion(){
 if(collisionDone||paused)return false;
 const entries=Object.entries(players).filter(([id,p])=>p.ready&&sim[id]?.status==='driving');
 if(entries.length<2)return false;
 const first=pick(entries),second=pick(entries.filter(([id])=>id!==first[0]));
 if(!first||!second)return false;
 const w1=causeWeight(first[1])*victimWeight(second[1]);
 const w2=causeWeight(second[1])*victimWeight(first[1]);
 const firstCauses=Math.random()<w1/(w1+w2);
 const causer=firstCauses?first:second,victim=firstCauses?second:first;
 const pos=actorPos(sim[causer[0]]);
 collisionNode=nearestSignalForPos(pos);
 collisionIds=[causer[0],victim[0]];
 collisionMeta={kind:'player',causerId:causer[0],victimId:victim[0],pattern:chooseCrashPattern(causer[1],victim[1]),timed:true};
 affectedCount=2;stopQuestionClock();accidentsThisRound++;
 announce('📚 30秒已到｜同學互撞・全班保險挑戰');
 triggerCollision();return true;
}
function forceNpcCollision(asQuestion=false){
 if(collisionDone||paused)return false;
 let entries=Object.entries(players).filter(([id,p])=>p.ready&&sim[id]&&(asQuestion||sim[id].status==='driving'));
 if(!entries.length)return false;
 let target=weightedPick(entries,p=>causeWeight(p)+victimWeight(p)),id=target[0],p=target[1],a=sim[id];
 let cw=causeWeight(p),vw=victimWeight(p),playerCauses=Math.random()<(cw/(cw+vw));
 let hitRun=!playerCauses&&Math.random()<.55;
 collisionNode=nearestSignalForPos(actorPos(a));
 collisionIds=[id,'__NPC__'];
 collisionMeta={kind:'npc',playerId:id,playerCauses,hitRun,pattern:pick(['rear','cross','leftTurn','merge']),forcedFallback:true};
 affectedCount=1;
 if(asQuestion){
  // Timed case is always a class-wide question; it is not gated by incident count.
  stopQuestionClock();accidentsThisRound++;
  announce('📚 30秒已到｜全班強制險挑戰');
  triggerCollision();
 }else handleAccident();
 return true
}
function medicalFor(p){
 let speed=Math.max(20,Number(p.speed||40));
 return Math.round((15000+speed*680)/1000)*1000
}
function damageFor(p){
 let speed=Math.max(20,Number(p.speed||40));
 return Math.round((12000+speed*760)*(p.vehicleType==='moto'?.65:1)/1000)*1000
}
function victimRecord(p){
 return{name:p.name||'玩家',medical:medicalFor(p),damage:damageFor(p),roleName:p.roleName||'',
 scenarioTitle:p.scenarioTitle||'一般行程',scenarioText:p.scenarioText||'',
 scenarioAction:p.scenarioAction||'前往目的地',speed:Number(p.speed||0),vehicleType:p.vehicleType||'car'}
}
function backgroundLine(v){
 return `${v.name}玩家是${v.roleName||'一般用路人'}，正在執行「${v.scenarioTitle}」任務，需要${v.scenarioAction||v.scenarioText||'連續前往多個地點'}。`
}
function playerCrashLine(a,b,meta){
 if(meta.pattern==='rear')return `${a.name}玩家接近路口時未能及時與前方保持距離，追撞正在減速通行的${b.name}玩家。`;
 if(meta.pattern==='leftTurn')return `${a.name}玩家進入十字路口準備轉向時，與另一方向直行的${b.name}玩家發生轉向碰撞。`;
 if(meta.pattern==='merge')return `${a.name}玩家由巷道匯入主要道路時，與同時通過路口的${b.name}玩家發生擦撞。`;
 return `${a.name}玩家與${b.name}玩家分別由不同方向進入十字路口，雙方在路口中央發生側向碰撞。`
}
function npcCrashLine(v,meta){
 const pattern=meta.pattern||'cross';
 if(meta.hitRun){
  if(pattern==='rear')return `${v.name}玩家行經路口減速時，遭後方NPC汽車追撞，對方隨即逃離，事後仍無法查明事故車輛。`;
  if(pattern==='leftTurn')return `${v.name}玩家正直行通過路口，與突然轉彎的NPC汽車相撞，對方離開現場後仍無法查明車輛。`;
  if(pattern==='merge')return `${v.name}玩家經過巷口，遭匯入道路的NPC汽車擦撞；對方駛離，事後查無肇事車輛。`;
  return `${v.name}玩家穿越路口時遭NPC汽車側向碰撞；對方逃逸後仍無法查明事故車輛。`;
 }
 if(meta.playerCauses){
  if(pattern==='rear')return `${v.name}玩家未保持適當距離，追撞前方減速的NPC汽車。`;
  if(pattern==='leftTurn')return `${v.name}玩家轉彎進入路口時，與一輛直行NPC汽車碰撞。`;
  if(pattern==='merge')return `${v.name}玩家由巷口駛入主要道路時，與NPC汽車發生擦撞。`;
  return `${v.name}玩家與NPC汽車分別由不同方向駛入路口，發生側向碰撞。`;
 }
 if(pattern==='leftTurn')return `${v.name}玩家沿路直行，一輛轉彎中的NPC汽車與其碰撞。`;
 if(pattern==='merge')return `${v.name}玩家通過巷口，遭匯入主要道路的NPC汽車擦撞。`;
 if(pattern==='cross')return `${v.name}玩家經過路口時，遭不同方向駛入的NPC汽車側撞。`;
 return `${v.name}玩家在路口前減速，遭後方NPC汽車追撞。`;
}
function selfCrashLine(v,meta){
 if(meta.pattern==='barrier')return `${v.name}玩家行經路口後未能順利控制車輛，擦撞路旁護欄，形成單一車輛事故。`;
 if(meta.pattern==='alley')return `${v.name}玩家由小巷轉入主要道路時操作不慎，擦撞路旁設施，形成單一車輛事故。`;
 return `${v.name}玩家在轉彎過程中偏離行車路線，擦撞路旁設施，形成單一車輛事故。`
}
function accidentSummaryFor(caseInfo){
 let lead=caseInfo.victims[0],summary='';
 if(caseInfo.kind==='player'){
  let other=caseInfo.victims[1];
  summary=`${backgroundLine(lead)} ${backgroundLine(other)} ${playerCrashLine(lead,other,caseInfo.meta)} ${lead.name}玩家產生醫療費 ${lead.medical.toLocaleString()} 元與車損 ${lead.damage.toLocaleString()} 元。`;
 }else if(caseInfo.kind==='npc'){
  summary=`${backgroundLine(lead)} ${npcCrashLine(lead,caseInfo.meta)}`;
  if(caseInfo.meta.hitRun)summary+=` ${lead.name}玩家因此受傷並產生醫療費 ${lead.medical.toLocaleString()} 元。`;
  else summary+=` ${lead.name}玩家產生醫療費 ${lead.medical.toLocaleString()} 元與車損 ${lead.damage.toLocaleString()} 元。`;
 }else{
  summary=`${backgroundLine(lead)} ${selfCrashLine(lead,caseInfo.meta)} 車輛因此產生 ${lead.damage.toLocaleString()} 元修復費。`;
 }
 return summary
}
/* The fixed bank follows the teacher-edited source; removed question IDs
   never return through a stale inline copy. */
function questionCandidates(caseInfo){
 const bank=window.GAME_QUESTION_BANK?.questions;
 if(!Array.isArray(bank)||!bank.length)throw new Error('教師題庫尚未載入');
 const kind=caseInfo.kind==='player'?'player':'npc';
 return bank.filter(q=>q.scope==='all'||q.scope===kind||(q.scope==='hitRun'&&kind==='npc'&&!!caseInfo.meta?.hitRun));
}

function fallbackQuestion(caseInfo){
 // 只有在本次事故類型所有固定題均已抽完時才啟用；每回合金額重新生成且不重複題號。
 const seq=questionSerial+1,med=(12+(seq*17)%85)*1000,repair=med+35000;
 const fmt=n=>n.toLocaleString('zh-TW');
 return {id:'dynamic_'+seq,category:'動態理賠計算',scope:caseInfo.kind,
  prompt:`延伸${caseInfo.kind==='player'?'同學互撞':'NPC交通事故'}案例：假設有資格請求強制險的受害人，合於傷害醫療給付規定的費用為 ${fmt(med)} 元、車損為 ${fmt(repair)} 元，且尚未達醫療給付限額。下列哪一金額可能列入強制險傷害醫療給付？`,
  options:[`${fmt(med)} 元`,`${fmt(med+repair)} 元`,`${fmt(repair)} 元`,'0元，因為同時有車損'],correctIndex:0,
  explanation:'傷害醫療與車損應分開；題目已假設醫療費合規、被害人資格成立且未達限額。金額是教學示例，須以實際審認為準。',};
}
function questionContext(caseInfo){
 const a=caseInfo.victims?.[0]?.name||'事故當事人';
 const b=caseInfo.kind==='player'?(caseInfo.victims?.[1]?.name||'另一位同學'):'NPC汽車';
 return {A:a,B:b};
}
function fillCaseText(value,ctx){return String(value).replaceAll('{{A}}',ctx.A).replaceAll('{{B}}',ctx.B)}
const QUIZ_HISTORY_KEY='cityInsuranceQuestionHistory_v830';
let questionCategoryCounts={},lastQuestionCategory='',timedQuestionSerial=0;
function pastQuestionHistory(){try{return JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY)||'[]')}catch(e){return []}}
function buildQuestion(caseInfo){
 const all=questionCandidates(caseInfo),remaining=all.filter(q=>!usedQuestionIds.has(q.id));
 let chosen;
 if(remaining.length){
  // 種類分層：優先選最少出現的主題，避免連續幾題都考相同保障範圍。
  const distinct=remaining.filter(q=>q.category!==lastQuestionCategory);
  const base=distinct.length?distinct:remaining;
  const history=new Set(pastQuestionHistory());
  const fresh=base.filter(q=>!history.has(q.id));
  const pool=fresh.length?fresh:base;
  const min=Math.min(...pool.map(q=>questionCategoryCounts[q.category]||0));
  const balanced=pool.filter(q=>(questionCategoryCounts[q.category]||0)<=min+1);
  chosen=pick(balanced);
 }else chosen=fallbackQuestion(caseInfo);
 usedQuestionIds.add(chosen.id);questionSerial++;
 lastQuestionCategory=chosen.category;
 questionCategoryCounts[chosen.category]=(questionCategoryCounts[chosen.category]||0)+1;
 try{localStorage.setItem(QUIZ_HISTORY_KEY,JSON.stringify([...pastQuestionHistory().filter(id=>id!==chosen.id),chosen.id].slice(-110)))}catch(e){}
 const ctx=questionContext(caseInfo);
 let opts=chosen.options.map((txt,i)=>({text:fillCaseText(txt,ctx),correct:i===chosen.correctIndex}));
 for(let i=opts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]]}
 return {id:'q_'+Date.now()+'_'+questionSerial,templateId:chosen.id,category:chosen.category,
  accidentSummary:accidentSummaryFor(caseInfo),
  prompt:fillCaseText(chosen.prompt,ctx),options:opts.map(x=>x.text),correctIndex:opts.findIndex(x=>x.correct),
  explanation:fillCaseText(chosen.explanation,ctx),
  revealed:false,closed:false,answers:{},createdAt:Date.now()};
}

async function triggerCollision(){
 if(collisionDone||paused)return;collisionDone=true;paused=true;stopEnvironmentCycle();
 let node=NODES[collisionNode],updates={status:'question'},victims=[];collisionAmbientId=null;
 let coords=[{x:node.x-1.8,y:node.y,rot:90},{x:node.x+1.8,y:node.y,rot:-90},{x:node.x,y:node.y+1.8,rot:0}];
 for(let i=0;i<collisionIds.length;i++){
  let id=collisionIds[i],pos=coords[i%coords.length];
  if(id==='__NPC__'){
   let npc=ambient.find(a=>a.status==='driving')||ambient[0];
   if(npc){collisionAmbientId=npc.id;npc.status='accident';npc.forcePos=actorPos(npc)}
   continue
  }
  let p=players[id],a=sim[id];if(!p||!a)continue;
  a.status='accident';a.forcePos=actorPos(a);victims.push(victimRecord(p));
  updates[`players/${id}/status`]='accident';
  updates[`players/${id}/currentEvent`]=collisionMeta?.kind==='self'?'⚠️ 發生單一車輛事故':'💥 發生交通事故';
  updates[`players/${id}/lastFeedback`]=null
 }
 let q=buildQuestion({kind:collisionMeta?.kind||'player',meta:collisionMeta||{},victims});
 updates.globalQuestion=q;updates[`usedQuestions/${q.templateId}`]=true;updates[`usedQuestionCategories/${q.category}`]=questionCategoryCounts[q.category];await roomRef.update(updates);renderCars()
}
function renderQuestion(){let q=currentQuestion;if(!q||q.closed){$('qOverlay').classList.add('hidden');return}$('qOverlay').classList.remove('hidden');$('accDetail').textContent=q.accidentSummary||'';$('qPrompt').textContent=q.prompt||'';let answers=q.answers||{},total=Object.values(players).filter(p=>p.ready).length,count=Object.keys(answers).length;$('qCount').textContent=`${count} / ${total} 已作答`;$('answeredText').textContent=total?`全班作答率 ${Math.round(count/total*100)}%`:'等待作答';$('bars').innerHTML=(q.options||[]).map((o,i)=>{let c=Object.values(answers).filter(a=>Number(a.option)===i).length,pct=total?Math.round(c/total*100):0,cls=q.revealed?(i===Number(q.correctIndex)?'correct':'wrongpick'):'';return `<div class="answerbar"><div class="letter">${String.fromCharCode(65+i)}</div><div class="track ${cls}"><div class="fill" style="width:${pct}%"></div><div class="label">${safeText(o)}</div></div><div class="pct">${pct}%</div></div>`}).join('');$('revealBtn').classList.toggle('hidden',!!q.revealed);$('continueBtn').classList.toggle('hidden',!q.revealed);$('explain').classList.toggle('hidden',!q.revealed);$('explain').textContent=q.revealed?q.explanation||'':''}
function setupRoomLifecycle(ref){
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  try{ref.onDisconnect().remove()}catch(e){}
  heartbeatTimer=setInterval(()=>{if(roomRef===ref)ref.update({hostOnline:true,hostHeartbeat:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{})},5000);
  window.onbeforeunload=()=>{try{ref.child('hostOnline').set(false)}catch(e){}};
  $('hostBadge').textContent=window.LOCAL_DEMO?'🟢 老師在線｜本機試玩同步':'🟢 老師在線｜Firebase 已連線';
}
function detachRoomListeners(ref=watchedRoomRef){
  roomWatchGeneration++;
  if(ref){for(const key of ['players','environment','usedQuestions','usedQuestionCategories','globalQuestion','status'])ref.child(key).off();ref.off()}
  if(watchedRoomRef===ref)watchedRoomRef=null;
}
function watchRoom(){
  detachRoomListeners();
  const ref=roomRef,generation=roomWatchGeneration;watchedRoomRef=ref;
  const current=()=>ref===roomRef&&generation===roomWatchGeneration;
  ref.child('players').on('value',snap=>{if(!current())return;players=snap.val()||{};for(const [id,p]of Object.entries(players)){if(sim[id])sim[id].speed=Number(p.speed??sim[id].speed??40)}renderSide();renderCars()});
  ref.child('environment').on('value',snap=>{if(!current())return;currentEnvironment=snap.val()||null;renderEnvironment()});
  ref.child('usedQuestions').on('value',snap=>{if(current())usedQuestionIds=new Set(Object.keys(snap.val()||{}))});
  ref.child('usedQuestionCategories').on('value',snap=>{if(current())questionCategoryCounts=snap.val()||{}});
  ref.child('globalQuestion').on('value',snap=>{if(!current())return;currentQuestion=snap.val();renderQuestion()});
  ref.child('status').on('value',snap=>{if(!current())return;const status=snap.val();if(status==='question')stopEnvironmentCycle();if(status==='finished'){running=false;paused=false;stopEnvironmentCycle();$('mapStatus').textContent='⏹️ 本局已結束'}});
}

function renderMemberList(){
  if(!$('memberList')) return;
  let arr=Object.values(players).sort((a,b)=>Number(a.joinedAt||0)-Number(b.joinedAt||0) || String(a.name||'').localeCompare(String(b.name||''),'zh-Hant'));
  $('memberCount').textContent=arr.length;
  $('memberList').innerHTML=arr.length?arr.map((p,i)=>`<div class="memberRow"><div class="memberNo">${i+1}</div><div><b>${safeText(p.name||'未命名')}</b><small>${p.connected===false?'連線中斷':'已加入房間'}</small></div><div class="memberState ${p.ready?'ready':''}">${p.ready?'READY':'準備中'}</div></div>`).join(''):'<div style="padding:24px;text-align:center;font-weight:900;color:#789">目前尚無學生加入</div>';
}
function studentInviteUrl(){
  const invite = new URL(`student.html?v=830&room=${encodeURIComponent(room)}`, window.location.href); if(window.LOCAL_DEMO)invite.searchParams.set('demo','1'); return invite.href;
}
function showInvite(){
  if(!room) return;
  $('inviteRoomCode').textContent=room;
  let url=studentInviteUrl();$('inviteUrl').textContent=url;$('qrcode').innerHTML='';
  if(window.QRCode){new QRCode($('qrcode'),{text:url,width:260,height:260,colorDark:'#10295a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});}
  else {$('qrcode').textContent='QR Code 載入失敗，請直接使用下方網址';}
  $('inviteModal').classList.remove('hidden');
}
$('inviteBtn').onclick=showInvite;
$('membersBtn').onclick=()=>{renderMemberList();$('membersModal').classList.remove('hidden')};
$('closeInvite').onclick=()=>$('inviteModal').classList.add('hidden');
$('closeMembers').onclick=()=>$('membersModal').classList.add('hidden');
$('inviteModal').onclick=e=>{if(e.target===$('inviteModal'))$('inviteModal').classList.add('hidden')};
$('membersModal').onclick=e=>{if(e.target===$('membersModal'))$('membersModal').classList.add('hidden')};


function finalRanking(){return scoreRank().slice(0,3)}
function showFinalPodium(){
  let top=finalRanking(),order=[1,0,2],classes=['second','first','third'],medals=['🥈','🥇','🥉'],places=['第二名','第一名','第三名'];
  $('podium').innerHTML=order.map((srcIndex,displayIndex)=>{
    let item=top[srcIndex],cls=classes[displayIndex],medal=medals[displayIndex],place=places[displayIndex];
    if(!item)return `<div class="pod ${cls} empty"><div class="medal">${medal}</div><div class="place">${place}</div><div class="winnerName">—</div><div class="winnerScore">—</div></div>`;
    let [,p]=item;
    return `<div class="pod ${cls}"><div class="medal">${medal}</div><div class="place">${place}</div><div class="winnerName">${safeText(p.name||'玩家')}</div><div class="winnerScore">${'$'+RISK_GAME.getWealth(p).toLocaleString('zh-TW')}</div></div>`
  }).join('');
  let awardDefs=[['🧭 任務達人','visitCount','最多拜訪站數'],['💼 工作達人','completedRuns','最多完成任務趟數']];
 $('specialAwards').innerHTML=awardDefs.map(([title,key,subtitle])=>{
 let winner=Object.values(players).filter(p=>p.ready).sort((a,b)=>Number(b[key]||0)-Number(a[key]||0))[0];
 return `<div class="specialAward">${title}<strong>${safeText(winner?.name||'—')}</strong><small>${subtitle} ${Number(winner?.[key]||0)}</small></div>`
 }).join('');
 $('finalOverlay').classList.remove('hidden')
}
$('closeFinalBtn').onclick=()=>$('finalOverlay').classList.add('hidden');
$('resetFromFinalBtn').onclick=async()=>{$('finalOverlay').classList.add('hidden');$('resetBtn').click()};
$('stopBtn').onclick=async()=>{
  if(!roomRef||!running||starting||roomMutationPending)return;
  const ref=roomRef,generation=++roundSerial;roomMutationPending=true;
  running=false;paused=true;stopEnvironmentCycle();stopQuestionClock();$('stopBtn').disabled=true;$('startBtn').disabled=true;
  $('qOverlay').classList.add('hidden');
  try{
    await window.settleOpenIncidentsAtEnd(ref,generation);
    const snapshot=await ref.child('players').once('value');
    if(ref!==roomRef||generation!==roundSerial)return;
    players=snapshot.val()||players;
    const updates={status:'finished',globalQuestion:null,finishedAt:firebase.database.ServerValue.TIMESTAMP};
    for(const [id,p]of Object.entries(players)){if(!p.ready)continue;updates[`players/${id}/status`]='finished';updates[`players/${id}/actionRequest`]=null;updates[`players/${id}/currentEvent`]='🏁 本局結束'}
    await ref.update(updates);
    if(ref!==roomRef||generation!==roundSerial)return;
    renderSide();showFinalPodium();$('mapStatus').textContent='🏁 本局結束｜前三名已公布';
  }catch(error){$('setupMsg').textContent='結束遊戲同步失敗，請確認連線後重設房間';console.error(error)}
  finally{roomMutationPending=false;if(ref===roomRef)renderSide()}
};

$('createBtn').onclick=async()=>{
  if(running||starting||roomMutationPending)return;
  roomMutationPending=true;$('createBtn').disabled=true;
  try{
    const connected=await db.ref('.info/connected').once('value');
    if(connected.val()!==true){$('setupMsg').textContent='尚未連線，請確認網路後再建立房間';return}
    let code=$('roomInput').value.trim();if(!/^\d{4}$/.test(code))code=String(Math.floor(1000+Math.random()*9000));
    const ref=db.ref(`rooms/${code}`),old=await ref.once('value');
    if(old.exists()&&old.child('hostOnline').val()&&Date.now()-Number(old.child('hostHeartbeat').val()||0)<18000){$('setupMsg').textContent='這個房號目前已有老師使用，請換一個房號';return}
    roundSerial++;running=false;paused=false;stopEnvironmentCycle();stopQuestionClock();
    const previous=roomRef;detachRoomListeners(previous);
    if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}window.onbeforeunload=null;
    if(previous){await previous.child('hostOnline').set(false);await previous.onDisconnect().cancel();await previous.remove()}
    room=code;roomRef=ref;currentEnvironment=null;currentQuestion=null;sim={};players={};
    usedQuestionIds.clear();questionCategoryCounts={};lastQuestionCategory='';timedQuestionSerial=0;questionSerial=0;accidentsThisRound=0;
    renderEnvironment();$('roomInput').value=code;$('roomShow').textContent=code;$('qOverlay').classList.add('hidden');$('finalOverlay').classList.add('hidden');
    await ref.set({status:'waiting',hostUid:auth.currentUser.uid,hostOnline:true,hostHeartbeat:firebase.database.ServerValue.TIMESTAMP,createdAt:firebase.database.ServerValue.TIMESTAMP});
    setupRoomLifecycle(ref);$('resetBtn').disabled=false;$('inviteBtn').disabled=false;$('membersBtn').disabled=false;$('stopBtn').disabled=true;
    $('setupMsg').textContent='房間已建立；關閉老師頁面後房間會自動失效';$('cars').innerHTML='';setupAmbient();watchRoom();showMapMarks();renderSignals();
  }catch(error){$('setupMsg').textContent='建立房間失敗：'+(error.message||'請確認連線');console.error(error)}
  finally{roomMutationPending=false;renderSide()}
};
$('resetBtn').onclick=async()=>{
  if(!roomRef||starting||roomMutationPending)return;
  const ref=roomRef,generation=++roundSerial;roomMutationPending=true;running=false;paused=false;
  stopEnvironmentCycle();stopQuestionClock();detachRoomListeners(ref);
  $('finalOverlay').classList.add('hidden');$('qOverlay').classList.add('hidden');$('stopBtn').disabled=true;
  sim={};players={};collisionDone=false;collisionIds=[];collisionMeta=null;affectedCount=0;currentQuestion=null;
  lastMissionAward=0;accidentEligibleAt=0;accidentDeadlineAt=0;accidentsThisRound=0;overspeedPending.clear();environmentChangedAt=0;currentEnvironment=null;
  usedQuestionIds.clear();questionCategoryCounts={};lastQuestionCategory='';timedQuestionSerial=0;questionSerial=0;
  renderEnvironment();$('cars').innerHTML='';setupAmbient();
  try{
    await ref.set({status:'waiting',hostUid:auth.currentUser.uid,hostOnline:true,hostHeartbeat:firebase.database.ServerValue.TIMESTAMP,createdAt:firebase.database.ServerValue.TIMESTAMP});
    if(ref!==roomRef||generation!==roundSerial)return;
    setupRoomLifecycle(ref);watchRoom();$('setupMsg').textContent='房間已重設，請學生重新加入';
  }catch(error){$('setupMsg').textContent='重設房間失敗：'+(error.message||'請確認連線');console.error(error)}
  finally{roomMutationPending=false;if(ref===roomRef)renderSide()}
};

function initialPlacement(entries){let out={},starts=[['W1','A'],['E1','B'],['N1','A'],['S1','C'],['W2','C'],['E2','D'],['N2','B'],['S2','D'],['A','M1'],['C','M2'],['H','I'],['J','I']],slots=[.18,.46,.74],occupied=[];for(const a of ambient)occupied.push({from:a.from,to:a.to,t:a.t});entries.forEach(([id,p],i)=>{let chosen=null;for(let k=0;k<starts.length&&!chosen;k++){let [from,to]=starts[(i+k)%starts.length];for(const t of slots){let busy=occupied.some(o=>o.from===from&&o.to===to&&Math.abs(o.t-t)<.16);if(!busy){chosen={from,to,t};break}}}if(!chosen)chosen={from:'W1',to:'A',t:.12};let a=makeActor(id,p,i,false);a.from=chosen.from;a.to=chosen.to;a.t=chosen.t;out[id]=a;occupied.push(chosen)});return out}
$('startBtn').onclick=async()=>{
 if(!roomRef||running||starting||roomMutationPending)return;
 const arr=Object.entries(players);if(!arr.length||!arr.every(([,p])=>p.ready&&p.status==='ready'))return;
 starting=true;$('startBtn').disabled=true;$('createBtn').disabled=true;$('resetBtn').disabled=true;
 const ref=roomRef,generation=++roundSerial;
 try{
 sim=initialPlacement(arr);currentEnvironment=randomEnvironment();environmentChangedAt=Date.now()-ENVIRONMENT_ADJUST_MS;overspeedPending.clear();usedQuestionIds.clear();questionCategoryCounts={};lastQuestionCategory="";timedQuestionSerial=0;questionSerial=0;accidentsThisRound=0;renderEnvironment();
 let updates={status:'running',globalQuestion:null,usedQuestions:null,usedQuestionCategories:null,environment:currentEnvironment,startedAt:firebase.database.ServerValue.TIMESTAMP};
 arr.forEach(([id])=>{
  let p=players[id],a=sim[id];a.stops=missionPlan(p,1);a.stage=0;a.run=1;a.lockedPlan=RISK_GAME.planFor(p.insurancePlan).id;a.lockedRole=RISK_GAME.roleFor(p.roleId).id;a.routeMode=RISK_GAME.routeFor(p.routeChoice).id;a.incidentCooldownUntil=Date.now()+20000;a.arrivalBusy=false;a.pauseUntil=0;a.runElapsedMs=0;a.runBudgetMs=0;a.minVisitDistance=a.to===goalFor(a)?Math.min(MIN_VISIT_ROAD_DISTANCE,nodeVec(a.from,a.to).len*(1-a.t)):MIN_VISIT_ROAD_DISTANCE;
  updates[`players/${id}/status`]='driving';updates[`players/${id}/score`]=null;updates[`players/${id}/insurancePlan`]=a.lockedPlan;updates[`players/${id}/wallet`]=RISK_GAME.newWallet(a.lockedPlan,a.lockedRole);updates[`players/${id}/incident`]=null;updates[`players/${id}/actionRequest`]=null;updates[`players/${id}/incidentCount`]=0;updates[`players/${id}/quizAwards`]=null;
  updates[`players/${id}/missionStops`]=a.stops;updates[`players/${id}/missionIndex`]=0;updates[`players/${id}/missionRound`]=1;updates[`players/${id}/visitCount`]=0;updates[`players/${id}/completedRuns`]=0;updates[`players/${id}/safeTicks`]=0;updates[`players/${id}/safeStreak`]=0;updates[`players/${id}/bestStreak`]=0;updates[`players/${id}/lastBonusAmount`]=0;updates[`players/${id}/lastVisitAt`]=null;updates[`players/${id}/quizCorrect`]=0;
  updates[`players/${id}/currentEvent`]='🚦 行駛中';updates[`players/${id}/lastFeedback`]=null;updates[`players/${id}/lastMissionBonusAt`]=null;updates[`players/${id}/lastSpeedHintAt`]=null;updates[`players/${id}/overspeedUntil`]=null;updates[`players/${id}/lastOverspeedCrashAt`]=null
 });
 await ref.update(updates);if(ref!==roomRef||generation!==roundSerial)return;running=true;paused=false;lastTs=performance.now();lastMissionAward=Date.now();
 $('stopBtn').disabled=false;$('startBtn').disabled=true;announce('🚦 出發！完成工作賺錢、事故自付扣錢，依剩餘財產排名。每25～30秒自動出題。');startEnvironmentCycle();startAccidentCycle();startQuestionClock();requestAnimationFrame(ts=>tick(ts,generation));
 }catch(error){if(ref===roomRef&&generation===roundSerial){running=false;$('setupMsg').textContent='發車失敗：'+(error.message||'請確認連線')}console.error(error)}
 finally{starting=false;if(ref===roomRef)renderSide()}
};
function isTaskSpeedOnTarget(p){
 let s=Number(p.speed),r=drivingScoreRange(currentEnvironment);
 return !!r&&Number.isFinite(s)&&s>=r.min&&s<=r.max;
}
async function awardMissionProgress(){/* 財產只因工作收入與事故結算改變。 */}
$('revealBtn').onclick=async()=>{
 const ref=roomRef,generation=roundSerial,q=currentQuestion;
 if(!ref||!running||!paused||!q||q.revealed||q.closed)return;
 $('revealBtn').disabled=true;
 try{
  const revealed=await ref.child('globalQuestion').transaction(current=>{
    if(ref!==roomRef||generation!==roundSerial||!running||!paused||!current||current.id!==q.id||current.revealed||current.closed)return;
    return{...current,revealed:true};
  });
  if(!revealed.committed||ref!==roomRef||generation!==roundSerial)return;
  const answers=revealed.snapshot.val().answers||{},jobs=[];
  for(const id of Object.keys(players))jobs.push(ref.child(`players/${id}`).transaction(p=>{
    if(ref!==roomRef||generation!==roundSerial||!running||!p||!p.ready||p.status==='finished'||p.quizAwards?.[q.id])return;
    const a=answers[id];if(!a)return;
    const correct=Number(a.option)===Number(q.correctIndex);
    return{...p,quizAwards:{...(p.quizAwards||{}),[q.id]:true},quizCorrect:Number(p.quizCorrect||0)+(correct?1:0),lastFeedback:correct?'✅ 本題答對，看看解析再繼續行車。':'本題未答對，可依解析再想一想。'};
  }));
  await Promise.allSettled(jobs);
 }catch(error){console.error('案例公布失敗',error)}
 finally{if(ref===roomRef&&generation===roundSerial)$('revealBtn').disabled=false}
};

$('continueBtn').onclick=async()=>{let updates={status:'running','globalQuestion/closed':true},node=collisionNode;for(const id of collisionIds){if(id==='__NPC__')continue;let a=sim[id];if(!a)continue;a.forcePos=null;a.status='driving';a.t=Math.min(.94,Math.max(.08,a.t));updates[`players/${id}/status`]='driving';updates[`players/${id}/currentEvent`]='🚗 事故處理完成，重新上路'}if(collisionAmbientId){let a=ambient.find(x=>x.id===collisionAmbientId);if(a){a.forcePos=null;a.status='driving';a.t=Math.min(.92,Math.max(.12,a.t))}}await roomRef.update(updates);setTimeout(()=>roomRef.child('globalQuestion').remove(),500);paused=false;lastMissionAward=Date.now();startEnvironmentCycle();startAccidentCycle();startQuestionClock();log('事故題結束，下一題將於行車30秒後出現','good')};
async function tick(ts){
 if(!running)return;
 let dt=Math.min(90,Math.max(0,ts-(lastTs||ts)));lastTs=ts;renderSignals();
 if(!paused){
  resumeOverspeedDrivers();
  checkOverspeedDrivers();
  advanceActors(dt);
  let now=Date.now();
  if(nextQuestionAt&&now>=nextQuestionAt){
   // No question before the 30-second clock elapses, regardless of collisions.
   timedQuestionSerial++;
   if(!(timedQuestionSerial%2===1&&forcePlayerQuestion()))forceNpcCollision(true);
  }else if(!collisionDone){
   if(now>=accidentEligibleAt)tryPlayerCollision();
   if(!collisionDone&&now>=accidentDeadlineAt)forceNpcCollision();
  }
  if(!paused&&now-lastMissionAward>=5000){lastMissionAward=now;awardMissionProgress()}
  if(ts-lastSideRender>700){lastSideRender=ts;renderSide()}
 }
 renderCars();requestAnimationFrame(tick)
}
showMapMarks();init();
