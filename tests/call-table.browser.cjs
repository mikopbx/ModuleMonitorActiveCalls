// Usage: node tests/call-table.browser.cjs <playwright module> <Vue 2 browser script>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let template = fs.readFileSync(path.join(__dirname, '../App/Views/index.volt'), 'utf8');
    template = template.slice(template.indexOf('<table id="calls"'));
    template = template.replace(/{%[\s\S]*?%}/g, '').replace(/{{[\s\S]*?}}/g, '');
    await page.setContent(template);
    await page.addScriptTag({ path: process.argv[3] });
    await page.evaluate(() => {
      window.globalRootUrl = '/';
      window.$ = () => ({ ready() {}, dropdown() {}, val() { return ''; } });
    });
    await page.addScriptTag({ path: path.join(__dirname, '../public/assets/js/module-monitor-active-calls-index.js') });
    await page.evaluate(() => {
      const RealVue = window.Vue;
      const monitor = window.ModuleMonitorActiveCalls;
      monitor.initContactsCache = () => {};
      monitor.applyContactsCacheToQueueWidget = () => {};
      const stop = new Error('captured');
      window.Vue = function (options) {
        if (options.el === '#calls') {
          window.table = new RealVue(options);
          throw stop;
        }
        return { getClientHeader(phone) { return phone; } };
      };
      try { monitor.initialize(); } catch (error) { if (error !== stop) throw error; }
      window.Vue = RealVue;
    });
    const employee = { channel: 'PJSIP/133-1', number: '133', name: 'Employee' };
    const mobile = { channel: 'PJSIP/trunk-1', number: '7915', name: 'Mobile' };
    for (const legs of [[mobile, employee], [employee], [{ ...mobile, channel: 'PJSIP/trunk-2' }, employee],
      [{ ...employee, channel: 'PJSIP/133-2' }, employee]]) {
      await page.evaluate(async legs => {
        table.calls = [{ linkedid: 'call', start: Date.now() / 1000 - 65, answer: '',
          src_num: '130', src_name: 'Caller', src_chan: 'PJSIP/130-1', dst_chan: '', dst_num: '',
          queueData: { EnterTime: Date.now() / 1000 - 65 }, calledChannels: legs, bridgeChannels: [] }];
        await table.$nextTick();
      }, legs);
      const labels = page.locator('#calls .label.pink');
      assert.deepEqual(await labels.allTextContents(), legs.map(leg => ' ' + leg.name + ' <' + leg.number + '>'));
      assert.equal(await page.locator('#calls tbody tr').count(), 1);
      assert.deepEqual(await labels.locator('[data-chan]').evaluateAll(nodes => nodes.map(node => node.dataset.chan)), legs.map(leg => leg.channel));
    }
    console.log('PASS: Vue renders channel replacement, parallel devices and a queue call after 60 seconds.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
