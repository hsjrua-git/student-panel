#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Student Panel — single-user launcher (embedded PGlite, zero setup).
//
// Double-click start.bat (Windows) or run `node scripts/launch.mjs`.
// Idempotent and safe to re-run. On each launch it:
//   1. Checks Node >= 20.
//   2. Ensures server/.env has a valid SESSION_SECRET and DB_DRIVER=pglite
//      (generates the secret, never prints it, never clobbers values you set).
//   3. Installs server/ and client/ dependencies the first time.
//   4. Applies database migrations (safe to repeat).
//   5. Builds the client the first time.
//   6. Starts the server and opens your browser once it answers.
//
// The embedded database lives in data/pgdata (git-ignored). The first time the
// page opens you choose the single password; after that you just log in.
// ---------------------------------------------------------------------------
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');
const ENV_PATH = path.join(SERVER, '.env');
const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
let n = 0;
const step = (m) => console.log('\n' + bold(`[${++n}] ${m}`));
function die(msg) {
  console.error('\n' + red('Could not start: ' + msg));
  if (IS_WIN) spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' });
  process.exit(1);
}

function run(args, cwd, label) {
  const res = spawnSync(NPM, args, { cwd, stdio: 'inherit', shell: IS_WIN });
  if (res.status !== 0) die(`${label} failed (npm ${args.join(' ')}).`);
}

// 1. Node version ----------------------------------------------------------
step('Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < 20) {
  die(`Node 20 or newer is required (found ${process.versions.node}). Install it from https://nodejs.org and run this again.`);
}
console.log(`  Node ${process.versions.node} ok`);

// 2. server/.env ------------------------------------------------------------
step('Preparing configuration');
const defaults = {
  DB_DRIVER: 'pglite',
  HOST: '127.0.0.1',
  PORT: '3000',
  NODE_ENV: 'production',
  SESSION_COOKIE_SECURE: 'auto',
};
const env = {};
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
}
let changed = false;
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-with')) {
  env.SESSION_SECRET = randomBytes(48).toString('hex'); // 96 chars, never printed
  changed = true;
}
for (const [k, v] of Object.entries(defaults)) {
  if (env[k] === undefined) { env[k] = v; changed = true; }
}
if (changed) {
  const body = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, body, { mode: 0o600 });
  console.log('  wrote server/.env (session secret generated, not shown)');
} else {
  console.log('  server/.env already configured');
}
const HOST = env.HOST || '127.0.0.1';
const PORT = Number(env.PORT) || 3000;
const URL_HOST = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
const APP_URL = `http://${URL_HOST}:${PORT}/`;

// 3. dependencies -----------------------------------------------------------
step('Installing dependencies (first run only)');
if (!fs.existsSync(path.join(SERVER, 'node_modules'))) run(['install'], SERVER, 'Server install');
else console.log('  server dependencies present');
if (!fs.existsSync(path.join(CLIENT, 'node_modules'))) run(['install'], CLIENT, 'Client install');
else console.log('  client dependencies present');

// 4. migrations -------------------------------------------------------------
step('Preparing the database');
run(['run', 'migrate'], SERVER, 'Migration');

// 5. client build -----------------------------------------------------------
step('Building the app (first run only)');
if (!fs.existsSync(path.join(CLIENT, 'dist', 'index.html'))) run(['run', 'build'], CLIENT, 'Client build');
else console.log('  client already built (delete client/dist to rebuild)');

// 6. start + open -----------------------------------------------------------
step('Starting Student Panel');
const server = spawn(NPM, ['start'], { cwd: SERVER, stdio: 'inherit', shell: IS_WIN });
server.on('exit', (code) => process.exit(code ?? 0));

function openBrowser(url) {
  const cmd = IS_WIN ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = IS_WIN ? ['/c', 'start', '', url] : [url];
  spawnSync(cmd, args, { stdio: 'ignore', shell: IS_WIN });
}

let opened = false;
const deadline = Date.now() + 60_000;
(function waitForHealth() {
  const req = http.get({ host: URL_HOST, port: PORT, path: '/api/health', timeout: 1500 }, (res) => {
    res.resume();
    if (res.statusCode === 200 && !opened) {
      opened = true;
      console.log('\n' + green(`Student Panel is running at ${APP_URL}`));
      console.log('Keep this window open while you use the app; close it to stop.');
      openBrowser(APP_URL);
    }
  });
  req.on('error', retry);
  req.on('timeout', () => { req.destroy(); retry(); });
  function retry() {
    if (opened) return;
    if (Date.now() > deadline) {
      console.log('\n' + green(`Open ${APP_URL} in your browser.`));
      opened = true;
      return;
    }
    setTimeout(waitForHealth, 600);
  }
})();
