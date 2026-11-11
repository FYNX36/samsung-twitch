'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The browse scene is DOM-heavy; stub TW.dom richly enough to exercise the
// Following view's sectioned build, focus model, and routing without a real
// DOM. Elements track appended children and expose zeroed layout metrics so the
// selection-frame math runs without throwing.
function setup(opts) {
  opts = opts || {};
  const els = {};
  function mk() {
    const e = {
      style: {}, className: '', textContent: '', innerHTML: '', children: [], _inner: null,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter((child) => child !== c); if (c.parentNode === this) { c.parentNode = null; } return c; },
      getElementsByTagName() { return []; },
      offsetLeft: 0, offsetTop: 0, offsetWidth: 100, offsetHeight: 60, clientHeight: 600,
    };
    Object.defineProperty(e, 'firstChild', {
      get() { return this.children[0] || (this._inner || (this._inner = mk())); },
    });
    Object.defineProperty(e, 'childNodes', { get() { return this.children; } });
    return e;
  }
  const get = (id) => (els[id] || (els[id] = mk()));
  const calls = { goToChannel: [], goToChannelPage: [], goToLogin: 0 };
  const apiCalls = { followedStreams: 0, followedGames: 0, followedChannels: 0, topStreams: 0, topGames: 0, streamsByGame: 0 };
  const delayed = [];
  const pendingHome = { followedStreams: [], topStreams: [] };

  const dom = {
    create: (t, c, h) => { const e = mk(); if (c) { e.className = c; } if (h != null) { e.innerHTML = h; } return e; },
    get,
    text(e, v) { if (e) { e.textContent = v; } },
    html(e, v) { if (e) { e.innerHTML = v; e.children = []; } },
    attr() {},
    addClass(e, c) { if (e) { e.className = (e.className ? e.className + ' ' : '') + c; } },
    removeClass(e, c) { if (e) { e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, ''); } },
    show(e, d) { if (e) { e.style.display = d || 'block'; } },
    hide(e) { if (e) { e.style.display = 'none'; } },
    escape: (s) => String(s == null ? '' : s),
    on() {},
  };

  const TW = {
    dom,
    KEY: { BACK: 'back', ENTER: 'enter', UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', RED: 'red', GREEN: 'green', YELLOW: 'yellow' },
    i18n: { t: (k, ...args) => args.length ? `${k}:${args.join(',')}` : k },
    config: { columns: 4 },
    delay: (ms, fn) => { delayed.push({ ms, fn }); },
    shortNumber: (n) => String(n),
    addCommas: (n) => String(n),
    auth: { isLoggedIn: () => opts.loggedIn !== false, user: () => ({ display: 'Me' }) },
    api: {
      followedStreams: (cursor, ok, fail) => {
        apiCalls.followedStreams++;
        if (opts.deferHomeData) { pendingHome.followedStreams.push({ ok, fail }); return; }
        if (opts.followedStreamsFail) { fail(opts.followedStreamsStatus || 0); return; }
        ok({ items: (opts.live || []).slice(), cursor: null });
      },
      followedGames: (ok, fail) => {
        apiCalls.followedGames++;
        if (opts.followedGamesFail) { fail(opts.followedGamesStatus || 0); return; }
        ok({ items: (opts.categories || []).slice(), cursor: false });
      },
      followedChannels: (cursor, ok, fail) => {
        apiCalls.followedChannels++;
        if (opts.followedChannelsFail) { fail(opts.followedChannelsStatus || 0); return; }
        ok({ items: (opts.follows || []).slice(), cursor: null });
      },
      topStreams: (cursor, ok, fail) => {
        apiCalls.topStreams++;
        if (opts.deferHomeData) { pendingHome.topStreams.push({ ok, fail }); return; }
        if (opts.topStreamsFail) { fail(opts.topStreamsStatus || 0); return; }
        ok({ items: (opts.streams || []).slice(), cursor: null });
      },
      topGames: (cursor, ok) => { apiCalls.topGames++; ok({ items: (opts.games || []).slice(), cursor: null }); },
      streamsByGame: (game, cursor, ok) => { apiCalls.streamsByGame++; ok({ items: (opts.gameStreams || []).slice(), cursor: null }); },
      categoryInfo: (game, ok) => ok(opts.categoryInfo || game),
    },
    app: {
      goToChannel: (l) => calls.goToChannel.push(l),
      goToChannelPage: (l) => calls.goToChannelPage.push(l),
      goToLogin: () => { calls.goToLogin++; },
    },
    log: { warn() {}, info() {} },
    sceneManager: { focusedName: () => 'browser' },
  };

  const g = { TW, window: null, document: { body: mk() }, Math, JSON };
  g.window = g; g.self = g; g.globalThis = g;
  vm.createContext(g);
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'src/core/scenes/browser-scene.js'), 'utf8');
  vm.runInContext(code, g, { filename: 'browser-scene.js' });
  const scene = new TW.BrowserScene(opts.adapter || {});
  scene.initialize();
  return { scene, calls, els, apiCalls, delayed, pendingHome, MODE: TW.BrowserScene.MODE, KEY: TW.KEY };
}

const stream = (login, display, extra) => Object.assign(
  { kind: 'stream', login, display: display || login, title: 't', viewers: 1, thumb: '' },
  extra || {},
);
const channel = (login, display) => ({ kind: 'channel', login, display: display || login, avatar: '' });
const game = (display) => ({ kind: 'game', name: display, display, viewers: 1, box: '' });

// Development-only authenticated homepage fixture. The real auth and API
// implementations are untouched; setup() supplies deterministic responses.
const authenticatedHomepageFixture = () => setup({
  loggedIn: true,
  live: [
    stream('followed-alpha', 'Followed Alpha', { title: 'Alpha live', viewers: 120 }),
    stream('followed-beta', 'Followed Beta', { title: 'Beta live', viewers: 80 }),
    stream('followed-gamma', 'Followed Gamma', { title: 'Gamma live', viewers: 40 }),
  ],
  streams: [
    stream('followed-alpha', 'Followed Alpha', { title: 'Alpha live', viewers: 120 }),
    stream('discover-delta', 'Discover Delta', { title: 'Delta live', viewers: 60 }),
    stream('discover-epsilon', 'Discover Epsilon', { title: 'Epsilon live', viewers: 30 }),
    stream('discover-zeta', 'Discover Zeta', { title: 'Zeta live', viewers: 20 }),
  ],
});

test('zero follows shows the empty state and builds no rows', () => {
  const { scene, els, MODE } = setup({ live: [], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 0);
  assert.notEqual(els['tw-follow-empty'].style.display, 'none'); // shown
  assert.equal(els['tw-follow'].style.display, 'none');          // grid hidden
});

test('logged-out Following stays in the tab and suggests logging in', () => {
  const { scene, calls, els, MODE } = setup({ loggedIn: false });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.mode, MODE.FOLLOWED);
  assert.equal(calls.goToLogin, 0);
  assert.equal(scene.fRows.length, 0);
  assert.equal(scene.loading, false);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_LOGIN');
  assert.notEqual(els['tw-follow-empty'].style.display, 'none');
  assert.equal(els['tw-follow'].style.display, 'none');
});

test('auth-disabled adapters hide Login and Following navigation', () => {
  const { scene, calls, els, apiCalls, MODE, KEY } = setup({
    adapter: { auth: { enabled: false } },
    streams: [stream('a')],
    games: [game('Chess')],
  });

  assert.equal(els['tw-account'].style.display, 'none');
  assert.equal(els['tw-tip-followed'].style.display, 'none');

  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(apiCalls.followedStreams, 0);
  assert.equal(apiCalls.followedChannels, 0);

  scene.handleKeyDown(KEY.YELLOW);
  assert.equal(scene.mode, MODE.ALL);

  scene.focusTopNav();
  scene.handleTopNavKey(KEY.RIGHT);
  scene.handleTopNavKey(KEY.RIGHT);
  assert.equal(scene.navIndex, 1, 'only Channels and Categories remain in top nav');
  scene.handleTopNavKey(KEY.ENTER);
  assert.equal(calls.goToLogin, 0);
  assert.equal(scene.mode, MODE.GAMES);
});

test('live + offline render as two sections, with live channels excluded from offline', () => {
  const { scene, MODE } = setup({
    live: [stream('a', 'A')],
    // 'a' is live, so it must NOT appear again in the offline section.
    follows: [channel('a', 'A'), channel('b', 'B')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 2, 'one live row + one offline row');
  assert.equal(scene.fRows[0].items[0].kind, 'stream');
  assert.equal(scene.fRows[1].items[0].kind, 'channel');
  assert.equal(scene.fRows[1].items[0].login, 'b', 'live channel a filtered out of offline');
});

test('Following renders Live Categories before live and offline rows', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
      Object.assign(game('Offline Game'), { viewers: 0, followers: 20 }),
    ],
    live: [stream('a', 'A')],
    follows: [channel('a', 'A'), channel('c', 'C')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories.length, 1, 'duplicate live categories are merged');
  assert.equal(scene.fCategories[0].name, 'Chess');
  assert.equal(scene.fCategories[0].viewers, 5);
  assert.equal(scene.fRows.length, 3, 'category row + live row + offline row');
  assert.equal(scene.fRows[0].items[0].kind, 'game');
  assert.equal(scene.fRows[1].items[0].kind, 'stream');
  assert.equal(scene.fRows[2].items[0].kind, 'channel');
});

test('Following category section uses game rail compensation only for category rows', () => {
  const { scene, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 5, box: 'http://img/chess.jpg' })],
    live: [stream('a', 'A')],
    follows: [channel('b', 'B')],
  });
  scene.switchMode(MODE.FOLLOWED, true);

  assert.match(scene.fRows[0].el.parentNode.parentNode.className, /tw-sec-game/);
  assert.doesNotMatch(scene.fRows[1].el.parentNode.parentNode.className, /tw-sec-game/);
  assert.doesNotMatch(scene.fRows[2].el.parentNode.parentNode.className, /tw-sec-game/);

  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src/ui/styles.css'), 'utf8');
  assert.match(css, /\.tw-sec-game\s*\{[^}]*margin-left: -5px;[^}]*margin-right: -5px;/s);
  assert.match(css, /\.tw-sec-game \.tw-sec-head\s*\{[^}]*padding-left: 13px;[^}]*padding-right: 13px;/s);
});

test('Following sorts live categories and live channels by viewer count', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Low Category'), { viewers: 5 }),
      Object.assign(game('High Category'), { viewers: 50 }),
    ],
    live: [
      stream('low-live', 'Low Live', { viewers: 7 }),
      stream('high-live', 'High Live', { viewers: 70 }),
    ],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories[0].name, 'High Category');
  assert.equal(scene.fLive[0].login, 'high-live');
  assert.equal(scene.fRows[0].items[0].name, 'High Category');
  assert.equal(scene.fRows[1].items[0].login, 'high-live');
});

test('Following shows followed live categories even when matching followed channels are not live', () => {
  const { scene, MODE } = setup({
    categories: [
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
    ],
    live: [],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fCategories.length, 1);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].items[0].name, 'Chess');
});

test('Following preserves live categories when channel follow loading fails', () => {
  const { scene, els, MODE } = setup({
    categories: [
      Object.assign(game('Chess'), { viewers: 5, followers: 20, box: 'http://img/chess.jpg' }),
    ],
    live: [],
    followedChannelsFail: true,
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].items[0].name, 'Chess');
  assert.equal(els['tw-follow-empty'].style.display, 'none');
  assert.notEqual(els['tw-follow'].style.display, 'none');
});

test('Following shows a scoped re-login state when the token lacks follow access', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [],
    followedChannelsFail: true,
    followedChannelsStatus: 'scope',
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.loading, false);
  assert.equal(scene.fRows.length, 0);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_SCOPE_ERR');
  assert.notEqual(els['tw-follow-empty'].style.display, 'none');
});

test('Following shows the scoped re-login state immediately when live follows fail on scope', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [channel('a')],
    followedStreamsFail: true,
    followedStreamsStatus: 'scope',
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.loading, false);
  assert.equal(scene.fRows.length, 0);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_SCOPE_ERR');
  assert.equal(els['tw-follow'].style.display, 'none');
});

test('Following returns to the login prompt when a cleared session reaches channel loading', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [],
    followedChannelsFail: true,
    followedChannelsStatus: -1,
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.loading, false);
  assert.equal(scene.fRows.length, 0);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_LOGIN');
  assert.equal(els['tw-follow'].style.display, 'none');
});

test('Following uses a followed-channel-specific empty error instead of the generic stream error', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [],
    followedChannelsFail: true,
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.loading, false);
  assert.equal(scene.fRows.length, 0);
  assert.equal(els['tw-follow-empty'].textContent, 'FOLLOW_LOAD_ERR');
  assert.notEqual(els['tw-follow-empty'].style.display, 'none');
  assert.notEqual(els['tw-b-loading'].style.display, 'block');
});

test('a lone live tile remains a single focused rail card', () => {
  const { scene, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].cells.length, 1, 'one focusable cell');
  assert.equal(scene.fRows[0].el.children.length, 1);
});

test('a lone homepage Discover tile remains focused without a flat grid', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  assert.equal(els['tw-home'].style.display, 'block');
  assert.equal(scene.homeRows.length, 1);
  assert.equal(scene.homeRows[0].cells.length, 1, 'one focusable Discover tile');
});

test('Channels homepage shows followed live first and deduplicates Discover streams', () => {
  const { scene, MODE, apiCalls } = setup({
    live: [stream('followed', 'Followed')],
    streams: [stream('followed', 'Followed'), stream('discover', 'Discover')],
  });
  scene.switchMode(MODE.ALL, true);
  assert.equal(apiCalls.followedStreams, 1);
  assert.equal(apiCalls.topStreams, 1);
  assert.equal(scene.homeRows.length, 2);
  assert.equal(scene.homeRows[0].id, 'following');
  assert.equal(scene.homeRows[0].items[0].login, 'followed');
  assert.equal(scene.homeRows[1].id, 'discover');
  assert.equal(scene.homeRows[1].items.map((item) => item.login).join(','), 'discover');
});

test('logged-out Channels homepage omits Following and keeps Discover', () => {
  const { scene, MODE, apiCalls } = setup({
    loggedIn: false,
    live: [stream('followed')],
    streams: [stream('discover')],
  });
  scene.switchMode(MODE.ALL, true);
  assert.equal(apiCalls.followedStreams, 0);
  assert.equal(scene.homeRows.length, 1);
  assert.equal(scene.homeRows[0].id, 'discover');
});

test('homepage handles empty followed results and Discover loading errors', () => {
  const emptyFollowed = setup({ live: [], streams: [stream('discover')] });
  emptyFollowed.scene.switchMode(emptyFollowed.MODE.ALL, true);
  assert.equal(emptyFollowed.scene.homeRows.length, 1);
  assert.equal(emptyFollowed.scene.homeRows[0].id, 'discover');

  const failedDiscover = setup({ live: [stream('followed')], topStreamsFail: true });
  failedDiscover.scene.switchMode(failedDiscover.MODE.ALL, true);
  assert.equal(failedDiscover.scene.homeRows.length, 1);
  assert.equal(failedDiscover.scene.homeRows[0].id, 'following');

  const failedAll = setup({ live: [], topStreamsFail: true, followedStreamsFail: true });
  failedAll.scene.switchMode(failedAll.MODE.ALL, true);
  assert.equal(failedAll.scene.homeRows.length, 0);
  assert.notEqual(failedAll.els['tw-b-loading'].style.display, 'none');
});

test('homepage rails navigate horizontally and vertically and restore playback focus', () => {
  const { scene, calls, MODE, KEY } = authenticatedHomepageFixture();
  scene.switchMode(MODE.ALL, true);
  assert.equal(scene.homeRows.length, 2);
  assert.equal(scene.homeRows[0].id, 'following');
  assert.equal(scene.homeRows[1].id, 'discover');
  assert.equal(scene.homeRows[0].items.length, 3);
  assert.equal(scene.homeRows[1].items.length, 3);
  var following = scene.homeRows[0];
  following.railViewport.offsetWidth = 600;
  following.railViewport.clientWidth = 600;
  for (var i = 0; i < following.cells.length; i++) {
    following.cells[i].offsetLeft = i * 300;
    following.cells[i].offsetWidth = 300;
  }
  scene.handleKeyDown(KEY.RIGHT);
  assert.equal(scene.hc, 1);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1, 'DOWN at the last visible rail stays on that rail');
  scene.handleKeyDown(KEY.UP);
  assert.equal(scene.hr, 0);
  assert.equal(scene.hc, 0);
  scene.handleKeyDown(KEY.ENTER);
  assert.deepEqual(calls.goToChannel, ['followed-alpha']);
  scene.handleHide();
  scene.handleShow();
  scene.handleFocus();
  assert.equal(scene.hr, 0);
  assert.equal(scene.hc, 0);
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
});

test('authenticated homepage uses local focus across both visible rails', () => {
  const { scene, els, MODE, KEY } = authenticatedHomepageFixture();
  scene.switchMode(MODE.ALL, true);
  scene.homeRows[0].railViewport.clientWidth = 1200;
  scene.homeRows[0].railViewport.offsetWidth = 1200;
  scene.homeRows[1].railViewport.clientWidth = 1200;
  scene.homeRows[1].railViewport.offsetWidth = 1200;
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1);
  assert.doesNotMatch(scene.homeRows[0].cells[0].firstChild.className, /tw-focused/);
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
  scene.handleKeyDown(KEY.RIGHT);
  assert.doesNotMatch(scene.homeRows[1].cells[0].firstChild.className, /tw-focused/);
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
});

test('homepage vertical navigation uses spatial columns instead of remembered columns', () => {
  const { scene, MODE, KEY } = authenticatedHomepageFixture();
  scene.switchMode(MODE.ALL, true);
  scene.homeRows[0].railViewport.clientWidth = 1200;
  scene.homeRows[0].railViewport.offsetWidth = 1200;
  scene.homeRows[1].railViewport.clientWidth = 1200;
  scene.homeRows[1].railViewport.offsetWidth = 1200;
  for (var r = 0; r < scene.homeRows.length; r++) {
    for (var c = 0; c < scene.homeRows[r].cells.length; c++) {
      scene.homeRows[r].cells[c].offsetLeft = c * 300;
      scene.homeRows[r].cells[c].offsetWidth = 300;
    }
  }
  scene.handleKeyDown(KEY.DOWN);
  scene.handleKeyDown(KEY.RIGHT);
  scene.handleKeyDown(KEY.RIGHT);
  assert.equal(scene.hc, 2);
  scene.handleKeyDown(KEY.UP);
  assert.equal(scene.hr, 0);
  assert.equal(scene.hc, 2);
  scene.handleKeyDown(KEY.LEFT);
  scene.handleKeyDown(KEY.LEFT);
  assert.equal(scene.hc, 0);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1);
  assert.equal(scene.hc, 0, 'Following #1 returns to Discover #1');
});

test('homepage vertical navigation chooses aligned cards across different rail lengths and scrolls', () => {
  const { scene, MODE, KEY } = setup({
    live: [stream('f1'), stream('f2')],
    streams: [stream('d1'), stream('d2'), stream('d3')],
  });
  scene.switchMode(MODE.ALL, true);
  var following = scene.homeRows[0];
  var discover = scene.homeRows[1];
  following.railViewport.clientWidth = 1200;
  following.railViewport.offsetWidth = 1200;
  discover.railViewport.clientWidth = 1200;
  discover.railViewport.offsetWidth = 1200;
  for (var i = 0; i < following.cells.length; i++) {
    following.cells[i].offsetLeft = i * 300;
    following.cells[i].offsetWidth = 300;
  }
  for (var j = 0; j < discover.cells.length; j++) {
    discover.cells[j].offsetLeft = j * 300;
    discover.cells[j].offsetWidth = 300;
  }
  scene.handleKeyDown(KEY.RIGHT);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hc, 1, 'Following #2 selects Discover #2');
  following.railScroll = 300;
  scene.hr = 0;
  scene.hc = 1;
  scene.homeMove(1, 0);
  assert.equal(scene.hc, 0, 'horizontal rail scroll is included in spatial alignment');
});

test('homepage local focus does not depend on scaled global-frame geometry', () => {
  const { scene, els, MODE } = setup({ streams: [stream('solo')] });
  scene.switchMode(MODE.ALL, true);
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src/ui/styles.css'), 'utf8');
  assert.match(css, /\.tw-home \.tw-cell-inner\.tw-focused \.tw-thumb\s*\{[^}]*border-color: #A78BFA;/s);
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
});

test('stale homepage responses cannot restore focus after leaving Channels', () => {
  const { scene, pendingHome, MODE, els } = setup({ deferHomeData: true });
  scene.switchMode(MODE.ALL, true);
  assert.equal(scene.loading, true);
  scene.switchMode(MODE.GAMES, true);
  pendingHome.followedStreams[0].ok({ items: [stream('late-followed')], cursor: null });
  pendingHome.topStreams[0].ok({ items: [stream('late-discover')], cursor: null });
  assert.equal(scene.mode, MODE.GAMES);
  assert.equal(scene.homeRows.length, 0);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
});

test('homepage local focus remains aligned through vertical rail scrolling', () => {
  const { scene, els, MODE, KEY } = authenticatedHomepageFixture();
  scene.switchMode(MODE.ALL, true);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1);
  assert.match(scene.homeCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '0');
  assert.equal(scene.homeRows[1].railTrack.style.transform, 'translate3d(0px,0,0)');
});

test('homepage vertical scroll stays within content bounds across rail changes', () => {
  const { scene, els, MODE, KEY } = authenticatedHomepageFixture();
  scene.switchMode(MODE.ALL, true);
  els['tw-home'].offsetHeight = 1000;
  els['tw-grid-wrap'].clientHeight = 600;
  scene.homeRows[1].el.offsetTop = 850;
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.homeScroll, 400, 'scroll is clamped to content height minus viewport height');
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-400px,0)');
  assert.ok(scene.homeScroll >= 0 && scene.homeScroll <= scene.homeScrollMax());
  scene.handleKeyDown(KEY.UP);
  assert.equal(scene.homeScroll, 0);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.homeScroll, 400, 'repeated DOWN does not accumulate displacement');
});

test('adapter can defer the initial browse network request until after first paint', () => {
  const { scene, els, apiCalls, delayed, MODE } = setup({
    adapter: { browse: { deferInitialLoadMs: 900 } },
    streams: [stream('solo')],
  });

  scene.handleFocus();

  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.loading, true);
  assert.equal(apiCalls.topStreams, 0);
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].ms, 900);
  assert.match(els['tw-tip-all'].className, /tw-tip-active/);

  delayed[0].fn();

  assert.equal(apiCalls.topStreams, 1);
  assert.equal(scene.loading, false);
  assert.equal(scene.items.length, 1);
});

test('Back while the browser is loading falls through to the platform exit fallback', () => {
  const { scene, MODE, KEY } = setup({ streams: [stream('solo')] });
  scene.mode = MODE.ALL;
  scene.loading = true;

  assert.equal(scene.handleKeyDown(KEY.BACK), false);
});

test('browse grid thumbnails carry dimensions and placeholder fallback', () => {
  const { scene } = setup();
  const streamCell = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers: 1, thumb: 'http://img/a.jpg' });
  assert.match(streamCell.innerHTML, /class="tw-thumb" width="320" height="180" src="http:\/\/img\/a\.jpg"/);
  assert.match(streamCell.innerHTML, /onerror="this\.removeAttribute\('src'\)"/);
  assert.match(streamCell.innerHTML, /class="tw-live-badge">LIVE<\/span>T<\/div>/);
  const gameCell = scene.createCell({ kind: 'game', display: 'G', viewers: 2, box: 'http://img/g.jpg' });
  assert.match(gameCell.innerHTML, /class="tw-thumb" width="285" height="380" src="http:\/\/img\/g\.jpg"/);
  assert.doesNotMatch(gameCell.innerHTML, /tw-live-badge/);
});

test('homepage stream cards render local overlays and two-row metadata', () => {
  const { scene } = setup();
  const cell = scene.createCell({
    kind: 'stream', login: 'alpha', display: 'Streamer Alpha', title: 'A very long stream title',
    viewers: 1200, game: 'Category Alpha', thumb: 'http://img/a.jpg',
  }, true);
  assert.match(cell.innerHTML, /class="tw-home-thumb-wrap"/);
  assert.match(cell.innerHTML, /class="tw-home-live-badge">LIVE<\/span>/);
  assert.match(cell.innerHTML, /class="tw-home-viewers">1\.2K<\/span>/);
  assert.match(cell.innerHTML, /class="tw-home-meta-name">Streamer Alpha<\/span>/);
  assert.match(cell.innerHTML, /class="tw-home-meta-category">Category Alpha<\/div>/);
  assert.match(cell.innerHTML, /class="tw-home-meta-title">A very long stream title<\/div>/);
  assert.doesNotMatch(cell.innerHTML, /class="tw-meta-views"/);
  assert.doesNotMatch(cell.innerHTML, /class="tw-meta-name"/);
});

test('homepage viewer pills format counts and omit unavailable values', () => {
  const { scene } = setup();
  [
    [980, '980'], [1200, '1.2K'], [12400, '12.4K'], [1200000, '1.2M'],
  ].forEach(([viewers, formatted]) => {
    const cell = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers, thumb: '' }, true);
    assert.match(cell.innerHTML, new RegExp('class="tw-home-viewers">' + formatted + '<\\/span>'));
  });
  const missing = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers: null, thumb: '' }, true);
  assert.doesNotMatch(missing.innerHTML, /tw-home-viewers/);
});

test('homepage metadata handles missing category and keeps default cards isolated', () => {
  const { scene } = setup();
  const homepage = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers: 1, thumb: '' }, true);
  assert.doesNotMatch(homepage.innerHTML, /tw-home-meta-category/);
  assert.match(homepage.innerHTML, /tw-home-meta-title/);
  const regular = scene.createCell({ kind: 'stream', display: 'A', title: 'T', viewers: 1, thumb: '' });
  assert.doesNotMatch(regular.innerHTML, /tw-home-thumb-wrap|tw-home-live-badge|tw-home-viewers/);
  const gameCell = scene.createCell(game('Chess'), true);
  assert.doesNotMatch(gameCell.innerHTML, /tw-home-thumb-wrap|tw-home-live-badge|tw-home-viewers/);
});

test('offline channel avatars keep their placeholder on load failure', () => {
  const { scene } = setup();
  const cell = scene.createChannelCell({ display: 'A', avatar: 'http://img/avatar.jpg' });
  assert.match(cell.innerHTML, /class="tw-chan-avatar" width="96" height="96" src="http:\/\/img\/avatar\.jpg"/);
  assert.match(cell.innerHTML, /onerror="this\.removeAttribute\('src'\)"/);
});

test('offline channel avatar frame keeps a thumbnail-style gap', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src/ui/styles.css'), 'utf8');
  assert.match(css, /\.tw-chan-avatar\s*\{[^}]*border: 3px solid transparent;[^}]*box-sizing: border-box;[^}]*background-clip: padding-box;/s);
  assert.match(css, /\.tw-grid-frame-round\s*\{[^}]*border-radius: 50%;[^}]*box-shadow: 0 0 0 4px #f4f4f7;/s);
});

test('Following live selection frame preserves fractional thumbnail bounds', () => {
  const { scene, els, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 21;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84; // thumbnail + caption
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120.5, bottom: 90.25 }),
  }];
  scene.fScroll = 4;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '17px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following live selection frame converts scaled rects back to stage coordinates', () => {
  const { scene, els, MODE } = setup({ live: [stream('solo')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 21;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 10, top: 20, right: 60, bottom: 62 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 60.25, bottom: 50.125 }),
  }];
  scene.fScroll = 4;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '17px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following section frame converts scaled section top back to stage coordinates', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [stream('solo')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 1;
  scene.fc = 0;
  scene.fScroll = 462;
  els['tw-follow'].getBoundingClientRect = () => ({ top: 100, left: 0, right: 100, bottom: 600 });
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 10, top: 360.5, right: 60, bottom: 402.5 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 10, top: 360.5, right: 60.25, bottom: 390.625 }),
  }];
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.left, '5px');
  assert.equal(els['tw-grid-frame'].style.top, '59px');
  assert.equal(els['tw-grid-frame'].style.width, '100.5px');
  assert.equal(els['tw-grid-frame'].style.height, '60.25px');
});

test('Following live selection frame subtracts the row-local table offset', () => {
  const { scene, els, MODE } = setup({
    live: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
    follows: [channel('offguy')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 1;
  scene.fc = 0;
  scene.fRows[1].el.offsetTop = 200;
  const inner = scene.followCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 221;        // table-local: row offset + cell padding
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120, bottom: 90 }),
  }];
  scene.fScroll = 154;
  scene.followFrame();
  assert.equal(els['tw-grid-frame'].style.top, '67px');
});

test('Following offline channel focus uses the animated round frame', () => {
  const { scene, els, MODE, KEY } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('offguy')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(els['tw-grid-frame'].style.opacity, '1');
  scene.handleFollowKey(KEY.DOWN);
  assert.match(scene.followCell().firstChild.className, /tw-focused/);
  assert.equal(els['tw-grid-frame'].style.opacity, '1');
  assert.match(els['tw-grid-frame'].className, /tw-grid-frame-round/);
});

test('top-level games use the tighter wrapper inset for cover padding', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
});

test('game stream lists return to the standard wrapper inset', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')], gameStreams: [stream('a')] });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.doesNotMatch(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
});

test('game stream lists render a category header above the grid', () => {
  const { scene, els, MODE } = setup({
    games: [game('Chess')],
    gameStreams: [stream('a')],
    categoryInfo: {
      kind: 'game',
      name: 'Chess',
      display: 'Chess',
      viewers: 1234,
      followers: 9876,
      description: 'A strategic board game.',
      box: 'http://img/chess.jpg',
    },
  });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-category/);
  assert.equal(els['tw-category-head'].style.display, 'block');
  assert.equal(els['tw-category-name'].textContent, 'Chess');
  assert.equal(els['tw-category-stats'].textContent, 'CATEGORY_VIEWERS:1234 | CATEGORY_FOLLOWERS:9876');
  assert.equal(els['tw-category-desc'].textContent, 'A strategic board game.');
});

test('category stream selection frame accounts for the fixed header', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')], gameStreams: [stream('solo')] });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  els['tw-grid-scroll'].offsetTop = 174;
  const inner = scene.focusedCell().firstChild;
  inner.offsetLeft = 5;
  inner.offsetTop = 9;
  inner.offsetWidth = 100;
  inner.offsetHeight = 84;
  inner.getBoundingClientRect = () => ({ left: 20, top: 30, right: 120, bottom: 114 });
  inner.getElementsByTagName = () => [{
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 60,
    complete: true,
    getBoundingClientRect: () => ({ left: 20, top: 30, right: 120, bottom: 90 }),
  }];
  scene.updateFrame();
  assert.equal(els['tw-grid-frame'].style.top, '183px');
});

test('category stream header scrolls with the grid content', () => {
  const { scene, els, MODE } = setup({
    games: [game('Chess')],
    gameStreams: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
  });
  scene.switchMode(MODE.GAMES, true);
  scene.activate();
  scene.rowEls[1].offsetTop = 240;
  scene.move(0, 1);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-240px,0)');
  assert.equal(els['tw-category-head'].style.transform, 'translate3d(0,-240px,0)');
});

test('returning from another scene preserves the current browser mode', () => {
  const { scene, els, MODE } = setup({ games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  assert.equal(scene.mode, MODE.GAMES);
  assert.equal(scene.items.length, 1);
  scene.handleHide();
  scene.handleShow();
  scene.handleFocus();
  assert.equal(scene.mode, MODE.GAMES);
  assert.equal(scene.items.length, 1);
  assert.match(els['tw-grid-wrap'].className, /tw-grid-wrap-games/);
});

test('the offline section lays out at 6 columns', () => {
  const { scene, MODE } = setup({
    live: [],
    follows: [channel('a'), channel('b'), channel('c'), channel('d'), channel('e'), channel('f'), channel('g')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 2, '7 channels -> two rows of 6');
  assert.equal(scene.fRows[0].cells.length, 6);
  assert.equal(scene.fRows[0].el.childNodes.length, 6);
  assert.equal(scene.fRows[1].cells.length, 1);
  assert.equal(scene.fRows[1].el.childNodes.length, 6); // 1 real + 5 pads
});

test('Following live channels use one horizontally navigable rail row', () => {
  const { scene, MODE } = setup({
    live: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows.length, 1);
  assert.equal(scene.fRows[0].cells.length, 5);
  assert.match(scene.fRows[0].el.parentNode.parentNode.className, /tw-rail-track/);
});

test('Following live rail moves left and right and scrolls the focused card into view', () => {
  const { scene, MODE, KEY } = setup({
    live: [stream('a'), stream('b'), stream('c'), stream('d'), stream('e')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  var row = scene.fRows[0];
  row.railViewport.offsetWidth = 600;
  row.railViewport.clientWidth = 600;
  row.railTrack.offsetWidth = 1500;
  for (var i = 0; i < row.cells.length; i++) {
    row.cells[i].offsetLeft = i * 300;
    row.cells[i].offsetWidth = 300;
  }
  scene.followAddFocus();
  scene.handleFollowKey(KEY.RIGHT);
  assert.equal(scene.fc, 1);
  scene.handleFollowKey(KEY.RIGHT);
  assert.equal(scene.fc, 2);
  assert.equal(row.railScroll, 300);
  assert.equal(row.railTrack.style.transform, 'translate3d(-300px,0,0)');
  scene.handleFollowKey(KEY.LEFT);
  assert.equal(scene.fc, 1);
  assert.equal(row.railScroll, 300);
});

test('Following remembers the live rail card across vertical sections', () => {
  const { scene, MODE, KEY } = setup({
    live: [stream('a'), stream('b'), stream('c')],
    follows: [channel('offguy')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.handleFollowKey(KEY.RIGHT);
  scene.handleFollowKey(KEY.RIGHT);
  scene.handleFollowKey(KEY.DOWN);
  assert.equal(scene.fr, 1);
  scene.handleFollowKey(KEY.UP);
  assert.equal(scene.fr, 0);
  assert.equal(scene.fc, 2);
});

test('Following top navigation returns focus to the live rail', () => {
  const { scene, MODE, KEY } = setup({ live: [stream('a'), stream('b')], follows: [] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.focusTopNav();
  scene.navIndex = 2;
  scene.handleTopNavKey(KEY.DOWN);
  assert.equal(scene.onTopNav, false);
  assert.equal(scene.fr, 0);
  assert.equal(scene.fc, 1);
  assert.match(scene.followCell().firstChild.className, /tw-focused/);
});

test('Following single-item and empty live rails remain safe', () => {
  const single = setup({ live: [stream('solo')], follows: [] });
  single.scene.switchMode(single.MODE.FOLLOWED, true);
  assert.equal(single.scene.fRows.length, 1);
  assert.equal(single.scene.fRows[0].cells.length, 1);
  assert.equal(single.scene.fRows[0].railScroll, 0);

  const empty = setup({ live: [], follows: [] });
  empty.scene.switchMode(empty.MODE.FOLLOWED, true);
  assert.equal(empty.scene.fRows.length, 0);
  assert.notEqual(empty.els['tw-follow-empty'].style.display, 'none');
});

test('returning from playback restores the focused Following rail card', () => {
  const { scene, MODE, KEY } = setup({
    live: [stream('a'), stream('b'), stream('c')],
    follows: [],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.handleFollowKey(KEY.RIGHT);
  scene.handleHide();
  scene.handleShow();
  scene.handleFocus();
  assert.equal(scene.mode, MODE.FOLLOWED);
  assert.equal(scene.fr, 0);
  assert.equal(scene.fc, 1);
  assert.match(scene.followCell().firstChild.className, /tw-focused/);
});

test('Following pins later rows at the top so prior row names stay hidden', () => {
  const { scene, els, MODE } = setup({
    live: [],
    follows: [channel('a'), channel('b'), channel('c'), channel('d'), channel('e'), channel('f'), channel('g')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  els['tw-follow'].offsetHeight = 1000;
  els['tw-grid-wrap'].clientHeight = 600;
  scene.fRows[1].el.offsetTop = 900;
  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 900);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-900px,0)');
});

test('Following scroll uses each row position in the full sectioned view', () => {
  const { scene, els, MODE, KEY } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a'), channel('b')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  assert.equal(scene.fRows[0].items[0].kind, 'game');
  assert.equal(scene.fRows[1].items[0].kind, 'channel');

  var offlineTable = scene.fRows[1].el.parentNode;
  var offlineSection = offlineTable.parentNode;
  scene.fRows[1].el.offsetTop = 0;      // first row inside its own table
  offlineTable.offsetTop = 38;          // section heading before the table
  offlineSection.offsetTop = 470;       // category section above it

  scene.handleFollowKey(KEY.DOWN);
  assert.equal(scene.fr, 1);
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('Following row positioning uses same-space rects to avoid double-counting sections', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  var offlineTable = scene.fRows[1].el.parentNode;
  var offlineSection = offlineTable.parentNode;
  scene.fRows[1].el.offsetTop = 0;
  offlineTable.offsetTop = 508;         // table offset is already section-relative in real layout
  offlineSection.offsetTop = 470;       // parent-chain summing would wrongly add this again
  scene.fRows[1].el.getBoundingClientRect = () => ({ top: -665, left: 0, right: 100, bottom: -605 });
  els['tw-follow'].getBoundingClientRect = () => ({ top: -1173, left: 0, right: 100, bottom: -155 });

  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('Following row positioning converts scaled section rects back to stage coordinates', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10 })],
    live: [],
    follows: [channel('a')],
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fRows[1].el.offsetHeight = 60;
  scene.fRows[1].el.getBoundingClientRect = () => ({ top: 354, left: 0, right: 100, bottom: 384 });
  els['tw-follow'].getBoundingClientRect = () => ({ top: 100, left: 0, right: 100, bottom: 500 });

  scene.fr = 1;
  scene.followScrollTo();
  assert.equal(scene.fScroll, 462);
  assert.equal(els['tw-grid-scroll'].style.transform, 'translate3d(0,-462px,0)');
});

test('selecting a live tile opens the player; an offline tile opens the channel page', () => {
  const { scene, calls, MODE } = setup({ live: [stream('liveguy')], follows: [channel('offguy')] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 0; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannel, ['liveguy']);
  scene.fr = 1; scene.fc = 0; scene.activateFollow();
  assert.deepEqual(calls.goToChannelPage, ['offguy']);
});

test('selecting a live category enters the shared category stream view', () => {
  const { scene, els, MODE } = setup({
    categories: [Object.assign(game('Chess'), { viewers: 10, followers: 20, box: 'http://img/chess.jpg' })],
    live: [stream('liveguy', 'Live Guy')],
    follows: [],
    gameStreams: [stream('other')],
    categoryInfo: { kind: 'game', name: 'Chess', display: 'Chess', viewers: 10, followers: 20, box: 'http://img/chess.jpg' },
  });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.fr = 0; scene.fc = 0; scene.activateFollow();
  assert.equal(scene.mode, MODE.GAMES_STREAMS);
  assert.equal(scene.selectedGame.name, 'Chess');
  assert.equal(els['tw-category-head'].style.display, 'block');
  assert.equal(scene.items.length, 1);
});

test('UP from the top grid row hands focus to the tab row', () => {
  const { scene, MODE, KEY } = setup({ live: [stream('a')], follows: [channel('b')] });
  scene.switchMode(MODE.FOLLOWED, true);
  scene.handleFollowKey(KEY.DOWN);            // -> offline row
  assert.equal(scene.fr, 1);
  scene.handleFollowKey(KEY.UP);              // -> back to live row
  assert.equal(scene.fr, 0);
  assert.equal(scene.onTopNav, false);
  scene.handleFollowKey(KEY.UP);              // -> tab row
  assert.equal(scene.onTopNav, true);
});

test('tab cursor uses rendered vertical bounds without changing horizontal metrics', () => {
  const { scene, els } = setup();
  scene.focusTopNav();

  const tips = els['tw-tips'];
  const box = els['tw-tip-all'].firstChild;
  const cursor = els['tw-tip-cursor'];
  tips.getBoundingClientRect = () => ({ top: 44.5, bottom: 79 });
  box.getBoundingClientRect = () => ({ top: 50, bottom: 79, height: 29 });
  box.offsetLeft = 8;
  box.offsetTop = 6;      // rounded browser offset; rendered top is 5.5px
  box.offsetWidth = 90;
  box.offsetHeight = 29;

  scene.moveTabCursor();

  assert.equal(cursor.style.left, '8px');
  assert.equal(cursor.style.width, '90px');
  assert.equal(cursor.style.top, '5.5px');
  assert.equal(cursor.style.height, '29px');
});

test('tab cursor converts scaled vertical bounds back to stage coordinates', () => {
  const { scene, els } = setup();
  scene.focusTopNav();

  const tips = els['tw-tips'];
  const box = els['tw-tip-all'].firstChild;
  const cursor = els['tw-tip-cursor'];
  tips.getBoundingClientRect = () => ({ top: 100, bottom: 117.25 });
  box.getBoundingClientRect = () => ({ top: 102.75, bottom: 117.25, height: 14.5 });
  box.offsetLeft = 8;
  box.offsetTop = 6;
  box.offsetWidth = 90;
  box.offsetHeight = 29;

  scene.moveTabCursor();

  assert.equal(cursor.style.left, '8px');
  assert.equal(cursor.style.width, '90px');
  assert.equal(cursor.style.top, '5.5px');
  assert.equal(cursor.style.height, '29px');
});

test('BACK on the tab row selects Channels', () => {
  const { scene, els, MODE, KEY } = setup({ streams: [stream('a')], games: [game('Chess')] });
  scene.switchMode(MODE.GAMES, true);
  scene.focusTopNav();
  assert.equal(scene.navIndex, 1, 'Games tab focused');
  assert.equal(scene.handleKeyDown(KEY.BACK), true);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.onTopNav, true);
  assert.equal(scene.navIndex, 0);
  assert.match(els['tw-tip-all'].className, /tw-tip-active/);
});

test('BACK on the Channels tab row is unhandled', () => {
  const { scene, MODE, KEY } = setup({ streams: [stream('a')] });
  scene.switchMode(MODE.ALL, true);
  scene.focusTopNav();
  assert.equal(scene.navIndex, 0, 'Channels tab focused');

  assert.equal(scene.handleKeyDown(KEY.BACK), false);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.onTopNav, true);
  assert.equal(scene.navIndex, 0);
});

test('BACK on a non-active tab row item returns focus to Channels', () => {
  const { scene, MODE, KEY } = setup({ streams: [stream('a')], games: [game('Chess')] });
  scene.switchMode(MODE.ALL, true);
  scene.focusTopNav();
  scene.handleTopNavKey(KEY.RIGHT);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.navIndex, 1, 'Games tab focused');

  assert.equal(scene.handleKeyDown(KEY.BACK), true);
  assert.equal(scene.mode, MODE.ALL);
  assert.equal(scene.onTopNav, true);
  assert.equal(scene.navIndex, 0);
});

test('OK on the active tab row refreshes the current grid', () => {
  const { scene, apiCalls, MODE, KEY } = setup({ streams: [stream('a')] });
  scene.switchMode(MODE.ALL, true);
  assert.equal(apiCalls.topStreams, 1);

  scene.focusTopNav();
  assert.equal(scene.navIndex, 0, 'Channels tab focused');
  scene.handleKeyDown(KEY.ENTER);

  assert.equal(scene.mode, MODE.ALL);
  assert.equal(apiCalls.topStreams, 2);
  assert.equal(scene.onTopNav, false);
});


// Fitch Task 04B.2 regression test
test('hero tracks the selected Following stream without being replaced on Discover', () => {
  const { scene, MODE, KEY } = setup({
    live: [
      stream('alpha', 'Alpha', { title: 'Alpha live', game: 'Counter-Strike', gameBox: 'https://example.com/a.jpg', thumb: 'https://example.com/a-320x180.jpg' }),
      stream('beta', 'Beta', { title: 'Beta live', game: 'IRL', gameBox: 'https://example.com/b.jpg', thumb: 'https://example.com/b-320x180.jpg' }),
    ],
    streams: [stream('delta', 'Delta')],
  });
  scene.switchMode(MODE.ALL, true);
  assert.match(scene.homeHeroCopy.innerHTML, /Alpha/);
  assert.match(scene.homeHeroCopy.innerHTML, /tw-home-hero-cover/);
  assert.match(scene.homeHeroArt.style.backgroundImage, /a-1280x720\.jpg/);
  scene.handleKeyDown(KEY.RIGHT);
  assert.match(scene.homeHeroCopy.innerHTML, /Beta/);
  assert.match(scene.homeHeroArt.style.backgroundImage, /b-1280x720\.jpg/);
  scene.handleKeyDown(KEY.DOWN);
  assert.equal(scene.hr, 1);
  assert.match(scene.homeHeroCopy.innerHTML, /Beta/, 'Discover focus keeps the last followed hero');
});


// Fitch Task 04B.3 regression test
test('cinematic backdrop spans behind navigation and hides on other tabs', () => {
  const { scene, els, MODE } = setup({
    live: [stream('alpha', 'Alpha', { thumb: 'https://example.com/a-320x180.jpg' })],
    streams: [stream('delta', 'Delta')],
  });
  assert.match(scene.root.innerHTML, /id="tw-home-backdrop"/);
  scene.switchMode(MODE.ALL, true);
  assert.equal(els['tw-home-backdrop'].style.display, 'block');
  assert.equal(els['tw-home-backdrop'].children.length, 2);
  assert.match(scene.homeHeroArt.style.backgroundImage, /a-1280x720/);
  scene.switchMode(MODE.GAMES, true);
  assert.equal(els['tw-home-backdrop'].style.display, 'none');
});
