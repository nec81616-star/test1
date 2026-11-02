/* Load the selected transport before either page's original initialization. */
(async function () {
  'use strict';
  const page = document.currentScript.dataset.page;
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('無法載入 ' + new URL(src, location.href).pathname));
    document.body.appendChild(script);
  });
  try {
    await load('firebase-config.js?v=840');
    await load('game-data.js?v=840');
    await load('risk-engine.js?v=840');
    if (page === 'teacher') await load('question-bank.js?v=840');
    if (demo) {
      await load('local-backend.js?v=840');
      const banner = document.createElement('div');
      banner.className = 'demoBanner';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'padding:12px 18px;background:#17375b;color:#fff;font:700 14px/1.7 system-ui;text-align:center';
      banner.textContent = '本機試玩｜僅同一瀏覽器的分頁同步，不連線到正式課堂。';
      if (page === 'teacher') {
        const open = document.createElement('button');
        open.id = 'openDemoStudent';
        open.textContent = '開啟學生試玩分頁 ↗';
        open.style.cssText = 'margin-left:12px;padding:7px 12px;border:1px solid white;border-radius:8px;color:#17375b;background:white;font-size:13px;cursor:pointer';
        open.onclick = () => {
          const room = document.getElementById('roomInput').value.trim();
          if (!/^\d{4}$/.test(room) || !document.getElementById('inviteBtn') || document.getElementById('inviteBtn').disabled) {
            document.getElementById('setupMsg').textContent = '請先建立試玩房間，再開啟學生分頁。';
            return;
          }
          window.open('student.html?demo=1&room=' + encodeURIComponent(room), '_blank', 'noopener');
        };
        banner.append(open);
      }
      document.body.prepend(banner);
    } else {
      for (const sdk of ['app', 'auth', 'database'])
        await load(`https://www.gstatic.com/firebasejs/10.12.5/firebase-${sdk}-compat.js`);
    }
    if (page === 'student') await load('student-v8.js?v=840');
    await load(page + '-core.js?v=840');
    if (page === 'teacher') {
      await load('teacher-v8.js?v=840');
      await load('teacher-fonts.js?v=840');
      if (!demo) load('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js').catch(() => {
        // Invitations still display the complete URL when QR rendering is unavailable.
      });
    }
    window.GAME_RUNTIME_READY = true;
  } catch (error) {
    const target = document.getElementById(page === 'teacher' ? 'setupMsg' : 'joinMsg');
    if (target) {
      target.textContent = '遊戲啟動失敗，請檢查網路或重新載入。' + error.message;
      target.classList.remove('hidden');
    }
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    console.error(error);
  }
})();
