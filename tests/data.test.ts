import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCase, deleteNote, emptyData, generateReport, newCase, newFinding, newNote, parseBackup, serializeBackup } from '../src/data';
import { CHAIN_LABELS, type AppData } from '../src/types';

function fixture(): AppData {
  const a = newCase('午市双人套餐调整');
  const b = newCase('外卖渠道价格核对');
  const note = { ...newNote(a.id), content: '同学查询了三张Excel，目的还不知道。', evidence: '现场目视，未留存文件。' };
  const question = { ...newNote(a.id), content: '为什么要反复查询？', nature: '我的疑问' as const };
  const other = { ...newNote(b.id), content: '打开渠道配置表。' };
  const finding = { ...newFinding(a.id), description: '查询表格是否存在重复劳动？', facts: '观察到查询三张表。', hypothesis: '可能缺少统一商品系统。', noteIds: [note.id], unknowns: '尚不知道三张表各自用途。', nextSteps: '找套餐负责人核对三张表的字段和使用目的。' };
  a.chain[1] = { description: '查看Excel资料', status: '待确认', noteIds: [note.id], evidence: '仅看到查询动作，不知道用途。' };
  return { version: 1, cases: [a, b], notes: [note, question, other], findings: [finding], selectedCaseId: a.id };
}

test('constructors create independent stable IDs and seven empty, unconfirmed chain nodes', () => {
  const a = newCase('  套餐任务  ');
  const b = newCase('套餐任务');
  assert.equal(a.name, '套餐任务');
  assert.notEqual(a.id, b.id);
  assert.equal(a.chain.length, CHAIN_LABELS.length);
  assert.ok(a.chain.every(node => node.status === '待确认' && node.description === '' && node.noteIds.length === 0));
  a.chain[0].noteIds.push('note-id');
  assert.deepEqual(a.chain[1].noteIds, []);
  assert.equal(newNote(a.id).timeType, '未知');
  assert.equal(newFinding(a.id).status, '待验证');
});

test('empty and populated JSON backups round trip without changing IDs, timestamps or relationships', () => {
  assert.deepEqual(parseBackup(serializeBackup(emptyData())), emptyData());
  const data = fixture();
  const restored = parseBackup(serializeBackup(data));
  assert.deepEqual(restored, data);
  assert.notEqual(restored, data);
  assert.equal(restored.cases[0].chain[1].noteIds[0], data.notes[0].id);
});

test('an incomplete observation saves with only task, text and nature; optional details remain unknown', () => {
  const c = newCase('未知目的的查询');
  const note = { ...newNote(c.id), content: '正在查询一个Excel，不知道目的。' };
  const data = { ...emptyData(), cases: [c], notes: [note], selectedCaseId: c.id };
  assert.deepEqual(parseBackup(serializeBackup(data)).notes[0], note);
});

test('reject malformed JSON, unsupported versions, incomplete or extra fields before restoration', () => {
  assert.throws(() => parseBackup('{'), /不是有效的JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...emptyData(), version: 2 })), /版本1/);
  assert.throws(() => parseBackup(JSON.stringify({ cases: [], notes: [], findings: [], selectedCaseId: '' })), /缺少必要字段/);
  assert.throws(() => parseBackup(JSON.stringify({ ...emptyData(), settings: {} })), /不支持的字段/);
  const missingField = fixture() as unknown as { notes: Record<string, unknown>[] };
  delete missingField.notes[0].timeType;
  assert.throws(() => parseBackup(JSON.stringify(missingField)), /缺少必要字段/);
});

test('reject duplicate IDs across objects and duplicate references', () => {
  const data = fixture();
  data.notes.push({ ...data.notes[0] });
  assert.throws(() => parseBackup(JSON.stringify(data)), /ID重复/);
  const crossTypeDuplicate = fixture();
  crossTypeDuplicate.findings[0].id = crossTypeDuplicate.cases[0].id;
  assert.throws(() => parseBackup(JSON.stringify(crossTypeDuplicate)), /ID重复/);
  const duplicateReference = fixture();
  duplicateReference.findings[0].noteIds.push(duplicateReference.findings[0].noteIds[0]);
  assert.throws(() => parseBackup(JSON.stringify(duplicateReference)), /重复引用/);
});

test('reject dangling parent, selected task, chain and finding references', () => {
  const parent = fixture();
  parent.notes[0].caseId = 'missing-case';
  assert.throws(() => parseBackup(JSON.stringify(parent)), /任务不存在/);
  const selected = fixture();
  selected.selectedCaseId = 'missing-case';
  assert.throws(() => parseBackup(JSON.stringify(selected)), /当前选中的任务不存在/);
  const chain = fixture();
  chain.cases[0].chain[0].noteIds = ['missing-note'];
  assert.throws(() => parseBackup(JSON.stringify(chain)), /不存在的观察记录/);
  const finding = fixture();
  finding.findings[0].noteIds = ['missing-note'];
  assert.throws(() => parseBackup(JSON.stringify(finding)), /不存在的观察记录/);
  const orphanFinding = fixture();
  orphanFinding.findings[0].caseId = 'missing-case';
  assert.throws(() => parseBackup(JSON.stringify(orphanFinding)), /研究问题关联的任务不存在/);
});

test('reject chain and finding evidence that belongs to another case', () => {
  const chain = fixture();
  chain.cases[0].chain[2].noteIds = [chain.notes[2].id];
  assert.throws(() => parseBackup(JSON.stringify(chain)), /其他任务/);
  const finding = fixture();
  finding.findings[0].noteIds = [finding.notes[2].id];
  assert.throws(() => parseBackup(JSON.stringify(finding)), /其他任务/);
});

test('reject invalid field types, enum values, dates, IDs and chain lengths', () => {
  const invalidNature = fixture();
  (invalidNature.notes[0] as unknown as { nature: string }).nature = '已证实的根因';
  assert.throws(() => parseBackup(JSON.stringify(invalidNature)), /取值不受支持/);
  const invalidBoolean = fixture();
  (invalidBoolean.notes[0] as unknown as { important: string }).important = 'false';
  assert.throws(() => parseBackup(JSON.stringify(invalidBoolean)), /布尔值/);
  const invalidDate = fixture();
  invalidDate.cases[0].startDate = '2026-02-30';
  assert.throws(() => parseBackup(JSON.stringify(invalidDate)), /日期无效/);
  const invalidTimestamp = fixture();
  invalidTimestamp.notes[0].createdAt = 'tomorrow';
  assert.throws(() => parseBackup(JSON.stringify(invalidTimestamp)), /时间格式不正确/);
  const badId = fixture();
  badId.cases[0].id = '<script>';
  assert.throws(() => parseBackup(JSON.stringify(badId)), /稳定ID/);
  const badChain = fixture();
  badChain.cases[0].chain.pop();
  assert.throws(() => parseBackup(JSON.stringify(badChain)), /7个节点/);
});

test('reject oversized backups using byte size, including multibyte Chinese input', () => {
  assert.throws(() => parseBackup(' '.repeat(10 * 1024 * 1024 + 1)), /超过10 MiB/);
  assert.throws(() => parseBackup('中'.repeat(4 * 1024 * 1024)), /超过10 MiB/);
});

test('optional local dates and times are real, timezone-free and chronologically valid', () => {
  const data = fixture();
  const note = data.notes[0];
  note.timeType = '估算';
  note.duration = '约5分钟';
  note.startTime = '2024-02-29T23:58';
  assert.doesNotThrow(() => parseBackup(serializeBackup(data)));
  note.endTime = '2024-03-01T00:03:00.125';
  assert.doesNotThrow(() => parseBackup(serializeBackup(data)));
  note.startTime = '2024-03-01T00:04';
  assert.throws(() => parseBackup(JSON.stringify(data)), /结束时间不能早于开始时间/);
  note.endTime = '';
  for (const invalidTime of ['2026-02-30T10:00', '2026-10-20T24:00', '2026-10-20T10:60', '2026-10-20T10:00:60', '2026-10-20T10:00Z', '2026-10-20 10:00', '10:00']) {
    note.startTime = invalidTime;
    assert.throws(() => parseBackup(JSON.stringify(data)), /日期无效|本地日期和时间/, invalidTime);
  }
  note.startTime = '';
  note.timeType = '未知';
  assert.throws(() => parseBackup(JSON.stringify(data)), /不能保留隐藏的耗时或起止时间/);
  note.duration = '';
  note.startTime = '2026-10-20T10:00';
  assert.throws(() => parseBackup(JSON.stringify(data)), /不能保留隐藏的耗时或起止时间/);
  note.startTime = '';
  assert.doesNotThrow(() => parseBackup(serializeBackup(data)));
});

test('timestamps reject normalized hour 24, invalid minute/second/offset and impossible dates', () => {
  const data = fixture();
  for (const value of ['2026-10-20T24:00:00.000Z', '2026-10-20T10:60:00Z', '2026-10-20T10:00:60Z', '2026-10-20T10:00:00+24:00', '2026-10-20T10:00:00+08:60', '2026-02-30T10:00:00Z']) {
    data.notes[0].createdAt = value;
    assert.throws(() => parseBackup(JSON.stringify(data)), /时间格式不正确|日期无效/, value);
  }
  data.notes[0].createdAt = '2026-10-20T10:00:00+08:00';
  assert.doesNotThrow(() => parseBackup(serializeBackup(data)));
});

test('validation failure does not mutate existing state and serializer refuses corrupt data', () => {
  const current = fixture();
  const before = structuredClone(current);
  const corrupt = structuredClone(current);
  corrupt.notes[0].caseId = 'unknown';
  assert.throws(() => parseBackup(JSON.stringify(corrupt)), /当前数据未被修改/);
  assert.deepEqual(current, before);
  assert.throws(() => serializeBackup(corrupt), /任务不存在/);
});

test('editing a note preserves stable evidence links and reports updated text', () => {
  const data = fixture();
  const noteId = data.notes[0].id;
  data.notes[0] = { ...data.notes[0], content: '已核对：查询的是两张Excel。', updatedAt: '2026-10-21T08:00:00.000Z' };
  const restored = parseBackup(serializeBackup(data));
  assert.equal(restored.notes[0].id, noteId);
  assert.deepEqual(restored.cases[0].chain[1].noteIds, [noteId]);
  assert.deepEqual(restored.findings[0].noteIds, [noteId]);
  const report = generateReport(restored, data.selectedCaseId);
  assert.match(report, /已核对：查询的是两张Excel/);
  assert.match(report, /修改于/);
  assert.ok(report.includes(noteId));
});

test('deleting a note immutably removes references without deleting user descriptions', () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = deleteNote(data, data.notes[0].id);
  assert.equal(result.notes.length, 2);
  assert.deepEqual(result.cases[0].chain[1].noteIds, []);
  assert.deepEqual(result.findings[0].noteIds, []);
  assert.equal(result.cases[0].chain[1].description, '查看Excel资料');
  assert.deepEqual(data, before);
  assert.deepEqual(parseBackup(serializeBackup(result)), result);
});

test('deleting a task cascades its notes and findings and chooses a remaining task', () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = deleteCase(data, data.cases[0].id);
  assert.equal(result.cases.length, 1);
  assert.equal(result.notes.length, 1);
  assert.deepEqual(result.findings, []);
  assert.equal(result.selectedCaseId, data.cases[1].id);
  assert.deepEqual(data, before);
  assert.deepEqual(parseBackup(serializeBackup(result)), result);
  assert.deepEqual(deleteCase(result, result.cases[0].id), emptyData());
});

test('report contains exactly seven main sections and leaves all unobserved stages unknown', () => {
  const data = fixture();
  const report = generateReport(data, data.selectedCaseId);
  assert.equal(report.match(/^## \d\./gm)?.length, 7);
  CHAIN_LABELS.forEach(label => assert.ok(report.includes(label)));
  assert.match(report, /未观察到 \/ 尚未补充；待确认/);
  assert.match(report, /尚未观察到后续结果/);
  assert.match(report, /不代表活动发生时间、观察时长或任务耗时/);
  assert.match(report, /不能代表整个货盘组/);
  assert.match(report, /证据说明：现场目视/);
});

test('question and hypothesis notes stay outside the facts section and retain their nature and evidence', () => {
  const data = fixture();
  const speculation = { ...newNote(data.selectedCaseId), content: '怀疑因为缺少统一商品系统。', nature: '我的推测' as const, evidence: '仅是我个人猜测。' };
  data.notes.push(speculation);
  data.findings[0].noteIds.push(speculation.id);
  const report = generateReport(data, data.selectedCaseId);
  const factsSection = report.split('## 4. 关键事实及证据')[1].split('## 5. 当前不能解释的环节')[0];
  assert.ok(!factsSection.includes(speculation.content));
  assert.ok(!factsSection.includes('为什么要反复查询？'));
  assert.match(report, /【我的疑问】为什么要反复查询/);
  assert.match(report, /【我的推测】怀疑因为缺少统一商品系统/);
  assert.match(report, /未确认，不能作为已确认事实/);
  assert.match(report, /原因假设（待验证，不是已确认根因）/);
  assert.match(report, /此条不是已确认事实/);
  assert.match(report, /仅是我个人猜测/);
});

test('report includes at most three active user-selected findings from the representative task', () => {
  const data = fixture();
  data.findings = Array.from({ length: 6 }, (_, i) => ({ ...newFinding(data.selectedCaseId), description: `候选描述${i}` }));
  data.findings[0].includeInReport = false;
  data.findings[1].status = '暂不追踪';
  data.findings.push({ ...newFinding(data.cases[1].id), description: '其他任务候选' });
  const report = generateReport(data, data.selectedCaseId);
  assert.equal(report.match(/^### 候选问题 \d/gm)?.length, 3);
  assert.ok(!report.includes('候选描述0'));
  assert.ok(!report.includes('候选描述1'));
  assert.ok(!report.includes('候选描述5'));
  assert.ok(!report.includes('其他任务候选'));
  assert.match(report, /另有 1 个/);
});

test('fact report excerpts cap at eight and prioritize importance, representative references and representative context', () => {
  const a = newCase('代表任务');
  const b = newCase('其他任务');
  const referenced = { ...newNote(a.id), content: '代表任务引用的较早事实', createdAt: '2026-10-20T00:00:00Z' };
  const important = { ...newNote(b.id), content: '重要事实优先', important: true, createdAt: '2026-10-19T00:00:00Z' };
  const selected = Array.from({ length: 9 }, (_, i) => ({ ...newNote(a.id), content: `代表任务其他事实${i}`, createdAt: `2026-10-20T01:0${i}:00Z` }));
  const others = Array.from({ length: 4 }, (_, i) => ({ ...newNote(b.id), content: `其他任务较新事实${i}`, createdAt: `2026-10-21T01:0${i}:00Z` }));
  a.chain[0].noteIds = [referenced.id];
  const data = { ...emptyData(), cases: [a, b], notes: [...selected, ...others, referenced, important], selectedCaseId: a.id };
  const report = generateReport(data, a.id);
  const facts = report.split('## 4. 关键事实及证据')[1].split('## 5. 当前不能解释的环节')[0];
  assert.equal(facts.match(/^- (?:★ )?`/gm)?.length, 8);
  assert.ok(facts.indexOf(important.id) < facts.indexOf(referenced.id));
  assert.ok(facts.indexOf(referenced.id) < facts.indexOf(selected[8].id));
  assert.ok(facts.includes(selected[3].id));
  assert.ok(!facts.includes(selected[2].id));
  assert.ok(others.every(note => !facts.includes(note.id)));
  assert.match(facts, /摘录 8 \/ 15 条/);
  assert.match(facts, /不是完整档案；完整数据请导出 JSON 备份/);
});

test('unconfirmed excerpts cap at six with explicit omissions and preserve representative priority', () => {
  const data = fixture();
  const selected = data.cases[0];
  const questions = Array.from({ length: 9 }, (_, i) => ({ ...newNote(selected.id), content: `需要核对的疑问${i}`, nature: '我的疑问' as const, createdAt: `2026-10-20T01:0${i}:00Z` }));
  const important = { ...newNote(data.cases[1].id), content: '重要的个人推测', nature: '我的推测' as const, important: true, createdAt: '2026-10-19T00:00:00Z' };
  data.notes = [...questions, important];
  selected.chain[1].noteIds = [questions[0].id];
  data.findings = [];
  const report = generateReport(data, selected.id);
  const unknown = report.split('## 5. 当前不能解释的环节')[1].split('## 6. 值得进一步验证的候选问题')[0];
  assert.equal(unknown.match(/^- `/gm)?.length, 6);
  assert.ok(unknown.indexOf(important.id) < unknown.indexOf(questions[0].id));
  assert.ok(unknown.indexOf(questions[0].id) < unknown.indexOf(questions[8].id));
  assert.ok(!unknown.includes(questions[1].id));
  assert.match(unknown, /摘录 6 \/ 10 条/);
  assert.match(unknown, /不代表全部未知信息；完整记录保留在 JSON 备份中/);
});

test('excerpt limits never truncate exact chain and candidate evidence references', () => {
  const c = newCase('证据链任务');
  const notes = Array.from({ length: 10 }, (_, i) => ({ ...newNote(c.id), content: `原始事实${i}`, evidence: `原始事实证据${i}`, createdAt: `2026-10-20T01:0${i}:00Z` }));
  const questions = Array.from({ length: 8 }, (_, i) => ({ ...newNote(c.id), content: `原始疑问${i}`, evidence: `原始疑问证据${i}`, nature: '我的疑问' as const, createdAt: `2026-10-20T02:0${i}:00Z` }));
  c.chain[0].noteIds = notes.map(note => note.id);
  const finding = { ...newFinding(c.id), description: '需继续验证', noteIds: questions.map(note => note.id) };
  const report = generateReport({ ...emptyData(), cases: [c], notes: [...notes, ...questions], findings: [finding], selectedCaseId: c.id }, c.id);
  const chain = report.split('## 3. 一项代表性任务的真实链路')[1].split('## 4. 关键事实及证据')[0];
  const candidates = report.split('## 6. 值得进一步验证的候选问题')[1].split('## 7. 下一步调查行动')[0];
  notes.forEach(note => { assert.ok(chain.includes(note.id)); assert.ok(chain.includes(note.content)); assert.ok(chain.includes(note.evidence)); });
  questions.forEach(note => { assert.ok(candidates.includes(note.id)); assert.ok(candidates.includes(note.content)); assert.ok(candidates.includes(note.evidence)); });
});

test('a completed task still has no confirmed outcome until result evidence is present and confirmed', () => {
  const data = fixture();
  data.cases[0].status = '已结束';
  assert.match(generateReport(data, data.selectedCaseId), /尚未观察到后续结果/);
  data.cases[0].chain[6].description = '渠道负责人确认已上线。';
  assert.match(generateReport(data, data.selectedCaseId), /尚未观察到后续结果/);
  data.cases[0].chain[6].status = '已确认';
  assert.ok(!generateReport(data, data.selectedCaseId).includes('**尚未观察到后续结果。'));
  assert.match(generateReport(data, data.selectedCaseId), /可确认的范围限于以上描述与证据/);
});

test('report safely escapes content that could impersonate a report heading and has no invented conclusion', () => {
  const data = emptyData();
  const empty = generateReport(data, '');
  assert.match(empty, /尚无现场观察记录，不能形成研究结论/);
  assert.match(empty, /尚未选择代表性任务；不补造链路/);
  assert.match(empty, /尚未选入候选问题/);
  const populated = fixture();
  populated.notes[0].content = '观察\n## 已确认根因\n<script>alert(1)</script>';
  const report = generateReport(populated, populated.selectedCaseId);
  assert.equal(report.match(/^## \d\./gm)?.length, 7);
  assert.ok(!report.includes('\n## 已确认根因'));
  assert.ok(!report.includes('<script>'));
});
