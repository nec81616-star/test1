/* Student decisions stay compact; the host owns work income and automatic claims. */
window.StudentV8 = (() => {
  let roomStatus = 'waiting', playerStatus = 'ready', latestPlayer = null;
  let locked = false, pendingAction = null, actionTimer = null, lastIncidentKey = '', dismissedReceipt = '';
  let routePending = false;
  let renewal = null, renewalSelection = null, renewalPending = null, renewalSignature = '';
  const quote = (id, remainingMs = 300000) => game().premiumQuote(id, remainingMs);
  const ACTION_TIMEOUT_MS = 12000;
  let actionRemaining = ACTION_TIMEOUT_MS, actionDeadline = 0, actionSubmitted = false;
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('zh-TW');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el = id => document.getElementById(id);
  const game = () => window.RISK_GAME;
  const role = id => game().roleFor(id || state.role || 'office');
  const plan = id => game().planFor(id || state.insurancePlan || 'basic');
  const planLabels = { uninsured: ['不投保', '違規｜事故查驗會罰款'], basic: ['只保強制險', '保人身、不保財物'], complete: ['強制＋商業', '人傷＋雙方財損'] };
  const planLabel = id => planLabels[id] || planLabels.basic;
  const finished = () => ['finished', 'closed'].includes(roomStatus);
  const canDrive = () => !finished() && roomStatus === 'running' && playerStatus === 'driving';
  const canAdjustSpeed = () => canDrive() || (!finished() && roomStatus === 'waiting' && playerStatus === 'ready');

  function reset() {
    roomStatus = 'waiting'; playerStatus = 'ready'; latestPlayer = null; locked = false;
    clearActionWait(); clearRenewal(); lastIncidentKey = ''; dismissedReceipt = ''; routePending = false;
    el('incidentPanel').classList.add('hidden');
    renderSetup();
  }

  function mount() {
    renderSetup(); renderRoutes();
    el('walletPanel').innerHTML = '<div class="walletHeading"><span>💰 目前財產</span><small id="playerRank">等待發車</small></div><div class="walletGrid"><div><strong id="walletBalance"><span id="hScore">等待出發</span></strong></div><div><small>工作收入</small><b id="walletIncome">$0</b></div><div><small>事故扣款</small><b id="walletSelfPay">$0</b></div></div><p id="walletPlan" class="coverLine">出發前選保障，出事自動結算。</p><p id="walletFineNote" class="walletFineNote"></p>';
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
    target.innerHTML = `<div class="roleBudget"><span>${esc(selectedRole.name)}｜起始 ${money(selectedRole.startingWealth)}</span><small>每完成一站＋${money(selectedRole.stationIncome)} · 每站至少 ${selectedRole.workSeconds} 秒</small></div><h3>🛡️ 選擇本期保障，每5題續保</h3><div class="planCards">${Object.values(game().PLANS).map(p => `<button type="button" data-plan="${esc(p.id)}" class="planCard ${p.id === 'uninsured' ? 'uninsuredPlan' : ''} ${selectedPlan.id === p.id ? 'selected' : ''}" aria-pressed="${selectedPlan.id === p.id}" ${locked ? 'disabled' : ''}><span class="planName">${planLabel(p.id)[0]}${p.id === 'uninsured' ? '<em>未保強制險</em>' : ''}</span><strong>${money(quote(p.id))}</strong><span class="periodFee">每5題一期</span><small>${planLabel(p.id)[1]}</small></button>`).join('')}</div><div class="budgetPreview"><span>扣除保障費後出發財產</span><strong id="budgetRemaining">${money(selectedRole.startingWealth - quote(selectedPlan.id))}</strong></div><details class="setupDetails"><summary>保障怎麼分？</summary><p>「不投保」沒有強制險與財損保障，屬違規選擇；「只保強制險」保障符合條件的受害人人身，不包含車損；「強制＋商業」是本遊戲合併第三人財損、自己車損與駕駛人傷害保障的教學方案。單車自撞的駕駛本人受傷不屬自己強制險保障，須看駕駛人傷害等保障；實際商業保險依承保內容判斷。本遊戲在事故後查驗，未投保的模擬罰款為 ${money(game().UNINSURED_FINE)}；現實未投保也可能在其他情況查獲，法定處分依規定辦理。未投保不代表受害人沒有其他救濟途徑，但駕駛仍可能負賠償或追償責任。</p></details><h3>🧭 先選一條路</h3><div class="setupRoutes">${Object.values(game().ROUTES).map(r => `<button type="button" data-setup-route="${esc(r.id)}" class="routeCard ${state.routeChoice === r.id ? 'selected' : ''}" aria-pressed="${state.routeChoice === r.id}" title="${esc(r.description)}" ${locked ? 'disabled' : ''}><b>${esc(r.name)}</b><small>${esc(r.riskLabel)}</small></button>`).join('')}</div><p class="mutedNote">行車中可以改道；每完成5題重新選保障、繳本期保費。</p><p id="strategyError" class="inlineError" role="alert"></p>`;
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
  function actionWaitMessage() { return roomStatus === 'question' ? '全班答題中，結束後繼續處理。' : roomStatus === 'renewal' ? '全班續保中，老師繼續行車後恢復處理。' : '處理中…'; }
  function armActionTimeout(id) {
    if (pendingAction !== id || !actionSubmitted || roomStatus !== 'running') return;
    clearTimeout(actionTimer); actionDeadline = Date.now() + actionRemaining;
    actionTimer = setTimeout(() => {
      actionTimer = null; actionDeadline = 0;
      if (pendingAction !== id || ['question','renewal'].includes(roomStatus)) return;
      clearActionWait();
      if (el('incidentFeedback')) el('incidentFeedback').textContent = '尚未收到回應，請確認教師頁面仍開啟，再重試。';
      updateControls();
    }, actionRemaining);
  }
  function setStatus(status) {
    const previousStatus = roomStatus; roomStatus = status;
    if (finished()) {
      clearActionWait(); clearRenewal(); clearQuestionState(); el('incidentPanel').classList.add('hidden');
      if (el('routeStatus')) el('routeStatus').textContent = '本局已結束';
    } else if (['question','renewal'].includes(status) && pendingAction) {
      pauseActionTimeout(); if (el('incidentFeedback')) el('incidentFeedback').textContent = actionWaitMessage();
    } else if (status === 'running' && ['question','renewal'].includes(previousStatus) && pendingAction) {
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
    el('hScore').textContent = money(wallet.balance ?? selectedRole.startingWealth - quote(selectedPlan.id));
    el('walletIncome').textContent = money(wallet.missionIncome);
    el('walletSelfPay').textContent = money(Number(wallet.totalOutOfPocket || 0) + Number(wallet.totalFines || 0));
    el('walletFineNote').textContent = Number(wallet.totalFines || 0) > 0 ? `事故扣款含未投保模擬罰款 ${money(wallet.totalFines)}` : '';
    el('walletPlan').textContent = `🛡️ ${planLabel(selectedPlan.id)[0]}｜第 ${Number(player.policyPeriod || 1)} 期 · 每5題到期｜累計保費 ${money(wallet.premium)}`;
    el('walletBalance').classList.toggle('negative', Number(wallet.balance) < 0);
    const info = player.routeInfo || {}, eta = Number(info.etaSeconds);
    el('routeEstimate').textContent = `${info.name || selectedRoute.name}｜${Number.isFinite(eta) && eta > 0 ? `約 ${Math.ceil(eta)} 秒到站` : '留意路況'}${info.note?.includes('已選新路線') ? '｜下一路口改道' : ''}`;
    if (!finished()) el('routeStatus').textContent = roomStatus === 'renewal' ? '續保中，等待老師繼續' : canDrive() ? '下一路口生效' : (playerStatus === 'ready' ? '等待發車' : '處理事件中');
    renderIncident(player.incident); renderRenewal(); updateControls();
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
    renderInspection(incident);
    const feedback = el('incidentFeedback');
    if (feedback) feedback.textContent = pendingAction ? actionWaitMessage() : (incident.feedback || '先確認現場安全，再依序處理。');
    panel.querySelectorAll('[data-incident-action]').forEach(button => {
      const done = !!incident.actions?.[button.dataset.incidentAction];
      button.classList.toggle('done', done); button.setAttribute('aria-pressed', String(done));
      if (button.querySelector('.actionCheck')) button.querySelector('.actionCheck').textContent = done ? '✓ 已完成' : '處理';
    });
    if (el('sceneProgress')) el('sceneProgress').textContent = `${['secure','call','photo','documents'].filter(a => incident.actions?.[a]).length} / 4`;
  }
  function renderInspection(incident) {
    const target = el('insuranceInspection');
    if (!target) return;
    const inspection = incident.insuranceInspection;
    target.hidden = !inspection?.checked;
    if (!inspection?.checked) return;
    target.classList.toggle('violation', !!inspection.violation);
    if (inspection.violation) {
      target.textContent = incident.practice
        ? `🧰 演練查驗：未投保強制險；模擬罰款 ${money(inspection.simulatedFine || game().UNINSURED_FINE)}，本次未扣款。`
        : `⚠️ 事故查驗：未投保強制險${Number(inspection.fine || 0) > 0 ? `；模擬罰款 ${money(inspection.fine)} 已扣款。` : '。'}`;
    } else target.textContent = '✅ 事故查驗完成：已投保強制險，沒有未投保罰款。';
  }
  function incidentPolicy(incident) {
    const id = incident.coveragePlan || latestPlayer?.insurancePlan || 'basic';
    return `<p class="incidentPolicy">本次事故保障：<b>${esc(planLabel(game().planFor(id).id)[0])}</b>；續保只適用之後的新事故。</p>`;
  }
  function lossChips(incident) {
    const labels = {medical:'對方人損',ownMedical:'我方人損',thirdParty:'對方財損',ownDamage:'我方財損'};
    const keys = Object.keys(labels).filter(key => Number(incident[key] || 0) > 0);
    if (!keys.length) return '';
    return `<div class="lossChips" aria-label="本次事故損失">${keys.map(key => `<span class="lossChip ${key === 'medical' || key === 'ownMedical' ? 'injury' : 'property'}" data-loss-type="${key}"><b>${labels[key]}</b><strong>${money(incident[key])}</strong></span>`).join('')}</div>`;
  }
  function renderScene(incident) {
    const actions = [['secure','🚧','確認安全、警示後方'],['call','📞','查看傷者、通報並查驗保險'],['photo','📸','拍攝位置與車損'],['documents','📁','整理資料，自動結算']];
    el('incidentPanel').innerHTML = `<div class="incidentHeading"><h3>${incident.practice ? '🧰 處置演練（不扣款）' : esc(incident.title || '💥 處理事故現場')}</h3><b id="sceneProgress">0 / 4</b></div>${incidentPolicy(incident)}${lossChips(incident)}${incident.sceneSummary ? `<p class="sceneSummary">${esc(incident.sceneSummary)}</p>` : ''}<p class="scenePrompt">先顧安全與救護，再留下紀錄。通報處理時會查驗強制險，其他同學繼續行車。</p><p id="insuranceInspection" class="insuranceInspection" role="status" hidden></p><div class="sceneActions">${actions.map(([id,icon,label]) => `<button type="button" data-incident-action="${id}"><span class="toolIcon">${icon}</span><b>${label}</b><span class="actionCheck">處理</span></button>`).join('')}</div><details class="incidentDetails"><summary>補充現場資訊</summary><p>${esc(incident.context || '')}</p><button type="button" data-incident-action="witness">🙋 保留目擊者聯絡資料</button></details><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('incidentPanel').querySelectorAll('[data-incident-action]').forEach(button => button.onclick = () => sendAction(button.dataset.incidentAction));
  }
  function renderClaim(incident) {
    el('incidentPanel').innerHTML = '<h3>🛡️ 正在自動結算</h3><p class="scenePrompt">依事故發生時的保障結算；之後續保不會回溯變更本次事故。</p><p id="incidentFeedback" class="incidentFeedback" role="status"></p>';
  }
  function renderSettlement(incident) {
    const settlement = incident.settlement || {};
    const fine = Number(settlement.fine ?? incident.insuranceInspection?.fine ?? 0);
    const outOfPocket = Number(settlement.outOfPocket || 0);
    const total = Number(settlement.totalDeduction ?? outOfPocket + fine);
    el('incidentPanel').innerHTML = `<div class="incidentHeading"><h3>✅ 已恢復行車</h3><button type="button" id="dismissReceipt">繼續任務 ✕</button></div><p id="insuranceInspection" class="insuranceInspection" hidden></p>${incidentPolicy(incident)}${lossChips(incident)}<div class="receiptSummary"><span>保障分擔 <b>${money(settlement.insurancePaid)}</b></span><span>損失自付 <strong id="receiptOutOfPocket">${money(outOfPocket)}</strong></span>${fine > 0 ? `<span>未投保模擬罰款 <strong id="receiptFine">${money(fine)}</strong></span>` : ''}<span class="receiptTotal">${incident.practice ? '演練合計（未扣款）' : '本次合計扣款'} <strong id="receiptTotal">${money(total)}</strong></span></div><details class="incidentDetails"><summary>查看明細</summary><div class="receiptRows">${(settlement.lines || []).map(line => `<div><b>${esc(line.label)}</b><span>保障 ${money(line.paid)} · 自付 ${money(line.selfPay)}</span></div>`).join('')}</div><p class="mutedNote">${esc(incident.learningNote || '')}</p><p class="mutedNote">罰款為遊戲模擬，並非法定罰鍰報價；現實未投保也可能在事故以外查獲。</p></details><p id="incidentFeedback" class="incidentFeedback" role="status"></p>`;
    el('dismissReceipt').onclick = () => { dismissedReceipt = incident.id; el('incidentPanel').classList.add('hidden'); };
  }

  function clearRenewal() {
    renewal = null; renewalSelection = null; renewalPending = null; renewalSignature = '';
    if (el('renewalModal')) el('renewalModal').classList.add('hidden');
  }
  function setRenewal(value) {
    if (!value || finished()) { clearRenewal(); return; }
    if (!renewal || renewal.id !== value.id) {
      renewalSelection = null; renewalPending = null; renewalSignature = '';
    }
    renewal = value;
    renderRenewal();
  }
  function renderRenewal() {
    const modal = el('renewalModal');
    if (!modal || !renewal || finished() || roomStatus !== 'renewal') {
      if (modal) modal.classList.add('hidden');
      return;
    }
    modal.classList.remove('hidden');
    const receipt = latestPlayer?.renewalReceipt?.renewalId === renewal.id ? latestPlayer.renewalReceipt : null;
    if (receipt) renewalPending = null;
    const balance = game().getWealth(latestPlayer || {roleId:state.role, insurancePlan:state.insurancePlan});
    const fee = receipt ? Number(receipt.fee || 0) : renewalSelection === null ? null : quote(renewalSelection, renewal.remainingMs);
    const signature = JSON.stringify([renewal.id, renewal.period, renewal.completedQuestions, renewal.remainingMs,
      renewalSelection, renewalPending, receipt, balance]);
    if (signature === renewalSignature) return;
    renewalSignature = signature;
    const submitted = !!receipt, disabled = submitted || !!renewalPending;
    el('renewalContent').innerHTML = `<div class="renewalEyebrow">已完成 ${Number(renewal.completedQuestions || 0)} 題 · 第 ${Number(renewal.period || 2)} 期</div><h2 id="renewalTitle">🛡️ 保險到期，請重新選擇</h2><p class="renewalIntro">上一期保障已到期。選好後按確認，才會繳本期保費；續保不會改變先前事故的保障。</p><div class="planCards renewalPlans">${Object.values(game().PLANS).map(p => `<button type="button" data-renewal-plan="${esc(p.id)}" class="planCard ${p.id === 'uninsured' ? 'uninsuredPlan' : ''} ${renewalSelection === p.id ? 'selected' : ''}" aria-pressed="${renewalSelection === p.id}" ${disabled ? 'disabled' : ''}><span class="planName">${planLabel(p.id)[0]}</span><strong>${money(quote(p.id, renewal.remainingMs))}</strong><small>${planLabel(p.id)[1]}</small></button>`).join('')}</div><div class="renewalBudget"><span>目前財產 <b>${money(balance)}</b></span><span>${submitted ? '已繳保費' : '本次保費'} <strong id="renewalFee">${fee === null ? '請先選擇' : money(fee)}</strong></span><span>繳費後財產 <strong id="renewalBalanceAfter">${fee === null ? '—' : money(submitted ? balance : balance - fee)}</strong></span></div><p class="renewalNote">每5題重新選擇；局末不足一期時，依剩餘行車時間減收。若未確認，老師可讓你以「不投保」繼續。</p><button type="button" id="confirmRenewal" class="green" ${disabled || renewalSelection === null ? 'disabled' : ''}>${submitted ? '已完成，等待老師繼續' : renewalPending ? '正在送出…' : '確認本期保障並繳費'}</button><p id="renewalStatus" class="renewalStatus" role="status">${submitted ? `已記錄「${esc(planLabel(game().planFor(receipt.planId).id)[0])}」，本次保費 ${money(receipt.fee)}。等待老師繼續行車。` : renewalPending ? '已送出，等待教師端確認；請勿重複送出。' : '請選擇本期保障，尚未扣款。'}</p>`;
    modal.querySelectorAll('[data-renewal-plan]').forEach(button => button.onclick = () => {
      if (roomStatus !== 'renewal' || receipt || renewalPending) return;
      renewalSelection = button.dataset.renewalPlan; renderRenewal();
    });
    el('confirmRenewal').onclick = confirmRenewal;
  }
  async function confirmRenewal() {
    if (!renewal || roomStatus !== 'renewal' || finished() || renewalSelection === null || renewalPending || !playerRef || latestPlayer?.renewalReceipt?.renewalId === renewal.id) return;
    const renewalId = renewal.id;
    const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    renewalPending = requestId; renderRenewal();
    try {
      await playerRef.child('renewalRequest').set({id:requestId,renewalId,planId:renewalSelection});
    } catch (error) {
      if (renewal?.id !== renewalId || renewalPending !== requestId) return;
      renewalPending = null; renewalSignature = ''; renderRenewal();
      el('renewalStatus').textContent = '續保尚未送出，請確認連線後重試；尚未扣款。';
    }
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
  return { mount, reset, render, renderSetup, setStatus, setRenewal, finished, canDrive, canAdjustSpeed, inRenewal: () => roomStatus === 'renewal' };
})();
