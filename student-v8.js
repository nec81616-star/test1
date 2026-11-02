/* Student decisions stay compact; the host owns work income and automatic claims. */
window.StudentV8 = (() => {
  let roomStatus = 'waiting', playerStatus = 'ready', latestPlayer = null;
  let locked = false, pendingAction = null, actionTimer = null, lastIncidentKey = '', dismissedReceipt = '';
  let routePending = false;
  const ACTION_TIMEOUT_MS = 12000;
  let actionRemaining = ACTION_TIMEOUT_MS, actionDeadline = 0, actionSubmitted = false;
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('zh-TW');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el = id => document.getElementById(id);
  const game = () => window.RISK_GAME;
  const role = id => game().roleFor(id || state.role || 'office');
  const plan = id => game().planFor(id || state.insurancePlan || 'basic');
  const planLabels = { basic: ['基本', '保人身'], liability: ['保對方', '人身＋對方財物'], complete: ['保雙方', '人身＋雙方車損'] };
  const planLabel = id => planLabels[id] || planLabels.basic;
  const finished = () => ['finished', 'closed'].includes(roomStatus);
  const canDrive = () => !finished() && roomStatus === 'running' && playerStatus === 'driving';
  const canAdjustSpeed = () => canDrive() || (!finished() && roomStatus === 'waiting' && playerStatus === 'ready');

  function reset() {
    roomStatus = 'waiting'; playerStatus = 'ready'; latestPlayer = null; locked = false;
    clearActionWait(); lastIncidentKey = ''; dismissedReceipt = ''; routePending = false;
    el('incidentPanel').classList.add('hidden');
    renderSetup();
  }

  function mount() {
    renderSetup(); renderRoutes();
    el('walletPanel').innerHTML = '<div class="walletHeading"><span>💰 目前財產</span><small id="playerRank">等待發車</small></div><div class="walletGrid"><div><strong id="walletBalance"><span id="hScore">等待出發</span></strong></div><div><small>工作收入</small><b id="walletIncome">$0</b></div><div><small>事故自付</small><b id="walletSelfPay">$0</b></div></div><p id="walletPlan" class="coverLine">出發前選保障，出事自動結算。</p>';
    const originalReady = el('readyBtn').onclick;
    el('readyBtn').onclick = async () => {
      if (locked || !playerRef || !state.vehicle || !state.role || !state.scenario || state.speed == null) return;
      const selectedPlan = plan(state.insurancePlan);
      const selectedRoute = game().routeFor(state.routeChoice);
      state.insurancePlan = selectedPlan.id; state.routeChoice = selectedRoute.id;
      locked = true; renderSetup(); el('readyBtn').disabled = true;
      try {
        await originalReady();
        el('waitInfo').textContent += `｜${selectedRoute.name}｜${planLabel(selectedPlan.id)[0]}`;
      } catch (error) {
        locked = false; renderSetup();
        el('strategyError').textContent = '準備資料尚未送出，請確認連線後重試。';
        el('readyBtn').disabled = false;
      }
    };
  }

  function renderSetup() {
    const target = el('strategySetup');
    if (!target || !game()) return;
    const selectedRole = role(), selectedPlan = plan();
    target.innerHTML = `<div class="roleBudget"><span>${esc(selectedRole.name)}｜起始 ${money(selectedRole.startingWealth)}</span><small>每完成一站＋${money(selectedRole.stationIncome)} · 每站至少 ${selectedRole.workSeconds} 秒</small></div><h3>🛡️ 選一次保障，出事自動算</h3><div class="planCards">${Object.values(game().PLANS).map(p => `<button type="button" data-plan="${esc(p.id)}" class="planCard ${selectedPlan.id === p.id ? 'selected' : ''}" aria-pressed="${selectedPlan.id === p.id}" ${locked ? 'disabled' : ''}><span class="planName">${planLabel(p.id)[0]}</span><strong>${money(p.premium)}</strong><small>${planLabel(p.id)[1]}</small></button>`).join('')}</div><div class="budgetPreview"><span>扣除保障費後出發財產</span><strong id="budgetRemaining">${money(selectedRole.startingWealth - selectedPlan.premium)}</strong></div><details class="setupDetails"><summary>保障怎麼分？</summary><p>基本含符合條件的人身保障；「保對方」再補對方財物；「保雙方」也補自己的車損。保障不能防止事故，未保障或超過額度的部分會扣自己的錢。金額為遊戲設定，實際給付依責任、法律與契約條件判斷。</p></details><h3>🧭 先選一條路</h3><div class="setupRoutes">${Object.values(game().ROUTES).map(r => `<button type="button" data-setup-route="${esc(r.id)}" class="routeCard ${state.routeChoice === r.id ? 'selected' : ''}" aria-pressed="${state.routeChoice === r.id}" title="${esc(r.description)}" ${locked ? 'disabled' : ''}><b>${esc(r.name)}</b><small>${esc(r.riskLabel)}</small></button>`).join('')}</div><p class="mutedNote">行車中可以改道；保障準備完成後鎖定。</p><p id="strategyError" class="inlineError" role="alert"></p>`;
    target.querySelectorAll('[data-plan]').forEach(button => button.onclick = () => {
      if (locked) return; state.insurancePlan = button.dataset.plan; renderSetup();
    });
    target.querySelectorAll('[data-setup-route]').forEach(button => button.onclick = () => {
      if (locked) return; state.routeChoice = button.dataset.setupRoute; renderSetup();
    });
  }

  function renderRoutes() {
    if (!el('routePanel') || !game()) return;
    el('routePanel').innerHTML = `<div class="routeHeading"><h3>🧭 路線</h3><span class="routeStatus" id="routeStatus">下一路口生效</span></div><div class="liveRoutes">${Object.values(game().ROUTES).map(r => `<button type="button" data-live-route="${esc(r.id)}" class="routeCard" title="${esc(r.description)}"><b>${esc(r.name)}</b><small>${esc(r.riskLabel)}</small></button>`).join('')}</div><p id="routeEstimate" class="routeEstimate">出發後顯示下一站預估時間。</p><p id="routeError" class="inlineError" role="alert"></p>`;
    el('routePanel').querySelectorAll('[data-live-route]').forEach(button => button.onclick = async () => {
      if (!canDrive() || routePending || !playerRef) return;
      routePending = true; el('routeError').textContent = ''; updateControls();
      try { await playerRef.update({ routeChoice: button.dataset.liveRoute }); }
      catch (error) { el('routeError').textContent = '路線尚未送出，請稍後重試。'; }
      finally { routePending = false; updateControls(); }
    });
  }

  function clearActionWait() {
    clearTimeout(actionTimer); actionTimer = null; pendingAction = null;
    actionSubmitted = false; actionDeadline = 0; actionRemaining = ACTION_TIMEOUT_MS;
  }
  function pauseActionTimeout() {
    if (actionTimer !== null) {
      actionRemaining = Math.max(0, actionDeadline - Date.now()); clearTimeout(actionTimer);
      actionTimer = null; actionDeadline = 0;
    }
  }
  function actionWaitMessage() { return roomStatus === 'question' ? '全班答題中，結束後繼續處理。' : '處理中…'; }
  function armActionTimeout(id) {
    if (pendingAction !== id || !actionSubmitted || roomStatus !== 'running') return;
    clearTimeout(actionTimer); actionDeadline = Date.now() + actionRemaining;
    actionTimer = setTimeout(() => {
      actionTimer = null; actionDeadline = 0;
      if (pendingAction !== id || roomStatus === 'question') return;
      clearActionWait();
      if (el('incidentFeedback')) el('incidentFeedback').textContent = '尚未收到回應，請確認教師頁面仍開啟，再重試。';
      updateControls();
    }, actionRemaining);
  }
  function setStatus(status) {
    const previousStatus = roomStatus; roomStatus = status;
    if (finished()) {
      clearActionWait(); stopQuestionCountdown(); el('incidentPanel').classList.add('hidden');
      if (el('routeStatus')) el('routeStatus').textContent = '本局已結束';
    } else if (status === 'question' && pendingAction) {
      pauseActionTimeout(); if (el('incidentFeedback')) el('incidentFeedback').textContent = actionWaitMessage();
    } else if (status === 'running' && previousStatus === 'question' && pendingAction) {
      armActionTimeout(pendingAction); if (el('incidentFeedback')) el('incidentFeedback').textContent = actionWaitMessage();
    }
    updateControls();
  }
  function updateControls() {
    document.querySelectorAll('[data-live-route]').forEach(button => {
      button.disabled = !canDrive() || routePending;
      const selected = button.dataset.liveRoute === (latestPlayer?.routeChoice || state.routeChoice);
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-incident-action]').forEach(button => {
      button.disabled = finished() || roomStatus !== 'running' || !!pendingAction || playerStatus === 'finished';
    });
    document.querySelectorAll('#liveBox [data-speed-delta]').forEach(button => button.disabled = !canDrive());
    document.querySelectorAll('#waitBox [data-speed-delta]').forEach(button => button.disabled = !canAdjustSpeed());
  }

  function render(player) {
    latestPlayer = player; playerStatus = player.status || 'ready'; if (player.ready) locked = true;
    const selectedRoute = game().routeFor(player.routeChoice), selectedPlan = plan(player.insurancePlan);
    const selectedRole = role(player.roleId); state.routeChoice = selectedRoute.id;
    const wallet = player.wallet || {};
    el('hScore').textContent = money(wallet.balance ?? selectedRole.startingWealth - selectedPlan.premium);
    el('walletIncome').textContent = money(wallet.missionIncome); el('walletSelfPay').textContent = money(wallet.totalOutOfPocket);
    el('walletPlan').textContent = `🛡️ ${planLabel(selectedPlan.id)[0]}：${planLabel(selectedPlan.id)[1]}｜事故自動結算`;
    el('walletBalance').classList.toggle('negative', Number(wallet.balance) < 0);
    const info = player.routeInfo || {}, eta = Number(info.etaSeconds);
    el('routeEstimate').textContent = `${info.name || selectedRoute.name}｜${Number.isFinite(eta) && eta > 0 ? `約 ${Math.ceil(eta)} 秒到站` : '留意路況'}${info.note?.includes('已選新路線') ? '｜下一路口改道' : ''}`;
    if (!finished()) el('routeStatus').textContent = canDrive() ? '下一路口生效' : (playerStatus === 'ready' ? '等待發車' : '處理事件中');
    renderIncident(player.incident); updateControls();
  }

  function renderIncident(incident) {
    const panel = el('incidentPanel');
    if (!incident || finished() || (incident.stage === 'settled' && dismissedReceipt === incident.id)) {
      panel.classList.add('hidden'); if (!incident) lastIncidentKey = ''; return;
    }
    if (pendingAction && incident.lastActionId === pendingAction) clearActionWait();
    const key = `${incident.id}:${incident.stage}`; panel.classList.remove('hidden');
    if (key !== lastIncidentKey) {
      lastIncidentKey = key;
      if (incident.stage === 'scene') renderScene(incident);
      else if (incident.stage === 'claim') renderClaim(incident);
      else renderSettlement(incident);
      if (incident.stage !== 'settled') requestAnimationFrame(() => panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    }
    const feedback = el('incidentFeedback');
    if (feedback) feedback.textContent = pendingAction ? actionWaitMessage() : (incident.feedback || '先確認現場安全，再依序處理。');
    panel.querySelectorAll('[data-incident-action]').forEach(button => {
      const done = !!incident.actions?.[button.dataset.incidentAction];
      button.classList.toggle('done', done); button.setAttribute('aria-pressed', String(done));
      if (button.querySelector('.actionCheck')) button.querySelector('.actionCheck').textContent = done ? '✓ 已完成' : '處理';
    });
    if (el('sceneProgress')) el('sceneProgress').textContent = `${['secure','call','photo','documents'].filter(a => incident.actions?.[a]).length} / 4`;
  }
  function renderScene(incident) {
    const actions = [['secure','🚧','確認安全、警示後方'],['call','📞','查看傷者、通報處理'],['photo','📸','拍攝位置與車損'],['documents','📁','整理資料，自動結算']];
    el('incidentPanel').innerHTML = `<div class="incidentHeading"><h3>${incident.practice ? '🧰 處置演練（不扣款）' : '💥 處理事故現場'}</h3><b id="sceneProgress">0 / 4</b></div><p class="scenePrompt">先顧安全與救護，再留下紀錄。保障會自動分擔，其他同學繼續行車。</p><div class="sceneActions">${actions.map(([id,icon,label]) => `<button type="button" data-incident-action="${id}"><span class="toolIcon">${icon}</span><b>${label}</b><span class="actionCheck">處理</span></button>`).join('')}</div><details class="incidentDetails"><summary>補充現場資訊</summary><p>${esc(incident.context || '')}</p><button type="button" data-incident-action="witness">🙋 保留目擊者聯絡資料</button></details><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('incidentPanel').querySelectorAll('[data-incident-action]').forEach(button => button.onclick = () => sendAction(button.dataset.incidentAction));
  }
  function renderClaim(incident) {
    el('incidentPanel').innerHTML = '<h3>🛡️ 正在自動結算</h3><p class="scenePrompt">依出發前的保障分擔費用，不需要再選一次保險。</p><p id="incidentFeedback" class="incidentFeedback" role="status"></p>';
  }
  function renderSettlement(incident) {
    const settlement = incident.settlement || {};
    el('incidentPanel').innerHTML = `<div class="incidentHeading"><h3>✅ 已恢復行車</h3><button type="button" id="dismissReceipt">繼續任務 ✕</button></div><div class="receiptSummary"><span>保障分擔 <b>${money(settlement.insurancePaid)}</b></span><span>${incident.practice ? '演練自付（未扣款）' : '這次自付'} <strong>${money(settlement.outOfPocket)}</strong></span></div><details class="incidentDetails"><summary>查看明細</summary><div class="receiptRows">${(settlement.lines || []).map(line => `<div><b>${esc(line.label)}</b><span>保障 ${money(line.paid)} · 自付 ${money(line.selfPay)}</span></div>`).join('')}</div><p class="mutedNote">${esc(incident.learningNote || '')}</p></details><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('dismissReceipt').onclick = () => { dismissedReceipt = incident.id; el('incidentPanel').classList.add('hidden'); };
  }
  async function sendAction(action) {
    const incident = latestPlayer?.incident;
    if (!incident || incident.stage === 'settled' || !playerRef || finished() || roomStatus !== 'running' || pendingAction) return;
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingAction = id; actionSubmitted = false; actionRemaining = ACTION_TIMEOUT_MS; updateControls();
    if (el('incidentFeedback')) el('incidentFeedback').textContent = '處理中…';
    try {
      await playerRef.child('actionRequest').set({ id, incidentId: incident.id, action });
      if (pendingAction !== id) return;
      actionSubmitted = true; armActionTimeout(id);
    } catch (error) {
      if (pendingAction !== id) return;
      clearActionWait(); if (el('incidentFeedback')) el('incidentFeedback').textContent = '操作尚未送出，請檢查連線後重試。'; updateControls();
    }
  }
  return { mount, reset, render, renderSetup, setStatus, finished, canDrive, canAdjustSpeed };
})();
