import { CHAIN_LABELS, NATURES, type AppData, type Case, type Finding, type Note } from './types';

export const STORAGE_KEY = 'huopan-field-research-v1';
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 50_000;
const MAX_TEXT_LENGTH = 100_000;
const caseStatuses = ['观察中', '待补充', '已结束'] as const;
const findingStatuses = ['待验证', '验证中', '已核对', '暂不追踪'] as const;
const timeTypes = ['未知', '估算', '实测'] as const;
const chainStatuses = ['待确认', '已确认'] as const;

function dateInShanghai(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function emptyData(): AppData {
  return { version: 1, cases: [], notes: [], findings: [], selectedCaseId: '' };
}

export function newCase(name: string): Case {
  return {
    id: crypto.randomUUID(), name: name.trim(), type: '', purpose: '', startDate: dateInShanghai(),
    status: '观察中', description: '', limitations: '',
    chain: CHAIN_LABELS.map(() => ({ description: '', status: '待确认', noteIds: [], evidence: '' })),
  };
}

export function newNote(caseId: string): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), caseId, createdAt: now, updatedAt: now, content: '', nature: '直接观察',
    important: false, activity: '', timeType: '未知', duration: '', startTime: '', endTime: '',
    source: '', input: '', process: '', output: '', handoff: '', evidence: '',
  };
}

export function newFinding(caseId: string): Finding {
  return {
    id: crypto.randomUUID(), caseId, description: '', facts: '', hypothesis: '', noteIds: [],
    unknowns: '', nextSteps: '', status: '待验证', includeInReport: true,
  };
}

function invalid(message: string): never {
  throw new Error(`备份无法恢复：${message}。当前数据未被修改。`);
}

function object(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label}应为对象`);
  const result = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(result, key))) invalid(`${label}缺少必要字段`);
  if (Object.keys(result).some(key => !keys.includes(key))) invalid(`${label}含有不支持的字段`);
  return result;
}

function string(value: unknown, label: string, nonempty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) invalid(`${label}应为有效文本（最多10万字符）`);
  if (nonempty && !value.trim()) invalid(`${label}不能为空`);
}

function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) invalid(`${label}不是有效的稳定ID`);
}

function strings(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  keys.forEach(key => string(record[key], `${label}.${key}`));
}

function enumeration(value: unknown, values: readonly string[], label: string): void {
  if (typeof value !== 'string' || !values.includes(value)) invalid(`${label}取值不受支持`);
}

function boolean(value: unknown, label: string): void {
  if (typeof value !== 'boolean') invalid(`${label}应为布尔值`);
}

function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) invalid(`${label}应为数组且最多包含5万项`);
}

function idList(value: unknown, label: string): asserts value is string[] {
  array(value, label);
  value.forEach(item => id(item, label));
  if (new Set(value).size !== value.length) invalid(`${label}含有重复引用`);
}

function calendarDate(value: unknown, label: string): void {
  string(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label}日期格式不正确`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(`${label}日期无效`);
}

function timestamp(value: unknown, label: string): void {
  string(value, label);
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59
    || (parts[5] !== undefined && (Number(parts[5]) > 23 || Number(parts[6]) > 59))
    || !Number.isFinite(Date.parse(value))) invalid(`${label}时间格式不正确`);
  calendarDate(parts[1], label);
}

function localDateTime(value: unknown, label: string): number | null {
  string(value, label);
  if (!value) return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4] ?? 0) > 59) invalid(`${label}应为有效的本地日期和时间`);
  calendarDate(parts[1], label);
  // Treat both values in the same fixed frame for comparison; never infer a timezone or duration.
  const comparable = Date.parse(`${value}Z`);
  if (!Number.isFinite(comparable)) invalid(`${label}应为有效的本地日期和时间`);
  return comparable;
}

/** Validate the entire backup before the caller changes any live state. */
export function parseBackup(text: string): AppData {
  if (typeof text !== 'string') invalid('文件内容不是文本');
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    invalid('文件超过10 MiB，请选择较小的备份');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { invalid('不是有效的JSON文件'); }
  const root = object(parsed, '备份', ['version', 'cases', 'notes', 'findings', 'selectedCaseId']);
  if (root.version !== 1) invalid('仅支持版本1');
  array(root.cases, '任务'); array(root.notes, '观察记录'); array(root.findings, '研究问题');
  const allIds = new Set<string>();
  const remember = (value: unknown, label: string) => {
    id(value, label);
    if (allIds.has(value)) invalid(`ID重复（${value}）`);
    allIds.add(value);
  };
  root.cases.forEach((value, index) => {
    const label = `任务${index + 1}`;
    const item = object(value, label, ['id', 'name', 'type', 'purpose', 'startDate', 'status', 'description', 'chain', 'limitations']);
    remember(item.id, label); string(item.name, `${label}名称`, true);
    strings(item, ['type', 'purpose', 'description', 'limitations'], label);
    calendarDate(item.startDate, `${label}开始日期`); enumeration(item.status, caseStatuses, `${label}状态`);
    array(item.chain, `${label}链路`);
    if (item.chain.length !== CHAIN_LABELS.length) invalid(`${label}链路必须有7个节点`);
    item.chain.forEach((node, nodeIndex) => {
      const nodeLabel = `${label}.${CHAIN_LABELS[nodeIndex]}`;
      const chainNode = object(node, nodeLabel, ['description', 'status', 'noteIds', 'evidence']);
      strings(chainNode, ['description', 'evidence'], nodeLabel);
      enumeration(chainNode.status, chainStatuses, `${nodeLabel}确认状态`);
      idList(chainNode.noteIds, `${nodeLabel}记录引用`);
    });
  });
  root.notes.forEach((value, index) => {
    const label = `观察记录${index + 1}`;
    const item = object(value, label, ['id', 'caseId', 'createdAt', 'updatedAt', 'content', 'nature', 'important', 'activity', 'timeType', 'duration', 'startTime', 'endTime', 'source', 'input', 'process', 'output', 'handoff', 'evidence']);
    remember(item.id, label); id(item.caseId, `${label}任务ID`);
    timestamp(item.createdAt, `${label}保存时间`); timestamp(item.updatedAt, `${label}修改时间`);
    string(item.content, `${label}内容`, true);
    enumeration(item.nature, NATURES, `${label}性质`); boolean(item.important, `${label}重要标记`);
    enumeration(item.timeType, timeTypes, `${label}时间类型`);
    strings(item, ['activity', 'duration', 'startTime', 'endTime', 'source', 'input', 'process', 'output', 'handoff', 'evidence'], label);
    const start = localDateTime(item.startTime, `${label}开始时间`);
    const end = localDateTime(item.endTime, `${label}结束时间`);
    if (start !== null && end !== null && end < start) invalid(`${label}结束时间不能早于开始时间`);
    if (item.timeType === '未知' && (item.duration !== '' || item.startTime !== '' || item.endTime !== '')) {
      invalid(`${label}时间为未知时不能保留隐藏的耗时或起止时间`);
    }
  });
  root.findings.forEach((value, index) => {
    const label = `研究问题${index + 1}`;
    const item = object(value, label, ['id', 'caseId', 'description', 'facts', 'hypothesis', 'noteIds', 'unknowns', 'nextSteps', 'status', 'includeInReport']);
    remember(item.id, label); id(item.caseId, `${label}任务ID`);
    strings(item, ['description', 'facts', 'hypothesis', 'unknowns', 'nextSteps'], label);
    idList(item.noteIds, `${label}记录引用`);
    enumeration(item.status, findingStatuses, `${label}状态`); boolean(item.includeInReport, `${label}报告选项`);
  });
  // The checks above establish the full field contract. Reference validation follows separately.
  const result = parsed as AppData;
  const caseIds = new Set(result.cases.map(item => item.id));
  const notes = new Map(result.notes.map(item => [item.id, item]));
  const checkReferences = (noteIds: string[], caseId: string, label: string) => {
    for (const noteId of noteIds) {
      const note = notes.get(noteId);
      if (!note) invalid(`${label}引用了不存在的观察记录`);
      if (note.caseId !== caseId) invalid(`${label}引用了其他任务的观察记录`);
    }
  };
  for (const note of result.notes) if (!caseIds.has(note.caseId)) invalid('观察记录关联的任务不存在');
  for (const item of result.cases) item.chain.forEach(node => checkReferences(node.noteIds, item.id, '任务链路'));
  for (const item of result.findings) {
    if (!caseIds.has(item.caseId)) invalid('研究问题关联的任务不存在');
    checkReferences(item.noteIds, item.caseId, '研究问题');
  }
  string(result.selectedCaseId, '当前任务');
  if (result.selectedCaseId && !caseIds.has(result.selectedCaseId)) invalid('当前选中的任务不存在');
  return result;
}

export function serializeBackup(data: AppData): string {
  const text = JSON.stringify(data, null, 2);
  parseBackup(text);
  return text;
}

export function deleteNote(data: AppData, noteId: string): AppData {
  return {
    ...data, notes: data.notes.filter(item => item.id !== noteId),
    cases: data.cases.map(item => ({ ...item, chain: item.chain.map(node => ({ ...node, noteIds: node.noteIds.filter(id => id !== noteId) })) })),
    findings: data.findings.map(item => ({ ...item, noteIds: item.noteIds.filter(id => id !== noteId) })),
  };
}

export function deleteCase(data: AppData, caseId: string): AppData {
  const removedNotes = new Set(data.notes.filter(item => item.caseId === caseId).map(item => item.id));
  const cases = data.cases.filter(item => item.id !== caseId).map(item => ({
    ...item, chain: item.chain.map(node => ({ ...node, noteIds: node.noteIds.filter(id => !removedNotes.has(id)) })),
  }));
  return {
    ...data, cases, notes: data.notes.filter(item => item.caseId !== caseId),
    findings: data.findings.filter(item => item.caseId !== caseId).map(item => ({ ...item, noteIds: item.noteIds.filter(id => !removedNotes.has(id)) })),
    selectedCaseId: data.selectedCaseId === caseId ? (cases[0]?.id ?? '') : data.selectedCaseId,
  };
}

function md(value: string): string {
  return value.replace(/([\\`*_{}\[\]<>#|])/g, '\\$1').replace(/\r?\n/g, ' / ');
}
function textOrUnknown(value: string, unknown = '尚未补充'): string {
  return value.trim() ? md(value) : unknown;
}
function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}
function noteReference(note: Note): string {
  return `\`${note.id}\`【${note.nature}】${md(note.content)}`;
}
function evidenceReference(note: Note): string {
  return `${noteReference(note)}；原记录证据说明：${textOrUnknown(note.evidence, '未补充')}`;
}
function filledNode(node: Case['chain'][number]): boolean {
  return Boolean(node.description.trim() || node.noteIds.length || node.evidence.trim());
}

/** A deterministic compilation of saved evidence; this function never infers causes or fills gaps. */
export function generateReport(data: AppData, representativeCaseId: string): string {
  const chosen = data.cases.find(item => item.id === representativeCaseId);
  const allNotes = [...data.notes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const notesById = new Map(data.notes.map(item => [item.id, item]));
  const caseName = (caseId: string) => md(data.cases.find(item => item.id === caseId)?.name ?? '任务缺失');
  const candidates = data.findings.filter(item => item.caseId === chosen?.id && item.includeInReport && item.status !== '暂不追踪');
  const findings = candidates.slice(0, 3);
  const factNotes = allNotes.filter(item => item.nature === '直接观察' || item.nature === '对方原话');
  const unconfirmedNotes = allNotes.filter(item => item.nature === '我的疑问' || item.nature === '我的推测');
  const representativeReferences = new Set([
    ...(chosen?.chain.flatMap(node => node.noteIds) ?? []),
    ...findings.flatMap(item => item.noteIds),
  ]);
  const priority = (note: Note) => note.important ? 0 : note.caseId === chosen?.id ? (representativeReferences.has(note.id) ? 1 : 2) : 3;
  const excerpts = (notes: Note[], limit: number) => [...notes].sort((a, b) => priority(a) - priority(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
  const factExcerpts = excerpts(factNotes, 8);
  const unconfirmedExcerpts = excerpts(unconfirmedNotes, 6);
  const observedCases = data.cases.filter(item => data.notes.some(note => note.caseId === item.id));
  const lines = ['# 货盘组现场观察报告', '', '## 1. 本次观察范围及局限', ''];
  if (allNotes.length) {
    lines.push(`保存记录的时间范围：${formatTimestamp(allNotes[0].createdAt)} 至 ${formatTimestamp(allNotes[allNotes.length - 1].createdAt)}（北京时间）。`);
  } else lines.push('尚无现场观察记录，不能形成研究结论。');
  lines.push(`本报告汇总当前设备已保存的 ${data.notes.length} 条记录，涉及 ${observedCases.length} 项有记录的任务；代表性链路仅针对${chosen ? `「${md(chosen.name)}」` : '尚未选择的任务'}。`,
    '保存时间仅用于定位记录，不代表活动发生时间、观察时长或任务耗时。未填写和未观察的内容保持未知。',
    '当前样本不能代表整个货盘组的工作时间分布、长期问题发生频率、月度效率或总ROI。原话只证明对方这样表述，未自动证明表述内容已独立核实。',
    `代表任务的额外局限：${chosen ? textOrUnknown(chosen.limitations, '尚未填写，需在使用报告前核对观察覆盖范围') : '尚未选择代表任务'}。`, '',
    '## 2. 观察到的任务和主要工作活动', '');
  if (!observedCases.length) lines.push('尚未观察到任务。已创建但没有记录的任务不计入观察样本。');
  observedCases.forEach(item => {
    const notes = data.notes.filter(note => note.caseId === item.id);
    const activities = [...new Set(notes.map(note => note.activity.trim()).filter(Boolean))];
    lines.push(`- **${md(item.name)}**（任务ID：\`${item.id}\`；${item.status}；${notes.length} 条记录）`,
      `  - 任务类型：${textOrUnknown(item.type, '未填写')}；用户补充的目标/起因：${textOrUnknown(item.purpose, '待确认')}。`,
      `  - 已填写的活动类型：${activities.length ? activities.map(md).join('、') : '未分类；不根据记录文字自动推断'}。`);
  });
  lines.push('', '## 3. 一项代表性任务的真实链路', '');
  if (!chosen) lines.push('尚未选择代表性任务；不补造链路。');
  else {
    lines.push(`代表任务：**${md(chosen.name)}**。节点描述和确认状态均由用户整理，不由系统推断。`, '');
    chosen.chain.forEach((node, index) => {
      lines.push(`### ${index + 1}. ${CHAIN_LABELS[index]}`, '',
        filledNode(node) ? `用户标记：${node.status}。${textOrUnknown(node.description, '尚未补充描述')}。` : '未观察到 / 尚未补充；待确认。');
      if (node.noteIds.length) {
        lines.push('引用原始记录：');
        node.noteIds.forEach(id => {
          const note = notesById.get(id);
          lines.push(`- ${note ? evidenceReference(note) : `\`${id}\`（原始记录缺失，不可据此得出结论）`}`);
        });
      } else lines.push('引用原始记录：暂无。');
      lines.push(`证据说明：${textOrUnknown(node.evidence, '尚未补充证据说明')}。`, '');
    });
    const outcome = chosen.chain[6];
    if (chosen.status !== '已结束' || !outcome || !filledNode(outcome) || outcome.status !== '已确认') {
      lines.push('**尚未观察到后续结果。任务未结束，或结果确认尚不完整；不能把当前输出当作最终业务结果。**');
    } else lines.push('结果确认由用户标记为已确认；可确认的范围限于以上描述与证据。');
  }
  lines.push('', '## 4. 关键事实及证据', '', '以下保留直接观察和对方原话的原始分类；记录性质不等于独立核实状态。',
    `以下摘录 ${factExcerpts.length} / ${factNotes.length} 条事实或原话记录（最多8条，依次优先重要标记、代表任务引用、代表任务其他记录；同级较新记录优先）。这是关键记录摘录，不是完整档案；完整数据请导出 JSON 备份。`);
  if (!factNotes.length) lines.push('尚无直接观察或对方原话记录。疑问和推测不列为事实。');
  factExcerpts.forEach(note => {
    lines.push('', `- ${note.important ? '★ ' : ''}${noteReference(note)}`, `  - 任务：${caseName(note.caseId)}；保存于 ${formatTimestamp(note.createdAt)}${note.updatedAt !== note.createdAt ? `；修改于 ${formatTimestamp(note.updatedAt)}` : ''}。`);
    const optional: [string, string][] = [['来源/资料', note.source], ['输入', note.input], ['处理或判断', note.process], ['输出', note.output], ['交接对象', note.handoff]];
    optional.filter(([, value]) => value.trim()).forEach(([label, value]) => lines.push(`  - 用户补充的${label}：${md(value)}`));
    if (note.timeType !== '未知' && (note.duration.trim() || note.startTime || note.endTime)) {
      const timing = [note.duration ? `耗时 ${md(note.duration)}` : '', note.startTime ? `开始 ${md(note.startTime)}` : '', note.endTime ? `结束 ${md(note.endTime)}` : ''].filter(Boolean).join('；');
      lines.push(`  - 时间记录（${note.timeType}）：${timing}；未据此外推整体效率。`);
    }
    lines.push(`  - 证据说明：${textOrUnknown(note.evidence, '未附证据说明，需按原记录核对')}。`);
  });
  lines.push('', '## 5. 当前不能解释的环节', '');
  if (chosen) {
    const pending = chosen.chain.map((node, index) => (!filledNode(node) || node.status === '待确认') ? CHAIN_LABELS[index] : null).filter(Boolean);
    lines.push(pending.length ? `代表任务中尚缺记录或待确认的节点：${pending.join('、')}。` : '链路节点均由用户标记已确认；这不表示已排除样本之外的未知信息。');
  } else lines.push('尚未选择代表任务，无法核对链路覆盖范围。');
  lines.push(`以下摘录 ${unconfirmedExcerpts.length} / ${unconfirmedNotes.length} 条疑问或推测（最多6条，沿用重要标记和代表任务优先顺序），不代表全部未知信息；完整记录保留在 JSON 备份中。`);
  if (!unconfirmedNotes.length) lines.push('尚未记录独立的疑问或推测，不表示不存在未知环节。');
  unconfirmedExcerpts.forEach(note => lines.push(`- ${noteReference(note)}（未确认，不能作为已确认事实；任务：${caseName(note.caseId)}；证据说明：${textOrUnknown(note.evidence, '未补充')}）`));
  findings.forEach(item => { if (item.unknowns.trim()) lines.push(`- 候选问题「${textOrUnknown(item.description, '未命名')}」尚缺：${md(item.unknowns)}`); });
  lines.push('', '## 6. 值得进一步验证的候选问题（最多三个）', '', '以下仅收录用户主动建立并选入报告的候选问题。原因假设不自动转为根因，状态“已核对”也不自动证实假设。');
  if (!findings.length) lines.push('尚未选入候选问题；系统不从现场操作自动判定低效、浪费或根因。');
  findings.forEach((item, index) => {
    lines.push('', `### 候选问题 ${index + 1}：${textOrUnknown(item.description, '尚未描述')}`, '',
      `问题ID：\`${item.id}\`；状态：${item.status}。`,
      `用户整理的已确认事实（仍需对照原始证据）：${textOrUnknown(item.facts, '尚未补充，不能据此确认问题成立')}。`,
      `可能有问题的依据：${textOrUnknown(item.description, '尚未明确')}；该描述是用户提出的候选问题，不是系统判定。`,
      `原因假设（待验证，不是已确认根因）：${textOrUnknown(item.hypothesis, '尚未提出')}。`,
      `不足以支持结论的信息：${textOrUnknown(item.unknowns, '尚未明确，需要继续核对')}。`, '关联原始记录：');
    if (!item.noteIds.length) lines.push('- 暂无关联记录，证据不足。');
    item.noteIds.forEach(id => {
      const note = notesById.get(id);
      lines.push(`- ${note ? evidenceReference(note) : `\`${id}\`（原始记录缺失）`}${note && (note.nature === '我的疑问' || note.nature === '我的推测') ? '；此条不是已确认事实' : ''}`);
    });
  });
  if (candidates.length > 3) lines.push('', `另有 ${candidates.length - 3} 个已勾选候选问题未列入；报告按问题列表顺序最多保留3个，可调整选入项后重新导出。`);
  lines.push('', '## 7. 下一步调查行动', '');
  if (!findings.length) lines.push('尚未填写调查行动。请根据待确认环节补充要找的人、要查看的资料及核对方法。');
  findings.forEach(item => lines.push(`- 围绕「${textOrUnknown(item.description, '尚未描述的问题')}」：${textOrUnknown(item.nextSteps, '尚未填写找谁、查看什么资料及如何验证')}。`));
  lines.push('', '现场先捕捉，事后再分析。后续改善方式需根据证据比较业务流程、数据治理、现有系统、规则、脚本或AI，不预设解决方案。', '');
  return lines.join('\n');
}
