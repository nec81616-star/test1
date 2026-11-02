/* v8 host: routing and money remain authoritative on the teacher's page. */
(() => {
  'use strict';
  const Engine = window.RISK_GAME;
  const processing = new Set();
  let lastHazardScan = 0;
  let lastRouteSync = 0;
  let practiceNumber = 0;
  let continuing = false;
  const activeActor = (id, actor, ref, generation) => ref === roomRef && generation === roundSerial && actor === sim[id] && running;
  const cash = value => '$' + Math.round(Number(value || 0)).toLocaleString('zh-TW');
  const routeId = value => Engine.routeFor(value).id;

  const controls = document.createElement('div');
  controls.className = 'v8Controls';
  controls.innerHTML = '<button id="classCaseBtn" disabled>📚 全班案例演練</button>' +
    '<select id="practicePlayer" aria-label="選擇處置演練學生"><option value="">選擇處置演練學生</option></select>' +
    '<button id="personalPracticeBtn" disabled>🧰 指定學生處置演練</button>' +
    '<small>學生自主選路；只有事故當事人停車。指定演練不計事故、不扣虛擬金；全班案例由老師決定何時開始。</small>';
  document.querySelector('.hostControlBar').after(controls);
  document.querySelector('.finalBtns').before(Object.assign(document.createElement('div'), { id: 'financialReport', className: 'v8Report' }));

  // Preserve a meaningful difference between a longer main road, a short alley,
  // and a slower route that avoids the busy school crossing where possible.
  edgeDistance = function(a, b, mode) {
    const length = nodeVec(a, b).len;
    let factor = alleyEdge(a, b) ? (mode === 'shortcut' ? .62 : mode === 'school' ? 1.3 : 3.3) : 1;
    if (mode === 'main' && currentEnvironment?.roadKey === 'congested' && !alleyEdge(a, b)) factor *= 1.4;
    if (mode === 'school' && (a === 'A' || b === 'A')) factor *= 2.1;
    return length * factor;
  };
  nextMissionStep = function(actor, node, prev) {
    const goal = goalFor(actor);
    if (!goal) return nextNode(actor, node, prev);
    actor.routeMode = routeId(players[actor.id]?.routeChoice);
    const mode = actor.routeMode;
    const ranked = (ADJ[node] || []).map(next => ({
      node: next,
      cost: edgeDistance(node, next, mode) + remainingDistance(next, goal, mode) + (next === prev ? .2 : 0),
    })).sort((a, b) => a.cost - b.cost);
    return ranked[0]?.node || nextNode(actor, node, prev);
  };
  const oldSpeedUnits = speedUnits;
  speedUnits = function(actor) {
    if (!actor.isAmbient && Number(players[actor.id]?.speed ?? actor.speed) <= 0) return 0;
    const units = oldSpeedUnits(actor);
    if (actor.isAmbient) return units;
    if (Number(players[actor.id]?.speed || 0) <= 0) return 0;
    const route = actor.routeMode || routeId(players[actor.id]?.routeChoice);
    if (route === 'school') return units * .82;
    if (route === 'main' && currentEnvironment?.roadKey === 'congested') return units * .72;
    return units;
  };

  missionArrival = function(actor, node) {
    if (actor.arrivalBusy || !running || paused || actor.status !== 'driving') return false;
    const player = players[actor.id];
    if (!player || player.status !== 'driving' || !actor.stops?.[actor.stage] || actor.stops[actor.stage].node !== node) return false;
    if (isDangerouslyFast(player) || actor.driveElapsedMs - actor.lastVisitDriveMs < MIN_VISIT_DRIVE_MS || actor.distanceSinceVisit < MIN_VISIT_ROAD_DISTANCE) return false;
    const ref = roomRef, generation = roundSerial;
    const current = actor.stops[actor.stage];
    const final = actor.stage === actor.stops.length - 1;
    const run = actor.run || 1;
    const before = { stage: actor.stage, run: actor.run, stops: actor.stops, lastVisitDriveMs: actor.lastVisitDriveMs, distanceSinceVisit: actor.distanceSinceVisit };
    actor.arrivalBusy = true;
    actor.stage++;
    actor.pauseUntil = Date.now() + 1500;
    actor.lastVisitDriveMs = actor.driveElapsedMs;
    actor.distanceSinceVisit = 0;
    if (final) { actor.run = run + 1; actor.stops = missionPlan(player, actor.run); actor.stage = 0; }
    ref.child(`players/${actor.id}`).transaction(p => {
      if (!activeActor(actor.id, actor, ref, generation) || !p || p.status !== 'driving' || !running) return;
      const wallet = p.wallet || Engine.newWallet(actor.lockedPlan || 'basic');
      return { ...p,
        missionStops: actor.stops, missionIndex: actor.stage, missionRound: actor.run || run,
        visitCount: Number(p.visitCount || 0) + 1,
        completedRuns: Number(p.completedRuns || 0) + (final ? 1 : 0),
        score: Number(p.score || 0) + 15 + (final ? 25 : 0),
        wallet: { ...wallet, balance: Number(wallet.balance) + 300, missionIncome: Number(wallet.missionIncome || 0) + 300 },
        lastVisitName: current.label, lastVisitAt: firebase.database.ServerValue.TIMESTAMP,
        currentEvent: final ? `🎉 完成第 ${run} 趟任務！任務收入＋$300，整趟加分＋25` : `📍 完成 ${current.label}，收入＋$300、積分＋15`,
      };
    }).then(result => {
      if (!activeActor(actor.id, actor, ref, generation)) return;
      if (result.committed) announce(`📍 ${player.name || '玩家'}完成 ${current.label}｜任務收入＋$300`);
      else Object.assign(actor, before);
    }).catch(error => { if (activeActor(actor.id, actor, ref, generation)) Object.assign(actor, before); console.error('任務收入同步失敗', error); })
      .finally(() => { actor.arrivalBusy = false; });
    return true;
  };

  window.beginPersonalIncident = async function(id, kind = 'collision', practice = false) {
    const actor = sim[id];
    const player = players[id];
    if (!running || paused || !roomRef || !actor || !player?.ready || actor.status !== 'driving' || player.status !== 'driving' || actor.arrivalBusy) return false;
    const ref = roomRef, generation = roundSerial;
    actor.status = 'incident';
    const incident = Engine.createIncident(`incident_${Date.now()}_${++practiceNumber}`, kind, player);
    incident.practice = !!practice;
    if (practice) incident.title = '🧰 現場處置演練（不計事故、不扣款）';
    incident.startedAt = Date.now();
    try {
      const result = await ref.child(`players/${id}`).transaction(p => {
        if (!activeActor(id, actor, ref, generation) || !p || p.status !== 'driving' || !running) return;
        return { ...p, status: 'incident', incident, actionRequest: null,
          incidentCount: Number(p.incidentCount || 0) + (practice ? 0 : 1),
          safeStreak: 0,
          currentEvent: practice ? '🧰 正在進行現場處置演練；其他玩家繼續行車' : '💥 請在自己的畫面處理現場，其他玩家繼續行車',
        };
      });
      if (!activeActor(id, actor, ref, generation)) return false;
      if (!result.committed) { actor.status = 'driving'; return false; }
      if (!practice) accidentsThisRound++;
      announce(practice ? `🧰 ${player.name || '玩家'}進行處置演練（不扣款）` : `💥 ${player.name || '玩家'}處理個人事故；其他玩家繼續任務`);
      return true;
    } catch (error) {
      if (activeActor(id, actor, ref, generation)) actor.status = 'driving';
      console.error('事故建立失敗', error);
      return false;
    }
  };

  async function processAction(id) {
    if (processing.has(id) || !roomRef || !running || paused) return;
    if (!players[id]?.actionRequest || !sim[id]) return;
    processing.add(id);
    const actor = sim[id], ref = roomRef, generation = roundSerial;
    try {
      const result = await ref.child(`players/${id}`).transaction(player => {
        if (!activeActor(id, actor, ref, generation) || paused || !player?.actionRequest) return;
        const request = player.actionRequest;
        const incident = player.incident;
        if (typeof request.id !== 'string' || !request.id || request.id.length > 160 || typeof request.action !== 'string') {
          return { ...player, actionRequest: null };
        }
        if (!incident || request.incidentId !== incident.id || player.status !== 'incident' || incident.stage === 'settled' || request.id === incident.lastActionId) {
          return { ...player, actionRequest: null };
        }
        const answer = request.action === 'settle'
          ? Engine.settle(incident, actor.lockedPlan || 'basic', request.allocations || {})
          : Engine.act(incident, request.action);
        const updated = { ...(answer.incident || incident), feedback: answer.message || '', lastActionId: request.id };
        const output = { ...player, incident: updated, actionRequest: null };
        if (answer.ok && updated.stage === 'settled' && answer.settlement) {
          const settlement = answer.settlement;
          const wallet = player.wallet || Engine.newWallet(actor.lockedPlan || 'basic');
          if (incident.practice) {
            output.incident.feedback = '演練完成。以下為模擬結算，本次不扣款、不計事故。';
          } else {
            output.wallet = { ...wallet,
              balance: Number(wallet.balance) - Number(settlement.outOfPocket || 0),
              totalOutOfPocket: Number(wallet.totalOutOfPocket || 0) + Number(settlement.outOfPocket || 0),
              insurancePaid: Number(wallet.insurancePaid || 0) + Number(settlement.insurancePaid || 0),
            };
          }
          output.status = 'driving';
          output.lastFeedback = incident.practice ? '✅ 處置演練完成，已恢復行車（不扣款）' : `✅ 現場與理賠處理完成，自付 ${cash(settlement.outOfPocket)}；已恢復行車`;
          output.currentEvent = output.lastFeedback;
          output.speed = Math.min(Number(player.speed || 0), drivingScoreRange(currentEnvironment)?.max || 40);
        }
        return output;
      });
      const player = result.snapshot?.val();
      if (result.committed && player?.status === 'driving' && player.incident?.stage === 'settled' && activeActor(id, actor, ref, generation)) {
        actor.status = 'driving'; actor.pauseUntil = 0; actor.forcePos = null;
        actor.incidentCooldownUntil = Date.now() + 30000;
        actor.overspeedCooldownUntil = Date.now() + 30000;
      }
    } catch (error) { console.error('處置操作同步失敗', error); }
    finally {
      processing.delete(id);
      // A newer command can arrive while a transaction's acknowledgement is in flight.
      if (running && players[id]?.actionRequest) setTimeout(() => processAction(id), 80);
    }
  }
  const oldWatchRoom = watchRoom;
  watchRoom = function() {
    oldWatchRoom();
    const ref = roomRef, generation = roomWatchGeneration;
    ref.child('players').on('value', snapshot => {
      if (ref !== roomRef || generation !== roomWatchGeneration) return;
      const value = snapshot.val() || {};
      for (const [id, p] of Object.entries(value)) if (p.actionRequest) processAction(id);
    });
  };

  // No timer manufactures a crash. Events are personal and depend on route,
  // weather and speed; buying insurance never changes their probability.
  startQuestionClock = function() { nextQuestionAt = 0; };
  startAccidentCycle = function() { collisionDone = false; collisionIds = []; accidentDeadlineAt = 0; };
  checkOverspeedDrivers = function() {
    if (!running || paused || Date.now() - environmentChangedAt < ENVIRONMENT_ADJUST_MS) return;
    for (const [id, p] of Object.entries(players)) {
      const actor = sim[id];
      if (actor?.status === 'driving' && isDangerouslyFast(p) && Date.now() > (actor.overspeedCooldownUntil || 0)) {
        beginPersonalIncident(id, 'overspeed');
      }
    }
  };
  function checkRouteHazards(now) {
    if (now - lastHazardScan < 15000) return;
    lastHazardScan = now;
    for (const [id, p] of Object.entries(players)) {
      const actor = sim[id];
      if (!actor || actor.status !== 'driving' || Number(p.speed || 0) <= 0 || now < (actor.incidentCooldownUntil || 0)) continue;
      const route = actor.routeMode || routeId(p.routeChoice);
      let probability = route === 'shortcut' ? .12 : route === 'school' ? .025 : .055;
      if (currentEnvironment?.weatherKey === 'rainy') probability *= 1.5;
      if (isTaskSpeedOnTarget(p)) probability *= .65;
      if (Math.random() < probability) beginPersonalIncident(id, 'collision');
    }
  }
  function syncRouteInfo(now) {
    if (!roomRef || now - lastRouteSync < 4000) return;
    lastRouteSync = now;
    const updates = {};
    for (const [id, actor] of Object.entries(sim)) {
      const p = players[id]; if (!p?.ready) continue;
      const route = Engine.ROUTES[actor.routeMode || routeId(p.routeChoice)];
      const goal = goalFor(actor);
      const remaining = nodeVec(actor.from, actor.to).len * (1 - actor.t) + (goal ? remainingDistance(actor.to, goal, route.id) : 0);
      updates[`players/${id}/routeInfo`] = {
        name: route.name,
        etaSeconds: Math.ceil(remaining / Math.max(.1, speedUnits(actor))),
        riskLabel: route.riskLabel,
        note: routeId(p.routeChoice) !== (actor.routeMode || 'main') ? '已選新路線，下一路口生效' : '預估時間不含紅燈與臨時停車；路線變更於下一路口生效',
      };
    }
    if (Object.keys(updates).length) roomRef.update(updates).catch(error => console.warn('路線資訊同步失敗', error));
  }
  tick = async function(ts, generation = roundSerial) {
    if (!running || generation !== roundSerial) return;
    const dt = Math.min(90, Math.max(0, ts - (lastTs || ts))); lastTs = ts;
    renderSignals();
    if (!paused) {
      checkOverspeedDrivers(); advanceActors(dt);
      const now = Date.now();
      checkRouteHazards(now); syncRouteInfo(now);
      if (now - lastMissionAward >= 5000) { lastMissionAward = now; awardMissionProgress(); }
      if (ts - lastSideRender > 700) { lastSideRender = ts; renderSide(); }
    }
    renderCars(); requestAnimationFrame(next => tick(next, generation));
  };

  const oldRenderCars = renderCars;
  renderCars = function() {
    oldRenderCars();
    for (const [id, actor] of Object.entries(sim)) document.getElementById(`car_${id}`)?.classList.toggle('incident', actor.status === 'incident');
  };
  const oldRenderSide = renderSide;
  renderSide = function() {
    oldRenderSide();
    const list = scoreRank();
    $('ranking').innerHTML = list.map(([id, p], i) => {
      const wallet = p.wallet;
      const mode = Engine.ROUTES[routeId(p.routeChoice)];
      return `<div class="rank"><div class="no">${i + 1}</div><div><b>${safeText(p.name || '玩家')}</b><small>${safeText(mode.name)} · ${Number(p.speed || 0)} km/h</small><span class="missionMeta">📍 ${Number(p.visitCount || 0)} 站 · ${Number(p.completedRuns || 0)} 趟</span><span class="v8Money">${wallet ? `餘額 ${cash(wallet.balance)}｜自付 ${cash(wallet.totalOutOfPocket)}` : '出發前配置保障'}${p.status === 'incident' ? '<br><span class="v8Incident">🧰 正在處理現場</span>' : ''}</span></div><div class="score">${Number(p.score || 0)}</div></div>`;
    }).join('');
    $('mAcc').textContent = Object.values(players).filter(p => p.status === 'incident' && !p.incident?.practice).length;
    $('createBtn').disabled = running || starting || roomMutationPending;
    $('resetBtn').disabled = !roomRef || starting || roomMutationPending;
    $('startBtn').disabled = running || starting || roomMutationPending || !list.length || Object.values(players).some(p => !p.ready || p.status !== 'ready');
    $('mapStatus').textContent = !running && list.some(([, p]) => p.status === 'finished') ? '🏁 本局結束｜查看風險管理帳本' : paused ? '📚 全班案例演練｜由老師主持討論' : running ? `自主選路｜任務進行中｜實際事故 ${accidentsThisRound} 起` : '等待老師發車';
    $('classCaseBtn').disabled = !running || paused;
    $('personalPracticeBtn').disabled = !running || paused || !$('practicePlayer').value || sim[$('practicePlayer').value]?.status !== 'driving';
    const selected = $('practicePlayer').value;
    const options = list.map(([id, p]) => `<option value="${safeText(id)}">${safeText(p.name || '玩家')}</option>`).join('');
    if ($('practicePlayer').dataset.list !== options) {
      $('practicePlayer').innerHTML = '<option value="">選擇處置演練學生</option>' + options;
      $('practicePlayer').value = selected;
      $('practicePlayer').dataset.list = options;
    }
  };
  $('practicePlayer').onchange = () => renderSide();
  $('personalPracticeBtn').onclick = () => beginPersonalIncident($('practicePlayer').value, 'collision', true);

  $('classCaseBtn').onclick = async () => {
    if (!running || paused || !roomRef) return;
    paused = true; stopEnvironmentCycle();
    const ref = roomRef, generation = roundSerial;
    const ready = Object.values(players).filter(p => p.ready);
    const first = ready[0] || { name: '案例駕駛' };
    const q = buildQuestion({ kind: 'npc', meta: { kind: 'npc', playerCauses: true }, victims: [victimRecord(first)] });
    q.practice = true;
    q.accidentSummary = '📚 全班案例演練：以下為虛構教學案例，不計入任何玩家的事故或財務。\n' + q.accidentSummary;
    try { await ref.update({ status: 'question', globalQuestion: q }); }
    catch (error) { if (ref === roomRef && generation === roundSerial && running) { paused = false; startEnvironmentCycle(); } console.error('案例演練啟動失敗', error); }
  };
  $('continueBtn').onclick = async () => {
    if (!roomRef || !running || !paused || continuing || !currentQuestion?.revealed || currentQuestion.closed) return;
    const ref = roomRef, generation = roundSerial, questionId = currentQuestion.id;
    continuing = true; $('continueBtn').disabled = true;
    try {
      const result = await ref.transaction(meta => {
        if (ref !== roomRef || generation !== roundSerial || !running || !meta || meta.status !== 'question' || meta.globalQuestion?.id !== questionId || !meta.globalQuestion.revealed || meta.globalQuestion.closed) return;
        return { ...meta, status: 'running', globalQuestion: { ...meta.globalQuestion, closed: true } };
      });
      if (!result.committed || ref !== roomRef || generation !== roundSerial || !running) return;
      paused = false; lastTs = performance.now(); lastMissionAward = Date.now(); startEnvironmentCycle();
      announce('🚦 案例討論結束，繼續各自的城市任務');
      for (const [id, player] of Object.entries(players)) if (player.actionRequest) processAction(id);
    } catch (error) { console.error('恢復行車失敗', error); }
    finally { continuing = false; if (ref === roomRef && generation === roundSerial) $('continueBtn').disabled = false; }
  };
  const oldRenderQuestion = renderQuestion;
  renderQuestion = function() {
    oldRenderQuestion();
    document.querySelector('#qOverlay h2').textContent = '📚 全班案例演練';
  };
  const oldShowFinal = showFinalPodium;
  showFinalPodium = function() {
    oldShowFinal();
    $('financialReport').innerHTML = '<table><caption>本局風險管理帳本（虛擬金）</caption><thead><tr><th>學生</th><th>任務收入</th><th>保費</th><th>保險承擔</th><th>事故自付</th><th>剩餘資金</th></tr></thead><tbody>' + scoreRank().map(([, p]) => {
      const w = p.wallet || {};
      return `<tr><td>${safeText(p.name || '玩家')}</td><td>${cash(w.missionIncome)}</td><td>${cash(w.premium)}</td><td>${cash(w.insurancePaid)}</td><td>${cash(w.totalOutOfPocket)}</td><td>${cash(w.balance)}</td></tr>`;
    }).join('') + '</tbody></table>';
  };

  const oldStart = $('startBtn').onclick;
  $('startBtn').onclick = async () => {
    if (running || starting || roomMutationPending) return;
    lastHazardScan = Date.now(); lastRouteSync = 0;
    await oldStart();
    if (running) announce('🚦 選路與保障都會影響旅程！每站收入 $300；遇到事故請在個人畫面處理。');
  };
})();
