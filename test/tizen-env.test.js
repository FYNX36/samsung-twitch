'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tizenEnv = require('../tools/lib/tizen-env');

function fakeSdkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tizen sdk-'));
  fs.mkdirSync(path.join(root, 'tools', 'ide', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools', 'tizen-core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'package-manager'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'ide', 'bin', 'tizen.bat'), '@echo off\r\n');
  fs.writeFileSync(path.join(root, 'tools', 'tizen-core', 'tz.exe'), '');
  fs.writeFileSync(path.join(root, 'package-manager', 'package-manager-cli.exe'), '');
  return root;
}

test('Windows SDK probing selects native CLI entry points', () => {
  const root = fakeSdkRoot();
  try {
    const env = tizenEnv.fromSdkRoot(root, 'local', 'win32');
    assert.equal(path.basename(env.tizen), 'tizen.bat');
    assert.equal(path.basename(env.tz), 'tz.exe');
    assert.equal(path.basename(env.pkgMgr), 'package-manager-cli.exe');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows batch commands are routed through cmd.exe with quoted paths', () => {
  const root = fakeSdkRoot();
  try {
    const cli = path.join(root, 'tools', 'ide', 'bin', 'tizen.bat');
    const command = tizenEnv.commandFor(cli, ['cli-config', 'profiles.path=' + path.join(root, 'profile.xml'), '--', path.join(root, 'build output')], 'win32', 'C:\\Windows\\System32\\cmd.exe');
    assert.equal(command.file, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(command.args.slice(0, 2), ['/d', '/c']);
    assert.match(command.args[2], /^call ".*tizen\.bat" cli-config "profiles\.path=.*profile\.xml" -- ".*build output"$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows batch execution works from a path containing spaces', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tizen command-'));
  const script = path.join(root, 'echo cli.bat');
  try {
    fs.writeFileSync(script, '@echo off\r\necho tizen-cli-ok\r\n');
    const output = tizenEnv.execFileSyncCompat(script, ['version'], { encoding: 'utf8' });
    assert.match(output, /tizen-cli-ok/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

