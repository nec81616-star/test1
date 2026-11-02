/* Run against python3 -m http.server 8010 from the project directory.
   All requests stay on the local demo transport; configured Firebase is untouched. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ARTIFACTS = path.resolve(__dirname, '..', 'artifacts');
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8010';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(page, predicate, argument, label = 'condition') {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, argument)) return;
    await sleep(30);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], remote = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== BASE) { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const host = await context.newPage();
  try {
    await host.goto(`${BASE}/teacher.html?demo=1`);
    await eventually(host, () => window.GAME_RUNTIME_READY && typeof auth !== 'undefined' && auth.currentUser, null, 'teacher runtime');
    await host.clock.install();
    await host.clock.pauseAt(new Date(Date.now() + 1000));
    await host.locator('#roomInput').fill('2486');
    await host.locator('#createBtn').click();
    await eventually(host, () => room === '2486' && !!roomRef, null, 'demo room');
    assert.match(await host.evaluate(() => studentInviteUrl()), /demo=1/);

    async function addStudent(name, plan, role) {
      const page = await context.newPage();
      await page.goto(`${BASE}/student.html?demo=1&room=2486`);
      await eventually(page, () => window.GAME_RUNTIME_READY && typeof uid !== 'undefined' && !!uid, null, 'student runtime');
      await page.locator('#nameInput').fill(name);
      await page.locator('#joinBtn').click();
      await page.locator('#setup').waitFor({ state: 'visible' });
      await page.locator('.vehicle button[data-v="car"]').click();
      await page.locator('#toRole').click();
      await page.locator(`.role button[data-r="${role}"]`).click();
      await page.locator('#toScenario').click();
      await page.locator('#drawBtn').click();
      await page.locator('#speedInput').fill('30');
      await page.locator(`[data-plan="${plan}"]`).click();
      await page.locator('[data-setup-route="shortcut"]').click();
      const preview = await page.locator('#budgetRemaining').innerText();
      const expected = await page.evaluate(({ plan, role }) => RISK_GAME.newWallet(plan, role).balance, { plan, role });
      assert.equal(Number(preview.replace(/[^\d.-]/g, '')), expected);
      assert.equal(await page.locator('#strategySetup select').count(), 0, 'insurance preparation has no long allocation form');
      await page.locator('#readyBtn').click();
      await page.locator('#waitBox').waitFor({ state: 'visible' });
      return page;
    }
    const student = await addStudent('小安', 'liability', 'office');
    const other = await addStudent('小晴', 'complete', 'student');
    const id = await student.evaluate(() => uid), otherId = await other.evaluate(() => uid);
    assert.notEqual(id, otherId);
    const beforeStart = await host.evaluate(() => roundSerial);
    await host.evaluate(() => { document.getElementById('startBtn').onclick(); document.getElementById('startBtn').onclick(); });
    await student.locator('#liveBox').waitFor({ state: 'visible' });
    await eventually(host, () => running && !starting, null, 'one successful departure');
    await host.evaluate(() => { Math.random = () => 0.99; }); // deterministic hazard checks, normal timer scheduling is retained
    const initial = await host.evaluate(({ id, otherId }) => ({
      office: RISK_GAME.newWallet('liability', 'office'),
      student: RISK_GAME.newWallet('complete', 'student'),
      actualOffice: players[id].wallet,
      actualStudent: players[otherId].wallet,
    }), { id, otherId });
    assert.equal(initial.actualOffice.balance, initial.office.balance);
    assert.equal(initial.actualStudent.balance, initial.student.balance);
    assert.notEqual(initial.office.initialAssets, initial.student.initialAssets);
    assert.equal(await host.evaluate(() => roundSerial), beforeStart + 1);
    assert.equal(await host.locator('#createBtn').isDisabled(), true);
    await host.evaluate(async ({ id, otherId }) => { await roomRef.child(`players/${id}/score`).set(0); await roomRef.child(`players/${otherId}/score`).set(999999); }, { id, otherId });
    await eventually(host, ({ id, otherId }) => players[id].score === 0 && players[otherId].score === 999999, { id, otherId });
    assert.equal(await host.evaluate(() => scoreRank()[0][0]), initial.office.balance > initial.student.balance ? id : otherId);
    assert.doesNotMatch(await host.locator('#ranking').innerText(), /積分|\d+\s*分/);
    console.log('PASS: concise insurance, role-specific starting wealth, single departure and property-only ranking');

    await student.locator('[data-live-route="school"]').click();
    await eventually(host, id => players[id].routeChoice === 'school', id, 'route request');
    const differentPaths = await host.evaluate(id => {
      const actor = { id, stops: [{ node: 'J' }], stage: 0 };
      players[id].routeChoice = 'main'; const main = nextMissionStep(actor, 'H', 'C');
      players[id].routeChoice = 'shortcut'; const shortcut = nextMissionStep(actor, 'H', 'C');
      players[id].routeChoice = 'school';
      return { main, shortcut };
    }, id);
    assert.notEqual(differentPaths.main, differentPaths.shortcut);
    console.log('PASS: student route choices change actual pathfinding');

    async function finishScene(page) {
      for (const action of ['secure', 'call', 'photo', 'documents']) {
        await page.locator(`[data-incident-action="${action}"]`).click();
        if (action !== 'documents') await eventually(page, action => document.querySelector(`[data-incident-action="${action}"]`)?.getAttribute('aria-pressed') === 'true', action, `scene ${action}`);
      }
    }
    await host.evaluate(id => beginPersonalIncident(id, 'collision', false), id);
    await student.locator('[data-incident-action="secure"]').waitFor({ state: 'visible' });
    assert.equal(await host.evaluate(() => paused), false);
    assert.equal(await host.evaluate(id => players[id].status, otherId), 'driving');
    await student.locator('[data-incident-action="photo"]').click();
    await eventually(student, () => document.getElementById('incidentFeedback').textContent.includes('尚未確認安全'), null, 'wrong-order feedback');
    await finishScene(student);
    await eventually(host, id => players[id].incident?.stage === 'settled' && players[id].status === 'driving', id, 'automatic insurance settlement');
    assert.equal(await student.locator('#claim-medical').count(), 0);
    assert.equal(await student.locator('#settleIncident').count(), 0);
    const settled = await host.evaluate(id => players[id], id);
    assert.equal(settled.wallet.totalOutOfPocket, 3500);
    assert.equal(settled.wallet.insurancePaid, 5000);
    assert.equal(settled.wallet.balance, initial.office.balance + settled.wallet.missionIncome - 3500);
    await student.evaluate(async () => { const p = (await playerRef.once('value')).val(); await playerRef.child('actionRequest').set({ id: 'repeat', incidentId: p.incident.id, action: 'settle' }); });
    await eventually(host, id => !players[id].actionRequest, id, 'duplicate settlement acknowledgement');
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket, id), 3500);
    console.log('PASS: safety actions automatically apply existing coverage and charge personal loss exactly once');

    await host.locator('#practicePlayer').selectOption(otherId);
    await host.locator('#personalPracticeBtn').click();
    await finishScene(other);
    await eventually(host, id => players[id].incident?.stage === 'settled', otherId, 'rehearsal settlement');
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket, otherId), 0);
    assert.equal(await host.evaluate(id => players[id].incidentCount, otherId), 0);
    console.log('PASS: personal rehearsal remains separate from real wealth and accident counts');

    await other.evaluate(() => playerRef.update({ speed: 160 }));
    await host.evaluate(id => { sim[id].incidentCooldownUntil = 0; sim[id].overspeedCooldownUntil = 0; environmentChangedAt = Date.now() - 5000; }, otherId);
    await host.clock.runFor(100);
    await other.locator('[data-incident-action="secure"]').waitFor({ state: 'visible' });
    assert.equal(await host.evaluate(id => players[id].incident.kind, otherId), 'overspeed');
    await finishScene(other);
    await eventually(host, id => players[id].incident?.stage === 'settled', otherId, 'covered automatic overspeed claim');
    assert.equal(await host.evaluate(id => players[id].wallet.totalOutOfPocket, otherId), 0);
    assert.equal(await host.evaluate(id => players[id].incidentCount, otherId), 1);
    console.log('PASS: actual overspeed event settles automatically without asking students to classify insurance');

    const visitBefore = await host.evaluate(id => Number(players[id].visitCount || 0), id);
    const incomeBefore = await host.evaluate(id => players[id].wallet.missionIncome, id);
    const jobIncome = await host.evaluate(id => RISK_GAME.roleFor(players[id].roleId).stationIncome, id);
    await host.evaluate(id => {
      const actor = sim[id], role = RISK_GAME.roleFor(players[id].roleId);
      actor.driveElapsedMs = actor.lastVisitDriveMs + (role.workSeconds + 1) * 1000;
      actor.distanceSinceVisit = 25;
      missionArrival(actor, goalFor(actor));
    }, id);
    await eventually(host, ({ id, count }) => players[id].visitCount === count + 1, { id, count: visitBefore }, 'job income');
    assert.equal(await host.evaluate(id => players[id].wallet.missionIncome, id), incomeBefore + jobIncome);
    console.log('PASS: completing work credits the selected profession income');

    async function advanceTo(timestamp) {
      const now = await host.evaluate(() => Date.now());
      await host.clock.fastForward(Math.max(1, timestamp - now + 10));
      await sleep(80); // let cross-tab storage events and locked transactions finish
    }
    const firstClock = await host.evaluate(() => ({ now: Date.now(), next: ClassQuizV81.nextQuestionAt, delay: ClassQuizV81.nextDelayMs }));
    assert.ok(firstClock.delay >= 25000 && firstClock.delay <= 30000);
    assert.ok(firstClock.next > firstClock.now);
    await advanceTo(firstClock.next - 20);
    assert.equal(await host.evaluate(() => paused), false, 'no forced question before its scheduled driving interval');
    await advanceTo(firstClock.next);
    await student.locator('#qModal').waitFor({ state: 'visible' });
    const firstQuestion = await host.evaluate(() => ({ ...currentQuestion }));
    assert.equal(firstQuestion.autoMode, true);
    assert.equal(firstQuestion.practice, true);
    assert.ok(firstQuestion.answerDeadlineAt > await host.evaluate(() => Date.now()));
    const wealthBeforeQuiz = await host.evaluate(({ id, otherId }) => [players[id].wallet.balance, players[otherId].wallet.balance], { id, otherId });
    const roundAtPause = await host.evaluate(() => ClassQuizV81.roundRemainingMs);
    await student.locator('#qOpts button').nth(firstQuestion.correctIndex).click();
    await other.locator('#qOpts button').nth((firstQuestion.correctIndex + 1) % firstQuestion.options.length).click();
    await advanceTo(firstQuestion.answerDeadlineAt);
    await eventually(host, () => currentQuestion?.revealed, null, 'automatic answer reveal');
    assert.equal(await host.evaluate(() => paused), true);
    assert.deepEqual(await host.evaluate(({ id, otherId }) => [players[id].wallet.balance, players[otherId].wallet.balance], { id, otherId }), wealthBeforeQuiz, 'quiz correctness never adds property');
    assert.equal(await host.evaluate(() => ClassQuizV81.roundRemainingMs), roundAtPause, 'answer/explanation pauses the active work clock');
    const resumeAt = await host.evaluate(() => currentQuestion.resumeAt);
    await advanceTo(resumeAt);
    await student.locator('#qModal').waitFor({ state: 'hidden' });
    await eventually(host, () => !paused && running, null, 'automatic driving resume');
    const secondAt = await host.evaluate(() => ClassQuizV81.nextQuestionAt);
    assert.ok(secondAt - await host.evaluate(() => Date.now()) >= 24900);
    await advanceTo(secondAt);
    await student.locator('#qModal').waitFor({ state: 'visible' });
    assert.notEqual(await host.evaluate(() => currentQuestion.id), firstQuestion.id);
    const secondDeadline = await host.evaluate(() => currentQuestion.answerDeadlineAt);
    await advanceTo(secondDeadline);
    await eventually(host, () => currentQuestion?.revealed, null, 'unanswered question reveal');
    await advanceTo(await host.evaluate(() => currentQuestion.resumeAt));
    await student.locator('#qModal').waitFor({ state: 'hidden' });
    console.log('PASS: 25–30s automatic quiz, 12s answers, automatic reveal/resume and a second cycle without teacher clicks');

    await student.setViewportSize({ width: 390, height: 844 });
    assert.ok(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.doesNotMatch(await student.locator('#liveBox').innerText(), /積分|連擊|\+\d+\s*分/);
    await fs.mkdir(ARTIFACTS, { recursive: true });
    await student.screenshot({ path: path.join(ARTIFACTS, 'student-mobile.png'), fullPage: true });
    await host.screenshot({ path: path.join(ARTIFACTS, 'teacher-desktop.png'), fullPage: true });

    // Let the actual active-work clock end the round, crossing any scheduled
    // automatic questions; neither questions nor the result window consume work time.
    for (let i = 0; i < 40 && await host.evaluate(() => running); i++) {
      const phase = await host.evaluate(() => ({ paused, now: Date.now(), next: ClassQuizV81.nextQuestionAt,
        remaining: ClassQuizV81.roundRemainingMs, q: currentQuestion }));
      if (phase.paused) {
        await advanceTo(phase.q.revealed ? phase.q.resumeAt : phase.q.answerDeadlineAt);
        await eventually(host, () => !running || !paused || currentQuestion?.revealed, null, 'case timer progress');
      } else {
        await advanceTo(Math.min(phase.next || Infinity, phase.now + phase.remaining));
      }
    }
    await eventually(host, () => !running && document.getElementById('finalOverlay').classList.contains('hidden') === false, null, 'automatic five-minute finish');
    await student.waitForFunction(() => StudentV8.finished());
    assert.equal(await student.locator('[data-live-route="main"]').isDisabled(), true);
    assert.equal(await student.locator('#incidentPanel').isVisible(), false);
    assert.match(await host.locator('#financialReport').innerText(), /財產|資金/);
    assert.doesNotMatch(await host.locator('#podium').innerText(), /\d+\s*分/);
    const stoppedQuestion = await host.evaluate(() => currentQuestion?.id);
    await host.clock.fastForward(60000);
    assert.equal(await host.evaluate(() => running), false);
    assert.equal(await host.evaluate(() => currentQuestion?.id), stoppedQuestion);
    assert.equal(await student.locator('#qModal').isVisible(), false);
    console.log('PASS: mobile wealth dashboard, automatic active-time finish and stopped quiz timers');

    await host.locator('#resetFromFinalBtn').click();
    await student.locator('#joinBox').waitFor({ state: 'visible' });
    assert.match(await student.locator('#joinMsg').innerText(), /重設/);
    await host.clock.fastForward(60000);
    assert.equal(await host.evaluate(() => running), false);
    assert.equal(await host.evaluate(() => ClassQuizV81.nextQuestionAt), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    console.log('PASS: reset returns students to join; no timer resurrection, runtime errors or external requests');
  } finally {
    await context.close(); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
