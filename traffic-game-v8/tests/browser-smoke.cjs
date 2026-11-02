/* Run against python3 -m http.server 8010 from the project directory.
   Uses local demo transport only: it never accesses the configured Firebase. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ARTIFACTS = path.resolve(__dirname, '..', 'artifacts');
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8010';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], remote = [];
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== BASE) { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const host = await context.newPage();
  try {
    await host.goto(`${BASE}/teacher.html?demo=1`);
    await host.waitForFunction(() => window.GAME_RUNTIME_READY && typeof auth !== 'undefined' && auth.currentUser);
    await host.locator('#roomInput').fill('2486');
    await host.locator('#createBtn').click();
    await host.waitForFunction(() => room === '2486' && !!roomRef);
    assert.match(await host.evaluate(() => studentInviteUrl()), /demo=1/);
    console.log('PASS: local teacher lobby and demo invitation');

    async function addStudent(name, plan, role) {
      const p = await context.newPage();
      await p.goto(`${BASE}/student.html?demo=1&room=2486`);
      await p.waitForFunction(() => window.GAME_RUNTIME_READY && typeof uid !== 'undefined' && !!uid);
      await p.locator('#nameInput').fill(name);
      await p.locator('#joinBtn').click();
      await p.locator('#setup').waitFor({state:'visible'});
      await p.locator('.vehicle button[data-v="car"]').click();
      await p.locator('#toRole').click();
      await p.locator(`.role button[data-r="${role}"]`).click();
      await p.locator('#toScenario').click();
      await p.locator('#drawBtn').click();
      await p.locator('#speedInput').fill('30');
      await p.locator(`[data-plan="${plan}"]`).click();
      await p.locator('[data-setup-route="shortcut"]').click();
      await p.locator('#readyBtn').click();
      await p.locator('#waitBox').waitFor({state:'visible'});
      return p;
    }
    const student = await addStudent('小安', 'liability', 'office');
    const other = await addStudent('小晴', 'complete', 'student');
    const id = await student.evaluate(() => uid), otherId = await other.evaluate(() => uid);
    assert.notEqual(id, otherId);
    const beforeStart = await host.evaluate(() => roundSerial);
    await host.evaluate(() => { document.getElementById('startBtn').onclick(); document.getElementById('startBtn').onclick(); });
    await student.locator('#liveBox').waitFor({state:'visible'});
    await host.evaluate(() => { Math.random = () => 0.99; });
    await student.waitForFunction(() => document.getElementById('walletBalance').textContent === '$8,800');
    assert.equal(await other.locator('#walletBalance').innerText(), '$7,200');
    assert.equal(await host.evaluate(() => roundSerial), beforeStart + 1);
    assert.equal(await host.locator('#createBtn').isDisabled(), true);
    console.log('PASS: two students join, select plans, and pay premium at departure');

    await student.locator('[data-live-route="school"]').click();
    await host.waitForFunction(id => players[id].routeChoice === 'school', id);
    const differentPaths = await host.evaluate(id => {
      const a = {id, stops:[{node:'J'}],stage:0};
      players[id].routeChoice = 'main'; const main = nextMissionStep(a,'H','C');
      players[id].routeChoice = 'shortcut'; const shortcut = nextMissionStep(a,'H','C');
      players[id].routeChoice = 'school';
      return {main,shortcut};
    }, id);
    assert.notEqual(differentPaths.main, differentPaths.shortcut);
    console.log('PASS: route request reaches teacher and changes actual pathfinding');

    // A personal incident must not pause the room or another student.
    await host.evaluate(id => beginPersonalIncident(id,'collision',false), id);
    await student.locator('[data-incident-action="secure"]').waitFor({state:'visible'});
    assert.equal(await host.evaluate(() => paused), false);
    assert.equal(await host.evaluate(id => players[id].status, otherId), 'driving');
    await student.locator('[data-incident-action="photo"]').click();
    await student.waitForFunction(() => document.getElementById('incidentFeedback').textContent.includes('尚未確認安全'));
    for (const action of ['secure','call','photo','witness','documents']) {
      await student.locator(`[data-incident-action="${action}"]`).click();
      if (action !== 'documents') await student.waitForFunction(action => document.querySelector(`[data-incident-action="${action}"]`).getAttribute('aria-pressed') === 'true', action);
    }
    await student.locator('#claim-medical').waitFor({state:'visible'});
    await student.locator('#claim-medical').selectOption('compulsory');
    await student.locator('#claim-thirdParty').selectOption('liability');
    await student.locator('#claim-ownDamage').selectOption('own');
    await student.locator('#settleIncident').click();
    await student.waitForFunction(() => document.getElementById('incidentFeedback').textContent.includes('未配置'));
    assert.equal(await student.locator('#claim-medical').inputValue(), 'compulsory');
    await student.locator('#claim-ownDamage').selectOption('self');
    await student.locator('#settleIncident').click();
    await host.waitForFunction(id => players[id].incident?.stage === 'settled', id);
    const settled = await host.evaluate(id => players[id], id);
    assert.equal(settled.wallet.totalOutOfPocket, 3500);
    assert.equal(settled.wallet.insurancePaid, 5000);
    assert.equal(settled.wallet.balance, 10000 - 1200 + settled.wallet.missionIncome - 3500);
    assert.equal(settled.status, 'driving');
    const before = settled.wallet.balance;
    await student.evaluate(async () => { const p = (await playerRef.once('value')).val(); await playerRef.child('actionRequest').set({id:'repeat',incidentId:p.incident.id,action:'settle',allocations:{medical:'compulsory',thirdParty:'liability',ownDamage:'self'}}); });
    await host.waitForFunction(id => !players[id].actionRequest, id);
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket, id), 3500);
    console.log('PASS: individual scene order, claim feedback, locked coverage and one-time settlement');

    await host.locator('#practicePlayer').selectOption(otherId);
    const otherWallet = await host.evaluate(id => players[id].wallet.totalOutOfPocket, otherId);
    await host.locator('#personalPracticeBtn').click();
    for (const action of ['secure','call','photo','documents']) {
      await other.locator(`[data-incident-action="${action}"]`).click();
      if (action !== 'documents') await other.waitForFunction(action => document.querySelector(`[data-incident-action="${action}"]`).getAttribute('aria-pressed') === 'true', action);
    }
    await other.locator('#claim-medical').selectOption('compulsory');
    await other.locator('#claim-thirdParty').selectOption('liability');
    await other.locator('#claim-ownDamage').selectOption('own');
    await other.locator('#settleIncident').click();
    await host.waitForFunction(id => players[id].incident?.stage === 'settled', otherId);
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket, otherId), otherWallet);
    assert.equal(await host.evaluate(id => players[id].incidentCount, otherId), 0);
    console.log('PASS: designated scene rehearsal never charges wallet or records an accident');

    // Exercise automatic unsafe-speed events separately from manual practice.
    await other.evaluate(() => playerRef.update({speed:160}));
    await host.evaluate(id => {sim[id].incidentCooldownUntil=0;sim[id].overspeedCooldownUntil=0;environmentChangedAt=Date.now()-5000;},otherId);
    await other.locator('[data-incident-action="secure"]').waitFor({state:'visible'});
    assert.equal(await host.evaluate(id => players[id].incident.kind,otherId),'overspeed');
    for (const action of ['secure','call','photo','documents']) {
      await other.locator(`[data-incident-action="${action}"]`).click();
      if (action !== 'documents') await other.waitForFunction(action => document.querySelector(`[data-incident-action="${action}"]`).getAttribute('aria-pressed') === 'true',action);
    }
    assert.equal(await other.locator('#claim-medical').isDisabled(),true);
    await other.locator('#claim-thirdParty').selectOption('liability');
    await other.locator('#claim-ownDamage').selectOption('own');
    await other.locator('#settleIncident').click();
    await host.waitForFunction(id => players[id].incident.stage === 'settled',otherId);
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket,otherId),otherWallet);
    assert.equal(await host.evaluate(id => players[id].incidentCount,otherId),1);
    console.log('PASS: automatic overspeed incident, zero injury and full optional coverage');

    // Exercise arrival bookkeeping without waiting for every map intersection.
    const visitBefore = await host.evaluate(id => Number(players[id].visitCount || 0), id);
    await host.evaluate(id => {const a=sim[id];a.driveElapsedMs=a.lastVisitDriveMs+10000;a.distanceSinceVisit=25;missionArrival(a,goalFor(a));}, id);
    await host.waitForFunction(({id,count}) => players[id].visitCount === count+1, {id,count:visitBefore});
    const income = await host.evaluate(id => players[id].wallet.missionIncome, id);
    assert.ok(income >= 300 && income % 300 === 0);
    assert.equal(await host.evaluate(() => nextQuestionAt), 0);
    console.log('PASS: mission arrival pays $300 and no fixed global-question clock remains');

    await host.locator('#classCaseBtn').click();
    await student.locator('#qModal').waitFor({state:'visible'});
    assert.match(await student.locator('#accInfo').innerText(), /案例演練/);
    await student.locator('#qOpts button').first().click();
    await other.locator('#qOpts button').first().click();
    await host.locator('#revealBtn').click();
    await host.locator('#continueBtn').click();
    await student.locator('#qModal').waitFor({state:'hidden'});
    console.log('PASS: teacher-triggered classroom case, answers, reveal and resume');

    await student.setViewportSize({width:390,height:844});
    assert.ok(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await fs.mkdir(ARTIFACTS,{recursive:true});
    await student.screenshot({path:path.join(ARTIFACTS,'student-mobile.png'),fullPage:true});
    await host.screenshot({path:path.join(ARTIFACTS,'teacher-desktop.png'),fullPage:true});
    await host.locator('#stopBtn').click();
    await host.locator('#financialReport').waitFor({state:'visible'});
    await student.waitForFunction(() => StudentV8.finished());
    assert.equal(await student.locator('[data-live-route="main"]').isDisabled(), true);
    assert.equal(await student.locator('#incidentPanel').isVisible(), false);
    console.log('PASS: mobile layout, final ledger and locked finished controls');

    await host.locator('#resetFromFinalBtn').click();
    await student.locator('#joinBox').waitFor({state:'visible'});
    assert.match(await student.locator('#joinMsg').innerText(), /重設/);
    assert.deepEqual(errors,[]);
    assert.deepEqual(remote,[]);
    console.log('PASS: room reset returns students to join; zero runtime errors or external demo requests');
  } finally {
    await context.close(); await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
