/* Student interface for the city risk-management game. Database writes are
   requests only; the teacher owns incidents, claims and the account ledger. */
window.StudentV8 = (() => {
  let roomStatus = 'waiting', playerStatus = 'ready', latestPlayer = null;
  let locked = false, pendingAction = null, actionTimer = null, lastIncidentKey = '';
  let routePending = false;
  const ACTION_TIMEOUT_MS = 12000;
  let actionRemaining = ACTION_TIMEOUT_MS, actionDeadline = 0, actionSubmitted = false;
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('zh-TW');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el = id => document.getElementById(id);
  const game = () => window.RISK_GAME;
  const finished = () => ['finished', 'closed'].includes(roomStatus);
  const canDrive = () => !finished() && roomStatus === 'running' && playerStatus === 'driving';
  const canAdjustSpeed = () => canDrive() || (!finished() && roomStatus === 'waiting' && playerStatus === 'ready');

  function reset() {
    roomStatus = 'waiting'; playerStatus = 'ready'; latestPlayer = null; locked = false;
    clearActionWait(); lastIncidentKey = ''; routePending = false;
    el('incidentPanel').classList.add('hidden');
    renderSetup();
  }

  function mount() {
    renderSetup();
    renderRoutes();
    el('walletPanel').innerHTML = '<div class="walletHeading"><span>💰 任務資金</span><small>到站賺取收入，事故支出依保障結算</small></div><div class="walletGrid"><div><small>可用資金</small><strong id="walletBalance">等待出發</strong></div><div><small>任務收入</small><b id="walletIncome">$0</b></div><div><small>自行負擔</small><b id="walletSelfPay">$0</b></div></div><p id="walletPlan" class="mutedNote">出發前決定保障；出發後不可補買。</p>';
    const originalReady = el('readyBtn').onclick;
    el('readyBtn').onclick = async () => {
      if (locked || !playerRef || !state.vehicle || !state.role || !state.scenario || state.speed == null) return;
      const selectedPlan = game().PLANS[state.insurancePlan] || game().PLANS.basic;
      const selectedRoute = game().ROUTES[state.routeChoice] || game().ROUTES.main;
      state.insurancePlan = selectedPlan.id;
      state.routeChoice = selectedRoute.id;
      locked = true;
      renderSetup();
      el('readyBtn').disabled = true;
      try {
        await originalReady();
        el('waitInfo').textContent += `｜${selectedRoute.name}｜${selectedPlan.name}`;
      } catch (error) {
        locked = false;
        renderSetup();
        const errorBox = el('strategyError');
        if (errorBox) errorBox.textContent = '準備資料尚未送出，請確認連線後重試。';
        el('readyBtn').disabled = false;
      }
    };
  }

  function renderSetup() {
    const target = el('strategySetup');
    if (!target || !game()) return;
    const plans = Object.values(game().PLANS), routes = Object.values(game().ROUTES);
    target.innerHTML = `<div class="sectionEyebrow">出發前，先做自己的決定</div><h3>🛡️ 配置保障與備用金</h3><p class="mutedNote">起始 ${money(game().START_BUDGET)}，已包含強制險基本人身保障。下列為教學用方案與模擬額度。</p><div class="planCards">${plans.map(plan => `<button type="button" data-plan="${esc(plan.id)}" class="planCard ${state.insurancePlan === plan.id ? 'selected' : ''}" aria-pressed="${state.insurancePlan === plan.id}" ${locked ? 'disabled' : ''}><span class="planName">${esc(plan.name)}</span><strong>${money(plan.premium)}</strong><span>${esc(plan.description)}</span><small>第三人財損上限 ${money(plan.thirdPartyLimit)}<br>自己車損上限 ${money(plan.ownLimit)}</small></button>`).join('')}</div><div class="budgetPreview"><span>出發時保留的備用金</span><strong id="budgetRemaining">${money(game().START_BUDGET - game().PLANS[state.insurancePlan].premium)}</strong></div><h3>🧭 第一段行程怎麼走？</h3><div class="setupRoutes">${routes.map(route => `<button type="button" data-setup-route="${esc(route.id)}" class="routeCard ${state.routeChoice === route.id ? 'selected' : ''}" aria-pressed="${state.routeChoice === route.id}" ${locked ? 'disabled' : ''}><b>${esc(route.name)}</b><span>${esc(route.description)}</span><small>相對風險：${esc(route.riskLabel)}</small></button>`).join('')}</div><p class="mutedNote">準備完成後保障即鎖定；行車中仍可改路線，於下一個路口生效。保險減輕損失，不會降低事故機率。</p><p id="strategyError" class="inlineError" role="alert"></p>`;
    target.querySelectorAll('[data-plan]').forEach(button => button.onclick = () => {
      if (locked) return;
      state.insurancePlan = button.dataset.plan;
      renderSetup();
    });
    target.querySelectorAll('[data-setup-route]').forEach(button => button.onclick = () => {
      if (locked) return;
      state.routeChoice = button.dataset.setupRoute;
      renderSetup();
    });
  }

  function renderRoutes() {
    if (!el('routePanel') || !game()) return;
    el('routePanel').innerHTML = `<div class="routeHeading"><h3>🧭 你的路線，你來決定</h3><span class="routeStatus" id="routeStatus">下一路口生效</span></div><div class="liveRoutes">${Object.values(game().ROUTES).map(route => `<button type="button" data-live-route="${esc(route.id)}" class="routeCard"><b>${esc(route.name)}</b><span>${esc(route.description)}</span><small>相對風險：${esc(route.riskLabel)}</small></button>`).join('')}</div><p id="routeEstimate" class="routeEstimate">出發後顯示下一站的路線估計。</p><p id="routeError" class="inlineError" role="alert"></p>`;
    el('routePanel').querySelectorAll('[data-live-route]').forEach(button => button.onclick = async () => {
      if (!canDrive() || routePending || !playerRef) return;
      routePending = true;
      el('routeError').textContent = '';
      updateControls();
      try {
        await playerRef.update({ routeChoice: button.dataset.liveRoute });
      } catch (error) {
        el('routeError').textContent = '路線尚未送出，請稍後重試。';
      } finally {
        routePending = false;
        updateControls();
      }
    });
  }

  function clearActionWait() {
    clearTimeout(actionTimer);
    actionTimer = null;
    pendingAction = null;
    actionSubmitted = false;
    actionDeadline = 0;
    actionRemaining = ACTION_TIMEOUT_MS;
  }

  function pauseActionTimeout() {
    if (actionTimer !== null) {
      actionRemaining = Math.max(0, actionDeadline - Date.now());
      clearTimeout(actionTimer);
      actionTimer = null;
      actionDeadline = 0;
    }
  }

  function actionWaitMessage() {
    return roomStatus === 'question'
      ? '全班案例討論中，個人操作暫停處理；討論結束後會繼續。'
      : '處理中…';
  }

  function armActionTimeout(id) {
    if (pendingAction !== id || !actionSubmitted || roomStatus !== 'running') return;
    clearTimeout(actionTimer);
    actionDeadline = Date.now() + actionRemaining;
    actionTimer = setTimeout(() => {
      actionTimer = null;
      actionDeadline = 0;
      if (pendingAction !== id) return;
      if (roomStatus === 'question') return;
      clearActionWait();
      if (el('incidentFeedback')) el('incidentFeedback').textContent = '尚未收到老師端回應，請確認老師頁面仍開啟，再重試。';
      updateControls();
    }, actionRemaining);
  }

  function setStatus(status) {
    const previousStatus = roomStatus;
    roomStatus = status;
    if (finished()) {
      clearActionWait();
      el('incidentPanel').classList.add('hidden');
      if (el('routeStatus')) el('routeStatus').textContent = '本局已結束';
    } else if (status === 'question' && pendingAction) {
      pauseActionTimeout();
      if (el('incidentFeedback')) el('incidentFeedback').textContent = actionWaitMessage();
    } else if (status === 'running' && previousStatus === 'question' && pendingAction) {
      armActionTimeout(pendingAction);
      if (el('incidentFeedback')) el('incidentFeedback').textContent = actionWaitMessage();
    }
    updateControls();
  }

  function updateControls() {
    document.querySelectorAll('[data-live-route]').forEach(button => {
      button.disabled = !canDrive() || routePending;
      const selected = button.dataset.liveRoute === (latestPlayer?.routeChoice || state.routeChoice);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-incident-action], #settleIncident').forEach(button => {
      button.disabled = finished() || roomStatus !== 'running' || !!pendingAction || playerStatus === 'finished';
    });
    document.querySelectorAll('#liveBox [data-speed-delta]').forEach(button => button.disabled = !canDrive());
    document.querySelectorAll('#waitBox [data-speed-delta]').forEach(button => button.disabled = !canAdjustSpeed());
  }

  function render(player) {
    latestPlayer = player;
    playerStatus = player.status || 'ready';
    if (player.ready) locked = true;
    const route = game().ROUTES[player.routeChoice] || game().ROUTES.main;
    const plan = game().PLANS[player.insurancePlan] || game().PLANS.basic;
    state.routeChoice = route.id;
    const wallet = player.wallet || {};
    el('walletBalance').textContent = money(wallet.balance ?? (game().START_BUDGET - plan.premium));
    el('walletIncome').textContent = money(wallet.missionIncome);
    el('walletSelfPay').textContent = money(wallet.totalOutOfPocket);
    el('walletPlan').textContent = `${plan.name}｜方案支出 ${money(wallet.premium ?? plan.premium)}｜累計保障分擔 ${money(wallet.insurancePaid)}`;
    el('walletBalance').classList.toggle('negative', Number(wallet.balance) < 0);
    const info = player.routeInfo || {};
    const eta = Number(info.etaSeconds);
    el('routeEstimate').textContent = `${info.name || route.name}｜${Number.isFinite(eta) && eta > 0 ? `預估 ${Math.ceil(eta)} 秒抵達下一站` : '依路況與號誌調整行程'}${info.note ? '｜' + info.note : ''}`;
    if (!finished()) el('routeStatus').textContent = canDrive() ? '改道於下一個路口生效' : (playerStatus === 'ready' ? '等待老師發車' : '處理事件後繼續行程');
    renderIncident(player.incident, player.actionRequest);
    updateControls();
  }

  function renderIncident(incident, request) {
    const panel = el('incidentPanel');
    if (!incident || finished()) {
      panel.classList.add('hidden'); lastIncidentKey = '';
      return;
    }
    if (pendingAction && incident.lastActionId === pendingAction) {
      clearActionWait();
    }
    const key = `${incident.id}:${incident.stage}`;
    panel.classList.remove('hidden');
    if (key !== lastIncidentKey) {
      lastIncidentKey = key;
      if (incident.stage === 'scene') renderScene(incident);
      else if (incident.stage === 'claim') renderClaim(incident);
      else renderSettlement(incident);
      requestAnimationFrame(() => panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    }
    const feedback = el('incidentFeedback');
    if (feedback) feedback.textContent = pendingAction ? actionWaitMessage() : (incident.feedback || '先確認現場安全，再依序處理事故。');
    panel.querySelectorAll('[data-incident-action]').forEach(button => {
      const done = !!incident.actions?.[button.dataset.incidentAction];
      button.classList.toggle('done', done);
      button.setAttribute('aria-pressed', String(done));
      const check = button.querySelector('.actionCheck');
      if (check) check.textContent = done ? '已完成 ✓' : '開始處理';
    });
    const doneCount = ['secure', 'call', 'photo', 'documents'].filter(action => incident.actions?.[action]).length;
    if (el('sceneProgress')) el('sceneProgress').textContent = `現場處理 ${doneCount} / 4`;
  }

  function renderScene(incident) {
    const actions = [
      ['secure', '🚧', '確認安全、警示後方', '先確認環境，再放置警示，避免二次事故'],
      ['call', '📞', '查看傷者、通報處理', '依現場狀況通報救護與警察，提供正確位置'],
      ['photo', '📸', '拍攝位置與車損', '留下車輛位置、道路標線及受損紀錄'],
      ['witness', '🙋', '留下目擊者資料', '補充現場資訊，讓事後釐清更完整'],
      ['documents', '📁', '整理資料、進入理賠', '完成必要處置後，帶著紀錄確認保障'],
    ];
    el('incidentPanel').innerHTML = `<div class="incidentHeading"><span class="sectionEyebrow">你的事故現場 · 其他同學繼續任務</span><h3>${esc(incident.title || '交通事故處理')}</h3><b id="sceneProgress">現場處理 0 / 4</b></div><p class="sceneContext">${esc(incident.context || '')}</p><div class="sceneIllustration" aria-hidden="true"><span class="sceneRoad"></span><span class="sceneCar">🚗</span><span class="sceneOther">🚙</span><span class="sceneMarker">⚠️</span><span class="scenePerson">🧍</span></div><p class="scenePrompt">先保護現場與人員，再蒐集資料。點選現場工具來處理；你的車會停留，其他人繼續行車。</p><div class="sceneActions">${actions.map(([id,icon,label,note]) => `<button type="button" data-incident-action="${id}"><span class="toolIcon">${icon}</span><span><b>${label}</b><small>${note}</small></span><span class="actionCheck">開始處理</span></button>`).join('')}</div><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('incidentPanel').querySelectorAll('[data-incident-action]').forEach(button => button.onclick = () => sendAction(button.dataset.incidentAction));
  }

  function renderClaim(incident) {
    const fields = [
      ['medical', '對方傷者符合條件的醫療費', incident.medical],
      ['thirdParty', '你依法應負責的對方車損', incident.thirdParty],
      ['ownDamage', '你自己的車輛修理費', incident.ownDamage],
    ];
    const options = [['', '將費用分配到保障'], ['compulsory', '強制險人身保障'], ['liability', '第三人財損保障'], ['own', '自己車損保障'], ['self', '自行負擔']];
    el('incidentPanel').innerHTML = `<div class="sectionEyebrow">現場處理完成</div><h3>📂 把損失放到適用的保障</h3><p class="sceneContext">${esc(incident.context || '')}</p><p class="claimPlan">你的出發方案：${esc(game().PLANS[latestPlayer?.insurancePlan]?.name || game().PLANS.basic.name)}${incident.practice ? '｜案例演練，不扣除任務資金' : ''}</p><p class="scenePrompt">取出你出發前選擇的方案。哪一筆可由保障分擔，哪一筆要從備用金支付？</p><div class="claimRows">${fields.map(([id,label,amount]) => `<label class="claimRow"><span><b>${label}</b><strong>${money(amount)}</strong></span><select id="claim-${id}" aria-label="${label}" ${Number(amount) === 0 ? 'disabled' : ''}>${options.map(([value,text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`).join('')}</div><button type="button" id="settleIncident" class="green">確認保障，結算支出</button><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('settleIncident').onclick = () => {
      const allocations = Object.fromEntries(fields.map(([id,,amount]) => [id, Number(amount) === 0 ? 'self' : el(`claim-${id}`).value]));
      if (Object.values(allocations).some(value => !value)) {
        el('incidentFeedback').textContent = '請先為每一筆費用安排保障或自行負擔。';
        return;
      }
      sendAction('settle', allocations);
    };
  }

  function renderSettlement(incident) {
    const settlement = incident.settlement || {};
    el('incidentPanel').innerHTML = `<div class="sectionEyebrow">本次事件已結算</div><h3>🧾 保障實際替你分擔了多少？</h3>${incident.practice ? '<p class="claimPlan">本次為案例演練，未扣除你的任務資金。</p>' : ''}<div class="settlementTotals"><div><small>保障分擔</small><strong>${money(settlement.insurancePaid)}</strong></div><div><small>備用金支出</small><strong>${money(settlement.outOfPocket)}</strong></div></div><div class="receiptRows">${(settlement.lines || []).map(line => `<div><b>${esc(line.label)}</b><span>損失 ${money(line.amount)}<br>保障 ${money(line.paid)} · 自付 ${money(line.selfPay)}</span></div>`).join('')}</div><p id="incidentFeedback" class="incidentFeedback" role="status">${esc(incident.feedback || '處理完成，返回任務。')}</p><p class="mutedNote">${esc(incident.learningNote || '此為教學模擬；保障依本案例設定的身分、責任與額度計算。')}</p>`;
  }

  async function sendAction(action, allocations) {
    const incident = latestPlayer?.incident;
    if (!incident || incident.stage === 'settled' || !playerRef || finished() || roomStatus !== 'running' || pendingAction) return;
    const id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    pendingAction = id;
    actionSubmitted = false;
    actionRemaining = ACTION_TIMEOUT_MS;
    updateControls();
    if (el('incidentFeedback')) el('incidentFeedback').textContent = '處理中…';
    try {
      await playerRef.child('actionRequest').set({ id, incidentId: incident.id, action, ...(allocations ? { allocations } : {}) });
      if (pendingAction !== id) return;
      actionSubmitted = true;
      armActionTimeout(id);
    } catch (error) {
      if (pendingAction !== id) return;
      clearActionWait();
      if (el('incidentFeedback')) el('incidentFeedback').textContent = '操作尚未送出，請檢查連線後重試。';
      updateControls();
    }
  }

  return { mount, reset, render, setStatus, finished, canDrive, canAdjustSpeed };
})();
