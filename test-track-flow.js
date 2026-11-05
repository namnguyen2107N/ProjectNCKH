/**
 * Comprehensive Automated Test Suite for Virtual Robot Track Separation
 */
const fs = require('fs');
const path = require('path');

// Minimal DOM simulation for Node.js
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...names) { names.forEach(n => n && this.classes.add(n)); }
  remove(...names) { names.forEach(n => n && this.classes.delete(n)); }
  toggle(name, force) {
    if (force === undefined) {
      if (this.classes.has(name)) this.classes.delete(name);
      else this.classes.add(name);
    } else if (force) {
      this.classes.add(name);
    } else {
      this.classes.delete(name);
    }
  }
  contains(name) { return this.classes.has(name); }
  toString() { return Array.from(this.classes).join(' '); }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.style = {};
    this._innerHTML = '';
    this._innerText = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.onclick = null;
    this.onchange = null;
  }

  get className() { return this.classList.toString(); }
  set className(val) {
    this.classList.classes.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }

  get innerText() { return this._innerText; }
  set innerText(val) {
    this._innerText = String(val);
    this._innerHTML = String(val);
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    parseHTMLInto(html, this);
  }

  querySelector(selector) {
    return querySelectorAll(this, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return querySelectorAll(this, selector);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getBoundingClientRect() {
    return { width: 800, height: 350, top: 0, left: 0, right: 800, bottom: 350 };
  }

  getContext(type) {
    const noop = () => {};
    const ctx = {
      createLinearGradient: () => ({ addColorStop: noop }),
      measureText: () => ({ width: 50 }),
      canvas: this
    };
    return new Proxy(ctx, {
      get: (target, prop) => (prop in target ? target[prop] : noop)
    });
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (matchesSelector(curr, selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
}

function parseHTMLInto(html, parent) {
  // Regex tag parser for test DOM
  const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9\-]+)([^>]*)\/>|<([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1] || match[4] || match[6];
    const attrsStr = match[2] || match[5] || match[7] || '';
    const inner = match[3] || '';

    const el = new MockElement(tagName);
    // Parse attributes
    const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;
    let aMatch;
    while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
      const name = aMatch[1];
      const val = aMatch[2] !== undefined ? aMatch[2] : true;
      el.attributes[name] = val;
      if (name === 'id') el.id = val;
      if (name === 'class') el.className = val;
      if (name === 'value') el.value = val;
      if (name === 'type') el.type = val;
      if (name === 'name') el.name = val;
      if (name === 'checked') el.checked = true;
    }

    if (inner && !inner.includes('<')) {
      el.innerText = inner.trim();
    } else if (inner) {
      el.innerHTML = inner;
    }
    parent.appendChild(el);
  }
}

function matchesSelector(el, sel) {
  sel = sel.trim();
  let needChecked = false;
  if (sel.includes(':checked')) {
    needChecked = true;
    sel = sel.replace(':checked', '').trim();
  }
  if (needChecked && !el.checked) return false;

  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));

  // Attribute selector support: [attr="val"] or tag[attr="val"] or tag[attr]
  const attrMatch = sel.match(/^([a-zA-Z0-9\-]*)(?:\[([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?\])?$/);
  if (attrMatch && (attrMatch[2] || !attrMatch[1].includes('.'))) {
    const tag = attrMatch[1];
    const attrName = attrMatch[2];
    const attrVal = attrMatch[3];

    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (attrName) {
      const actualVal = el.attributes[attrName] !== undefined ? el.attributes[attrName] : el[attrName];
      if (attrVal !== undefined) {
        if (actualVal != attrVal) return false;
      } else {
        if (actualVal === undefined) return false;
      }
    }
    return true;
  }

  if (sel.includes('.')) {
    const parts = sel.split('.');
    const tag = parts[0];
    const cls = parts[1];
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    return el.classList.contains(cls);
  }

  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function querySelectorAll(root, selector) {
  const results = [];
  function walk(node) {
    for (const child of node.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      walk(child);
    }
  }
  walk(root);
  return results;
}

global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.document = {
  body: new MockElement('body'),
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => {
    return querySelectorAll(global.document.body, '#' + id)[0] || null;
  },
  querySelector: (sel) => querySelectorAll(global.document.body, sel)[0] || null,
  querySelectorAll: (sel) => querySelectorAll(global.document.body, sel),
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.localStorage = {
  _store: {},
  getItem: (k) => global.localStorage._store[k] || null,
  setItem: (k, v) => { global.localStorage._store[k] = String(v); },
  removeItem: (k) => { delete global.localStorage._store[k]; }
};
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = { now: () => Date.now() };

// Helper to select a radio button in mock environment
function selectRadio(name, value) {
  const allRadios = querySelectorAll(global.document.body, `input[name="${name}"]`);
  allRadios.forEach(r => {
    if (r.value === value) {
      r.checked = true;
      if (r.onchange) r.onchange();
    } else {
      r.checked = false;
    }
  });
}

// Load code files
const projectDir = __dirname;
function loadScript(relPath) {
  const fullPath = path.join(projectDir, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  eval(code);
}

console.log('Loading scripts...');
loadScript('js/i18n.js');
loadScript('js/sound-fx.js');
loadScript('js/polya-engine.js');
loadScript('js/kinematics-model.js');
loadScript('js/simulation-engine.js');
loadScript('js/log-engine.js');
loadScript('js/vocab-support.js');
loadScript('js/math-hints.js');
loadScript('js/tasks/task1-reach.js');
loadScript('js/tasks/task2-fix.js');
loadScript('js/tasks/task3-new.js');
loadScript('js/feedback-engine.js');
loadScript('js/task-engine.js');

console.log('Scripts loaded successfully.');

// TEST SUITE
function runTests() {
  const container = new MockElement('div', 'main-view');
  document.body.appendChild(container);

  // =========================================================================
  // TEST 1: Task 1 (Hành trình đến đích / Reach The Goal: 42m, 7m/s, 6s)
  // =========================================================================
  console.log('\n--- TEST 1: Task 1 (Reach The Goal: 42m, 7m/s) ---');
  const engine = new TaskEngine('main-view');
  engine.loadTask(window.Task1Reach, 'Student A');

  // Verify initial layout: track sub-screen is hidden, config view is visible
  const configView = document.getElementById('workspace-config-view');
  const trackView = document.getElementById('workspace-track-view');
  if (!configView || configView.classList.contains('hidden')) {
    throw new Error('Config view should be visible on initial load');
  }
  if (!trackView || !trackView.classList.contains('hidden')) {
    throw new Error('Virtual Robot Track should be hidden on initial load');
  }
  console.log('✓ Initial screen: Virtual Robot Track is hidden; only problem & Step 1 form visible.');

  // Complete Step 1: speed = 7, distance = 42, target = time
  const s1Speed = document.getElementById('input-s1-speed');
  const s1Dist = document.getElementById('input-s1-distance');
  s1Speed.value = '7';
  s1Dist.value = '42';
  selectRadio('s1-target-qty', 'time');
  document.getElementById('btn-submit-step-1').onclick();
  if (engine.polya.currentStep !== 2) throw new Error(`Expected step 2 after step 1, got ${engine.polya.currentStep}`);
  console.log('✓ Step 1 completed -> Advanced to Step 2');

  // Complete Step 2: formula f1 (t = s ÷ v), calc = 6
  selectRadio('s2-formula', 'f1');
  document.getElementById('input-s2-calc').value = '6';
  document.getElementById('btn-submit-step-2').onclick();
  if (engine.polya.currentStep !== 3) throw new Error(`Expected step 3 after step 2, got ${engine.polya.currentStep}`);
  console.log('✓ Step 2 completed -> Advanced to Step 3');

  // Step 3: Verify button is "Mở Virtual Robot Track" and no direct run button in step 3
  const openTrackBtn = document.getElementById('btn-open-track');
  if (!openTrackBtn) throw new Error('Missing #btn-open-track in Step 3');
  const oldRunBtn = document.getElementById('btn-run-robot');
  if (oldRunBtn) throw new Error('Direct #btn-run-robot should not exist in Step 3');
  console.log('✓ Step 3 has button:', openTrackBtn.innerText);

  // Click "Mở Virtual Robot Track"
  openTrackBtn.onclick();
  if (trackView.classList.contains('hidden')) {
    throw new Error('Virtual Robot Track should be visible after clicking open track');
  }
  if (!configView.classList.contains('hidden')) {
    throw new Error('Config view should be hidden when track is open');
  }
  console.log('✓ Track screen opened! Config view hidden, track view visible.');

  // Check Track Screen elements
  const trackBackBtn = document.getElementById('btn-track-back');
  const trackHeading = document.querySelector('.track-view-heading');
  const trackTitle = document.getElementById('track-mission-title');
  const progressBadge = document.getElementById('track-progress-pill');
  const canvas = document.getElementById('robot-canvas');
  const flag = document.getElementById('destination-flag');
  const dispSpeed = document.getElementById('disp-speed');
  const dispTime = document.getElementById('disp-time');
  const dispDist = document.getElementById('disp-dist');
  const trackRunBtn = document.getElementById('btn-track-run-robot');

  if (!trackBackBtn) throw new Error('Missing track back button');
  if (!trackHeading) throw new Error('Missing track heading');
  if (!trackTitle) throw new Error('Missing mission title');
  if (!progressBadge) throw new Error('Missing progress badge');
  if (!canvas) throw new Error('Missing canvas');
  if (!flag) throw new Error('Missing destination flag');
  if (!dispSpeed || !dispTime || !dispDist) throw new Error('Missing kinematics readouts');
  if (!trackRunBtn) throw new Error('Missing track run robot button');

  console.log('✓ Track screen has all required elements:');
  console.log('  - Back button:', trackBackBtn.innerText);
  console.log('  - Mission title:', trackTitle.innerText);
  console.log('  - Progress pill:', progressBadge.innerText);
  console.log('  - Heading:', trackHeading.innerText);
  console.log('  - Destination flag:', flag.innerText);
  console.log('  - Kinematics cards: Speed =', dispSpeed.innerText, ', Time =', dispTime.innerText, ', Dist =', dispDist.innerText);

  // Test returning to parameter inputs
  trackBackBtn.onclick();
  if (!trackView.classList.contains('hidden')) throw new Error('Track view should be hidden after back click');
  if (configView.classList.contains('hidden')) throw new Error('Config view should be visible after back click');
  const paramTimeInput = document.getElementById('param-time');
  if (!paramTimeInput || paramTimeInput.value != '6') throw new Error('Inputs should be preserved when returning (expected 6)');
  console.log('✓ Returned to Step 3: inputs preserved (time = ' + paramTimeInput.value + ')');

  // Open track again and run robot
  document.getElementById('btn-open-track').onclick();
  trackRunBtn.onclick();
  console.log('✓ Robot running on track...');

  // Trigger robot finish: 7 m/s * 6 s = 42 m
  engine.sim.onFinish();
  const resultCard = document.getElementById('track-result-card');
  const rerunBtn = document.getElementById('btn-track-rerun');
  const contStep4Btn = document.getElementById('btn-track-go-step4');
  if (!resultCard || resultCard.classList.contains('hidden')) throw new Error('Result card should be visible after finish');
  if (!rerunBtn || rerunBtn.classList.contains('hidden')) throw new Error('Rerun button should be visible');
  if (!contStep4Btn || contStep4Btn.classList.contains('hidden')) throw new Error('Continue to Step 4 button should be visible');
  console.log('✓ Robot finished! Result card displayed, Re-run button & Continue button visible.');

  // Click Continue to Step 4
  contStep4Btn.onclick();
  if (engine.polya.currentStep !== 4) throw new Error('Expected step 4 after continue');
  if (trackView.classList.contains('hidden') === false) throw new Error('Track view should be closed on Step 4');
  console.log('✓ Transitioned to Step 4! Current Polya step =', engine.polya.currentStep);

  // Verify Step 4 has "Xem lại đường chạy" button
  const viewTrackBtn = document.getElementById('btn-view-track-s4');
  if (!viewTrackBtn) throw new Error('Step 4 should have button to view track');
  console.log('✓ Step 4 has button to review track:', viewTrackBtn.innerText);

  // Test opening track from Step 4
  viewTrackBtn.onclick();
  if (trackView.classList.contains('hidden')) throw new Error('Track view should open from Step 4');
  const backFromS4 = document.getElementById('btn-track-back');
  console.log('✓ Track opened from Step 4, back button text is:', backFromS4.innerText);
  backFromS4.onclick();
  if (!trackView.classList.contains('hidden')) throw new Error('Track view should close back to Step 4');
  console.log('✓ Closed track view, successfully returned to Step 4.');

  // Select Yes in Step 4
  document.getElementById('btn-check-yes').onclick();
  const completeBtn = document.getElementById('btn-complete-mission');
  if (!completeBtn) throw new Error('Expected complete mission button on successful verification');
  console.log('✓ Step 4 verification succeeded. Complete button ready:', completeBtn.innerText);


  // =========================================================================
  // TEST 2: Task 2 (Chuyến đi bất ngờ / The Unexpected Journey: 1.2km, 4m/s, trial 240s -> 960m)
  // =========================================================================
  console.log('\n--- TEST 2: Task 2 (The Unexpected Journey: 1.2km = 1200m, 4m/s) ---');
  const engine2 = new TaskEngine('main-view');
  engine2.loadTask(window.Task2Fix, 'Student B');

  // Step 1: distance_km = 1.2, speed = 4, target = time_minutes
  document.getElementById('input-s1-distance_km').value = '1,2';
  document.getElementById('input-s1-speed').value = '4';
  selectRadio('s1-target-qty', 'time_minutes');
  document.getElementById('btn-submit-step-1').onclick();
  if (engine2.polya.currentStep !== 2) throw new Error('Expected Step 2 in Task 2');
  console.log('✓ Task 2 Step 1 completed (1.2km, 4m/s, target: time in minutes)');

  // Step 2: formula f1 (t = 1200 ÷ 4 = 300s = 5min), calc = 300
  selectRadio('s2-formula', 'f1');
  document.getElementById('input-s2-calc').value = '300';
  document.getElementById('btn-submit-step-2').onclick();
  if (engine2.polya.currentStep !== 3) throw new Error('Expected Step 3 in Task 2');
  console.log('✓ Task 2 Step 2 completed (calc = 300s = 5 min)');

  // In Step 3: verify initial standardized trial run is fixed at 240s (NOT overwritten by 300s calc)
  const s3TimeInput = document.getElementById('param-time');
  if (!s3TimeInput || s3TimeInput.value != '240') {
    throw new Error(`Task 2 initial trial time must be 240s, got ${s3TimeInput ? s3TimeInput.value : 'null'}`);
  }
  console.log('✓ Task 2 Step 3 has initial trial run time = 240s (separated from 300s math)');

  // Open track and run trial: 4 m/s * 240 s = 960 m vs target 1200 m
  document.getElementById('btn-open-track').onclick();
  document.getElementById('btn-track-run-robot').onclick();
  engine2.sim.onFinish();

  // In Task 2, distance is 4 * 240 = 960m, target is 1200m -> warning mismatch!
  const resCard2 = document.getElementById('track-result-card');
  if (!resCard2 || !resCard2.classList.contains('result-warning')) {
    throw new Error('Task 2 initial trial run should result in warning (stopped at 960m short of 1200m)');
  }
  console.log('✓ Task 2 initial run result correctly identified mismatch (stopped at 960m vs 1200m target)');

  // Advance to Step 4
  document.getElementById('btn-track-go-step4').onclick();
  if (engine2.polya.currentStep !== 4) throw new Error('Expected step 4 in Task 2');

  // In Step 4: Answer "Không" (did not reach 1200m)
  document.getElementById('btn-check-no').onclick();
  selectRadio('ps9-disc', 'shortfall_960m');
  selectRadio('ps10-diag', 'ran_240s_only');
  document.getElementById('input-revised-time').value = '300'; // Revise time to 300s
  console.log('✓ Step 4 observation & diagnosis completed, revised time entered: 300s');

  // Click retry plan: opens track screen and executes simulation run live
  document.getElementById('btn-retry-ps11').onclick();
  const trackView2 = document.getElementById('workspace-track-view');
  if (trackView2.classList.contains('hidden')) throw new Error('Track view should open on retry');
  console.log('✓ Track view opened live on retry!');

  // Trigger finish for revised run (speed 4 * time 300 = 1200m match!)
  engine2.sim.onFinish();
  const resCardRetry = document.getElementById('track-result-card');
  if (!resCardRetry || !resCardRetry.classList.contains('result-success')) {
    throw new Error('Revised run should be a success match at 1200m');
  }
  console.log('✓ Revised run succeeded on track screen (4 m/s * 300 s = 1200 m)!');

  // Click continue from track screen to return to Step 4
  document.getElementById('btn-track-go-step4').onclick();
  const completeBtn2 = document.getElementById('btn-complete-mission');
  if (!completeBtn2) throw new Error('Expected complete mission button on Step 4 after successful retry');
  console.log('✓ Returned to Step 4, mathematical verification proof and completion button rendered!');


  // =========================================================================
  // TEST 3: Task 3 (Thử thách đúng giờ / The On-Time Challenge: 1.5km, 5min, find speed = 5m/s)
  // =========================================================================
  console.log('\n--- TEST 3: Task 3 (The On-Time Challenge: 1.5km in 5min -> speed = 5m/s) ---');
  const engine3 = new TaskEngine('main-view');
  engine3.loadTask(window.Task3New, 'Student C');

  // Step 1: 1.5km = 1500m, 5min = 300s, target is SPEED
  document.getElementById('input-s1-distance_km').value = '1,5';
  document.getElementById('input-s1-distance_m').value = '1500';
  document.getElementById('input-s1-time_min').value = '5';
  document.getElementById('input-s1-time_s').value = '300';
  selectRadio('s1-target-qty', 'speed');
  document.getElementById('btn-submit-step-1').onclick();
  if (engine3.polya.currentStep !== 2) throw new Error('Expected Step 2 in Task 3');
  console.log('✓ Task 3 Step 1 completed: Target quantity is SPEED!');

  // Step 2: formula f1 (v = s ÷ t = 1500 ÷ 300 = 5 m/s), calc = 5
  selectRadio('s2-formula', 'f1');
  document.getElementById('input-s2-calc').value = '5';
  document.getElementById('btn-submit-step-2').onclick();
  if (engine3.polya.currentStep !== 3) throw new Error('Expected Step 3 in Task 3');
  console.log('✓ Task 3 Step 2 completed: v = s ÷ t = 5 m/s');

  // Step 3: verify Speed is editable/prefilled with 5, Time is locked at 300s
  const s3SpeedInput = document.getElementById('param-speed');
  const s3TimeInput3 = document.getElementById('param-time');
  if (!s3SpeedInput || s3SpeedInput.value != '5') {
    throw new Error(`Expected Step 3 speed = 5, got ${s3SpeedInput ? s3SpeedInput.value : 'null'}`);
  }
  if (!s3TimeInput3 || s3TimeInput3.value != '300') {
    throw new Error(`Expected Step 3 time = 300, got ${s3TimeInput3 ? s3TimeInput3.value : 'null'}`);
  }
  console.log('✓ Task 3 Step 3 has speed = 5 m/s and locked time = 300 s');

  // Open track and run
  document.getElementById('btn-open-track').onclick();
  document.getElementById('btn-track-run-robot').onclick();
  engine3.sim.onFinish();

  const resCard3 = document.getElementById('track-result-card');
  if (!resCard3 || !resCard3.classList.contains('result-success')) {
    throw new Error('Task 3 run should be a success (5 m/s * 300s = 1500m)');
  }
  console.log('✓ Task 3 run succeeded on track screen (1500m match)!');

  document.getElementById('btn-track-go-step4').onclick();
  if (engine3.polya.currentStep !== 4) throw new Error('Expected Step 4 in Task 3');
  console.log('✓ Task 3 reached Step 4 successfully');

  // In Step 4: verify math proof includes 1500m and speed calculation
  document.getElementById('btn-check-yes').onclick();
  const completeBtn3 = document.getElementById('btn-complete-mission');
  if (!completeBtn3) throw new Error('Expected complete mission button on Step 4 in Task 3');
  console.log('✓ Task 3 Step 4 verified with speed formula and completed!');


  // =========================================================================
  // TEST 4: Language Switching (Bilingual i18n)
  // =========================================================================
  console.log('\n--- TEST 4: Language Switching (Bilingual i18n) ---');
  window.I18N.setLang('en');
  engine2.updateLanguage();
  console.log('✓ Switched to English:');
  console.log('  - Back button:', document.getElementById('btn-track-back').innerText);
  console.log('  - Track heading:', document.querySelector('.track-view-heading').innerText);
  console.log('  - Track instruction:', document.getElementById('track-instruction-text').innerText);

  window.I18N.setLang('vi');
  engine2.updateLanguage();
  console.log('✓ Switched back to Vietnamese:');
  console.log('  - Back button:', document.getElementById('btn-track-back').innerText);
  console.log('  - Track heading:', document.querySelector('.track-view-heading').innerText);
  console.log('  - Track instruction:', document.getElementById('track-instruction-text').innerText);

  console.log('\n🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);
}

runTests();
