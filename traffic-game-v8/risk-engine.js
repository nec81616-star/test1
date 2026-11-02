/* Shared simulation rules; independent of Firebase and the DOM. */
(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.RISK_GAME = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const START_BUDGET = 10000;
  const PLANS = Object.freeze({
    basic: Object.freeze({ id: 'basic', name: '基本保障', premium: 0, thirdPartyLimit: 0, ownLimit: 0,
      description: '已含強制險基本人身保障；第三人財損與自己車損留用備用金負擔。' }),
    liability: Object.freeze({ id: 'liability', name: '保對方', premium: 1200, thirdPartyLimit: 30000, ownLimit: 0,
      description: '基本保障＋第三人財損保障；自己的修車費仍需自行負擔。' }),
    complete: Object.freeze({ id: 'complete', name: '保雙方', premium: 2800, thirdPartyLimit: 30000, ownLimit: 15000,
      description: '基本保障＋第三人財損＋自己車損保障；出發時可用資金較少。' }),
  });
  // Calibrated against 300s of active driving over all 12 map spawn slots.
  // Lower starting wealth trades off against faster work and higher earnings.
  const ROLES = Object.freeze(Object.fromEntries([
    ['office', '上班族', 10000, 430, 18, '本金中等、工作節奏穩定'],
    ['delivery', '外送員', 6000, 530, 12, '本金較少、接單與收入較快'],
    ['caregiver', '家庭照顧者', 11000, 500, 26, '本金較多、每趟工作較久'],
    ['sales', '業務人員', 8000, 670, 22, '本金較少、單次報酬較高'],
    ['student', '學生', 6500, 510, 14, '本金較少、短程工作累積快'],
    ['public', '教師／公務人員', 10500, 500, 24, '本金較多、收入步調較慢'],
  ].map(([id, name, startingWealth, stationIncome, workSeconds, description]) =>
    [id, Object.freeze({ id, name, startingWealth, stationIncome, workSeconds, description })])));
  const ROUTES = Object.freeze({
    main: Object.freeze({ id: 'main', name: '城市幹道', description: '優先走幹道，視野較清楚；壅塞時會拖慢行程。', riskLabel: '較低風險・可能壅塞' }),
    shortcut: Object.freeze({ id: 'shortcut', name: '穿越巷道', description: '優先利用中央巷道縮短路程；路口密集，雨天更需減速。', riskLabel: '較高風險・距離較短' }),
    school: Object.freeze({ id: 'school', name: '慢行路線', description: '行經路口採取較慢步調，保留反應時間；抵達時間較長。', riskLabel: '較低風險・慢行' }),
  });
  const ACTIONS = Object.freeze({
    secure: '確認安全並設置警示', call: '查看傷者並通報救護、報警',
    photo: '拍攝車位、路況與車損', witness: '保留目擊者聯絡資料', documents: '整理事故與就醫、修車文件',
  });
  function planFor(id) { return Object.hasOwn(PLANS, id) ? PLANS[id] : PLANS.basic; }
  function routeFor(id) { return Object.hasOwn(ROUTES, id) ? ROUTES[id] : ROUTES.main; }
  function roleFor(id) { return Object.hasOwn(ROLES, id) ? ROLES[id] : ROLES.office; }
  function newWallet(planId, roleId) {
    const plan = planFor(planId);
    const role = roleFor(roleId);
    return { initialAssets: role.startingWealth, balance: role.startingWealth - plan.premium, premium: plan.premium,
      totalOutOfPocket: 0, missionIncome: 0, insurancePaid: 0 };
  }
  function getWealth(player) {
    const value = player?.wallet?.balance;
    return typeof value === 'number' && Number.isFinite(value)
      ? value : newWallet(player?.insurancePlan, player?.roleId).balance;
  }
  function createIncident(id, kind, player) {
    const solo = kind === 'overspeed';
    return { id: String(id), kind: solo ? 'overspeed' : 'collision',
      title: solo ? '超速擦撞護欄' : '路口碰撞：處理現場與損失',
      stage: 'scene', actions: {}, feedback: '先確認現場安全，再查看傷者與通報。',
      medical: solo ? 0 : 2000, thirdParty: solo ? 1500 : 3000,
      ownDamage: player?.vehicleType === 'moto' ? 1500 : 3500,
      context: solo
        ? '本次模擬無人受傷；護欄為第三人財物，自己的車損須另行處理。'
        : '本案例假設你對碰撞負賠償責任，對方傷者符合強制險醫療給付條件，且各項損失符合選定任意保障的承保條件。',
      learningNote: '金額與保費為遊戲設定。實際給付依法律、事故責任及契約條件判斷。',
    };
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function act(input, action) {
    const incident = copy(input);
    const reject = message => ({ ok: false, incident: { ...incident, feedback: message }, message });
    if (incident.stage !== 'scene') return reject('現場處理已完成，請檢視損失與保障。');
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) return reject('找不到這個現場操作。');
    const actions = incident.actions || {};
    if (actions[action]) return reject('這一步已完成，資料已保留，不需要重複操作。');
    if (action !== 'secure' && !actions.secure) return reject('現場尚未確認安全；請先確認安全並設置警示。');
    if (['photo', 'witness', 'documents'].includes(action) && !actions.call)
      return reject('請先查看傷者並通報，不要為了蒐證延誤救護。');
    if (action === 'documents' && !actions.photo) return reject('還缺少現場照片，請先拍攝事故位置與車損。');
    incident.actions = { ...actions, [action]: true };
    if (action === 'documents') {
      incident.stage = 'claim';
      incident.feedback = '文件已備妥。分開檢視人身、第三人財損與自己車損，再安排支付來源。';
    } else if (action === 'witness') {
      incident.feedback = '目擊者聯絡資訊已保存，可協助釐清經過；這不會自動改變責任或保險給付。';
    } else {
      incident.feedback = `${ACTIONS[action]}：已完成。`;
    }
    return { ok: true, incident, message: incident.feedback };
  }
  function settle(input, planId, allocations) {
    const incident = copy(input);
    const reject = message => ({ ok: false, incident: { ...incident, feedback: message }, message });
    if (incident.stage !== 'claim') return reject(incident.stage === 'settled' ? '本次事件已結算，不能重複請款。' : '請先完成安全、通報、蒐證與文件整理。');
    const plan = planFor(planId);
    const items = [
      { key: 'medical', label: '對方傷者醫療', source: 'compulsory', limit: 200000, available: true },
      { key: 'thirdParty', label: '第三人財物損害', source: 'liability', limit: plan.thirdPartyLimit, available: plan.thirdPartyLimit > 0 },
      { key: 'ownDamage', label: '自己車輛修復', source: 'own', limit: plan.ownLimit, available: plan.ownLimit > 0 },
    ];
    const lines = [];
    for (const item of items) {
      const amount = input[item.key];
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return reject('損失資料不完整，請老師協助檢查。');
      let source = allocations?.[item.key];
      if (!amount) source = 'self';
      if (source !== 'self' && source !== item.source)
        return reject(`${item.label}不能使用這項保障支付，請重新檢視人身與財物的差別。`);
      if (source !== 'self' && !item.available)
        return reject(`出發前未配置${item.label}保障；本次需要以備用金支付，不能事後加保。`);
      const paid = source === 'self' ? 0 : Math.min(amount, item.limit);
      lines.push({ key: item.key, label: item.label, amount, source, paid, selfPay: amount - paid });
    }
    const totalLoss = lines.reduce((sum, line) => sum + line.amount, 0);
    const insurancePaid = lines.reduce((sum, line) => sum + line.paid, 0);
    const settlement = { totalLoss, insurancePaid, outOfPocket: totalLoss - insurancePaid, lines };
    incident.stage = 'settled';
    incident.settlement = settlement;
    incident.feedback = `結算完成：保障分擔 $${insurancePaid.toLocaleString()}，自行負擔 $${settlement.outOfPocket.toLocaleString()}。`;
    return { ok: true, incident, settlement, message: incident.feedback };
  }
  function settleAuto(incident, planId) {
    const plan = planFor(planId);
    return settle(incident, plan.id, {
      medical: 'compulsory',
      thirdParty: plan.thirdPartyLimit > 0 ? 'liability' : 'self',
      ownDamage: plan.ownLimit > 0 ? 'own' : 'self',
    });
  }
  return Object.freeze({ VERSION: '8.1', START_BUDGET, PLANS, ROUTES, ROLES, ACTIONS, planFor, routeFor, roleFor, getWealth, newWallet, createIncident, act, settle, settleAuto });
});
