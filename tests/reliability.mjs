import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const url = process.env.APP_URL || 'http://127.0.0.1:5173';
const key = 'huopan-field-research-v1';
const out = path.resolve('test-results'); await fs.mkdir(out, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
const results = [];
let validBackup;
async function run(name, action) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  try { await action(page, context); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.stack || String(error) }); await page.screenshot({ path: path.join(out, `reliability-failure-${results.length}.png`), fullPage: true }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { await context.close(); }
}
async function seed(page, text = '可靠性验收种子记录') { await page.goto(url); await page.locator('#observation').fill(text); await page.locator('#observation').press('Control+Enter'); await page.locator('.note-card').waitFor(); }
async function stored(page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)), key); }
async function download(page, buttonName, filename) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: buttonName, exact: true }).click(); const file = path.join(out, filename); await (await pending).saveAs(file); return fs.readFile(file, 'utf8');
}
async function patchFailure(page) {
  await page.evaluate(k => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(storageKey, value) {
      if (storageKey === k) throw new DOMException('Simulated storage quota failure', 'QuotaExceededError');
      return set.call(this, storageKey, value);
    };
  }, key);
}
try {
  await run('A. 无任务直接保存自动创建未命名任务', async page => {
    await seed(page, '只看到在查 Excel，不知道目的。');
    const value = await stored(page);
    assert.equal(value.cases.length, 1); assert.equal(value.notes.length, 1);
    assert.equal(value.cases[0].name, '未命名现场任务'); assert.equal(value.notes[0].caseId, value.cases[0].id);
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    validBackup = await download(page, '导出 JSON', 'reliability-valid-backup.json');
  });
  await run('B. 损坏本机数据不覆盖，可下载原始数据并验证恢复', async page => {
    assert.ok(validBackup);
    await page.goto(url);
    const damaged = '{"version":1,"cases":"damaged"';
    await page.evaluate(({ k, value }) => localStorage.setItem(k, value), { k: key, value: damaged });
    await page.reload();
    await page.getByRole('alert').filter({ hasText: '无法读取本地数据' }).waitFor();
    await page.locator('#observation').fill('损坏数据期间应保留的文字');
    await page.getByRole('button', { name: /保存记录/ }).click();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), damaged);
    assert.equal(await page.locator('#observation').inputValue(), '损坏数据期间应保留的文字');
    assert.equal(await page.locator('.note-card').count(), 0);
    assert.equal(await download(page, '下载原始数据', 'reliability-damaged-original.json'), damaged);
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(validBackup) });
    await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
    assert.deepEqual(await stored(page), JSON.parse(validBackup));
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.locator('#observation').fill('恢复之后可以继续保存');
    await page.getByRole('button', { name: /保存记录/ }).click();
    assert.equal((await stored(page)).notes.length, 2);
  });
  await run('C. 多窗口阻止旧数据覆盖，失败输入刷新后仍在', async (pageA, context) => {
    await seed(pageA);
    const pageB = await context.newPage(); pageB.setDefaultTimeout(10000); await pageB.goto(url);
    const draft = '旧窗口尚未提交的现场文字，应在刷新后保留';
    await pageB.locator('#observation').fill(draft);
    await pageA.locator('#observation').fill('新窗口新增了第二条记录');
    await pageA.getByRole('button', { name: /保存记录/ }).click();
    await pageB.getByRole('alert').filter({ hasText: '另一个窗口更新了数据' }).waitFor();
    await pageB.getByRole('button', { name: /保存记录/ }).click();
    assert.equal((await stored(pageB)).notes.length, 2, 'Stale save cannot overwrite new records');
    assert.equal(await pageB.locator('#observation').inputValue(), draft, 'Failed save keeps current input');
    await pageB.reload();
    assert.equal(await pageB.locator('#observation').inputValue(), draft, 'Refresh retains stale-window draft');
    assert.equal(await pageB.locator('.note-card').count(), 2);
    await pageB.getByRole('button', { name: /保存记录/ }).click();
    assert.equal((await stored(pageB)).notes.length, 3);
  });
  await run('D. 模拟存储写失败不丢输入、不报成功、不写入记录或问题', async page => {
    await seed(page);
    await page.getByRole('status').waitFor({ state: 'hidden' });
    const captureText = '模拟存储失败时保留的观察文本';
    await patchFailure(page); await page.locator('#observation').fill(captureText);
    await page.getByRole('button', { name: /保存记录/ }).click();
    await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await page.locator('#observation').inputValue(), captureText);
    assert.equal(await page.locator('.note-card').count(), 1);
    assert.equal((await stored(page)).notes.length, 1);
    assert.equal(await page.getByRole('status').count(), 0, 'No success toast after failed capture');
    await page.reload();
    assert.equal(await page.locator('#observation').inputValue(), captureText);
    await page.getByRole('button', { name: /保存记录/ }).click();
    assert.equal((await stored(page)).notes.length, 2, 'Reload resets simulated failure');
    await page.getByRole('status').waitFor({ state: 'hidden' });
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '任务复盘', exact: true }).click();
    await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name: /候选问题/ }).click();
    await page.getByRole('button', { name: '新建候选问题', exact: true }).click();
    const editor = page.locator('.finding-editor'); const findingText = '写入失败后也保留的候选问题';
    await editor.getByLabel(/候选问题与提出依据/).fill(findingText);
    await editor.getByLabel(/^原因假设/).fill('尚待验证的假设内容');
    await patchFailure(page);
    await editor.getByRole('button', { name: '保存候选问题', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await editor.getByLabel(/候选问题与提出依据/).inputValue(), findingText);
    assert.equal(await editor.getByLabel(/^原因假设/).inputValue(), '尚待验证的假设内容');
    assert.equal((await stored(page)).findings.length, 0);
    assert.equal(await page.locator('.finding-card').count(), 0);
    assert.equal(await page.getByRole('status').count(), 0, 'No success toast after failed finding');
  });
  await run('E. 链路保存失败保留完整草稿，报告仅用保存态，备份及刷新可恢复', async page => {
    await seed(page);
    async function reviewTab(name) { await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name, exact: true }).click(); }
    async function openReview() { await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '任务复盘', exact: true }).click(); }
    async function openEvidence() { await page.locator('.chain-node').nth(1).locator('summary').filter({ hasText: '补充证据说明' }).click(); }
    await openReview();
    await page.getByLabel(/^信息输入描述/).fill('已保存的原始链路');
    await openEvidence(); await page.getByLabel(/^信息输入证据说明/).fill('已保存的原始证据');
    await page.getByLabel(/^观察范围与局限/).fill('已保存的原始范围');
    const savedBefore = await stored(page);
    await reviewTab('研究报告');
    const savedReport = await page.locator('.report-preview').innerText();
    assert.ok(savedReport.includes('已保存的原始链路'));
    await reviewTab('任务链路');
    const pendingDescription = '写入失败仍需完整保留的链路描述ABC123';
    const pendingEvidence = '写入失败仍需完整保留的证据 E99';
    const pendingLimit = '写入失败仍需完整保留的范围与局限：未见上线结果';
    await patchFailure(page);
    await page.getByLabel(/^信息输入描述/).fill('');
    await page.getByLabel(/^信息输入描述/).pressSequentially(pendingDescription);
    await openEvidence();
    await page.getByLabel(/^信息输入证据说明/).fill('');
    await page.getByLabel(/^信息输入证据说明/).pressSequentially(pendingEvidence);
    await page.getByLabel(/^观察范围与局限/).fill('');
    await page.getByLabel(/^观察范围与局限/).pressSequentially(pendingLimit);
    assert.equal(await page.getByLabel(/^信息输入描述/).inputValue(), pendingDescription);
    assert.equal(await page.getByLabel(/^信息输入证据说明/).inputValue(), pendingEvidence);
    assert.equal(await page.getByLabel(/^观察范围与局限/).inputValue(), pendingLimit);
    await page.getByText('未保存链路修改', { exact: true }).waitFor();
    assert.deepEqual(await stored(page), savedBefore, 'Failed chain write does not change saved data');
    await reviewTab('研究报告');
    assert.equal(await page.locator('.report-preview').innerText(), savedReport, 'Report must exclude unsaved chain text');
    const draftRaw = await download(page, '导出含草稿的JSON', 'reliability-chain-draft.json');
    const exported = JSON.parse(draftRaw); const exportedCase = exported.cases[0];
    assert.equal(exportedCase.chain[1].description, pendingDescription);
    assert.equal(exportedCase.chain[1].evidence, pendingEvidence);
    assert.equal(exportedCase.limitations, pendingLimit);
    assert.deepEqual(exported.notes, savedBefore.notes);
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles({ name: 'chain-draft.json', mimeType: 'application/json', buffer: Buffer.from(draftRaw) });
    await page.getByText('备份检查通过', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    assert.deepEqual(await stored(page), savedBefore, 'Previewing draft backup cannot overwrite saved data');
    await page.reload(); await openReview();
    await page.getByText('未保存链路修改', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/^信息输入描述/).inputValue(), pendingDescription);
    await openEvidence(); assert.equal(await page.getByLabel(/^信息输入证据说明/).inputValue(), pendingEvidence);
    assert.equal(await page.getByLabel(/^观察范围与局限/).inputValue(), pendingLimit);
    assert.deepEqual(await stored(page), savedBefore, 'Restored draft remains pending until explicit retry');
    await page.getByRole('button', { name: '重试保存链路', exact: true }).click();
    await page.getByText('链路修改自动保存', { exact: true }).waitFor();
    const savedAfter = await stored(page);
    assert.equal(savedAfter.cases[0].chain[1].description, pendingDescription);
    assert.equal(savedAfter.cases[0].chain[1].evidence, pendingEvidence);
    assert.equal(savedAfter.cases[0].limitations, pendingLimit);
    await reviewTab('研究报告'); assert.ok((await page.locator('.report-preview').innerText()).includes(pendingDescription));
  });
  const previewContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
  try {
    const preview = await previewContext.newPage(); await preview.goto(url);
    await preview.getByRole('heading', { name: '现场快速记录', exact: true }).waitFor();
    await preview.getByRole('status').waitFor({ state: 'hidden' });
    assert.equal(await preview.locator('.note-card').count(), 0);
    await preview.screenshot({ path: path.join(out, 'ready-to-use.png'), fullPage: true });
  } finally { await previewContext.close(); }
} finally {
  await fs.writeFile(path.join(out, 'reliability-result.json'), JSON.stringify({ results, browserVersion: browser.version(), testedAt: new Date().toISOString(), url }, null, 2));
  await browser.close();
}
assert.equal(results.filter(result => !result.passed).length, 0, 'All targeted failure-safety checks must pass');
