// Keyboard-only end-to-end tests: the built app against the real bridge
// (bridge/tests/e2e_server.py: the FastAPI app in front of a fake Instagram
// client) and a local stand-in for Instagram's CDN.
//
//   npm run build && npm run test:e2e              (Chromium + Firefox)
//   E2E_BROWSERS=firefox npm run test:e2e
//   BRIDGE_PYTHON=/path/to/venv/bin/python npm run test:e2e
//
// The app is served like the Lumen host serves a package (static files, SPA
// fallback) on 127.0.0.1:4173, the bridge on 8790 and the CDN on 8791, so every
// call is a real cross-origin request with a CORS preflight. Images go through
// the bridge's signed links (the CDN stand-in sends CORP same-origin on images,
// as Instagram's does); videos come from the CDN directly.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {chromium, firefox} from 'playwright';
import {fakeAudioScript} from './fakeAudio.mjs';
import {startStaticServer} from './static-server.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const outDir = path.join(root, '.e2e-output');
const APP = 'http://127.0.0.1:4173';
const PACKAGE_APP = 'http://127.0.0.1:5500';
const BRIDGE_PORT = 8790;
const CDN_PORT = 8791;
const BRIDGE = `http://127.0.0.1:${BRIDGE_PORT}`;
const CDN = `http://127.0.0.1:${CDN_PORT}`;
const KEY = 'e2e-bridge-key-0123456789abcdef';
const ANA = '340282366841710300949128000000000001';
const browsers = (process.env.E2E_BROWSERS ?? 'chromium,firefox').split(',');
const assets = path.join(root, 'src', 'demo', 'assets');
const results = [];

fs.mkdirSync(outDir, {recursive: true});

// ------------------------------------------------------------------ servers

/** Instagram's CDN, locally: videos by shortcode, every picture the same, the voice note. */
function startCdn() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, CDN);
    let file;
    let type;
    if (url.pathname.startsWith('/video/')) {
      [file, type] = url.pathname.includes('voice')
        ? ['voice.ogg', 'audio/ogg']
        : [url.pathname.includes('DBloom') ? 'tulips.webm' : url.pathname.includes('DMaya') ? 'ridge.webm' : 'market.webm', 'video/webm'];
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    } else if (url.pathname.startsWith('/cdn/')) {
      [file, type] = [url.pathname.includes('DBloom') ? 'tulips.webp' : 'ridge.webp', 'image/webp'];
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    } else {
      res.writeHead(404).end();
      return;
    }
    const body = fs.readFileSync(path.join(assets, file));
    res.writeHead(200, {'Content-Type': type, 'Content-Length': body.length, 'Accept-Ranges': 'none'});
    res.end(body);
  });
  return new Promise(resolve => server.listen(CDN_PORT, '127.0.0.1', () => resolve(server)));
}

async function startBridge() {
  const python = process.env.BRIDGE_PYTHON ?? 'python3';
  const child = spawn(python, [path.join(root, 'bridge', 'tests', 'e2e_server.py'), '--port', String(BRIDGE_PORT), '--media', CDN, '--key', KEY], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BRIDGE}/v1/health`)).ok) return child;
    } catch {
      // Not up yet.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('the bridge did not start');
}

const control = (pathname, method = 'POST') => fetch(`${BRIDGE}${pathname}`, {method}).then(response => response.json());
const reset = () => control('/__test/reset');
const failWith = code => control(`/__test/fail?code=${code}`);
const calls = () => control('/__test/calls', 'GET');
/** The writes the fake Instagram client received, as "name arg arg". */
const writes = async () => (await calls()).filter(call => call[0] !== 'read').map(call => call.join(' '));

// ------------------------------------------------------------------ helpers

async function focusLabel(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return '(body)';
    return (element.getAttribute('aria-label') || element.textContent || element.tagName).replace(/\s+/g, ' ').trim();
  });
}

async function press(page, key, times = 1, wait = 350) {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
  }
}

/** Moves focus with `key` until its label matches, or fails. */
async function focusUntil(page, key, pattern, limit = 12) {
  for (let i = 0; i <= limit; i += 1) {
    const label = await focusLabel(page);
    if (pattern.test(label)) return label;
    await press(page, key);
  }
  throw new Error(`focus never matched ${pattern}; last: ${await focusLabel(page)}`);
}

async function waitText(page, text, timeout = 10000) {
  await page.getByText(text, {exact: false}).first().waitFor({state: 'visible', timeout});
}

async function waitFor(check, message, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`timed out: ${message}`);
}

async function waitWrite(pattern) {
  let last = [];
  await waitFor(async () => (last = await writes()).some(write => pattern.test(write)), `a write like ${pattern}; got ${JSON.stringify(last)}`);
}

/** Simulates the platform dictation composer: `input` events, then `change`. */
async function dictate(page, text) {
  await page.evaluate(value => {
    const field = document.activeElement;
    if (!(field instanceof HTMLTextAreaElement)) throw new Error('reply field is not focused');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, value);
    field.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
  }, text);
  await page.waitForTimeout(200);
}

/** The video on screen is playing (muted autoplay counts) from the CDN stand-in. */
async function playingVideo(page) {
  return page.evaluate(cdn => {
    return [...document.querySelectorAll('video')].some(video => !video.paused && video.readyState >= 2 && video.currentSrc.startsWith(cdn));
  }, CDN);
}

/** Some picture shown through the bridge's signed links has loaded. */
async function proxiedImageLoaded(page) {
  return page.evaluate(bridge => {
    return [...document.querySelectorAll('img')].some(img => img.src.startsWith(`${bridge}/v1/m/`) && img.complete && img.naturalWidth > 0);
  }, BRIDGE);
}

const bridgeConfig = {'bridge.url': BRIDGE, 'bridge.key': KEY};

async function openApp(browser, name, config, {appUrl = APP, audio = false, path: startPath = '/'} = {}) {
  const context = await browser.newContext({viewport: {width: 600, height: 600}, locale: 'en-US'});
  await context.addInitScript(values => {
    localStorage.setItem('lumen-instagram.dev-config', JSON.stringify(values));
  }, config);
  if (audio) {
    await context.addInitScript(fakeAudioScript(`${APP}/voice.ogg`));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${appUrl}${startPath}`);
  let step = 0;
  return {
    page,
    context,
    errors,
    shot: label => page.screenshot({path: path.join(outDir, `${name}-${String((step += 1)).padStart(2, '0')}-${label}.png`)}),
  };
}

// ------------------------------------------------------------------ scenarios

const scenarios = {
  async 'setup screen without settings'(browser, name) {
    const {page, context, shot} = await openApp(browser, name, {});
    await waitText(page, 'Connect your bridge');
    await waitText(page, 'Bridge URL and Bridge key');
    assert.match(await focusLabel(page), /Check again/);
    await shot('setup');
    await context.close();
  },

  async 'wrong key, ended session and challenge'(browser, name) {
    await reset();
    let {page, context, shot} = await openApp(browser, name, {...bridgeConfig, 'bridge.key': 'x'.repeat(32)});
    await waitText(page, 'The bridge refused the key');
    await shot('bad-key');
    await context.close();

    await failWith('login_required');
    ({page, context, shot} = await openApp(browser, name, bridgeConfig));
    await waitText(page, 'Sign in on your bridge');
    await shot('login-required');
    await failWith('challenge');
    await press(page, 'Enter');
    await waitText(page, 'Confirm it is you');
    await shot('challenge');
    await failWith('none');
    assert.match(await focusLabel(page), /Try again/);
    await press(page, 'Enter');
    await waitText(page, 'First snow on the ridge');
    await context.close();
  },

  async 'reels: next, pause, like, save, comments and Back'(browser, name) {
    await reset();
    const {page, context, errors, shot} = await openApp(browser, name, bridgeConfig);
    await waitText(page, 'First snow on the ridge');
    assert.match(await focusLabel(page), /Reel by maya\.outdoors/);
    await waitFor(() => playingVideo(page), 'the first reel plays from the CDN');
    await waitFor(() => proxiedImageLoaded(page), 'a picture loads through the bridge');
    await shot('first-reel');

    await press(page, 'ArrowDown', 1, 900);
    assert.match(await focusLabel(page), /Reel by studio\.bloom/);
    await waitFor(() => playingVideo(page), 'the second reel plays');
    await shot('second-reel');

    // Enter pauses and focuses Like.
    await press(page, 'Enter', 1, 600);
    assert.match(await focusLabel(page), /^Like, 1\.2K likes/);
    await waitFor(async () => !(await playingVideo(page)), 'the reel pauses');
    await shot('paused');
    await press(page, 'Enter');
    await waitText(page, 'Liked');
    await waitWrite(/^media_like 3101_2004$/);

    await focusUntil(page, 'ArrowRight', /^Save$/);
    await press(page, 'Enter');
    await waitText(page, 'Saved');
    await waitWrite(/^media_save 3101_2004$/);

    // Comments, and back to the paused reel with the focus on Comments.
    await focusUntil(page, 'ArrowLeft', /comments$/);
    await press(page, 'Enter');
    await waitText(page, 'Which trail is this?');
    await shot('comments');
    await press(page, 'Escape', 1, 900);
    assert.match(await focusLabel(page), /comments$/);
    // Back on a paused reel resumes it.
    await press(page, 'Escape', 1, 700);
    assert.match(await focusLabel(page), /Reel by studio\.bloom.*Playing/);
    await waitFor(() => playingVideo(page), 'the reel plays again');
    assert.deepEqual(errors, []);
    await context.close();
  },

  async 'send a reel to a conversation'(browser, name) {
    await reset();
    const {page, context, shot} = await openApp(browser, name, bridgeConfig);
    await waitText(page, 'First snow on the ridge');
    await press(page, 'Enter', 1, 600);
    await focusUntil(page, 'ArrowRight', /^Send$/);
    await press(page, 'Enter');
    await waitText(page, 'Climbing crew');
    await focusUntil(page, 'ArrowDown', /ana\.costa/);
    await shot('send-to');
    await press(page, 'Enter');
    await waitText(page, 'Sent to ana.costa');
    await waitWrite(new RegExp(`^direct_media_share 3100_2001 \\(${ANA},\\) video$`));
    await shot('sent');
    await context.close();
  },

  async 'direct: inbox, conversation, reaction, reply and read mark'(browser, name) {
    await reset();
    const {page, context, errors, shot} = await openApp(browser, name, bridgeConfig);
    await waitText(page, 'First snow on the ridge');
    await press(page, 'ArrowRight', 1, 900);
    await waitText(page, 'Climbing crew');
    assert.match(await focusLabel(page), /ana\.costa/);
    await waitFor(() => proxiedImageLoaded(page), 'avatars load through the bridge');
    await shot('inbox');

    await press(page, 'Enter', 1, 900);
    await waitText(page, 'The place I told you about');
    await waitWrite(new RegExp(`^direct_message_seen ${ANA} 5005$`));
    await shot('thread');

    await focusUntil(page, 'ArrowUp', /The place I told you about/);
    await press(page, 'Enter');
    await focusUntil(page, 'ArrowRight', /React with 😂/, 4);
    await press(page, 'Enter');
    await waitText(page, 'Reacted 😂');
    await waitWrite(new RegExp(`^direct_send_reaction ${ANA} 5003 😂$`));

    await focusUntil(page, 'ArrowDown', /^(Reply|Voice)$/);
    await focusUntil(page, 'ArrowLeft', /^Reply$/, 2);
    await press(page, 'Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA');
    await dictate(page, 'Saturday works');
    await focusUntil(page, 'ArrowRight', /Send/, 3);
    await press(page, 'Enter');
    await waitText(page, 'Message sent');
    await waitWrite(new RegExp(`^direct_send Saturday works \\(${ANA},\\)$`));
    await waitText(page, 'Saturday works');
    await shot('replied');
    assert.deepEqual(errors, []);
    await context.close();
  },

  async 'a voice message from the glasses'(browser, name) {
    await reset();
    const {page, context, shot} = await openApp(browser, name, bridgeConfig, {audio: true, path: `/direct/${ANA}`});
    await waitText(page, 'The place I told you about');
    await focusUntil(page, 'ArrowDown', /^Voice$/, 6);
    await press(page, 'Enter', 1, 1200);
    await waitText(page, 'Recording');
    await shot('recording');
    assert.match(await focusLabel(page), /^Send$/);
    await press(page, 'Enter');
    await waitText(page, 'Voice message sent', 15000);
    await waitWrite(new RegExp(`^direct_send_voice \\.m4a True \\(${ANA},\\) 70$`));
    await context.close();
  },

  async 'a reel someone sent, with quick replies'(browser, name) {
    await reset();
    const {page, context, shot} = await openApp(browser, name, bridgeConfig, {path: `/direct/${ANA}`});
    await waitText(page, 'The place I told you about');
    await focusUntil(page, 'ArrowUp', /Reel by studio\.bloom/);
    await press(page, 'Enter');
    assert.match(await focusLabel(page), /^Play$/);
    await press(page, 'Enter', 1, 1000);
    await waitText(page, 'From ana.costa');
    await waitText(page, 'Tulip season at the flower market.');
    await waitFor(() => playingVideo(page), 'the shared reel plays');
    assert.ok((await calls()).some(call => call[0] === 'read' && call[1] === 'media/3101/info/'), 'the reel is fetched by its shortcode');
    await shot('shared-reel');
    await focusUntil(page, 'ArrowDown', /React with|Reply|Send/, 3);
    await focusUntil(page, 'ArrowLeft', /React with a heart/, 4);
    await press(page, 'ArrowUp');
    assert.match(await focusLabel(page), /Reel by studio\.bloom/, 'up goes back to the reel');
    await focusUntil(page, 'ArrowDown', /React with|Reply|Send/, 2);
    await focusUntil(page, 'ArrowLeft', /React with a heart/, 4);
    await press(page, 'Enter');
    await waitText(page, 'Reacted ❤️');
    await waitWrite(new RegExp(`^direct_send_reaction ${ANA} 5002 ❤️$`));
    await context.close();
  },

  async 'an Instagram notification opens its conversation'(browser, name) {
    await reset();
    const {page, context, shot} = await openApp(browser, name, bridgeConfig, {path: '/open/Climbing%20crew'});
    await waitText(page, 'Saturday, 7 am at the gate?');
    assert.match(page.url(), /\/direct\/340282366841710300949128000000000002$/);
    await shot('opened');
    await press(page, 'Escape', 1, 900);
    await waitText(page, 'ana.costa');
    await context.close();
  },

  async 'demo mode without a bridge'(browser, name) {
    const {page, context, shot} = await openApp(browser, name, {demo: 'demo-captures'});
    await waitText(page, 'First snow on the ridge');
    await waitFor(() => page.evaluate(() => [...document.querySelectorAll('video')].some(video => !video.paused)), 'a demo reel plays');
    await press(page, 'ArrowRight', 1, 900);
    await waitText(page, 'Climbing crew');
    await shot('demo-direct');
    await context.close();
  },

  async 'the offline package'(browser, name) {
    await reset();
    const {page, context} = await openApp(browser, name, bridgeConfig, {appUrl: PACKAGE_APP});
    await waitText(page, 'First snow on the ridge');
    await context.close();
  },
};

// ------------------------------------------------------------------ run

const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('build first: npm run build');
}
fs.copyFileSync(path.join(assets, 'voice.ogg'), path.join(dist, 'voice.ogg'));
const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-instagram-package-'));
const zip = path.join(dist, 'lumen-instagram.mrbd.zip');
if (fs.existsSync(zip)) {
  for (const [file, data] of Object.entries(unzipSync(new Uint8Array(fs.readFileSync(zip))))) {
    fs.mkdirSync(path.dirname(path.join(packageDir, file)), {recursive: true});
    fs.writeFileSync(path.join(packageDir, file), data);
  }
}

const servers = [await startCdn(), await startStaticServer(dist, 4173)];
if (fs.existsSync(path.join(packageDir, 'index.html'))) {
  servers.push(await startStaticServer(packageDir, 5500));
} else {
  delete scenarios['the offline package'];
}
const bridge = await startBridge();

try {
  for (const browserName of browsers) {
    const browser = await (browserName === 'firefox' ? firefox : chromium).launch();
    for (const [title, scenario] of Object.entries(scenarios)) {
      const name = `${browserName}-${title.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')}`;
      const started = Date.now();
      try {
        await scenario(browser, name);
        results.push({browser: browserName, title, ok: true, ms: Date.now() - started});
        console.log(`ok   ${browserName} ${title}`);
      } catch (error) {
        results.push({browser: browserName, title, ok: false, error: String(error?.stack ?? error)});
        console.log(`FAIL ${browserName} ${title}\n     ${String(error?.message ?? error).split('\n').join('\n     ')}`);
      }
    }
    await browser.close();
  }
} finally {
  bridge.kill();
  for (const server of servers) server.close();
}

const failed = results.filter(result => !result.ok);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
