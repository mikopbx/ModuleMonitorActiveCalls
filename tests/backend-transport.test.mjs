import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../public/assets/js/src/module-monitor-active-calls-index.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8') + '\nglobalThis.__monitor = ModuleMonitorActiveCalls;\n';
assert.equal(
  source.includes("console.log('backandEnable response', response)"),
  false,
  'backend session response (including its token) must not be logged',
);
const fakeSockets = [];
const scheduledTimeouts = [];

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    fakeSockets.push(this);
  }
}

function jqueryStub() {
  return {
    ready() {},
    checkbox() { return this; },
    dropdown() { return this; },
    tab() { return this; },
    removeClass() { return this; },
    hide() { return this; },
    remove() { return this; },
    form() { return this; },
    val() { return ''; },
    data() { return undefined; },
    find() { return this; },
    attr() { return undefined; },
    parent() { return this; },
    get length() { return 0; },
  };
}
jqueryStub.api = () => {};
jqueryStub.ajax = () => {
  throw new Error('direct backend refresh must not be used');
};

const context = vm.createContext({
  $: jqueryStub,
  globalRootUrl: '/',
  globalTranslate: {},
  Form: {},
  Config: {},
  Extensions: {},
  Vue: function Vue() {},
  document: {},
  window: {
    location: { protocol: 'https:', host: 'pbx.example.test' },
  },
  WebSocket: FakeWebSocket,
  console: { log() {}, error() {} },
  setTimeout(callback, delay) {
    scheduledTimeouts.push({ callback, delay });
    return scheduledTimeouts.length;
  },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
  atob() { throw new Error('not a JWT'); },
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Set,
  Promise,
  encodeURIComponent,
});

vm.runInContext(source, context, { filename: sourcePath.pathname });
const monitor = context.__monitor;
context.window.ModuleMonitorActiveCalls = monitor;

let startPollingCalls = 0;
let stopPollingCalls = 0;
monitor.startPollingActiveCalls = () => { startPollingCalls += 1; };
monitor.stopPollingActiveCalls = () => { stopPollingCalls += 1; };

function resetTransport() {
  fakeSockets.length = 0;
  scheduledTimeouts.length = 0;
  startPollingCalls = 0;
  stopPollingCalls = 0;
  monitor._contactsWs = null;
  monitor._activeCallsWs = null;
  monitor._contactsWsReconnectTimer = null;
  monitor._activeCallsWsReconnectTimer = null;
  monitor._contactsWsTokenTimer = null;
}

resetTransport();
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  expires_in: 3600,
  routes: {
    contacts: '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
    active_calls: '/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls',
  },
});
assert.equal(fakeSockets.length, 2, 'scoped session did not create both subscriptions');
assert.equal(fakeSockets[1].url.includes('/sub/me/active-calls?authorization='), true);
assert.equal(stopPollingCalls, 0, 'polling stopped before WebSocket open');
fakeSockets[1].readyState = FakeWebSocket.OPEN;
fakeSockets[1].onopen();
assert.equal(stopPollingCalls, 1, 'polling did not stop after WebSocket open');
fakeSockets[1].onclose({ code: 1006, reason: 'test' });
assert.equal(startPollingCalls, 1, 'polling did not resume after WebSocket close');

resetTransport();
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  routes: { active_calls: '/scoped/active-calls' },
});
fakeSockets[0].onerror({ type: 'test' });
assert.equal(startPollingCalls, 1, 'polling did not resume after WebSocket error');

resetTransport();
monitor.applyBackendSession({ transport: 'polling', routes: {} });
assert.equal(fakeSockets.length, 0, 'polling mode created a WebSocket');
assert.equal(startPollingCalls, 1, 'polling mode did not keep polling active');

resetTransport();
monitor.applyBackendSession({
  transport: 'legacy-v1',
  access_token: 'legacy-token',
  refresh_token: 'legacy-refresh',
  routes: {
    contacts: '/pbxcore/api/module-softphone-backend/v1/sub/contacts',
    active_calls: '/pbxcore/api/module-softphone-backend/v1/sub/active-calls',
  },
});
assert.equal(fakeSockets[1].url.includes('/sub/active-calls?authorization='), true, 'legacy route was not used verbatim');

let backendEnableCalls = 0;
monitor.requestBackendEnable = () => { backendEnableCalls += 1; };
monitor.refreshAuthToken();
assert.equal(backendEnableCalls, 1, 'token renewal did not request a new module UI session');

console.log('backend-transport.test.mjs: OK');
