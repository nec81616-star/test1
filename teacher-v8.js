/* v8 host: routing and money remain authoritative on the teacher's page. */
(() => {
  'use strict';
  const Engine = window.RISK_GAME;
  const processing = new Set();
  let lastHazardScan = 0;
  let lastRouteSync = 0;
  let practiceNumber = 0;
  let continuing = false;
  let quizTimer = null, statusTimer = null;
  let quizStarting = false, revealing = false, activeQuizId = '', quizDelayMs = 0;
  const ROUND_DURATION_MS = 300000;
  let roundTimer = null, roundRemaining = ROUND_DURATION_MS, roundStartedAt = null;
  let roundClockRef = null, roundClockGeneration = 0;
  const activeActor = (id, actor, ref, generation) => ref === roomRef && generation === roundSerial && actor === sim[id] && running;
  const cash = value => '$' + Math.round(Number(value || 0)).toLocaleString('zh-TW');
  const routeId = value => Engine.routeFor(value).id;

  const controls = document.createElement('div');
  controls.className = 'v8Controls';
  controls.innerHTML = '<span id="roundClockStatus" class="roundClockStatus" role="status">⏱️ 本局行車 5:00｜答題暫停計時</span><span id="autoQuizStatus" class="autoQuizStatus" role="status">📚 發車後每25～30秒自動出題</span><button id="classCaseBtn" hidden disabled>📚 全班案例演練</button>' +
    '<select id="practicePlayer" aria-label="選擇處置演練學生"><option value="">選擇處置演練學生</option></select>' +
    '<button id="personalPracticeBtn" disabled>🧰 指定學生處置演練</button>' +
    '<small>學生自主選路；只有事故當事人停車。指定演練不計事故、不扣虛擬金；全班題自動出現；公布答案與繼續行車由老師決定。</small>';
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
    const role = Engine.roleFor(actor.lockedRole || player.roleId);
    if (Number(player.speed || 0) <= 0 || isDangerouslyFast(player) || actor.driveElapsedMs - actor.lastVisitDriveMs < Math.max(MIN_VISIT_DRIVE_MS, role.workSeconds * 1000) || actor.distanceSinceVisit + .01 < (actor.minVisitDistance ?? MIN_VISIT_ROAD_DISTANCE)) return false;
    const income = role.stationIncome;
    const ref = roomRef, generation = roundSerial;
    const current = actor.stops[actor.stage];
    const final = actor.stage === actor.stops.length - 1;
    const run = actor.run || 1;
    const before = { stage: actor.stage, run: actor.run, stops: actor.stops, lastVisitDriveMs: actor.lastVisitDriveMs, distanceSinceVisit: actor.distanceSinceVisit, minVisitDistance: actor.minVisitDistance };
    actor.arrivalBusy = true;
    actor.stage++;
    actor.pauseUntil = Date.now() + 1500;
    actor.lastVisitDriveMs = actor.driveElapsedMs;
    actor.distanceSinceVisit = 0;
    actor.minVisitDistance = MIN_VISIT_ROAD_DISTANCE;
    if (final) { actor.run = run + 1; actor.stops = missionPlan(player, actor.run); actor.stage = 0; }
    ref.child(`players/${actor.id}`).transaction(p => {
      if (!activeActor(actor.id, actor, ref, generation) || !p || p.status !== 'driving' || !running) return;
      const wallet = p.wallet || Engine.newWallet(actor.lockedPlan || 'basic', actor.lockedRole);
      return { ...p,
        missionStops: actor.stops, missionIndex: actor.stage, missionRound: actor.run || run,
        visitCount: Number(p.visitCount || 0) + 1,
        completedRuns: Number(p.completedRuns || 0) + (final ? 1 : 0),
        wallet: { ...wallet, balance: Number(wallet.balance) + income, missionIncome: Number(wallet.missionIncome || 0) + income },
        lastVisitName: current.label, lastVisitAt: firebase.database.ServerValue.TIMESTAMP,
        currentEvent: final ? `🎉 完成第 ${run} 趟任務！任務收入＋${cash(income)}` : `📍 完成 ${current.label}，收入＋${cash(income)}`,
      };
    }).then(result => {
      if (!activeActor(actor.id, actor, ref, generation)) return;
      if (result.committed) announce(`📍 ${player.name || '玩家'}完成 ${current.label}｜任務收入＋${cash(income)}`);
      else Object.assign(actor, before);
    }).catch(error => { if (activeActor(actor.id, actor, ref, generation)) Object.assign(actor, before); console.error('任務收入同步失敗', error); })
      .finally(() => { actor.arrivalBusy = false; });
    return true;
  };

  window.beginPersonalIncident = async function(id, kind = 'collision', practice = false, options = {}) {
    const actor = sim[id];
    const player = players[id];
    if (!running || paused || !roomRef || !actor || !player?.ready || actor.status !== 'driving' || player.status !== 'driving' || actor.arrivalBusy) return false;
    const ref = roomRef, generation = roundSerial;
    actor.status = 'incident';
    const incident = Engine.createIncident(`incident_${Date.now()}_${++practiceNumber}`, kind, player, options);
    incident.practice = !!practice;
    incident.insuranceInspection = { checked: false };
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
        let answer = request.action === 'settle'
          ? Engine.settleAuto(incident, actor.lockedPlan || 'basic')
          : Engine.act(incident, request.action);
        let updated = { ...(answer.incident || incident) };
        let wallet = player.wallet || Engine.newWallet(actor.lockedPlan || 'basic', actor.lockedRole);
        let fineCharged = false;
        // The police check belongs to this accident, not to a random roadside
        // timer or classroom quiz. The same atomic player transaction stores
        // the check and its one-time fine, so retries cannot charge it again.
        if (answer.ok && !updated.insuranceInspection?.checked &&
            (request.action === 'call' || ['claim', 'settled'].includes(updated.stage))) {
          const inspection = Engine.inspectionFor(actor.lockedPlan || 'basic', !!incident.practice);
          updated.insuranceInspection = inspection;
          if (inspection.fine > 0) {
            wallet = { ...wallet,
              balance: Number(wallet.balance) - inspection.fine,
              totalFines: Number(wallet.totalFines || 0) + inspection.fine,
            };
            fineCharged = true;
          }
          if (request.action === 'call') answer.message = inspection.note;
        }
        if (answer.ok && updated.stage === 'claim') {
          answer = Engine.settleAuto(updated, actor.lockedPlan || 'basic');
          updated = { ...(answer.incident || updated) };
        }
        updated.feedback = answer.message || '';
        updated.lastActionId = request.id;
        const output = { ...player, incident: updated, actionRequest: null };
        if (fineCharged) output.wallet = wallet;
        if (answer.ok && request.action === 'call' && updated.insuranceInspection?.checked) {
          output.currentEvent = updated.feedback;
        }
        if (answer.ok && updated.stage === 'settled' && answer.settlement) {
          const fine = Number(updated.insuranceInspection?.fine || 0);
          const settlement = { ...answer.settlement, fine,
            totalDeduction: Number(answer.settlement.outOfPocket || 0) + fine };
          output.incident.settlement = settlement;
          if (incident.practice) {
            output.incident.feedback = '演練完成。以下為模擬結算，本次不扣款、不計事故。';
          } else {
            // Any uninsured fine was already charged during the police call.
            // Only compensation is charged here; preserve the prior fine ledger.
            output.wallet = { ...wallet,
              balance: Number(wallet.balance) - Number(settlement.outOfPocket || 0),
              totalOutOfPocket: Number(wallet.totalOutOfPocket || 0) + Number(settlement.outOfPocket || 0),
              insurancePaid: Number(wallet.insurancePaid || 0) + Number(settlement.insurancePaid || 0),
            };
          }
          output.status = 'driving';
          output.lastFeedback = incident.practice ? '✅ 處置演練完成，已恢復行車（不扣款）' :
            `✅ 事故處理完成：自付 ${cash(settlement.outOfPocket)}${fine ? `、未投保模擬罰款 ${cash(fine)}` : ''}；已恢復行車`;
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
  // An unresolved accident is still a financial liability. Closing the round
  // settles it without inventing completed safety actions or a second fine.
  window.settleOpenIncidentsAtEnd = async function(ref, generation) {
    const valid = () => ref === roomRef && generation === roundSerial && !running;
    const snapshot = await ref.child('players').once('value');
    if (!valid()) return;
    await Promise.all(Object.entries(snapshot.val() || {}).map(async ([id, initial]) => {
      if (!initial.ready || !initial.incident || initial.incident.practice || initial.incident.stage === 'settled') return;
      const lockedPlan = sim[id]?.lockedPlan || Engine.planFor(initial.insurancePlan).id;
      const lockedRole = sim[id]?.lockedRole || Engine.roleFor(initial.roleId).id;
      await ref.child(`players/${id}`).transaction(player => {
        if (!valid() || !player?.ready || !player.incident || player.incident.practice || player.incident.stage === 'settled') return;
        const incident = player.incident;
        const alreadyChecked = !!incident.insuranceInspection?.checked;
        const inspection = alreadyChecked ? incident.insuranceInspection : Engine.inspectionFor(lockedPlan, false);
        const result = Engine.settleAuto({ ...incident, stage: 'claim', insuranceInspection: inspection }, lockedPlan);
        if (!result.ok) throw new Error('局末事故清算失敗：' + result.message);
        const newFine = alreadyChecked ? 0 : Number(inspection.fine || 0);
        const fine = Number(inspection.fine || 0);
        const settlement = { ...result.settlement, fine, totalDeduction: result.settlement.outOfPocket + fine };
        const wallet = player.wallet || Engine.newWallet(lockedPlan, lockedRole);
        return { ...player, actionRequest: null,
          incident: { ...result.incident, settlement,
            sceneIncomplete: !incident.actions?.documents, closedByRoundEnd: true,
            feedback: '本局結束：未完成的事故仍須結清損失與查驗罰款；現場處置保留原紀錄。' },
          wallet: { ...wallet,
            balance: Number(wallet.balance) - settlement.outOfPocket - newFine,
            totalOutOfPocket: Number(wallet.totalOutOfPocket || 0) + settlement.outOfPocket,
            totalFines: Number(wallet.totalFines || 0) + newFine,
            insurancePaid: Number(wallet.insurancePaid || 0) + settlement.insurancePaid },
        };
      });
    }));
  };
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
  // Timed class cases are defined below; they never create a personal crash.
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
  function routeIncidentProbability(player, actor) {
    const route = actor.routeMode || routeId(player.routeChoice);
    let probability = route === 'shortcut' ? .20 : route === 'school' ? .09 : .14;
    if (currentEnvironment?.weatherKey === 'rainy') probability *= 1.35;
    if (isTaskSpeedOnTarget(player)) probability *= .75;
    return Math.min(.40, probability);
  }
  function checkRouteHazards(now) {
    if (!running || paused || !roomRef || now - lastHazardScan < 15000) return;
    lastHazardScan = now;
    for (const [id, player] of Object.entries(players)) {
      const actor = sim[id];
      if (!actor || actor.status !== 'driving' || player.status !== 'driving' || actor.arrivalBusy || Number(player.speed || 0) <= 0 ||
          now < (actor.incidentCooldownUntil || 0) || now < (actor.pauseUntil || 0) || now < (actor.boundaryWait || 0)) continue;
      // Lawful speed reduces risk; it cannot remove road hazards entirely.
      // The chosen insurance never participates in this probability.
      if (Math.random() < routeIncidentProbability(player, actor))
        beginPersonalIncident(id, Math.random() < .55 ? 'self' : 'collision');
    }
  }
  window.RoadRiskV83 = Object.freeze({ scan: checkRouteHazards,
    probabilityFor: id => players[id] && sim[id] ? routeIncidentProbability(players[id], sim[id]) : 0 });
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
      return `<div class="rank"><div class="no">${i + 1}</div><div><b>${safeText(p.name || '玩家')}</b><small>${safeText(mode.name)} · ${Number(p.speed || 0)} km/h</small><span class="missionMeta">📍 ${Number(p.visitCount || 0)} 站 · ${Number(p.completedRuns || 0)} 趟</span><span class="v8Money">${wallet ? `財產 ${cash(wallet.balance)}｜事故自付 ${cash(wallet.totalOutOfPocket)}｜罰款 ${cash(wallet.totalFines)}` : '出發前配置保障'}${p.status === 'incident' ? '<br><span class="v8Incident">🧰 正在處理現場</span>' : ''}</span></div><div class="score wealth">${cash(Engine.getWealth(p))}</div></div>`;
    }).join('');
    $('mAcc').textContent = Object.values(players).filter(p => p.status === 'incident' && !p.incident?.practice).length;
    $('createBtn').disabled = running || starting || roomMutationPending;
    $('resetBtn').disabled = !roomRef || starting || roomMutationPending;
    $('startBtn').disabled = running || starting || roomMutationPending || !list.length || Object.values(players).some(p => !p.ready || p.status !== 'ready');
    $('mapStatus').textContent = !running && list.some(([, p]) => p.status === 'finished') ? '🏁 本局結束｜查看風險管理帳本' : paused ? '📚 全班答題／講解中｜由老師決定繼續行車' : running ? `自主選路｜任務進行中｜實際事故 ${accidentsThisRound} 起` : '等待老師發車';
    $('classCaseBtn').disabled = true;
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

  const quizValid = (ref, generation) => ref === roomRef && generation === roundSerial && running;
  function clearQuizTimers() {
    clearTimeout(quizTimer);
    clearInterval(statusTimer);
    quizTimer = statusTimer = null;
  }
  function currentRoundRemaining() {
    return Math.max(0, roundRemaining - (roundStartedAt === null ? 0 : Date.now() - roundStartedAt));
  }
  function pauseRoundClock() {
    roundRemaining = currentRoundRemaining();
    roundStartedAt = null;
    clearTimeout(roundTimer); roundTimer = null;
  }
  function clearRoundClock() {
    pauseRoundClock(); roundClockRef = null;
  }
  function resumeRoundClock() {
    if (!quizValid(roundClockRef, roundClockGeneration) || paused || roundStartedAt !== null) return;
    const ref = roundClockRef, generation = roundClockGeneration;
    roundStartedAt = Date.now();
    roundTimer = setTimeout(() => {
      if (!quizValid(ref, generation) || paused) return;
      roundTimer = null; roundRemaining = 0; roundStartedAt = null;
      $('stopBtn').onclick();
    }, roundRemaining);
  }
  function renderQuizClock() {
    const roundLabel = $('roundClockStatus');
    const secondsLeft = Math.ceil(currentRoundRemaining() / 1000);
    if (roundLabel) roundLabel.textContent = running ? `⏱️ 行車剩餘 ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}${paused ? '｜答題暫停計時' : ''}` : '⏱️ 本局行車 5:00｜答題暫停計時';
    const label = $('autoQuizStatus');
    if (!label) return;
    if (!running) { label.textContent = '📚 發車後每25～30秒自動出題'; return; }
    if (paused && currentQuestion && !currentQuestion.closed) {
      label.textContent = currentQuestion.revealed
        ? '📚 老師講解中｜按「繼續行車」才會關閉'
        : '📚 等待學生作答｜老師決定何時公布答案';
    } else {
      label.textContent = `📚 ${Math.max(0, Math.ceil((nextQuestionAt - Date.now()) / 1000))} 秒後自動出題`;
    }
  }
  stopQuestionClock = function() {
    clearQuizTimers(); clearRoundClock(); nextQuestionAt = 0; activeQuizId = ''; quizDelayMs = 0;
    quizStarting = false; revealing = false; continuing = false; renderQuizClock();
  };
  startQuestionClock = function() {
    clearQuizTimers(); nextQuestionAt = 0; activeQuizId = ''; quizDelayMs = 0;
    if (!roomRef || !running || paused) return;
    const ref = roomRef, generation = roundSerial;
    quizDelayMs = 25000 + Math.floor(Math.random() * 5001);
    nextQuestionAt = Date.now() + quizDelayMs;
    quizTimer = setTimeout(() => beginClassQuestion(ref, generation), quizDelayMs);
    statusTimer = setInterval(renderQuizClock, 250); renderQuizClock();
  };
  async function beginClassQuestion(ref = roomRef, generation = roundSerial) {
    if (!quizValid(ref, generation) || paused || quizStarting) return false;
    quizStarting = true; clearTimeout(quizTimer); quizTimer = null; nextQuestionAt = 0;
    pauseRoundClock(); paused = true; stopEnvironmentCycle();
    try {
      const ready = Object.values(players).filter(p => p.ready);
      const first = ready[0] || { name: '案例駕駛' };
      timedQuestionSerial++;
      const playerCase = timedQuestionSerial % 3 === 1 && ready.length > 1;
      const kind = playerCase ? 'player' : 'npc';
      const hitRun = !playerCase && timedQuestionSerial % 3 === 0;
      const victims = [victimRecord(first)];
      if (playerCase) victims.push(victimRecord(ready[1]));
      const q = buildQuestion({ kind, meta: { kind, playerCauses: !hitRun, hitRun, pattern: 'cross' }, victims });
      q.practice = true; q.autoMode = true; q.teacherControlled = true;
      q.accidentSummary = '📚 定時全班題：本題不計事故、不影響財產。\n' + q.accidentSummary;
      activeQuizId = q.id;
      await ref.update({ status: 'question', globalQuestion: q });
      if (!quizValid(ref, generation) || activeQuizId !== q.id) return false;
      if (!statusTimer) statusTimer = setInterval(renderQuizClock, 250);
      renderQuizClock(); return true;
    } catch (error) {
      if (quizValid(ref, generation)) { paused = false; startEnvironmentCycle(); startQuestionClock(); resumeRoundClock(); }
      console.error('自動題目載入失敗', error); return false;
    } finally { quizStarting = false; }
  }
  const originalReveal = $('revealBtn').onclick;
  async function revealClassQuestion(ref = roomRef, generation = roundSerial, questionId = activeQuizId) {
    if (!quizValid(ref, generation) || !paused || revealing || activeQuizId !== questionId || currentQuestion?.id !== questionId || currentQuestion.closed) return;
    revealing = true;
    try {
      if (!currentQuestion.revealed) await originalReveal();
      if (!quizValid(ref, generation) || activeQuizId !== questionId) return;
      // The explanation remains open until the teacher explicitly continues.
      renderQuizClock();
    } catch (error) {
      console.error('公布答案失敗，請重新按公布答案', error);
    } finally { revealing = false; }
  }
  async function continueClassQuestion(ref = roomRef, generation = roundSerial, questionId = activeQuizId) {
    if (!quizValid(ref, generation) || !paused || continuing || activeQuizId !== questionId || !currentQuestion?.revealed || currentQuestion.closed) return;
    continuing = true; $('continueBtn').disabled = true;
    try {
      const result = await ref.transaction(meta => {
        if (!quizValid(ref, generation) || !meta || meta.status !== 'question' || meta.globalQuestion?.id !== questionId || !meta.globalQuestion.revealed || meta.globalQuestion.closed) return;
        return { ...meta, status: 'running', globalQuestion: { ...meta.globalQuestion, closed: true } };
      });
      if (!result.committed || !quizValid(ref, generation)) return;
      paused = false; lastTs = performance.now(); startEnvironmentCycle(); startQuestionClock(); resumeRoundClock();
      announce('🚦 繼續工作賺錢！下題將在行車25～30秒後自動出現。');
      for (const [id, player] of Object.entries(players)) if (player.actionRequest) processAction(id);
    } catch (error) {
      console.error('恢復行車失敗，請重新按繼續行車', error);
    } finally { continuing = false; if (ref === roomRef && generation === roundSerial) $('continueBtn').disabled = false; }
  }
  $('classCaseBtn').onclick = () => beginClassQuestion();
  $('revealBtn').onclick = () => revealClassQuestion();
  $('continueBtn').onclick = () => continueClassQuestion();
  window.ClassQuizV83 = window.ClassQuizV81 = Object.freeze({ trigger: () => beginClassQuestion(),
    get nextDelayMs() { return quizDelayMs; }, get nextQuestionAt() { return nextQuestionAt; },
    get roundRemainingMs() { return currentRoundRemaining(); }, roundDurationMs: ROUND_DURATION_MS });
  const oldRenderQuestion = renderQuestion;
  renderQuestion = function() {
    oldRenderQuestion();
    document.querySelector('#qOverlay h2').textContent = '📚 定時全班題';
    $('revealBtn').textContent = '公布答案'; $('continueBtn').textContent = '繼續行車';
    renderQuizClock();
  };
  const oldShowFinal = showFinalPodium;
  showFinalPodium = function() {
    oldShowFinal();
    $('financialReport').innerHTML = '<table><caption>本局風險管理帳本（虛擬金）</caption><thead><tr><th>學生</th><th>初始財產</th><th>任務收入</th><th>保費</th><th>保險承擔</th><th>事故自付</th><th>未投保模擬罰款</th><th>剩餘資金</th></tr></thead><tbody>' + scoreRank().map(([, p]) => {
      const w = p.wallet || {};
      return `<tr><td>${safeText(p.name || '玩家')}</td><td>${cash(w.initialAssets)}</td><td>${cash(w.missionIncome)}</td><td>${cash(w.premium)}</td><td>${cash(w.insurancePaid)}</td><td>${cash(w.totalOutOfPocket)}</td><td>${cash(w.totalFines)}</td><td>${cash(w.balance)}</td></tr>`;
    }).join('') + '</tbody></table>';
  };

  const oldStart = $('startBtn').onclick;
  $('startBtn').onclick = async () => {
    if (running || starting || roomMutationPending) return;
    lastHazardScan = Date.now(); lastRouteSync = 0;
    await oldStart();
    if (running) {
      clearRoundClock(); roundRemaining = ROUND_DURATION_MS; roundClockRef = roomRef; roundClockGeneration = roundSerial; resumeRoundClock(); renderQuizClock();
      announce('🚦 本局行車5分鐘！各職業完成工作賺錢，事故依保障扣款；最後看誰的財產最多！');
    }
  };
})();
