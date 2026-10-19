import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Download, FileText, Flag, Link2, Pencil, Plus, Route, Trash2, X } from 'lucide-react';
import { CHAIN_LABELS } from './types';
import type { AppData, Case, ChainNode, Finding, Note, ReviewProps } from './types';
import { generateReport, parseBackup, serializeBackup } from './data';

const reviewDraftKey = (caseId: string) => `review-draft-v1:${caseId}`;

// Only restore editable research fields. Current saved metadata and surviving
// same-task references take precedence over a session's older snapshot.
function compatibleCaseDraft(data: AppData, savedCase: Case, value: unknown): Case {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('链路草稿格式无效');
  const draftValue = value as Record<string, unknown>;
  if (!Array.isArray(draftValue.chain)) throw new Error('链路草稿格式无效');
  const validNoteIds = new Set(data.notes.filter(note => note.caseId === savedCase.id).map(note => note.id));
  const chain = draftValue.chain.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const node = value as Record<string, unknown>;
    return { ...node, noteIds: Array.isArray(node.noteIds) ? [...new Set(node.noteIds.filter((id): id is string => typeof id === 'string' && validNoteIds.has(id)))] : node.noteIds };
  });
  const candidate = { ...savedCase, chain, limitations: draftValue.limitations };
  const validated = parseBackup(JSON.stringify({ ...data, cases: data.cases.map(item => item.id === savedCase.id ? candidate : item) }));
  return validated.cases.find(item => item.id === savedCase.id)!;
}

function noteDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function NoteReferences({ notes, selected, onChange, label = '引用现场记录' }: { notes: Note[]; selected: string[]; onChange: (ids: string[]) => void; label?: string }) {
  return <details className="reference-details"><summary><Link2 size={15} /> {label}<span className="tag">{selected.length} 条</span></summary>
    <div className="reference-options">{notes.length ? notes.map(note => <label className="note-reference" key={note.id}>
      <input type="checkbox" checked={selected.includes(note.id)} onChange={e => onChange(e.target.checked ? [...selected, note.id] : selected.filter(id => id !== note.id))} />
      <span><span className={`nature-chip nature-${note.nature === '我的推测' ? 'assumption' : note.nature === '我的疑问' ? 'question' : 'fact'}`}>{note.nature}</span><time>{noteDate(note.createdAt)}</time><span className="reference-content">{note.content}</span></span>
    </label>) : <p className="muted">该任务还没有现场记录，可先补充描述，稍后关联证据。</p>}</div>
  </details>;
}

function blankFinding(caseId: string): Finding {
  return { id: crypto.randomUUID(), caseId, description: '', facts: '', hypothesis: '', noteIds: [], unknowns: '', nextSteps: '', status: '待验证', includeInReport: true };
}

export default function Review({ data, selectedCase: savedCase, onSelectCase, onUpdateCase, onSaveFinding, onDeleteFinding, onNotify }: ReviewProps) {
  const [tab, setTab] = useState<'chain' | 'findings' | 'report'>('chain');
  const [pendingCase, setPendingCase] = useState<Case | null>(null);
  const [sessionDraftSaved, setSessionDraftSaved] = useState(false);
  const [recoveryWarning, setRecoveryWarning] = useState('');
  const hasPending = !!savedCase && pendingCase?.id === savedCase.id;
  const selectedCase = savedCase && hasPending ? { ...savedCase, chain: pendingCase.chain, limitations: pendingCase.limitations } : savedCase;
  const [draft, setDraft] = useState<Finding | null>(null);
  const [formError, setFormError] = useState('');
  const [copyFallback, setCopyFallback] = useState(false);
  const reportRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setPendingCase(null); setSessionDraftSaved(false); setRecoveryWarning('');
    if (!savedCase) return;
    try {
      const raw = sessionStorage.getItem(reviewDraftKey(savedCase.id));
      if (!raw) return;
      const restored = compatibleCaseDraft(data, savedCase, JSON.parse(raw));
      if (JSON.stringify([restored.chain, restored.limitations]) === JSON.stringify([savedCase.chain, savedCase.limitations])) {
        sessionStorage.removeItem(reviewDraftKey(savedCase.id)); return;
      }
      setPendingCase(restored); setSessionDraftSaved(true);
    } catch { setRecoveryWarning('暂时无法恢复此任务的链路草稿。已保存的数据未修改；请检查浏览器存储或先导出备份。'); }
    // Restore only on task entry, never replace in-progress text on parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCase?.id]);
  useEffect(() => { setDraft(null); setFormError(''); setCopyFallback(false); }, [selectedCase?.id]);
  useEffect(() => { if (copyFallback) { reportRef.current?.focus(); reportRef.current?.select(); } }, [copyFallback]);
  const notes = data.notes.filter(note => note.caseId === selectedCase?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const findings = data.findings.filter(finding => finding.caseId === selectedCase?.id);
  const report = savedCase ? generateReport(data, savedCase.id) : '';

  function saveCaseChanges(item: Case) {
    if (!savedCase) return;
    const next = { ...savedCase, chain: item.chain, limitations: item.limitations };
    if (onUpdateCase(next)) {
      setPendingCase(null); setSessionDraftSaved(false); setRecoveryWarning('');
      try { sessionStorage.removeItem(reviewDraftKey(savedCase.id)); } catch { /* Saved data remains authoritative. */ }
      return;
    }
    setPendingCase(next); setRecoveryWarning('');
    try { sessionStorage.setItem(reviewDraftKey(savedCase.id), JSON.stringify(next)); setSessionDraftSaved(true); }
    catch { setSessionDraftSaved(false); }
  }
  function exportPendingBackup() {
    if (!savedCase || !pendingCase) return;
    try {
      const restored = compatibleCaseDraft(data, savedCase, pendingCase);
      const content = serializeBackup({ ...data, cases: data.cases.map(item => item.id === savedCase.id ? restored : item) });
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `见微-含链路草稿-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); onNotify('含当前任务链路草稿的 JSON 已导出');
    } catch { onNotify('草稿备份未能导出，请复制未保存文字，并检查输入长度或浏览器功能。'); }
  }

  function updateNode(index: number, patch: Partial<ChainNode>) {
    if (!selectedCase) return;
    saveCaseChanges({ ...selectedCase, chain: selectedCase.chain.map((node, i) => i === index ? { ...node, ...patch } : node) });
  }
  function updateDraft(patch: Partial<Finding>) { setDraft(current => current ? { ...current, ...patch } : null); }
  function saveFinding() {
    if (!draft) return;
    if (!draft.description.trim()) { setFormError('先简短写下你想进一步验证的问题。'); return; }
    const reportCount = data.findings.filter(item => item.caseId === draft.caseId && item.id !== draft.id && item.includeInReport && item.status !== '暂不追踪').length;
    if (draft.includeInReport && draft.status !== '暂不追踪' && reportCount >= 3) { setFormError('报告最多纳入三个候选问题。请取消此问题的“纳入报告”，或先调整其他问题。'); return; }
    if (onSaveFinding({ ...draft, description: draft.description.trim() })) { setDraft(null); setFormError(''); }
  }
  async function copyReport() {
    try { await navigator.clipboard.writeText(report); setCopyFallback(false); onNotify('报告已复制'); }
    catch { setCopyFallback(true); onNotify('自动复制不可用，请复制下方已选中的报告'); }
  }
  function exportReport() {
    const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `货盘现场研究-${selectedCase?.name || '报告'}-${new Date().toISOString().slice(0, 10)}.md`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); onNotify('Markdown 报告已导出');
  }

  return <div className="review-page">
    <header className="page-heading"><div><p className="eyebrow">MAKE SENSE / 事后整理</p><h1>任务复盘</h1><p className="page-subtitle">从现场记录还原过程，让每个判断都能追溯。</p></div><span className="tag autosave-tag"><Check size={14} /> {hasPending ? '未保存链路修改' : '链路修改自动保存'}</span></header>
    {recoveryWarning && <div className="alert alert-error" role="alert">{recoveryWarning}</div>}
    {hasPending && <div className="alert alert-error" role="alert"><strong>链路修改尚未保存，当前输入已保留。</strong><p>{sessionDraftSaved ? '草稿已暂存当前标签页，刷新后可继续恢复。研究报告只包含已保存内容；离开前建议导出含草稿的 JSON。' : '浏览器也未能暂存草稿，请勿刷新或关闭页面。研究报告只包含已保存内容；离开前请导出含草稿的 JSON，或复制未保存文字。'}</p><div className="button-row"><button className="btn" onClick={() => selectedCase && saveCaseChanges(selectedCase)}>重试保存链路</button><button className="btn" onClick={exportPendingBackup}><Download size={16} /> 导出含草稿的JSON</button></div></div>}
    {!selectedCase ? <div className="panel empty-state"><Route size={34} /><h2>从一项真实任务开始</h2><p>请先到「现场记录」创建任务，留下一条观察。之后可以在这里逐步还原链路。</p><p className="muted">信息不完整也没关系，未知的环节可以先留空。</p></div> : <>
      <div className="panel review-context"><label className="field"><span>选择观察任务</span><select aria-label="选择复盘任务" value={selectedCase.id} onChange={e => onSelectCase(e.target.value)}>{data.cases.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="review-context-meta"><span className="tag">{selectedCase.status}</span><span className="muted">{selectedCase.startDate} 开始 · {notes.length} 条记录</span></div></div>
      <nav className="review-tabs" aria-label="复盘内容"><button className={tab === 'chain' ? 'active' : ''} onClick={() => setTab('chain')}><Route size={17} />任务链路</button><button className={tab === 'findings' ? 'active' : ''} onClick={() => setTab('findings')}><Flag size={17} />候选问题<span className="tab-count">{findings.length}</span></button><button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}><FileText size={17} />研究报告</button></nav>

      {tab === 'chain' && <>
        <div className="review-intro"><div><h2>把真实过程，串起来</h2><p className="muted">按实际发生的情况补充，可以留空、跨日期继续。每个节点都能引用原始记录。</p></div><span className="tag">7 个环节 · 按需补充</span></div>
        {(() => { const result = selectedCase.chain[6]; const described = result.description.trim() || result.noteIds.length || result.evidence.trim(); const confirmed = selectedCase.status === '已结束' && described && result.status === '已确认'; return <div className={confirmed ? 'status-banner confirmed' : 'status-banner'}><span className="status-dot" /><div><strong>{confirmed ? '后续结果已确认' : selectedCase.status !== '已结束' || !described ? '尚未观察到后续结果' : '后续结果待确认'}</strong><p>{confirmed ? '请保留相关证据，便于回溯。' : '任务尚未结束或结果尚未核对时，请保持待确认，不必补齐整条链路。'}</p></div></div>; })()}
        <div className="chain-list">{selectedCase.chain.map((node, index) => <section className="panel chain-node" key={`${selectedCase.id}-${index}`}><div className="chain-number">{String(index + 1).padStart(2, '0')}</div><div className="chain-body"><div className="section-heading"><h3>{CHAIN_LABELS[index]}</h3><select className={`node-status ${node.status === '已确认' ? 'confirmed' : ''}`} aria-label={`${CHAIN_LABELS[index]}确认状态`} value={node.status} onChange={e => updateNode(index, { status: e.target.value as ChainNode['status'] })}><option>待确认</option><option>已确认</option></select></div><label className="field"><span className="sr-only">{CHAIN_LABELS[index]}描述</span><textarea rows={2} placeholder={['因为什么开始？是谁提出了任务？', '用到了哪些信息？来自哪里？', '如何整理、比对、计算或转换信息？', '依据什么作出选择？哪些规则或经验起作用？', '形成了什么表格、配置、方案或结论？', '交给谁？由谁继续执行或确认？', '实际发生了什么结果？如何核对？'][index]} value={node.description} onChange={e => updateNode(index, { description: e.target.value })} /></label><NoteReferences notes={notes} selected={node.noteIds} onChange={noteIds => updateNode(index, { noteIds })} /><details className="evidence-details"><summary>补充证据说明{node.evidence ? ' · 已填写' : ''}</summary><label className="field"><span className="sr-only">{CHAIN_LABELS[index]}证据说明</span><textarea rows={2} placeholder="例如：表格名称、数据日期、口头核对对象。请勿在此上传企业资料。" value={node.evidence} onChange={e => updateNode(index, { evidence: e.target.value })} /></label></details></div></section>)}</div>
        <section className="panel"><div className="section-heading"><h3>本次观察的范围与局限</h3></div><p className="muted">例如：只观察了套餐调整的准备阶段，尚未看到设计交付和上线结果。</p><label className="field"><span className="sr-only">观察范围与局限</span><textarea rows={3} placeholder="哪些过程没有看到？哪些信息暂时无法确认？允许稍后补充。" value={selectedCase.limitations} onChange={e => saveCaseChanges({ ...selectedCase, limitations: e.target.value })} /></label></section>
      </>}

      {tab === 'findings' && <>
        <div className="review-intro"><div><h2>保留疑问，逐步验证</h2><p className="muted">候选问题是待调查的线索。请把已确认事实、原因假设与未知信息分开。</p></div><button className="btn btn-primary" onClick={() => { setDraft(blankFinding(selectedCase.id)); setFormError(''); }} disabled={!!draft}><Plus size={16} /> 新建候选问题</button></div>
        {draft && <section className="panel finding-editor"><div className="section-heading"><h3>{findings.some(item => item.id === draft.id) ? '编辑候选问题' : '新建候选问题'}</h3><button className="btn btn-quiet icon-btn" aria-label="取消编辑候选问题" onClick={() => { setDraft(null); setFormError(''); }}><X size={18} /></button></div><div className="form-grid"><label className="field full"><span>候选问题与提出依据 <span className="required">*</span></span><textarea autoFocus rows={2} placeholder="看到了什么现象？为什么认为它可能有问题？例如：观察到三次人工比对，希望进一步确认是否都必要。" value={draft.description} onChange={e => { updateDraft({ description: e.target.value }); setFormError(''); }} /></label><label className="field"><span>已确认事实</span><textarea rows={3} placeholder="只写亲眼看到或已核对的信息；暂未确认可以留空。" value={draft.facts} onChange={e => updateDraft({ facts: e.target.value })} /></label><label className="field"><span>原因假设 · 尚待验证</span><textarea rows={3} placeholder="哪些原因可能解释现象？假设不等于结论。" value={draft.hypothesis} onChange={e => updateDraft({ hypothesis: e.target.value })} /></label><label className="field"><span>还缺哪些信息</span><textarea rows={3} placeholder="哪些信息还不足以支持结论？" value={draft.unknowns} onChange={e => updateDraft({ unknowns: e.target.value })} /></label><label className="field"><span>下一步验证方法</span><textarea rows={3} placeholder="找谁核对？查看什么资料？再观察什么？" value={draft.nextSteps} onChange={e => updateDraft({ nextSteps: e.target.value })} /></label><div className="full"><NoteReferences notes={notes} selected={draft.noteIds} onChange={noteIds => updateDraft({ noteIds })} /></div><label className="field"><span>核对进度</span><select value={draft.status} onChange={e => updateDraft({ status: e.target.value as Finding['status'] })}><option>待验证</option><option>验证中</option><option>已核对</option><option>暂不追踪</option></select></label><label className="checkbox-field"><input type="checkbox" checked={draft.includeInReport} onChange={e => updateDraft({ includeInReport: e.target.checked })} />纳入报告（最多三个候选问题）</label></div><p className="muted">“已核对”只记录你的核对进度，报告仍会将原因假设单独列出。</p>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button className="btn btn-quiet" onClick={() => { setDraft(null); setFormError(''); }}>取消</button><button className="btn btn-primary" onClick={saveFinding}><Check size={16} /> 保存候选问题</button></div></section>}
        {!findings.length && !draft && <div className="panel empty-state"><Flag size={30} /><h3>还没有候选问题</h3><p>没有明确问题也是有效发现。先记录事实，等证据足够时再建立问题。</p></div>}
        <div className="findings-list">{findings.map(finding => <article className="panel finding-card" key={finding.id}><div className="section-heading"><span className="tag">{finding.status}</span>{finding.includeInReport && finding.status !== '暂不追踪' && <span className="tag subtle">纳入报告</span>}<div className="card-actions"><button className="btn btn-quiet icon-btn" aria-label={`编辑问题：${finding.description}`} onClick={() => { setDraft({ ...finding, noteIds: [...finding.noteIds] }); setFormError(''); }} disabled={!!draft}><Pencil size={16} /></button><button className="btn btn-quiet icon-btn danger" aria-label={`删除问题：${finding.description}`} onClick={() => onDeleteFinding(finding.id)}><Trash2 size={16} /></button></div></div><h3>{finding.description}</h3><div className="finding-summary"><div><span className="eyebrow">已确认事实</span><p>{finding.facts || '尚未填写已确认事实'}</p></div><div><span className="eyebrow">原因假设 · 待验证</span><p>{finding.hypothesis || '尚未建立原因假设'}</p></div></div>{finding.unknowns && <p><strong>未知信息：</strong>{finding.unknowns}</p>}{finding.nextSteps && <p><strong>下一步：</strong>{finding.nextSteps}</p>}<details className="reference-details"><summary><Link2 size={15} /> 已关联 {finding.noteIds.length} 条原始记录</summary>{notes.filter(note => finding.noteIds.includes(note.id)).map(note => <div className="note-reference" key={note.id}><span><span className="nature-chip">{note.nature}</span><time>{noteDate(note.createdAt)}</time><span className="reference-content">{note.content}</span></span></div>)}</details></article>)}</div>
      </>}

      {tab === 'report' && <>
        <div className="review-intro"><div><h2>一份有边界的研究成果</h2><p className="muted">根据当前任务、原始记录和人工整理内容生成；未观察与待确认的信息会保留。</p></div><div className="report-actions"><button className="btn" onClick={copyReport}><Clipboard size={16} /> 复制报告</button><button className="btn btn-primary" onClick={exportReport}><Download size={16} /> 导出 Markdown</button></div></div>
        <div className="report-notice">报告只描述本次案例，不外推全组月度效率或总 ROI。原因假设始终保留为假设。</div>
        {copyFallback && <div className="panel"><p role="alert">自动复制不可用。下方已选中报告，请按 Ctrl/Cmd + C，或长按复制。</p><textarea ref={reportRef} className="copy-fallback" aria-label="手动复制研究报告" rows={12} readOnly value={report} onFocus={e => e.currentTarget.select()} /></div>}
        <article className="panel report-preview"><pre>{report}</pre></article>
      </>}
    </>}
  </div>;
}
