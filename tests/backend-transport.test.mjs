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

  close() {
    this.readyState = 3;
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

function createBrowserContext() {
  return vm.createContext({
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
}

const context = createBrowserContext();

vm.runInContext(source, context, { filename: sourcePath.pathname });
const monitor = context.__monitor;
assert.equal(
  context.window.ModuleMonitorActiveCalls,
  monitor,
  'the classic browser script must register its controller on window before document ready',
);

const builtPath = new URL('../public/assets/js/module-monitor-active-calls-index.js', import.meta.url);
const builtSource = fs.readFileSync(builtPath, 'utf8') + '\nglobalThis.__monitor = ModuleMonitorActiveCalls;\n';
const builtContext = createBrowserContext();
vm.runInContext(builtSource, builtContext, { filename: builtPath.pathname });
assert.equal(
  builtContext.window.ModuleMonitorActiveCalls,
  builtContext.__monitor,
  'the deployed browser asset must register its controller on window before document ready',
);

// Regression: formatting elapsed time as "1:00" must not hide a waiting call.
for (const script of [source, builtSource]) {
  const browser = createBrowserContext();
  vm.runInContext(script, browser);
  const controller = browser.__monitor;
  const widgets = {};
  const initialized = new Error('widgets captured');
  browser.Date = class extends Date { static now() { return 2000000; } };
  browser.Vue = function Vue(options) {
    const widget = { ...options.data };
    for (const [name, method] of Object.entries(options.methods)) {
      widget[name] = method.bind(widget);
    }
    widgets[options.el] = widget;
    if (options.el === '#calls') throw initialized;
    return widget;
  };
  controller.initContactsCache = () => {};
  controller.applyContactsCacheToQueueWidget = () => {};
  assert.throws(() => controller.initialize(), error => error === initialized);
  const queue = widgets['#app-queue'];
  const calls = widgets['#calls'];
  const template = fs.readFileSync(new URL('../App/Views/index.volt', import.meta.url), 'utf8');
  const condition = template.match(/v-for="call in getQueueCalls\(queueId\)" v-if="([^"]+)"/)[1];
  const queueRowVisible = new Function('widget', 'call', `with (widget) { return ${condition}; }`);
  for (const [seconds, threshold, visible] of [
    [29, 30, false], [30, 30, true], [59, 30, true], [60, 30, true],
    [61, 30, true], [3600, 30, true], [60, 0, true], [60, 90, false], [90, 90, true],
  ]) {
    const call = { linkedid: 'waiting', start: 2000 - seconds, answer: '', dst_chan: '',
      queueData: { EnterTime: 2000 - seconds } };
    calls.minWaitVisible = queue.minWaitVisible = threshold;
    queue.allCalls = [call];
    queue.queues = { test: { callIds: ['waiting'] } };
    assert.equal(calls.callIsVisible(call), visible, `table visibility at ${seconds}s / threshold ${threshold}`);
    assert.equal(queue.hasWaitingCalls('test'), visible, `waiting indicator at ${seconds}s`);
    assert.equal(queueRowVisible(queue, call), visible, `queue row at ${seconds}s`);
  }
  assert.equal(calls.getClientHeader('130', 'Caller'), 'Caller <130>', 'snapshot names work outside monitored queues');
  calls.$nextTick = callback => callback();
  browser.Extensions.updatePhonesRepresent = () => { throw new Error('Vue call labels must not be rewritten'); };
  const mobile = { channel: 'PJSIP/trunk-1', number: '7915' };
  const employee = { channel: 'PJSIP/133-1', number: '133' };
  queue.queues = { test: { agents: { '133': { name: 'Employee' } } } };
  for (const channels of [[mobile, employee], [employee], [{ ...mobile, channel: 'PJSIP/trunk-2' }, employee]]) {
    calls.updatedCallsFromResponse({ calls: [{ linkedid: 'parallel', calledChannels: channels }], queues: {} });
    assert.deepEqual(Array.from(calls.calls[0].calledChannels, ch => ch.channel), channels.map(ch => ch.channel));
    assert.equal(calls.getClientHeader('133'), 'Employee <133>', 'employee name is rendered from Vue data');
  }
  assert.equal(controller.formatElapsedTime(1940), '1:00', 'display retains formatted time');
  assert.equal(calls.callIsVisible({ dst_chan: 'answered', queueData: {} }), true);
}

assert.equal(
  JSON.stringify(monitor.normalizeActiveCallsPayload(undefined)),
  '{"calls":[],"queues":{}}',
  'missing active-calls payload must render as empty collections',
);
assert.equal(
  JSON.stringify(monitor.normalizeActiveCallsPayload({ calls: null, queues: 'invalid' })),
  '{"calls":[],"queues":{}}',
  'malformed active-calls payload must render as empty collections',
);
const validActiveCallsPayload = {
  calls: [{ id: 'call-1' }],
  queues: { 'queue-1': { id: 'queue-1' } },
};
assert.equal(
  JSON.stringify(monitor.normalizeActiveCallsPayload(validActiveCallsPayload)),
  JSON.stringify(validActiveCallsPayload),
  'valid active-calls payload must be preserved',
);

const queueCall = {
  linkedid: 'queue-call-1',
  dst_chan: 'PJSIP/provider-0001',
  queueData: { QueueID: 'queue-1', EnterTime: 100 },
};
assert.equal(
  monitor.isWaitingQueueCall(queueCall),
  true,
  'a live queue entry must not disappear when dst_chan contains a stale or transient leg',
);
assert.equal(
  monitor.isWaitingQueueCall({ linkedid: 'ended-call', queueData: {} }),
  false,
  'a call without queue entry time must not be treated as waiting',
);

const mergedCalls = monitor.collectDisplayCalls({
  calls: [queueCall, { linkedid: 'regular-call' }],
  queues: {
    'queue-1': {
      calls: [queueCall, { linkedid: 'legacy-queue-call', queueData: { EnterTime: 101 } }],
    },
  },
});
assert.deepEqual(
  Array.from(mergedCalls, (call) => call.linkedid),
  ['queue-call-1', 'regular-call', 'legacy-queue-call'],
  'the lower table must merge old and new payloads without duplicating queue calls',
);

const canonicalQueueCall = { linkedid: 'canonical-queue-call', queueData: { EnterTime: 102 } };
const resolvedQueueCalls = monitor.resolveQueueCalls({
  calls: [canonicalQueueCall],
  queues: { 'queue-2': { callIds: ['canonical-queue-call'] } },
}, 'queue-2');
assert.equal(resolvedQueueCalls.length, 1, 'queue call IDs must resolve to the canonical call object');
assert.equal(
  resolvedQueueCalls[0],
  canonicalQueueCall,
  'queue projection must not create a duplicate call object',
);

let startPollingCalls = 0;
let stopPollingCalls = 0;
monitor.startPollingActiveCalls = () => { startPollingCalls += 1; };
monitor.stopPollingActiveCalls = () => { stopPollingCalls += 1; };

function resetTransport(controller = monitor) {
  fakeSockets.length = 0;
  scheduledTimeouts.length = 0;
  startPollingCalls = 0;
  stopPollingCalls = 0;
  controller._contactsWs = null;
  controller._activeCallsWs = null;
  controller._contactsWsReconnectTimer = null;
  controller._activeCallsWsReconnectTimer = null;
  controller._contactsWsTokenTimer = null;
  controller._activeCallsWsLastMessageAt = 0;
  controller.$widgetQueues = { updatedCallsFromResponse() {} };
  controller.$callsWidget = { updatedCallsFromResponse() {} };
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
assert.equal(stopPollingCalls, 0, 'polling stopped before the first valid WebSocket payload');
monitor.checkActiveCallsWsLiveness();
assert.equal(startPollingCalls, 1, 'zero-timestamp WebSocket did not keep polling active');
fakeSockets[1].onmessage({ data: JSON.stringify(validActiveCallsPayload) });
assert.equal(stopPollingCalls, 1, 'polling did not stop after the first valid WebSocket payload');
assert.equal(monitor._activeCallsWsLastMessageAt > 0, true, 'valid WebSocket payload did not update liveness');

const liveTimestamp = monitor._activeCallsWsLastMessageAt;
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'refreshed-token',
  routes: { active_calls: '/pbxcore/api/module-softphone-backend/v1/sub/me/active-calls' },
});
assert.equal(fakeSockets.length, 2, 'session refresh replaced an already-open active-calls socket');
assert.equal(
  monitor._activeCallsWsLastMessageAt,
  liveTimestamp,
  'session refresh reset liveness for a reused active-calls socket',
);

monitor._activeCallsWsLastMessageAt = Date.now() - 11000;
monitor.checkActiveCallsWsLiveness();
assert.equal(startPollingCalls, 2, 'polling did not resume after the WebSocket became silent');

fakeSockets[1].onmessage({ data: JSON.stringify(validActiveCallsPayload) });
assert.equal(stopPollingCalls, 2, 'polling did not stop after WebSocket delivery recovered');
fakeSockets[1].onclose({ code: 1006, reason: 'test' });
assert.equal(startPollingCalls, 3, 'polling did not resume after WebSocket close');

resetTransport();
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  routes: { active_calls: '/scoped/active-calls' },
});
const staleSocket = fakeSockets[0];
const staleMessageHandler = staleSocket.onmessage;
monitor.applyBackendSession({ transport: 'polling', routes: {} });
const stopsBeforeStaleMessage = stopPollingCalls;
staleMessageHandler({ data: JSON.stringify(validActiveCallsPayload) });
assert.equal(stopPollingCalls, stopsBeforeStaleMessage, 'stale WebSocket payload stopped polling mode');

resetTransport();
monitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  routes: { active_calls: '/scoped/active-calls' },
});
fakeSockets[0].onmessage({ data: JSON.stringify({ calls: [], queues: 'invalid' }) });
assert.equal(stopPollingCalls, 0, 'malformed WebSocket payload stopped polling');
assert.equal(monitor._activeCallsWsLastMessageAt, 0, 'malformed WebSocket payload updated liveness');

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

const builtMonitor = builtContext.__monitor;
resetTransport(builtMonitor);
builtMonitor.startPollingActiveCalls = () => { startPollingCalls += 1; };
builtMonitor.stopPollingActiveCalls = () => { stopPollingCalls += 1; };
builtMonitor.applyBackendSession({
  transport: 'scoped-v2',
  access_token: 'token',
  routes: { active_calls: '/scoped/active-calls' },
});
fakeSockets[0].readyState = FakeWebSocket.OPEN;
fakeSockets[0].onopen();
assert.equal(stopPollingCalls, 0, 'built asset stopped polling before a valid WebSocket payload');
fakeSockets[0].onmessage({ data: JSON.stringify(validActiveCallsPayload) });
assert.equal(stopPollingCalls, 1, 'built asset did not stop polling after a valid WebSocket payload');

console.log('backend-transport.test.mjs: OK');
