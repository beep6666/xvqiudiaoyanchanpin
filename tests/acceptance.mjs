import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch {
  const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  playwright = require(modulePath);
}
const outDir = path.resolve('test-results');
await fs.mkdir(outDir, { recursive: true });
const url = process.env.APP_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const browser = await playwright.chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const browserErrors = [], externalRequests = [], passed = [];
page.on('pageerror', err => browserErrors.push(err.message));
page.on('request', req => {
  const address = req.url();
  if (/^https?:/.test(address) && !['127.0.0.1', 'localhost'].includes(new URL(address).hostname)) externalRequests.push(address);
});
async function check(name, action) {
  await action(); passed.push(name); console.log(`PASS ${name}`);
}
async function assertVisible(locator) { await locator.waitFor({ state: 'visible' }); }
async function assertText(locator, text) { assert.ok((await locator.innerText()).includes(text), `Expected text ${text}`); }
async function screenshot(filename) {
  await page.getByRole('status').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(outDir, filename), fullPage: true });
}
async function downloadJson() {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const download = await pending;
  const dest = path.join(outDir, `backup-${Date.now()}.json`);
  await download.saveAs(dest);
  return { file: dest, data: JSON.parse(await fs.readFile(dest, 'utf8')) };
}
async function closeModal() { await page.getByRole('button', { name: '关闭弹窗' }).click(); }
async function go(name) { await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click(); }
async function makeTask(name) {
  await page.getByRole('button', { name: '快速新建', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^任务名称/).fill(name);
  await dialog.getByRole('button', { name: '创建并选中', exact: true }).click();
}
let firstRecordId, originalBackup, firstEntryElapsedMs;
try {
  await page.goto(url);
  const begun = Date.now();
  await check('场景1：默认快速记录，无任务时直接保存最简记录', async () => {
    await assertVisible(page.getByRole('heading', { name: '现场快速记录', exact: true }));
    await page.locator('#observation').fill('同学正在查询一个 Excel，目的尚未了解。');
    await page.locator('#observation').press('Control+Enter');
    await assertVisible(page.locator('.note-card').filter({ hasText: '同学正在查询一个 Excel，目的尚未了解。' }));
    firstEntryElapsedMs = Date.now() - begun;
    console.log(`First record elapsed: ${firstEntryElapsedMs} ms (automated flow, not a human timing claim)`);
    assert.equal(await page.locator('#observation').inputValue(), '');
    firstRecordId = await page.locator('.note-card').getAttribute('data-note-id');
    assert.equal(await page.locator('#current-case option:checked').innerText(), '未命名现场任务');
    await page.getByRole('button', { name: '编辑当前任务' }).click();
    await page.getByRole('dialog').getByLabel(/^任务名称/).fill('午市套餐毛利调整（验收）');
    await page.getByRole('dialog').getByRole('button', { name: '保存任务', exact: true }).click();
  });
  await check('场景2：同一任务连续5条，保留任务并清空正文', async () => {
    const selected = await page.locator('#current-case').inputValue();
    const entries = [
      ['对方原话', '同学说：“我先确认一下这版成本是不是最新的。”'],
      ['我的疑问', '为什么要分别核对两份成本表？待追问。'],
      ['我的推测', '可能存在版本核对成本，原因尚待验证。'],
      ['直接观察', '同学把调整后的套餐清单发给设计同事。'],
    ];
    for (const [nature, content] of entries) {
      await page.getByRole('group', { name: '记录性质' }).getByRole('button', { name: new RegExp(nature + '$') }).click();
      await page.locator('#observation').fill(content);
      await page.getByRole('button', { name: /保存记录/ }).click();
      assert.equal(await page.locator('#observation').inputValue(), '');
      assert.equal(await page.locator('#current-case').inputValue(), selected);
    }
    assert.equal(await page.locator('.note-card').count(), 5);
    await assertText(page.locator('.note-card').first(), '同学把调整后的套餐清单发给设计同事。');
    await page.locator('#observation').fill('尚未保存的连续观察草稿');
    await page.reload();
    assert.equal(await page.locator('#observation').inputValue(), '尚未保存的连续观察草稿');
    assert.equal(await page.locator('#current-case').inputValue(), selected);
    assert.equal(await page.locator('.note-card').count(), 5);
    await page.locator('#observation').fill('');
  });
  await check('场景3：目的未知与可选字段留空仍正常保存', async () => {
    const card = page.locator(`[data-note-id="${firstRecordId}"]`);
    await assertText(card, '目的尚未了解');
    assert.equal(await card.locator('.note-chips').count(), 0);
    await card.getByRole('button', { name: '标记重要', exact: true }).click();
    assert.equal(await card.getByRole('button', { name: '取消重要标记' }).getAttribute('aria-pressed'), 'true');
  });
  await check('场景4a：事后编辑输入/判断/输出，记录ID不变', async () => {
    await page.locator(`[data-note-id="${firstRecordId}"]`).getByRole('button', { name: '编辑记录', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^观察内容/).fill('同学正在查询商品成本 Excel；用途仍待确认。');
    assert.equal(await dialog.getByLabel(/^观察内容/).evaluate(el => el === document.activeElement), true, 'Editing must retain keyboard focus');
    await dialog.getByText('补充细节', { exact: false }).first().click();
    await dialog.getByLabel(/^输入信息/).fill('商品成本表，本次版本未核实');
    await dialog.getByLabel(/^处理或判断过程/).fill('按套餐编号筛选；判断依据待确认');
    await dialog.getByLabel(/^输出结果/).fill('筛选后的商品清单');
    await dialog.getByLabel(/^证据说明/).fill('现场笔记 E01；未上传企业文件');
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
    const card = page.locator(`[data-note-id="${firstRecordId}"]`);
    await assertText(card, '用途仍待确认');
    await card.getByText('查看补充信息', { exact: false }).click();
    await assertText(card, '商品成本表，本次版本未核实');
    await assertText(card, '现场笔记 E01');
    await page.getByRole('button', { name: '编辑当前任务' }).click();
    await page.getByRole('dialog').getByLabel(/^任务名称/).fill('午市套餐毛利调整（已补充）');
    await page.getByRole('dialog').getByRole('button', { name: '保存任务', exact: true }).click();
    assert.equal(await page.locator('.note-card').count(), 5);
  });

  await screenshot('desktop-capture.png');
  await check('场景4b：事后任务链保存描述、证据与原始记录引用', async () => {
    await go('任务复盘');
    await assertVisible(page.getByText('尚未观察到后续结果', { exact: true }));
    await page.getByLabel(/^信息输入描述/).fill('现场看到的输入为商品成本 Excel；版本尚未确认。');
    await page.getByLabel(/^信息输入确认状态/).selectOption('已确认');
    const node = page.locator('.chain-node').nth(1);
    await node.locator('summary').filter({ hasText: '引用现场记录' }).click();
    await node.locator('label.note-reference').filter({ hasText: '同学正在查询商品成本 Excel；用途仍待确认。' }).getByRole('checkbox').check();
    await node.locator('summary').filter({ hasText: '补充证据说明' }).click();
    await page.getByLabel(/^信息输入证据说明/).fill('E01；仅确认看到该表，不确认版本可靠性');
    await page.getByLabel(/^业务判断描述/).fill('需向经办同学进一步核对套餐选择依据。');
    await page.getByLabel(/^形成输出描述/).fill('形成套餐清单，后续设计及上线尚未观察。');
    await page.getByLabel(/^观察范围与局限/).fill('本次只观察准备与交接片段，未观察上线及经营结果。');
    await page.reload();
    await go('任务复盘');
    assert.equal(await page.getByLabel(/^信息输入描述/).inputValue(), '现场看到的输入为商品成本 Excel；版本尚未确认。');
    assert.equal(await page.getByLabel(/^信息输入确认状态/).inputValue(), '已确认');
    await assertText(page.locator('.chain-node').nth(1), '1 条');
    await assertVisible(page.getByText('尚未观察到后续结果', { exact: true }));
  });
  await check('场景5：候选问题保持待验证，报告不补造根因或结果', async () => {
    await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name: /候选问题/ }).click();
    await page.getByRole('button', { name: '新建候选问题', exact: true }).click();
    const editor = page.locator('.finding-editor');
    await editor.getByLabel(/候选问题与提出依据/).fill('两份成本表是否需要重复核对？只观察到一次核对，尚需验证。');
    await editor.getByLabel(/^已确认事实/).fill('同学查询了商品成本 Excel。');
    await editor.getByLabel(/^原因假设 · 尚待验证/).fill('可能存在资料版本不一致；尚无证据确认。');
    await editor.getByLabel(/^还缺哪些信息/).fill('资料版本规则、使用频率、其他同学的实际做法。');
    await editor.getByLabel(/^下一步验证方法/).fill('向经办同学核对两表用途，查看版本管理说明。');
    await editor.locator('summary').filter({ hasText: '引用现场记录' }).click();
    await editor.locator('label.note-reference').filter({ hasText: '同学正在查询商品成本 Excel；用途仍待确认。' }).getByRole('checkbox').check();
    await editor.getByRole('button', { name: '保存候选问题', exact: true }).click();
    await assertText(page.locator('.finding-card'), '待验证');
    await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name: '研究报告', exact: true }).click();
    const report = await page.locator('.report-preview').innerText();
    assert.ok(report.includes('原因假设（待验证，不是已确认根因）'));
    assert.ok(report.includes('尚未观察到后续结果'));
    assert.ok(report.includes('本次只观察准备与交接片段'));
    assert.ok(report.includes(firstRecordId));
    assert.ok(report.includes('可能存在版本核对成本，原因尚待验证。'));
    assert.equal((report.match(/### 候选问题 /g) || []).length, 1);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.getByRole('button', { name: '复制报告', exact: true }).click();
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), report);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
    const download = await pending;
    const file = path.join(outDir, 'acceptance-report.md'); await download.saveAs(file);
    assert.equal(await fs.readFile(file, 'utf8'), report);
    await screenshot('desktop-report.png');
  });
  await check('场景6a：JSON下载、无效导入不覆盖，误删防护与引用清理', async () => {
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    originalBackup = await downloadJson();
    assert.equal(originalBackup.data.notes.length, 5);
    assert.equal(originalBackup.data.cases[0].chain[1].noteIds[0], firstRecordId);
    assert.equal(originalBackup.data.findings[0].noteIds[0], firstRecordId);
    const before = JSON.stringify(originalBackup.data);
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"cases":[],"notes":"invalid"}') });
    await assertVisible(page.getByRole('alert'));
    assert.equal(await page.getByRole('button', { name: '确认替换并恢复', exact: true }).count(), 0);
    assert.equal(JSON.stringify((await downloadJson()).data), before);
    await closeModal(); await go('现场快速记录');
    await page.locator(`[data-note-id="${firstRecordId}"]`).getByRole('button', { name: '删除记录', exact: true }).click();
    await assertText(page.getByRole('dialog'), '引用');
    await page.getByRole('button', { name: '保留，不删除', exact: true }).click();
    assert.equal(await page.locator('.note-card').count(), 5);
    await page.locator(`[data-note-id="${firstRecordId}"]`).getByRole('button', { name: '删除记录', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除记录', exact: true }).click();
    assert.equal(await page.locator('.note-card').count(), 4);
    await page.reload(); assert.equal(await page.locator('.note-card').count(), 4);
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    const after = (await downloadJson()).data;
    assert.ok(!after.notes.some(n => n.id === firstRecordId));
    assert.ok(after.cases.every(c => c.chain.every(n => !n.noteIds.includes(firstRecordId))));
    assert.ok(after.findings.every(f => !f.noteIds.includes(firstRecordId)));
  });
  await check('场景6b：从JSON文件确认恢复，任务链与证据关系完整', async () => {
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles(originalBackup.file);
    await assertVisible(page.getByText('备份检查通过', { exact: true }));
    await page.getByRole('button', { name: '确认替换并恢复', exact: true }).click();
    assert.equal(await page.locator('.note-card').count(), 5);
    await page.reload(); assert.equal(await page.locator('.note-card').count(), 5);
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    assert.deepEqual((await downloadJson()).data, originalBackup.data);
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles(originalBackup.file);
    await assertVisible(page.getByText('备份检查通过', { exact: true }));
    await page.getByLabel(/^导入 JSON 备份/).setInputFiles({ name: 'bad-after-good.json', mimeType: 'application/json', buffer: Buffer.from('bad') });
    await assertVisible(page.getByRole('alert'));
    assert.equal(await page.getByRole('button', { name: '确认替换并恢复', exact: true }).count(), 0, 'Invalid selection clears prior pending restore');
    await closeModal();
  });
  await check('任务管理：删除确认保护与关联数据级联清理', async () => {
    await go('现场快速记录'); await makeTask('临时任务（仅用于删除验收）');
    await page.locator('#observation').fill('临时任务观察记录');
    await page.getByRole('button', { name: /保存记录/ }).click();
    const removedCaseId = await page.locator('#current-case').inputValue();
    await go('任务复盘');
    await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name: /候选问题/ }).click();
    await page.getByRole('button', { name: '新建候选问题', exact: true }).click();
    await page.locator('.finding-editor').getByLabel(/候选问题与提出依据/).fill('临时待验证问题');
    await page.getByRole('button', { name: '保存候选问题', exact: true }).click();
    await go('现场快速记录'); await page.getByRole('button', { name: '编辑当前任务' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除任务', exact: true }).click();
    const confirm = page.getByRole('dialog').last();
    await assertText(confirm, '1 条观察记录、1 个候选问题');
    await confirm.getByRole('button', { name: '保留，不删除', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除任务', exact: true }).click();
    await page.getByRole('dialog').last().getByRole('button', { name: '删除任务及全部内容', exact: true }).click();
    await page.getByRole('button', { name: '数据备份与恢复', exact: true }).click();
    const after = (await downloadJson()).data;
    assert.ok(!after.cases.some(c => c.id === removedCaseId));
    assert.ok(!after.notes.some(n => n.caseId === removedCaseId));
    assert.ok(!after.findings.some(f => f.caseId === removedCaseId));
    assert.equal(after.notes.length, 5);
    await closeModal();
  });
  await check('今日指南：目标、六重点、可折叠追问和研究原则', async () => {
    await go('今日指南');
    for (const term of ['现状', '差距', '目的', '本次目标', '任务', '信息', '判断', '操作', '协作', '结果']) await assertText(page.locator('main'), term);
    assert.ok(await page.locator('details').count() >= 1);
    await assertText(page.locator('main'), '先观察事实');
    await screenshot('desktop-guide.png');
  });
  await check('手机390px：三页与弹窗无横向溢出，可继续记录', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    async function noOverflow(label) {
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.width + 1, `${label} overflow ${sizes.scroll}/${sizes.width}`);
    }
    await noOverflow('guide');
    await page.getByRole('button', { name: '打开菜单', exact: true }).click(); await go('现场快速记录');
    await noOverflow('capture');
    await page.locator('#observation').fill('手机端补记：后续情况待确认。');
    await page.getByRole('button', { name: /保存记录/ }).click();
    assert.equal(await page.locator('.note-card').count(), 6);
    await page.getByRole('button', { name: '快速新建', exact: true }).click(); await noOverflow('case modal'); await closeModal();
    await screenshot('mobile-capture.png');
    await page.getByRole('button', { name: '打开菜单', exact: true }).click(); await go('任务复盘');
    await page.getByRole('navigation', { name: '复盘内容' }).getByRole('button', { name: '任务链路', exact: true }).click();
    await noOverflow('review chain');
    await screenshot('mobile-review.png');
  });
  assert.deepEqual(browserErrors, [], 'No uncaught browser script errors');
  assert.deepEqual(externalRequests, [], 'No external HTTP requests from research app');
  await fs.writeFile(path.join(outDir, 'acceptance-result.json'), JSON.stringify({ passed, firstEntryElapsedMs, browserErrors, externalRequests, browserVersion: browser.version(), testedAt: new Date().toISOString(), url }, null, 2));
  console.log(`All ${passed.length} browser acceptance groups passed. Results: ${outDir}`);
} catch (err) {
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true });
  throw err;
} finally { await browser.close(); }

