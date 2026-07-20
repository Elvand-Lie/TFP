import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const reportDir = join(root, 'zwds-codex-agent-kit', 'reports', 'final-screenshots');
const serverPort = 4173;
const debugPort = 9222;
const server = spawn('python3', ['-m', 'http.server', String(serverPort), '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore'
});
const profile = mkdtempSync(join(tmpdir(), 'zwds-browser-'));
const browser = spawn('chromium', [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-prefers-reduced-motion=reduce',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });

const browserStderr = [];
browser.stderr.on('data', (chunk) => browserStderr.push(String(chunk)));

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForJson(url, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.id && pending.has(payload.id)) {
      const handler = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) handler.reject(new Error(payload.error.message));
      else handler.resolve(payload.result);
      return;
    }
    events.push(payload);
  });
  const opened = new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  return {
    socket,
    events,
    opened,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result.value;
}

async function waitForChart(cdp) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    const ready = await evaluate(cdp, `(() => {
      const chart = document.getElementById('zwds-chart');
      return document.readyState === 'complete' && chart && !chart.hidden &&
        document.querySelectorAll('.zwds-palace').length === 12;
    })()`);
    if (ready) return;
    await delay(150);
  }
  throw new Error('Timed out waiting for the ZWDS chart');
}

const viewports = [
  { width: 375, height: 812, filename: 'zwds-mobile-375x812.png' },
  { width: 739, height: 1600, filename: 'zwds-reference-739x1600.png' },
  { width: 768, height: 1024, filename: 'zwds-tablet-768x1024.png' },
  { width: 1440, height: 900, filename: 'zwds-desktop-1440x900.png' }
];

try {
  const pages = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = pages.find((item) => item.type === 'page');
  assert.ok(page, 'Chromium must expose a page target');
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/zwds.html` });
  await waitForChart(cdp);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await delay(80);
  const unknownTimeControl = await evaluate(cdp, `(() => {
    const input = document.getElementById('zwds-time-unknown');
    const label = input.closest('label');
    const time = document.getElementById('zwds-birth-time');
    const labelRect = label.getBoundingClientRect();
    const timeRect = time.getBoundingClientRect();
    input.click();
    const checked = {
      disabled: time.disabled,
      helper: document.getElementById('zwds-time-branch').textContent
    };
    input.click();
    return {
      labelText: label.textContent.trim(),
      topDifference: Math.abs(labelRect.top - timeRect.top),
      heightDifference: Math.abs(labelRect.height - timeRect.height),
      checked,
      restored: !time.disabled
    };
  })()`);
  assert.equal(unknownTimeControl.labelText, 'Unknown birth time');
  assert.ok(unknownTimeControl.topDifference <= 2, `unknown-time control is vertically misaligned: ${JSON.stringify(unknownTimeControl)}`);
  assert.ok(unknownTimeControl.heightDifference <= 1, `unknown-time control height differs from time input: ${JSON.stringify(unknownTimeControl)}`);
  assert.equal(unknownTimeControl.checked.disabled, true);
  assert.ok(unknownTimeControl.checked.helper.includes('午時 / Wu hour'));
  assert.equal(unknownTimeControl.restored, true);

  await evaluate(cdp, `(() => {
    const set = (id, value) => {
      const control = document.getElementById(id);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return control;
    };
    set('zwds-name', 'Jose');
    set('zwds-year', '1981');
    set('zwds-month', '2');
    set('zwds-day', '11');
    const time = set('zwds-birth-time', '15:34');
    time.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('zwds-form').requestSubmit();
  })()`);
  await waitForChart(cdp);
  await delay(250);

  const jose = await evaluate(cdp, `(() => {
    const center = document.querySelector('.zwds-center').textContent;
    const selectedYear = document.querySelector('.zwds-year-button[aria-pressed="true"]');
    return {
      center,
      selectedYear: selectedYear && selectedYear.dataset.year,
      palaceCount: document.querySelectorAll('.zwds-palace').length,
      centerCount: document.querySelectorAll('.zwds-center').length,
      hasLucun: document.getElementById('zwds-grid').textContent.includes('祿存'),
      hasTianma: document.getElementById('zwds-grid').textContent.includes('天馬')
    };
  })()`);
  assert.equal(jose.palaceCount, 12);
  assert.equal(jose.centerCount, 1);
  assert.equal(jose.selectedYear, '2026');
  assert.ok(jose.center.includes('Jose'));
  assert.ok(jose.center.includes('1981-02-11 15:34'));
  assert.ok(jose.center.includes('金四局'));
  assert.ok(jose.center.includes('破軍'));
  assert.ok(jose.center.includes('天同'));
  assert.equal(jose.hasLucun, true);
  assert.equal(jose.hasTianma, true);

  const transition = await evaluate(cdp, `(async () => {
    document.querySelector('[data-year="2025"]').click();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    const first = document.getElementById('zwds-selection-summary').textContent;
    document.querySelector('[data-year="2026"]').click();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    const second = document.getElementById('zwds-selection-summary').textContent;
    return { first, second };
  })()`);
  assert.ok(transition.first.includes('2025'));
  assert.ok(transition.second.includes('2026'));
  assert.notEqual(transition.first, transition.second);

  await evaluate(cdp, `document.querySelector('.zwds-palace').focus()`);
  const enterKey = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...enterKey });
  await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...enterKey });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enterKey });
  await delay(50);
  assert.equal(await evaluate(cdp, `document.activeElement.classList.contains('zwds-palace') && document.activeElement.getAttribute('aria-pressed') === 'true'`), true);
  await evaluate(cdp, `document.querySelector('[data-year="2026"]').click()`);
  await delay(50);

  mkdirSync(reportDir, { recursive: true });
  const results = [];
  for (const viewport of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(100);
    const geometry = await evaluate(cdp, `(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const slots = {};
      for (const id of ['si','wu','wei','shen','chen','you','mao','xu','yin','chou','zi','hai']) {
        slots[id] = rect('[data-slot="' + id + '"]');
      }
      const center = rect('.zwds-center');
      const controls = [...document.querySelectorAll('.zwds-palace'), document.querySelector('.zwds-center')];
      let overlap = false;
      let clipped = false;
      for (let i = 0; i < controls.length; i += 1) {
        for (let j = i + 1; j < controls.length; j += 1) {
          const a = controls[i].getBoundingClientRect();
          const b = controls[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlap = true;
        }
      }
      for (const control of controls) {
        if (control.scrollHeight > control.clientHeight + 1 || control.scrollWidth > control.clientWidth + 1) clipped = true;
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        chartClientWidth: document.querySelector('.zwds-chart-viewport').clientWidth,
        chartScrollWidth: document.querySelector('.zwds-chart-viewport').scrollWidth,
        slots,
        center,
        regularStarFontSize: parseFloat(getComputedStyle(document.querySelector('.zwds-star')).fontSize),
        majorStarFontSize: parseFloat(getComputedStyle(document.querySelector('.zwds-star--major')).fontSize),
        overlap,
        clipped
      };
    })()`);
    assert.ok(geometry.documentWidth <= viewport.width + 1, `page overflow at ${viewport.width}px`);
    assert.ok(geometry.bodyWidth <= viewport.width + 1, `body overflow at ${viewport.width}px`);
    assert.equal(geometry.overlap, false, `palace overlap at ${viewport.width}px`);
    assert.equal(geometry.clipped, false, `palace content clipping at ${viewport.width}px`);
    assert.ok(geometry.regularStarFontSize >= 10, `regular star text is too small at ${viewport.width}px`);
    assert.ok(geometry.majorStarFontSize >= 12, `major star text is too small at ${viewport.width}px`);
    assert.ok(Math.abs(geometry.slots.si.top - geometry.slots.shen.top) < 2);
    assert.ok(Math.abs(geometry.slots.yin.top - geometry.slots.hai.top) < 2);
    assert.ok(geometry.slots.chen.left < geometry.center.left);
    assert.ok(geometry.slots.you.left >= geometry.center.right - 1);
    assert.ok(geometry.slots.mao.left < geometry.center.left);
    assert.ok(geometry.slots.xu.left >= geometry.center.right - 1);

    await evaluate(cdp, `(() => {
      document.querySelector('.zwds-chart-viewport').scrollIntoView({ block: 'start' });
      window.scrollBy(0, -88);
    })()`);
    await delay(80);
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    writeFileSync(join(reportDir, viewport.filename), Buffer.from(screenshot.data, 'base64'));
    results.push({
      size: `${viewport.width}x${viewport.height}`,
      pageOverflow: false,
      palaceOverlap: false,
      chartScrollFallback: geometry.chartScrollWidth > geometry.chartClientWidth,
      screenshot: viewport.filename
    });
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 188,
    height: 406,
    deviceScaleFactor: 1,
    mobile: false
  });
  await delay(80);
  const zoom200 = await evaluate(cdp, `(() => {
    const chart = document.querySelector('.zwds-chart-viewport');
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: innerWidth,
      chartClientWidth: chart.clientWidth,
      chartScrollWidth: chart.scrollWidth
    };
  })()`);
  await evaluate(cdp, `window.scrollTo({ left: 9999, top: window.scrollY, behavior: 'instant' })`);
  await delay(20);
  zoom200.pageScrollX = await evaluate(cdp, `window.scrollX`);
  assert.ok(zoom200.pageScrollX <= 1, `page is horizontally scrollable at 200% zoom equivalent: ${JSON.stringify(zoom200)}`);
  assert.ok(zoom200.chartScrollWidth > zoom200.chartClientWidth, 'chart-only scroll fallback must activate at 200% zoom equivalent');

  await evaluate(cdp, `document.getElementById('zwds-form').reset()`);
  await delay(30);
  assert.equal(await evaluate(cdp, `document.getElementById('zwds-chart').hidden`), true);

  const errors = cdp.events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params.canceled)
  );
  assert.deepEqual(errors, [], `browser errors: ${JSON.stringify(errors)}`);
  cdp.socket.close();
  console.log(JSON.stringify({ jose, transition, viewports: results, zoom200, resetHidesChart: true, browserErrors: errors.length }, null, 2));
} finally {
  browser.kill('SIGKILL');
  server.kill('SIGKILL');
  if (browserStderr.length && process.env.ZWDS_BROWSER_DEBUG) {
    process.stderr.write(browserStderr.join(''));
  }
}
