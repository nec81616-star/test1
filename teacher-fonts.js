/* Projector font controls remain independent of game and answer state. */
(() => {
  'use strict';
  const overlay = document.getElementById('qOverlay');
  const slider = document.getElementById('questionFontRange');
  const number = document.getElementById('questionFontSize');
  if (!overlay || !slider || !number) return;
  const storageKey = 'cityInsuranceQuestionFontPx';
  const minimum = 24, maximum = 64, defaultSize = 32;
  let size = defaultSize;
  const normalized = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : defaultSize;
  };
  function apply(value, persist = true) {
    size = normalized(value);
    overlay.style.setProperty('--question-font-size', size + 'px');
    slider.value = number.value = String(size);
    if (persist) { try { localStorage.setItem(storageKey, String(size)); } catch {} }
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) size = normalized(saved);
  } catch {}
  apply(size, false);
  document.getElementById('questionFontDecrease').onclick = () => apply(size - 2);
  document.getElementById('questionFontIncrease').onclick = () => apply(size + 2);
  document.getElementById('questionFontReset').onclick = () => apply(defaultSize);
  slider.oninput = () => apply(slider.value);
  number.oninput = () => { if (number.value !== '') apply(number.value); };
  number.onchange = () => apply(number.value === '' ? defaultSize : number.value);
  window.TeacherQuestionFonts = Object.freeze({ setSize: apply, get size() { return size; } });
})();
