/* Shared simulation rules; independent of Firebase and the DOM. */
(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.RISK_GAME = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const START_BUDGET = 10000;
  const ROUND_ACTIVE_MS = 300000;
  const POLICY_PERIOD_MS = 125000; // Five questions at the minimum 25s interval.
  const UNINSURED_FINE = 3000; // Game currency; not a statutory fine schedule.
  const PLANS = Object.freeze({
    uninsured: Object.freeze({ id: 'uninsured', name: '不投保（違規）', premium: 0, referencePremium: 0, compulsory: false, thirdPartyLimit: 0, ownLimit: 0, ownMedicalLimit: 0,
      description: '省保費；事故處理時查驗未投保，扣模擬罰款，損失仍需自行負擔。' }),
    basic: Object.freeze({ id: 'basic', name: '只保強制險', premium: 250, referencePremium: 600, compulsory: true, thirdPartyLimit: 0, ownLimit: 0, ownMedicalLimit: 0,
      description: '提供符合條件的人身保障，不賠車損與財物損失。' }),
    complete: Object.freeze({ id: 'complete', name: '強制＋商業', premium: 750, referencePremium: 1800, compulsory: true, thirdPartyLimit: 30000, ownLimit: 15000, ownMedicalLimit: 20000,
      description: '本教學方案含強制險、第三人財損、自己車損及另列的駕駛人傷害保障。' }),
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
  function premiumQuote(planId, remainingMs = ROUND_ACTIVE_MS) {
    const remaining = typeof remainingMs === 'number' && Number.isFinite(remainingMs)
      ? Math.min(ROUND_ACTIVE_MS, Math.max(0, remainingMs)) : ROUND_ACTIVE_MS;
    return Math.ceil(planFor(planId).referencePremium * Math.min(POLICY_PERIOD_MS, remaining) / ROUND_ACTIVE_MS);
  }
  function newWallet(planId, roleId) {
    const plan = planFor(planId);
    const role = roleFor(roleId);
    const premium = premiumQuote(plan.id);
    return { initialAssets: role.startingWealth, balance: role.startingWealth - premium, premium,
      totalOutOfPocket: 0, totalFines: 0, missionIncome: 0, insurancePaid: 0 };
  }
  function inspectionFor(planId, practice = false) {
    const hasCompulsory = planFor(planId).compulsory;
    const simulatedFine = hasCompulsory ? 0 : UNINSURED_FINE;
    const fine = practice ? 0 : simulatedFine;
    return { checked: true, hasCompulsory, violation: !hasCompulsory, fine, simulatedFine,
      note: hasCompulsory ? '事故查驗：已投保強制險，沒有未投保罰款。'
        : practice ? '演練查驗：未投保強制險；正式事故將扣模擬罰款，本次不扣款。'
          : `事故查驗：未投保強制險，扣模擬罰款 $${UNINSURED_FINE.toLocaleString()}。` };
  }
  function getWealth(player) {
    const value = player?.wallet?.balance;
    return typeof value === 'number' && Number.isFinite(value)
      ? value : newWallet(player?.insurancePlan, player?.roleId).balance;
  }
  const LOSS_TYPES = Object.freeze({
    medical: '對方人損', ownMedical: '我方人損', thirdParty: '對方財損', ownDamage: '我方財損',
  });
  function createIncident(id, kind, player, options = {}) {
    const rng = typeof options.rng === 'function' ? options.rng : Math.random;
    const draw = () => {
      const value = Number(rng());
      return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : .5;
    };
    const keys = Object.keys(LOSS_TYPES);
    const mask = 1 + Math.floor(draw() * 15);
    const lossTypes = options.lossKeys === undefined
      ? keys.filter((key, index) => mask & (1 << index))
      : keys.filter(key => options.lossKeys.includes(key));
    if (!lossTypes.length) throw new Error('事故至少需要一類有效損失。');
    const amounts = {};
    const ranges = { medical: [1000, 500, 5], ownMedical: [1500, 500, 6],
      thirdParty: [1000, 500, 6], ownDamage: player?.vehicleType === 'moto' ? [500, 250, 9] : [1000, 500, 7] };
    for (const key of keys) {
      if (!lossTypes.includes(key)) { amounts[key] = 0; continue; }
      const [minimum, step, count] = ranges[key];
      const value = options.amounts?.[key] ?? minimum + step * Math.floor(draw() * count);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('事故損失必須是正整數。');
      amounts[key] = value;
    }
    const incidentKind = ['overspeed', 'self'].includes(kind) ? kind : 'collision';
    const otherAffected = amounts.medical > 0 || amounts.thirdParty > 0;
    const cause = incidentKind === 'overspeed' ? '車速過快失控'
      : incidentKind === 'self' ? '行經路面異物，突發打滑偏離原路線' : '通行時發生碰撞';
    return { id: String(id), kind: incidentKind,
      title: incidentKind === 'overspeed' ? '超速失控事故' : incidentKind === 'self' ? '突發自失控事故' : '路口碰撞事故',
      stage: 'scene', actions: {}, feedback: '先確認現場安全，再查看傷者與通報。',
      ...amounts, lossTypes,
      sceneSummary: `${cause}，${otherAffected ? '波及他人或他人財物' : '未波及第三人'}。本次損失：${lossTypes.map(key => LOSS_TYPES[key]).join('、')}。`,
      context: '本案例以我方應負費用作教學結算，假設所列對方損失有應負的賠償責任。自己的強制險不給付單車自撞駕駛本人的傷害；第三方案另列駕駛人傷害保障。若涉及對方車輛、其他保險或法定補償，仍須另外判斷請求途徑，本帳本不另計那些給付。',
      learningNote: '保費與損失為遊戲設定。第三方案的駕駛人傷害保障為明列的教學組合，不代表所有商業險都含這項保障；實際依法律、身分、責任及契約條件判斷。',
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
      { key: 'medical', label: '對方傷者醫療', source: 'compulsory', limit: 200000, available: plan.compulsory },
      { key: 'ownMedical', label: '我方駕駛人傷害', source: 'driver', limit: plan.ownMedicalLimit, available: plan.ownMedicalLimit > 0 },
      { key: 'thirdParty', label: '第三人財物損害', source: 'liability', limit: plan.thirdPartyLimit, available: plan.thirdPartyLimit > 0 },
      { key: 'ownDamage', label: '自己車輛修復', source: 'own', limit: plan.ownLimit, available: plan.ownLimit > 0 },
    ];
    const lines = [];
    for (const item of items) {
      const amount = item.key === 'ownMedical' && input.ownMedical === undefined ? 0 : input[item.key];
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
      medical: plan.compulsory ? 'compulsory' : 'self',
      ownMedical: plan.ownMedicalLimit > 0 ? 'driver' : 'self',
      thirdParty: plan.thirdPartyLimit > 0 ? 'liability' : 'self',
      ownDamage: plan.ownLimit > 0 ? 'own' : 'self',
    });
  }
  return Object.freeze({ VERSION: '8.4', START_BUDGET, ROUND_ACTIVE_MS, POLICY_PERIOD_MS, UNINSURED_FINE, PLANS, ROUTES, ROLES, LOSS_TYPES, ACTIONS, planFor, routeFor, roleFor, premiumQuote, getWealth, newWallet, inspectionFor, createIncident, act, settle, settleAuto });
});
