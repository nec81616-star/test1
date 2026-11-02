
let db,auth,uid,room,state={vehicle:null,color:'#3b82f6',role:null,scenario:null,speed:null,routeChoice:'main',insurancePlan:'basic'},playerRef,roomRootRef=null,questionRef=null,hostWatchTimer=null,kicked=false,currentQuestionId='',answeredQuestionId='',lastMissionBonusSeen=0,lastSpeedHintSeen=0,lastVisitSeen=0,bonusToastTimer=null,currentEnvironment=null,lastOverspeedSeen=0,overspeedStunned=false,wasInGame=false;const $=id=>document.getElementById(id);
function safeQuestionText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function configOK(){return window.LOCAL_DEMO||window.GAME_FIREBASE_CONFIG&&!String(GAME_FIREBASE_CONFIG.apiKey).includes('PASTE_')}function scrollToEl(el){requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'start'}))}
async function init(){
  if(!configOK()){$('joinMsg').textContent='請先設定 Firebase';$('joinMsg').classList.remove('hidden');$('joinBtn').disabled=true;return}
  firebase.initializeApp(GAME_FIREBASE_CONFIG);auth=firebase.auth();db=firebase.database();await auth.signInAnonymously();uid=auth.currentUser.uid;
  let saved=JSON.parse(localStorage.getItem('insuranceGamePlayer')||'null');
  if(saved){$('nameInput').value=saved.name||''}
  let qrRoom=new URLSearchParams(location.search).get('room');
  if(qrRoom&&/^\d{4}$/.test(qrRoom)){
    $('roomInput').value=qrRoom;
    $('joinBtn').disabled=false;
  }else{
    $('roomInput').value='';
    $('joinBtn').disabled=true;
    $('joinMsg').textContent='請掃描老師畫面上的「邀請學生」QR Code 加入房間';
    $('joinMsg').classList.add('error');
    $('joinMsg').classList.remove('hidden');
  }
}
function renderColors(){$('colors').innerHTML=GAME.colors.map(c=>`<button class="swatch ${c.hex===state.color?'sel':''}" data-c="${c.hex}" style="background:${c.hex}"></button>`).join('');document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{state.color=b.dataset.c;renderColors();updateSummary()})}
function renderRoles(){$('roles').innerHTML=GAME.roles.map(r=>`<div class="role ${state.role===r.id?'selected':''}" data-r="${r.id}"><div class="icon">${r.icon}</div><div class="title">${r.name}</div><button data-r="${r.id}">選擇</button></div>`).join('');document.querySelectorAll('.role button').forEach(b=>b.onclick=()=>{state.role=b.dataset.r;state.scenario=null;renderRoles();$('toScenario').disabled=false;$('s2').classList.add('done');updateSummary()})}
function updateSummary(){let v=state.vehicle?GAME.getVehicle(state.vehicle):null,r=state.role?GAME.getRole(state.role):null;$('sumV').textContent=v?GAME.colorName(state.color)+v.name:'尚未選擇';$('sumR').textContent=r?r.name:'尚未選擇';$('sumS').textContent=state.scenario?state.scenario.title:'尚未抽卡';$('sumSpeed').textContent=state.speed!=null?state.speed+' km/h':'尚未設定'}
document.querySelectorAll('.vehicle button').forEach(b=>b.onclick=()=>{state.vehicle=b.dataset.v;document.querySelectorAll('.vehicle').forEach(x=>x.classList.toggle('selected',x.dataset.v===state.vehicle));$('toRole').disabled=false;$('s1').classList.add('done');updateSummary()});$('toRole').onclick=()=>{$('roleBox').classList.remove('hidden');renderRoles();scrollToEl($('roleBox'))};function resetScenarioDraw(){
 state.scenario=null;$('scenarioCard').classList.remove('drawLocked');$('scenarioCard').innerHTML='<h3>🎴 尚未抽取</h3><div>按下按鈕後，系統會從你的角色任務中隨機抽出一個情境。</div>';$('drawBtn').disabled=false;$('drawBtn').textContent='🎴 抽取任務情境';$('speedArea').classList.add('hidden');updateSummary()
}
$('toScenario').onclick=()=>{$('scenarioBox').classList.remove('hidden');if(!state.scenario)resetScenarioDraw();scrollToEl($('scenarioBox'))};
$('drawBtn').onclick=()=>{
 if(state.scenario||!state.role)return;
 let r=GAME.getRole(state.role),pool=r.scenarios||[];if(!pool.length)return;
 state.scenario=pool[Math.floor(Math.random()*pool.length)];
 $('scenarioCard').classList.add('drawLocked');$('scenarioCard').innerHTML=`<h3>${state.scenario.title}</h3><div>${state.scenario.text}</div>`;
 $('drawBtn').disabled=true;$('drawBtn').textContent='✅ 任務已抽取';$('speedArea').classList.remove('hidden');$('s3').classList.add('done');
 document.querySelectorAll('.role button').forEach(b=>b.disabled=true);$('toScenario').disabled=true;updateSummary()
};
$('speedInput').oninput=e=>{let raw=e.target.value;if(raw===''){state.speed=null;$('speedComment').textContent='請自行設定行車時速';$('speedComment').className='comment';$('readyBtn').disabled=true;updateSummary();return}let v=Math.max(0,Math.min(160,Number(raw)));e.target.value=v;state.speed=v;$('speedComment').textContent='已設定 '+v+' km/h';$('speedComment').className='comment';$('readyBtn').disabled=false;$('s4').classList.add('done');updateSummary()};
$('joinBtn').onclick=async()=>{
  room=$('roomInput').value.trim();let name=$('nameInput').value.trim();
  $('joinMsg').classList.add('hidden');$('joinMsg').classList.remove('error');
  if(!/^\d{4}$/.test(room)){ $('joinMsg').textContent='房號必須是4位數字';$('joinMsg').classList.add('error');$('joinMsg').classList.remove('hidden');return }
  if(!name){ $('joinMsg').textContent='請輸入姓名';$('joinMsg').classList.add('error');$('joinMsg').classList.remove('hidden');return }
  $('joinBtn').disabled=true;$('joinBtn').textContent='檢查房間中…';
  try{
    let roomSnap=await db.ref(`rooms/${room}`).once('value');
    if(!roomSnap.exists()){throw new Error('找不到這個房間，請確認老師投影上的4位數房號')}
    let status=roomSnap.child('status').val();
    let hostOnline=roomSnap.child('hostOnline').val();
    if(hostOnline!==true) throw new Error('老師目前沒有開啟這個房間，請確認老師投影畫面');
    if(status!=='waiting'){
      if(status==='running'||status==='question') throw new Error('這個房間已經開始遊戲，請找老師確認');
      if(status==='finished') throw new Error('這個房間已經結束，請使用老師新建立的房號');
      throw new Error('這個房間目前無法加入');
    }
    localStorage.setItem('insuranceGamePlayer',JSON.stringify({name}));
    kicked=false;wasInGame=false;StudentV8.reset();
    playerRef=db.ref(`rooms/${room}/players/${uid}`);
    await playerRef.update({name,connected:true,ready:false,joinedAt:firebase.database.ServerValue.TIMESTAMP,lastSeen:firebase.database.ServerValue.TIMESTAMP});
    playerRef.onDisconnect().update({connected:false});
    $('joinBox').classList.add('hidden');$('setup').classList.remove('hidden');renderColors();watchRoom();
  }catch(err){
    $('joinMsg').textContent=err.message||'加入失敗，請重新確認房號';$('joinMsg').classList.add('error');$('joinMsg').classList.remove('hidden');
  }finally{$('joinBtn').disabled=false;$('joinBtn').textContent='加入遊戲'}
};
$('readyBtn').onclick=async()=>{
 if(!state.vehicle||!state.role||!state.scenario||state.speed==null)return;
 let v=GAME.getVehicle(state.vehicle),r=GAME.getRole(state.role);
 await playerRef.update({
  name:$('nameInput').value.trim(),
  vehicleType:state.vehicle,color:state.color,
  roleId:r.id,roleName:r.name,
  scenarioId:state.scenario.id,scenarioTitle:state.scenario.title,scenarioText:state.scenario.text,
  scenarioAction:state.scenario.action,
  taskPace:state.scenario.pace,taskMin:Number(state.scenario.targetMin),taskMax:Number(state.scenario.targetMax),
  scenarioPressure:state.scenario.pressure||0,scenarioDistraction:state.scenario.distraction||0,
  speed:Number(state.speed),routeChoice:state.routeChoice,insurancePlan:state.insurancePlan,score:0,ready:true,status:'ready',
  currentEvent:'等待出發',updatedAt:firebase.database.ServerValue.TIMESTAMP
 });
 $('setup').classList.add('hidden');$('waitBox').classList.remove('hidden');
 $('waitInfo').textContent=`${GAME.colorName(state.color)}${v.name}｜${r.name}`;$('waitMission').textContent=state.scenario.title;$('liveMission').textContent=state.scenario.title;$('waitSpeed').textContent=state.speed+' km/h';
};
function kickFromRoom(reason){
  if(kicked)return;kicked=true;
  if(hostWatchTimer){clearInterval(hostWatchTimer);hostWatchTimer=null}
  if(roomRootRef)roomRootRef.off();
  if(questionRef)questionRef.off();
  try{if(playerRef)playerRef.off()}catch(e){}
  StudentV8.setStatus('closed');$('qModal').classList.add('hidden');$('setup').classList.add('hidden');$('waitBox').classList.add('hidden');$('liveBox').classList.add('hidden');$('joinBox').classList.remove('hidden');
  $('roomInput').value='';$('joinMsg').textContent=reason||'老師已離開，房間已關閉';$('joinMsg').classList.add('error');$('joinMsg').classList.remove('hidden');$('joinBtn').disabled=false;$('joinBtn').textContent='加入遊戲';
  let saved=JSON.parse(localStorage.getItem('insuranceGamePlayer')||'{}');localStorage.setItem('insuranceGamePlayer',JSON.stringify({name:saved.name||$('nameInput').value||''}));room='';playerRef=null;roomRootRef=null;questionRef=null;
}
function hostAlive(meta){return !!(meta&&meta.hostOnline===true)}
function showDriveToast(msg,type='success'){let el=$('bonusToast');if(!el)return;if(bonusToastTimer)clearTimeout(bonusToastTimer);el.textContent=msg;el.classList.toggle('hint',type==='hint');el.classList.remove('show');void el.offsetWidth;el.classList.add('show');bonusToastTimer=setTimeout(()=>el.classList.remove('show'),1500)}
function drivingScoreRange(env){
 if(!env)return null;
 let cap=Math.min(env.roadKey==='congested'?30:50,env.weatherKey==='rainy'?35:env.weatherKey==='cloudy'?45:50);
 return {min:Math.max(15,cap-15),max:cap};
}
function renderTargetRange(){
 let r=drivingScoreRange(currentEnvironment),label=r?`${r.min}～${r.max} km/h`:'發車後公布';
 for(const id of ['waitTarget','liveTarget'])if($(id))$(id).textContent=label;
 if($('speedJudge')){$('speedJudge').textContent=r?(Number(state.speed)>r.max+10?' 💥 危險超速':Number(state.speed)>=r.min&&Number(state.speed)<=r.max?' ✅ 達標':' ⚠️ 請調整'):' ';}
 if($('overspeedRule'))$('overspeedRule').textContent=r?`⚠️ 超過 ${r.max+10} km/h：可能撞擊護欄，需處理現場並依保障負擔損失`:'⚠️ 超速撞擊界線將於發車後顯示';
}
function renderEnvironment(env){
 let prev=currentEnvironment,road=env?.roadName||'尚未公布',weather=env?.weatherName||'尚未公布';
 currentEnvironment=env||null;renderTargetRange();
 ['waitRoad','liveRoad'].forEach(id=>{if($(id))$(id).textContent=road});
 ['waitWeather','liveWeather'].forEach(id=>{if($(id))$(id).textContent=weather});
 if(prev&&env){
  if(prev.roadKey!==env.roadKey)showDriveToast(`🚦 路況變化：${road}`,'hint');
  else if(prev.weatherKey!==env.weatherKey)showDriveToast(`🌦️ 天氣變化：${weather}`,'hint');
 }
}
async function changeLiveSpeed(delta){if(!playerRef||kicked||overspeedStunned||!StudentV8.canAdjustSpeed())return;try{await playerRef.child('speed').transaction(cur=>{let n=Number(cur);if(!Number.isFinite(n))n=Number(state.speed||0);return Math.max(0,Math.min(160,Math.round(n+delta)))});await playerRef.child('updatedAt').set(firebase.database.ServerValue.TIMESTAMP)}catch(e){}}
document.querySelectorAll('[data-speed-delta]').forEach(b=>b.onclick=()=>changeLiveSpeed(Number(b.dataset.speedDelta||0)));
function watchRoom(){
  roomRootRef=db.ref(`rooms/${room}`);
  roomRootRef.on('value',s=>{let meta=s.val();if(!meta){kickFromRoom('老師已關閉投影畫面，房間已自動關閉');return}if(!hostAlive(meta)){kickFromRoom('老師目前不在線，請等待老師重新建立房間');return}if(meta.status==='waiting'&&wasInGame&&!meta.players?.[uid]){kickFromRoom('老師已重設房間，請重新掃描邀請加入。');return}if(['running','question','finished'].includes(meta.status))wasInGame=true;renderEnvironment(meta.environment||null);let group=Object.entries(meta.players||{}).filter(([,p])=>p.ready).sort((a,b)=>Number(b[1].score||0)-Number(a[1].score||0));let rank=group.findIndex(([id])=>id===uid);if($('playerRank'))$('playerRank').textContent=rank<0?'等待發車':`第${rank+1}／${group.length}名`;let st=meta.status;StudentV8.setStatus(st);if(st==='running'||st==='question'){$('waitBox').classList.add('hidden');$('setup').classList.add('hidden');$('liveBox').classList.remove('hidden')}if(st==='finished'){$('qModal').classList.add('hidden');$('eventBox').textContent='🏁 本局已結束，請看老師投影公布前三名！'}});
  playerRef.on('value',s=>{let p=s.val();if(p)renderLive(p)});
  questionRef=db.ref(`rooms/${room}/globalQuestion`);questionRef.on('value',s=>handleGlobalQuestion(s.val()));
  hostWatchTimer=setInterval(async()=>{if(!roomRootRef||kicked)return;try{let s=await roomRootRef.once('value');let meta=s.val();if(!hostAlive(meta))kickFromRoom('老師已離開，房間已關閉')}catch(e){}},5000)
}
function renderMissionState(p){
 let stops=Array.isArray(p.missionStops)?p.missionStops:[],idx=Math.max(0,Number(p.missionIndex||0)),round=Number(p.missionRound||1);
 let next=stops[idx],name=next?.label||'正在取得拜訪地點';
 $('missionNext').textContent=`第 ${round} 趟｜下一站：${name}`;
 $('missionFill').style.width=(stops.length?Math.min(100,idx/stops.length*100):0)+'%';
 $('missionStats').textContent=`本趟 ${Math.min(idx,stops.length)} / ${stops.length||3} 站｜累計完成 ${Number(p.visitCount||0)} 站｜${Number(p.completedRuns||0)} 趟；依你選擇的路線自動行車`;
}
function renderLive(p){
 StudentV8.render(p);
 let spd=Number(p.speed||0);state.speed=spd;overspeedStunned=p.status==='overspeed';document.querySelectorAll('#liveBox [data-speed-delta]').forEach(b=>b.disabled=overspeedStunned||!StudentV8.canDrive());$('hSpeed').textContent=spd+' km/h';if($('waitSpeed'))$('waitSpeed').textContent=spd+' km/h';
 $('hScore').textContent=p.score||0;$('eventBox').textContent=p.currentEvent||'行駛中';renderMissionState(p);
 let crashAt=Number(p.lastOverspeedCrashAt||0);if(crashAt&&crashAt!==lastOverspeedSeen){lastOverspeedSeen=crashAt;showDriveToast('💥 超速撞擊！請處理現場並檢視損失','hint')}
 let streak=Math.max(0,Number(p.safeStreak||0));$('safeStreak').textContent=`${streak} 連擊｜距離獎勵 ${4-streak%4} 次`;
 $('streakFill').style.width=((streak%4)/4*100)+'%';renderTargetRange();
 let bonusAt=Number(p.lastMissionBonusAt||0);
 if(bonusAt&&bonusAt!==lastMissionBonusSeen){lastMissionBonusSeen=bonusAt;if(Number(p.lastBonusAmount||3)>3)showDriveToast('🔥 安全連擊達成！＋13 分','success')}
 let visitAt=Number(p.lastVisitAt||0);
 if(visitAt&&visitAt!==lastVisitSeen){lastVisitSeen=visitAt;showDriveToast('📍 成功抵達任務站點＋15 分','success')}
 if(p.lastFeedback){$('resultBox').classList.remove('hidden');$('resultBox').textContent=p.lastFeedback}else $('resultBox').classList.add('hidden')
}
function handleGlobalQuestion(q){if(StudentV8.finished()){$('qModal').classList.add('hidden');return}if(!q){$('qModal').classList.add('hidden');currentQuestionId='';return}currentQuestionId=q.id;if(q.closed){$('qModal').classList.add('hidden');return}$('qModal').classList.remove('hidden');$('accInfo').textContent=q.accidentSummary||'';$('qPrompt').textContent=q.prompt||'';$('qOpts').innerHTML=(q.options||[]).map((o,i)=>`<button data-i="${i}" ${(answeredQuestionId===q.id||q.revealed)?'disabled':''}>${String.fromCharCode(65+i)}. ${safeQuestionText(o)}</button>`).join('');$('answerWait').classList.toggle('hidden',answeredQuestionId!==q.id&&!q.revealed);if(answeredQuestionId!==q.id&&!q.revealed){document.querySelectorAll('#qOpts button').forEach(b=>b.onclick=async()=>{answeredQuestionId=q.id;document.querySelectorAll('#qOpts button').forEach(x=>{x.disabled=true;x.classList.toggle('picked',x===b)});$('answerWait').classList.remove('hidden');$('answerWait').textContent='已送出答案，等待老師公布。';await db.ref(`rooms/${room}/globalQuestion/answers/${uid}`).set({option:Number(b.dataset.i),name:$('nameInput').value.trim(),ts:firebase.database.ServerValue.TIMESTAMP})})}if(q.revealed){let ans=q.answers&&q.answers[uid];let msg=!ans?'未作答。':Number(ans.option)===Number(q.correctIndex)?'✅ 答對！':'❌ 答錯。';$('answerWait').classList.remove('hidden');$('answerWait').textContent=msg+' '+(q.explanation||'')}}
renderColors();StudentV8.mount();init().catch(error=>{$('joinMsg').textContent='連線失敗，請檢查網路後重新整理。';$('joinMsg').classList.remove('hidden');$('joinBtn').disabled=true;console.error(error)});
