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

test('coverage choices have an upfront budget tradeoff and no hidden wallet mutation', () => {
  assert.equal(rules.newWallet('basic').balance, 10000);
  assert.equal(rules.newWallet('liability').balance, 8800);
  assert.equal(rules.newWallet('complete').balance, 7200);
  for (const plan of Object.values(rules.PLANS)) {
    const wallet = rules.newWallet(plan.id);
    assert.equal(wallet.balance + wallet.premium, rules.START_BUDGET);
    assert.equal(wallet.totalOutOfPocket, 0);
    assert.equal(wallet.insurancePaid, 0);
  }
  const original = rules.newWallet('complete');
  const later = rules.newWallet('complete');
  later.balance = -100;
  assert.equal(original.balance, 7200);
});

test('unknown plan and route identifiers cannot select inherited object properties', () => {
  for (const invalid of ['missing', '__proto__', 'constructor', 'toString']) {
    assert.equal(rules.planFor(invalid).id, 'basic');
    assert.equal(rules.routeFor(invalid).id, 'main');
    assert.equal(rules.newWallet(invalid).balance, 10000);
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
  const liability = rules.settle(incident, 'liability', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'self' });
  const complete = rules.settle(incident, 'complete', { medical: 'compulsory', thirdParty: 'liability', ownDamage: 'own' });
  for (const result of [basic, liability, complete]) {
    assert.equal(result.ok, true);
    assert.equal(result.incident.stage, 'settled');
    assert.equal(result.settlement.totalLoss, result.settlement.insurancePaid + result.settlement.outOfPocket);
    for (const line of result.settlement.lines) assert.equal(line.amount, line.paid + line.selfPay);
  }
  assert.equal(basic.settlement.outOfPocket, 6500);
  assert.equal(liability.settlement.outOfPocket, 3500);
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
  const result = rules.settle(incident, 'liability', { thirdParty: 'liability', ownDamage: 'self' });
  assert.equal(result.ok, true);
  assert.equal(result.settlement.outOfPocket, 1500);
  for (const bad of [-1, 1.5, Infinity, 'not a number']) {
    assert.equal(rules.settle({ ...incident, ownDamage: bad }, 'complete', { thirdParty: 'liability', ownDamage: 'own' }).ok, false);
  }
});
