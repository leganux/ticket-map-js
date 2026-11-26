#!/usr/bin/env node
/**
 * Regenerates the screenshots and GIFs used in docs/ by driving a local Chrome over the
 * DevTools protocol. No npm packages are needed (Node 22+ for the global WebSocket);
 * GIFs need ffmpeg on the PATH.
 *
 *   cd dream-event-seating && python3 -m http.server 8080   # in another terminal
 *   node docs/tools/capture.mjs
 *
 * Env: CHROME (path to the Chrome binary), BASE_URL (default http://localhost:8080).
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../images');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

/* ----------------------------------------------------------------- Chrome */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'de-capture-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,1000',
  'about:blank',
], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.waiters = this.waiters.filter((w) => (w.method === msg.method ? (w.resolve(msg.params), false) : true));
      }
    };
  }
  open() {
    return new Promise((r) => (this.ws.onopen = r));
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method) {
    return new Promise((resolve) => this.waiters.push({ method, resolve }));
  }
}

let cdp;
async function viewport(width, height, mobile = false, scale = 1) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  });
}
async function goto(url, wait = 1800) {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: BASE + url });
  await loaded;
  await sleep(wait);
}
async function js(expression) {
  // eval() accepts statements and returns the last value; component instances are dropped.
  const wrapped = `(async () => { const v = await eval(${JSON.stringify(expression)}); return v && typeof v === 'object' && Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v) ? null : v; })()`;
  const r = await cdp.send('Runtime.evaluate', { expression: wrapped, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expression);
  return r.result.value;
}
async function shot(name, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = Object.assign({ scale: 1 }, clip);
  const { data } = await cdp.send('Page.captureScreenshot', params);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  console.log('✓', name);
}
async function mouse(type, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function click(x, y) {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
}
/** Center of an element in page coordinates. */
async function center(selector) {
  return js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}

/* -------------------------------------------------------------------- GIF */
class Recorder {
  constructor(name) {
    this.name = name;
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'de-gif-'));
    this.n = 0;
  }
  async frame(hold = 1) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    for (let i = 0; i < hold; i++) fs.writeFileSync(path.join(this.dir, `f${String(this.n++).padStart(4, '0')}.png`), buf);
  }
  async during(ms, every = 70) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await this.frame();
      await sleep(every);
    }
  }
  save(width) {
    const out = path.join(OUT, this.name);
    const filter = `fps=10,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', path.join(this.dir, 'f%04d.png'), '-vf', filter, '-loop', '0', out]);
    fs.rmSync(this.dir, { recursive: true, force: true });
    console.log('✓', this.name);
  }
}

/* --------------------------------------------------------------- scenarios */
async function builderShots() {
  await viewport(1440, 1000);
  await goto('/builder-demo.html');
  await js(`builder.selectSection('vip'); document.querySelector('.deb-panel-body').scrollTop = 0;`);
  await sleep(300);
  await shot('builder-overview.png');

  const panel = await js(`(() => { const p = document.querySelector('.deb-panel-body'); const f = p.querySelector('[data-form]'); p.scrollTop = f.offsetTop - 70; const r = document.querySelector('.deb-panel').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  await sleep(300);
  await shot('builder-section-form.png', panel);

  await js(`builder.selectSeats(builder.getSections()[1].rows.slice(1, 4).flatMap((r) => r.seats.slice(2, 7).map((s) => s.id)))`);
  await sleep(300);
  await shot('builder-seats.png');

  await js(`document.querySelector('[data-action="templates"]').click()`);
  await sleep(900);
  await shot('builder-templates.png');
  await js(`Swal.close()`);
  await sleep(400);

  for (const [id, file] of [['stadium-4', 'template-stadium.png'], ['cafe-bar', 'template-cafe.png'], ['grand-theater', 'template-grand-theater.png'], ['airplane', 'template-airplane.png']]) {
    await js(`builder.loadTemplate('${id}'); builder.select(null);`);
    await sleep(500);
    const r = await js(`(() => { const r = document.querySelector('.deb-map-card').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    await shot(file, r);
  }
}

async function builderGif() {
  await viewport(1280, 860);
  await goto('/builder-demo.html');
  const rec = new Recorder('builder-flow.gif');
  await rec.frame(8);
  let p = await center('[data-action="templates"]');
  await mouse('mouseMoved', p.x, p.y);
  await rec.frame(3);
  await click(p.x, p.y);
  await rec.during(900);
  await rec.frame(8);
  p = await center('[data-template="theater-2"]');
  await click(p.x, p.y);
  await rec.during(500);
  p = await center('.swal2-confirm');
  await rec.frame(6);
  await click(p.x, p.y);
  await rec.during(1200);
  await rec.frame(6);
  // Select the balcony and drag it down a little.
  const box = await js(`(() => { const c = document.querySelector('.deb-canvas').getBoundingClientRect(); const r = builder.renderer.sectionNodes.get('balcon').group.getClientRect(); return { x: c.x + r.x + r.width - 30, y: c.y + r.y + 30 }; })()`);
  await click(box.x, box.y);
  await rec.during(400);
  await mouse('mousePressed', box.x, box.y);
  for (let i = 1; i <= 12; i++) {
    await mouse('mouseMoved', box.x + i * 6, box.y + i * 4);
    await rec.frame();
  }
  await mouse('mouseReleased', box.x + 72, box.y + 48);
  await rec.during(400);
  // Edit rows + price in the form and apply.
  await js(`(() => { const p = document.querySelector('.deb-panel-body'); const f = p.querySelector('[data-form]'); p.scrollTop = f.offsetTop - 40; })()`);
  await rec.frame(4);
  await js(`(() => { const p = document.querySelector('.deb-panel-body'); const c = p.querySelector('[data-draft="counts"]'); c.value = '22, 22, 24, 24, 26, 26'; c.dispatchEvent(new Event('input', { bubbles: true })); const pr = p.querySelector('[data-draft="price"]'); pr.value = '520.00'; })()`);
  await rec.frame(8);
  await js(`document.querySelector('[data-action="apply-section"]').click()`);
  await rec.during(1500);
  await rec.frame(10);
  rec.save(960);
}

async function selectorShots() {
  await viewport(1440, 900);
  await goto('/selector-demo.html?map=example:concert&mode=desktop');
  await js(`['vip_C3', 'vip_C4', 'general_G6', 'general_G7'].forEach((id) => picker.selectSeat(id));`);
  await sleep(400);
  await shot('selector-desktop.png');
  await js(`picker.createHold()`);
  await sleep(600);
  await shot('selector-desktop-hold.png');
}

const HIDE_DEMO_BAR = `(() => { const s = document.createElement('style'); s.textContent = '.demo-bar{display:none!important}'; document.head.appendChild(s); document.getElementById('selector').style.setProperty('--dem-offset', '0px'); window.dispatchEvent(new Event('resize')); })()`;

async function mobileShots() {
  await viewport(390, 844, true, 2);
  await goto('/selector-demo.html?map=example:concert&mode=auto', 2200);
  await js(HIDE_DEMO_BAR);
  await sleep(800);
  await js(`picker.fitToScreen()`);
  await sleep(500);
  await shot('mobile-map.png');
  await js(`picker.instance.renderer.zoomToSeat('vip_B4', 30)`);
  await sleep(600);
  await js(`['vip_B4', 'vip_B5'].forEach((id) => picker.selectSeat(id))`);
  await sleep(300);
  await shot('mobile-selected.png');
  await js(`picker.instance.toggleSheet(true)`);
  await sleep(400);
  await shot('mobile-cart.png');
  await js(`picker.instance.action('hold')`);
  await sleep(500);
  await shot('mobile-hold.png');
  await js(`picker.instance.action('purchase')`);
  await sleep(500);
  await shot('mobile-done.png');
  await goto('/selector-demo.html?map=template:stadium-4&mode=auto', 2200);
  await js(HIDE_DEMO_BAR);
  await sleep(800);
  await js(`picker.fitToScreen()`);
  await sleep(500);
  await shot('mobile-stadium.png');
}

async function mobileGif() {
  await viewport(390, 844, true, 1);
  await goto('/selector-demo.html?map=example:concert&mode=auto', 2200);
  await js(HIDE_DEMO_BAR);
  await sleep(800);
  await js(`picker.fitToScreen()`);
  await sleep(500);
  const rec = new Recorder('mobile-flow.gif');
  await rec.frame(10);
  const seat = (id) => js(`(() => { const r = picker.instance.renderer; const c = r.container.getBoundingClientRect(); const p = r.seatNodes.get('${id}').getAbsolutePosition(); return { x: c.x + p.x, y: c.y + p.y }; })()`);
  let p = await seat('vip_B4');
  await click(p.x, p.y); // too small: zooms in
  await rec.during(900);
  for (const id of ['vip_B4', 'vip_B5']) {
    p = await seat(id);
    await click(p.x, p.y);
    await rec.during(500);
  }
  await rec.frame(6);
  p = await center('.dem-sheet-summary');
  await click(p.x, p.y);
  await rec.during(500);
  await rec.frame(8);
  p = await center('[data-action="hold"]');
  await click(p.x, p.y);
  await rec.during(1500);
  p = await center('[data-action="purchase"]');
  await click(p.x, p.y);
  await rec.during(600);
  await rec.frame(14);
  rec.save(390);
}

try {
  cdp = new CDP(await connect());
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await builderShots();
  await builderGif();
  await selectorShots();
  await mobileShots();
  await mobileGif();
} finally {
  chrome.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
