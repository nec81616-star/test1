const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../risk-engine.js');

function claim(kind = 'collision', vehicleType = 'car') {
  let incident = rules.createIncident('case-1', kind, { vehicleType });
  for (const action of ['secure', 'call', 'photo', 'documents']) {
    const result = rules.act(incident, action);
    assert.equal(result.ok, true, action);
    incident = result.incident;
  }
  return incident;
}
function freeze(value) {
  Object.freeze(value);
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return value;
}

test('role economy and insurance create upfront tradeoffs without mutating other wallets', () => {
  const roles = Object.values(rules.ROLES);
  assert.equal(roles.length, 6);
  assert.ok(new Set(roles.map(role => role.startingWealth)).size >= 4);
  assert.ok(new Set(roles.map(role => role.stationIncome / role.workSeconds)).size >= 4);
  for (const role of roles) for (const plan of Object.values(rules.PLANS)) {
    const wallet = rules.newWallet(plan.id, role.id);
    assert.equal(wallet.initialAssets, role.startingWealth);
    assert.equal(wallet.balance + wallet.premium, role.startingWealth);
    assert.equal(wallet.premium, plan.premium);
    assert.equal(wallet.totalOutOfPocket, 0);
    assert.equal(wallet.totalFines, 0);
    assert.equal(wallet.insurancePaid, 0);
    assert.ok(Number.isSafeInteger(role.stationIncome) && role.stationIncome > 0);
    assert.ok(role.workSeconds >= 9);
  }
  const original = rules.newWallet('complete', 'student');
  const later = rules.newWallet('complete', 'student');
  later.balance = -100;
  assert.equal(original.balance, rules.roleFor('student').startingWealth - rules.planFor('complete').premium);
});

test('property ranking values preserve zero and debt and ignore legacy points', () => {
  assert.equal(rules.getWealth({ wallet: { balance: 0 }, score: 99999 }), 0);
  assert.equal(rules.getWealth({ wallet: { balance: -250 }, score: 99999 }), -250);
  assert.equal(rules.getWealth({ wallet: { balance: 9000 }, score: 0 }), 9000);
  assert.equal(rules.getWealth({ roleId: 'student', insurancePlan: 'complete' }), rules.newWallet('complete', 'student').balance);
});

test('unknown plan and route identifiers cannot select inherited object properties', () => {
  for (const invalid of ['missing', '__proto__', 'constructor', 'toString']) {
    assert.equal(rules.planFor(invalid).id, 'basic');
    assert.equal(rules.routeFor(invalid).id, 'main');
    assert.equal(rules.newWallet(invalid).balance, rules.roleFor('office').startingWealth - rules.planFor('basic').premium);
    assert.equal(rules.roleFor(invalid).id, 'office');
  }
});

test('accident actions enforce safety and rescue before evidence, and documents before claims', () => {
  const initial = freeze(rules.createIncident('case-1', 'collision', { vehicleType: 'car' }));
  assert.equal(rules.act(initial, 'photo').ok, false);
  assert.equal(rules.act(initial, 'call').ok, false);
  assert.equal(rules.settle(initial, 'complete', {}).ok, false);
  const safe = rules.act(initial, 'secure');
  assert.equal(safe.ok, true);
  assert.deepEqual(initial.actions, {}, 'actions must not mutate source snapshots');
  assert.equal(rules.act(safe.incident, 'documents').ok, false);
  const called = rules.act(safe.incident, 'call');
  assert.equal(rules.act(called.incident, 'documents').ok, false);
  const photographed = rules.act(called.incident, 'photo');
  const witnessed = rules.act(photographed.incident, 'witness');
  assert.equal(witnessed.ok, true);
  const ready = rules.act(witnessed.incident, 'documents');
  assert.equal(ready.incident.stage, 'claim');
  assert.equal(rules.act(ready.incident, 'secure').ok, false);
});

test('duplicate and unknown scene actions are rejected without advancing the incident', () => {
  const initial = rules.createIncident('case-1', 'collision', {});
  const secured = rules.act(initial, 'secure').incident;
  assert.equal(rules.act(secured, 'secure').ok, false);
  assert.equal(rules.act(secured, 'invented-action').ok, false);
  assert.deepEqual(secured.actions, { secure: true });
  assert.equal(secured.stage, 'scene');
});

test('human injury and different property losses cannot use the wrong coverage', () => {
  const incident = freeze(claim());
  const invalidMedical = rules.settle(incident, 'complete', { medical: 'own', thirdParty: 'liability', ownDamage: 'own' });
  assert.equal(invalidMedical.ok, false);
  const uninsuredProperty = rules.settle(incident, 'basic', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'self' });
  assert.equal(uninsuredProperty.ok, false, 'cannot retroactively use optional coverage');
  const invalidOwn = rules.settle(incident, 'complete', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'compulsory' });
  assert.equal(invalidOwn.ok, false);
  assert.equal(incident.stage, 'claim');
  assert.equal(incident.settlement, undefined);
});

test('same incident produces distinct, arithmetically balanced losses under different preselected plans', () => {
  const incident = freeze(claim());
  const basic = rules.settle(incident, 'basic', { medical: 'compulsory', thirdParty: 'self', ownDamage: 'self' });
  const uninsured = rules.settle(incident, 'uninsured', { medical: 'self', thirdParty: 'self', ownDamage: 'self' });
  const complete = rules.settle(incident, 'complete', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'own' });
  for (const result of [uninsured, basic, complete]) {
    assert.equal(result.ok, true);
    assert.equal(result.incident.stage, 'settled');
    assert.equal(result.settlement.totalLoss, result.settlement.insurancePaid + result.settlement.outOfPocket);
    for (const line of result.settlement.lines) assert.equal(line.amount, line.paid + line.selfPay);
  }
  assert.equal(basic.settlement.outOfPocket, 6500);
  assert.equal(uninsured.settlement.outOfPocket, 8500);
  assert.equal(complete.settlement.outOfPocket, 0);
  assert.equal(incident.stage, 'claim', 'settling one plan must not alter the source case');
});

test('coverage limits leave excess losses with the player and duplicate settlement is rejected', () => {
  const incident = claim();
  Object.assign(incident, { medical: 210000, thirdParty: 40000, ownDamage: 20000 });
  const result = rules.settle(incident, 'complete', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'own' });
  assert.equal(result.ok, true);
  assert.equal(result.settlement.insurancePaid, 245000);
  assert.equal(result.settlement.outOfPocket, 25000);
  const duplicate = rules.settle(result.incident, 'complete', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'own' });
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.incident.settlement, result.settlement);
});

test('uninjured overspeed cases allow zero medical loss; malformed financial input cannot settle', () => {
  const incident = claim('overspeed', 'moto');
  assert.equal(incident.medical, 0);
  assert.equal(incident.ownDamage, 1500);
  const result = rules.settle(incident, 'basic', { thirdParty: 'self', ownDamage: 'self' });
  assert.equal(result.ok, true);
  assert.equal(result.settlement.outOfPocket, 3000);
  for (const bad of [-1, 1.5, Infinity, 'not a number']) {
    assert.equal(rules.settle({ ...incident, ownDamage: bad }, 'complete', { thirdParty: 'liability', ownDamage: 'own' }).ok, false);
  }
});


test('automatic claims select only purchased coverage without insurance form input', () => {
  const incident = freeze(claim());
  for (const [plan, amount] of [['uninsured', 8500], ['basic', 6500], ['complete', 0]]) {
    const result = rules.settleAuto(incident, plan);
    assert.equal(result.ok, true);
    assert.equal(result.incident.stage, 'settled');
    assert.equal(result.settlement.outOfPocket, amount);
    assert.equal(result.settlement.totalLoss, result.settlement.outOfPocket + result.settlement.insurancePaid);
    assert.equal(rules.settleAuto(result.incident, plan).ok, false, 'already settled claims cannot pay twice');
  }
  assert.equal(incident.stage, 'claim');
  assert.equal(rules.settleAuto(rules.createIncident('fresh', 'collision', {}), 'complete').ok, false);
});


test('the three insurance choices distinguish compulsory cover and property cover', () => {
  assert.deepEqual(Object.keys(rules.PLANS), ['uninsured', 'basic', 'complete']);
  assert.equal(rules.planFor('uninsured').premium, 0);
  assert.equal(rules.planFor('uninsured').compulsory, false);
  assert.equal(rules.planFor('basic').premium, 600);
  assert.equal(rules.planFor('basic').compulsory, true);
  assert.equal(rules.planFor('basic').thirdPartyLimit, 0);
  assert.equal(rules.planFor('basic').ownLimit, 0);
  assert.equal(rules.planFor('complete').premium, 1800);
  assert.equal(rules.planFor('complete').compulsory, true);
  const result = rules.settle(claim(), 'uninsured', { medical: 'compulsory', thirdParty: 'self', ownDamage: 'self' });
  assert.equal(result.ok, false, 'uninsured drivers cannot claim nonexistent compulsory cover');
});

test('accident inspection applies a clearly simulated uninsured fine and never charges rehearsals', () => {
  const uninsured = rules.inspectionFor('uninsured');
  assert.equal(uninsured.checked, true);
  assert.equal(uninsured.hasCompulsory, false);
  assert.equal(uninsured.violation, true);
  assert.equal(uninsured.fine, 3000);
  assert.equal(uninsured.simulatedFine, 3000);
  assert.match(uninsured.note, /模擬/);
  for (const id of ['basic', 'complete']) {
    const inspection = rules.inspectionFor(id);
    assert.equal(inspection.hasCompulsory, true);
    assert.equal(inspection.violation, false);
    assert.equal(inspection.fine, 0);
  }
  const rehearsal = rules.inspectionFor('uninsured', true);
  assert.equal(rehearsal.violation, true, 'the teaching scenario still identifies missing cover');
  assert.equal(rehearsal.fine, 0, 'a rehearsal cannot remove real game wealth');
  assert.equal(rehearsal.simulatedFine, 3000);
  const initial = rules.newWallet('uninsured', 'office');
  rules.inspectionFor('uninsured');
  assert.equal(initial.balance, initial.initialAssets, 'pure inspection rules cannot mutate a wallet');
});
