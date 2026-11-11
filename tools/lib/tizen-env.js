'use strict';
/*
 * tools/lib/tizen-env.js — locate a Tizen CLI toolchain for release.js /
 * tizen-setup.js, so they resolve the same binaries the same way.
 *
 * Preference order:
 *   1. the project-local SDK installed by `npm run tizen:setup` (dist/.tizen-sdk/)
 *   2. an explicit $TIZEN_SDK install
 *   3. a default ~/tizen-studio install
 *   4. `tizen` already on PATH
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LOCAL_SDK_DIR = path.join(ROOT, 'dist', '.tizen-sdk');     // gitignored (under dist/)
const LOCAL_SDK_ROOT = path.join(LOCAL_SDK_DIR, 'tizen-studio'); // the SDK itself
const ENV_JSON = path.join(LOCAL_SDK_DIR, 'tizen-env.json');     // written by tizen-setup

function firstExisting(root, paths) {
  for (const rel of paths) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// Build the CLI paths for a given SDK root. Windows installs use batch/exe
// entry points while Linux/macOS installs use extensionless scripts.
function fromSdkRoot(root, source, platform = process.platform) {
  const win = platform === 'win32';
  const tizen = firstExisting(root, [
    path.join('tools', 'ide', 'bin', win ? 'tizen.bat' : 'tizen'),
    path.join('tools', 'ide', 'bin', win ? 'tizen.cmd' : 'tizen'),
  ]);
  if (!tizen) return null;
  return {
    source: source,
    sdkRoot: root,
    tizen: tizen,
    tz: firstExisting(root, [
      path.join('tools', 'tizen-core', win ? 'tz.exe' : 'tz'),
      path.join('tools', 'tizen-core', win ? 'tz.bat' : 'tz'),
    ]),
    sdb: firstExisting(root, win ? [
      path.join('tools', 'sdb.exe'),
      path.join('tools', 'sdb', 'sdb.exe'),
    ] : [path.join('tools', 'sdb')]),
    pkgMgr: firstExisting(root, [
      path.join('package-manager', win ? 'package-manager-cli.exe' : 'package-manager-cli.bin'),
      path.join('package-manager', win ? 'package-manager-cli.bat' : 'package-manager-cli'),
    ]),
  };
}

function quoteCmdArg(value) {
  const s = String(value);
  if (!(/[\s"&()^|<>]/.test(s) || /^[A-Za-z0-9_.-]+=/.test(s))) return s;
  return '"' + s.replace(/(["^])/g, '^$1') + '"';
}

// cmd.exe must launch .bat/.cmd files on Windows. Keep this in one helper so
// release.js and setup use identical quoting for SDK paths containing spaces.
function commandFor(file, args, platform = process.platform, comspec = process.env.ComSpec || 'cmd.exe') {
  const batch = /\.(bat|cmd)$/i.test(file);
  if (platform !== 'win32' || !batch) return { file: file, args: args.slice() };
  const command = ['call', quoteCmdArg(file)].concat(args.map(quoteCmdArg)).join(' ');
  return { file: comspec, args: ['/d', '/c', command] };
}

function execFileSyncCompat(file, args, options) {
  const command = commandFor(file, args);
  if (command.file === (process.env.ComSpec || 'cmd.exe') && process.platform === 'win32') {
    options = Object.assign({}, options || {}, { windowsVerbatimArguments: true });
  }
  return execFileSync(command.file, command.args, options);
}

// Returns { source, sdkRoot, tizen, tz, sdb, pkgMgr } or null if no CLI is found.
function resolve() {
  // 1. env.json written by tizen-setup (authoritative; tolerates layout drift)
  if (fs.existsSync(ENV_JSON)) {
    try {
      const e = JSON.parse(fs.readFileSync(ENV_JSON, 'utf8'));
      if (e.tizen && fs.existsSync(e.tizen)) return Object.assign({ source: 'local' }, e);
    } catch (err) { /* fall through to layout probing */ }
  }
  // 2. project-local SDK, default layout
  const local = fromSdkRoot(LOCAL_SDK_ROOT, 'local');
  if (local) return local;
  // 3. $TIZEN_SDK
  if (process.env.TIZEN_SDK) {
    const env = fromSdkRoot(process.env.TIZEN_SDK, 'env');
    if (env) return env;
  }
  // 4. ~/tizen-studio
  const home = path.join(os.homedir(), 'tizen-studio');
  const homeSdk = fromSdkRoot(home, 'home');
  if (homeSdk) return homeSdk;
  // 5. on PATH
  for (const cli of process.platform === 'win32' ? ['tizen.bat', 'tizen.cmd', 'tizen'] : ['tizen']) {
    try {
      execFileSyncCompat(cli, ['version'], { stdio: 'ignore' });
      return { source: 'path', sdkRoot: null, tizen: cli, tz: 'tz', sdb: 'sdb', pkgMgr: null };
    } catch (e) { /* not found */ }
  }
  return null;
}

module.exports = {
  resolve: resolve,
  fromSdkRoot: fromSdkRoot,
  commandFor: commandFor,
  execFileSyncCompat: execFileSyncCompat,
  ROOT: ROOT,
  LOCAL_SDK_DIR: LOCAL_SDK_DIR,
  LOCAL_SDK_ROOT: LOCAL_SDK_ROOT,
  ENV_JSON: ENV_JSON
};
