import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpen, Check, ChevronDown, ClipboardList, Edit3, FileText, FolderOpen, Leaf, Menu, MoreHorizontal, Plus, Search, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { NATURES } from './types';
import type { AppData, Case, Finding, Nature, Note } from './types';
import { STORAGE_KEY, deleteCase, deleteNote, emptyData, newCase, newNote, parseBackup, serializeBackup } from './data';
import Guide from './Guide';
import Review from './Review';

const DRAFT_KEY = 'field-research-draft-v1';
const TAB_KEY = 'field-research-tab-v1';
let draftStorageKey: string;
try {
  let tabId = sessionStorage.getItem(TAB_KEY);
  if (!tabId) { tabId = crypto.randomUUID(); sessionStorage.setItem(TAB_KEY, tabId); }
  draftStorageKey = `${DRAFT_KEY}:${tabId}`;
} catch { draftStorageKey = `${DRAFT_KEY}:${crypto.randomUUID()}`; }
const pages = [{ id: 'capture', label: '现场快速记录', sub: '先捕捉', icon: Edit3 }, { id: 'guide', label: '今日指南', sub: '有备而来', icon: BookOpen }, { id: 'review', label: '任务复盘', sub: '再理解', icon: ClipboardList }] as const;
type Page = typeof pages[number]['id'];
type NoteDraft = Omit<Note, 'id' | 'caseId' | 'createdAt' | 'updatedAt' | 'important'>;
const blankDraft = (): NoteDraft => ({ content: '', nature: '直接观察', activity: '', timeType: '未知', duration: '', startTime: '', endTime: '', source: '', input: '', process: '', output: '', handoff: '', evidence: '' });
function readInitial() {
  try { const raw = localStorage.getItem(STORAGE_KEY); const data = raw ? parseBackup(raw) : emptyData();
    try { const draft = JSON.parse(localStorage.getItem(draftStorageKey) || 'null'); if (draft?.caseId && data.cases.some(c => c.id === draft.caseId)) data.selectedCaseId = draft.caseId; } catch { /* A broken draft must not prevent saved records from loading. */ }
    return { data, raw, error: '' }; }
  catch { return { data: emptyData(), raw: null, error: '无法读取本地数据。为避免覆盖，已暂停写入。请先下载原始数据，或从 JSON 备份恢复。' }; }
}
function readDraft(): NoteDraft {
  try { const value = JSON.parse(localStorage.getItem(draftStorageKey) || 'null'); const empty = blankDraft(); if (!value || typeof value !== 'object') return empty;
    for (const key of Object.keys(empty) as (keyof NoteDraft)[]) if (typeof value[key] === 'string') (empty as unknown as Record<string,string>)[key] = value[key];
    if (!NATURES.includes(empty.nature)) empty.nature = '直接观察';
    if (!['未知', '估算', '实测'].includes(empty.timeType)) empty.timeType = '未知'; return empty;
  } catch { return blankDraft(); }
}
export function downloadFile(content: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function shortDate(date: string) { return new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); }
function natureClass(nature: Nature) { return ['observed', 'quote', 'question', 'hypothesis'][NATURES.indexOf(nature)]; }

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current; (el?.querySelector('input:not([hidden]), textarea, select') as HTMLElement || el?.querySelector('button'))?.focus();
    const listener = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]'); if (dialogs[dialogs.length - 1] !== el) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && el) {
        const elements = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]'));
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }; document.addEventListener('keydown', listener); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', listener); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}><div className="modal-title"><h2 id="modal-title">{title}</h2><button className="icon-btn" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
function ExtraFields({ value, onChange }: { value: NoteDraft; onChange: (value: NoteDraft) => void }) {
  const set = (key: keyof NoteDraft, val: string) => onChange({ ...value, [key]: val });
  return <details className="extra-fields"><summary><ChevronDown size={15}/>补充细节<span>选填，事后再补也可以</span></summary><div className="form-grid">
    <label className="field">活动类型<select value={value.activity} onChange={e => set('activity', e.target.value)}><option value="">暂不分类</option>{['信息查询', '数据处理', '业务判断', '跨人协作', '配置执行', '结果核对', '其他'].map(x => <option key={x}>{x}</option>)}</select></label>
    <label className="field">时间类型<select value={value.timeType} onChange={e => set('timeType', e.target.value)}>{['未知', '估算', '实测'].map(x => <option key={x}>{x}</option>)}</select></label>
    {value.timeType !== '未知' && <><label className="field">{value.timeType === '估算' ? '估计耗时' : '实测耗时'}<input placeholder="如：约 5 分钟；可以不填" value={value.duration} onChange={e => set('duration', e.target.value)}/></label><div className="field">起止时间（选填）<div className="time-inputs"><input type="datetime-local" aria-label="开始时间" value={value.startTime} onChange={e => set('startTime', e.target.value)}/><input type="datetime-local" aria-label="结束时间" value={value.endTime} onChange={e => set('endTime', e.target.value)}/></div></div></>}
    {([['source','系统、表格或资料','如：商品毛利 Excel、企微群消息'],['input','输入信息','拿到了哪些信息？'],['process','处理或判断过程','做了什么？根据什么选择？'],['output','输出结果','形成了什么？尚未观察到可以留空'],['handoff','后续交接对象','谁确认或接手？'],['evidence','证据说明','如：表格名称、截图编号；无需上传文件']] as const).map(([key,label,placeholder]) => <label className="field" key={key}>{label}<textarea rows={2} placeholder={placeholder} value={value[key]} onChange={e => set(key,e.target.value)}/></label>)}
  </div></details>;
}
function CaseForm({ initial, onSave, onDelete }: { initial?: Case; onSave: (item: Case) => void; onDelete?: () => void }) {
  const [value, setValue] = useState<Case>(() => initial || newCase(''));
  const field = (key: keyof Case, val: string) => setValue({ ...value, [key]: val });
  return <form onSubmit={e => { e.preventDefault(); if (value.name.trim()) onSave({ ...value, name: value.name.trim() }); }}><p className="muted form-intro">只需填写名称。任务可以跨日期继续观察，其他信息随时补充。</p><div className="form-grid">
    <label className="field full">任务名称<span className="sr-only">必填</span><input required maxLength={160} placeholder="如：调整午市双人套餐" value={value.name} onChange={e => field('name',e.target.value)}/></label>
  </div><details className="extra-fields case-extra" open={initial ? true : undefined}><summary><ChevronDown size={15}/>补充任务信息<span>选填，之后再补</span></summary><div className="form-grid">
    <label className="field">任务类型<input placeholder="如：套餐策略 / 上线调整" value={value.type} onChange={e => field('type',e.target.value)}/></label>
    <label className="field">开始日期<input required type="date" value={value.startDate} onChange={e => field('startDate',e.target.value)}/></label>
    <label className="field full">任务目标或起因<textarea rows={2} placeholder="不知道也没关系，之后再问。" value={value.purpose} onChange={e => field('purpose',e.target.value)}/></label>
    <label className="field">状态<select value={value.status} onChange={e => field('status',e.target.value)}>{['观察中','待补充','已结束'].map(x => <option key={x}>{x}</option>)}</select></label>
    <label className="field full">补充说明<textarea rows={2} value={value.description} onChange={e => field('description',e.target.value)}/></label>
  </div></details><div className="modal-actions">{onDelete && <button type="button" className="btn btn-danger" onClick={onDelete}><Trash2 size={15}/>删除任务</button>}<button className="btn btn-primary" type="submit"><Check size={16}/>{initial ? '保存任务' : '创建并选中'}</button></div></form>;
}

export default function App() {
  const [initial] = useState(readInitial);
  const [data, setData] = useState(initial.data); const baseRef = useRef(initial.raw);
  const [storeError, setStoreError] = useState(initial.error);
  const [page, setPage] = useState<Page>('capture'); const [mobileMenu, setMobileMenu] = useState(false);
  const [draft, setDraftState] = useState<NoteDraft>(readDraft); const [draftError, setDraftError] = useState('');
  const [toast, setToast] = useState(''); const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [caseModal, setCaseModal] = useState<'new' | Case | null>(null); const [editNote, setEditNote] = useState<Note | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; label: string; action: () => void } | null>(null);
  const [backupOpen, setBackupOpen] = useState(false); const [importData, setImportData] = useState<AppData | null>(null); const [importError, setImportError] = useState('');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('全部记录');
  const inputRef = useRef<HTMLTextAreaElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const selectedCase = data.cases.find(x => x.id === data.selectedCaseId);
  const currentNotes = data.notes.filter(x => x.caseId === selectedCase?.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const shownNotes = currentNotes.filter(x => (filter !== '重要标记' || x.important) && (filter !== '疑问与推测' || ['我的疑问','我的推测'].includes(x.nature)) && (!search || [x.content,x.source,x.input,x.process,x.output,x.evidence].join(' ').toLowerCase().includes(search.toLowerCase())));
  const notify = (message: string) => { setToast(message); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(''), 3500); };
  useEffect(() => () => { if (toastRef.current) clearTimeout(toastRef.current); }, []);
  useEffect(() => { const listener = (e: StorageEvent) => { if (e.key === STORAGE_KEY && e.newValue !== baseRef.current) setStoreError('另一个窗口更新了数据。为防止相互覆盖，已暂停保存。当前输入仍保留，请刷新此页后继续。'); }; window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener); }, []);
  function commit(next: AppData, override = false): boolean {
    try {
      if (!override && localStorage.getItem(STORAGE_KEY) !== baseRef.current) { setStoreError(storeError || '本地数据已被其他窗口修改，请刷新后继续。当前输入仍保留。'); return false; }
      const raw = serializeBackup(next); localStorage.setItem(STORAGE_KEY,raw); baseRef.current = raw; setData(next); setStoreError(''); return true;
    } catch { setStoreError('保存失败：浏览器存储不可用或空间不足。当前输入已保留，请先导出 JSON 备份，释放空间后刷新重试。'); return false; }
  }
  function persistDraft(next: NoteDraft, caseId: string) { try { if (next.content || Object.entries(next).some(([key,value]) => value !== blankDraft()[key as keyof NoteDraft])) localStorage.setItem(draftStorageKey,JSON.stringify({ ...next,caseId })); else localStorage.removeItem(draftStorageKey); setDraftError(''); } catch { setDraftError('草稿暂时无法自动保存，请先复制当前文字；已保存记录可导出备份。'); } }
  function setDraft(next: NoteDraft) { setDraftState(next); persistDraft(next, selectedCase?.id || ''); }
  function selectCase(id: string) { if (commit({ ...data, selectedCaseId: id })) { persistDraft(draft,id); setSearch(''); setFilter('全部记录'); } }
  function saveNote(e?: FormEvent) {
    e?.preventDefault(); if (!draft.content.trim()) return;
    if (draft.timeType !== '未知' && draft.startTime && draft.endTime && draft.endTime < draft.startTime) { notify('结束时间不能早于开始时间，请调整或将时间标记为未知。'); return; }
    const task = selectedCase || newCase('未命名现场任务'); const note: Note = { ...newNote(task.id), ...draft, content: draft.content.trim() };
    if (note.timeType === '未知') { note.duration = ''; note.startTime = ''; note.endTime = ''; }
    const next = { ...data, cases: selectedCase ? data.cases : [...data.cases,task], selectedCaseId: task.id, notes: [...data.notes,note] };
    if (commit(next)) { setDraft(blankDraft()); notify('已保存 · 继续观察吧'); inputRef.current?.focus(); }
  }
  function saveCase(item: Case) { const exists = data.cases.some(x => x.id === item.id); if (commit({ ...data, cases: exists ? data.cases.map(x => x.id === item.id ? item : x) : [...data.cases,item], selectedCaseId: item.id })) { setCaseModal(null); notify(exists ? '任务已更新，原有记录关联保留' : '任务已创建，可以开始记录'); setTimeout(() => inputRef.current?.focus(),0); } }
  function updateCase(item: Case) { return commit({ ...data, cases: data.cases.map(x => x.id === item.id ? item : x) }); }
  function saveFinding(item: Finding) { const saved = commit({ ...data, findings: data.findings.some(x => x.id === item.id) ? data.findings.map(x => x.id === item.id ? item : x) : [...data.findings,item] }); if (saved) notify('候选问题已保存，仍需证据验证'); return saved; }
  function removeFinding(id: string) { setConfirmAction({title: '删除这个候选问题？', body: '仅删除问题整理，关联的原始观察记录会保留。', label: '删除问题', action: () => { if (commit({ ...data,findings:data.findings.filter(x => x.id !== id) })) notify('候选问题已删除'); } }); }
  function exportBackup() { downloadFile(serializeBackup(data),`见微-现场研究备份-${new Date().toISOString().slice(0,10)}.json`); notify('JSON 备份已导出，请妥善保管'); }
  async function readImport(file?: File) {
    setImportError(''); setImportData(null); if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setImportError('文件超过 10 MiB，请选择有效的 V0.1 备份。'); return; }
    try { setImportData(parseBackup(await file.text())); } catch (err) { setImportError(err instanceof Error ? err.message : '备份格式不正确，现有数据未更改。'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  function restore() {
    if (!importData) return;
    try { const previousRaw = localStorage.getItem(STORAGE_KEY); if (previousRaw) localStorage.setItem(`${STORAGE_KEY}-before-restore`, previousRaw); }
    catch { setImportError('无法保存恢复前的安全副本，请先手动导出并释放浏览器空间后重试。现有数据未更改。'); return; }
    if (commit(importData,true)) { setImportData(null); setImportError(''); setBackupOpen(false); setEditNote(null); setCaseModal(null); notify('恢复完成 · 任务、记录和证据关联已保留'); }
  }
  function requestDeleteNote(note: Note) {
    const refs = data.cases.reduce((n,c) => n + c.chain.filter(x => x.noteIds.includes(note.id)).length,0) + data.findings.filter(x => x.noteIds.includes(note.id)).length;
    setConfirmAction({ title: '删除这条观察记录？', body: `“${note.content.slice(0,70)}${note.content.length > 70 ? '…' : ''}”${refs ? `\n这条记录有 ${refs} 处引用，删除后会同步移除引用，请先确认相关证据。` : '\n建议先导出备份。删除后无法直接撤销。'}`, label: '删除记录', action: () => { if (commit(deleteNote(data,note.id))) notify('记录已删除，相关引用已同步更新'); } });
  }
  function saveEditedNote(e: FormEvent) {
    e.preventDefault(); if (!editNote || !editNote.content.trim()) return;
    if (editNote.timeType !== '未知' && editNote.startTime && editNote.endTime && editNote.endTime < editNote.startTime) { notify('结束时间不能早于开始时间'); return; }
    const moving = data.notes.find(x => x.id === editNote.id)?.caseId !== editNote.caseId;
    const base = moving ? deleteNote(data,editNote.id) : data;
    const item = { ...editNote, content: editNote.content.trim(), updatedAt: new Date().toISOString(), ...(editNote.timeType === '未知' ? { duration:'',startTime:'',endTime:'' } : {}) };
    const next = { ...base, notes: moving ? [...base.notes,item] : base.notes.map(x => x.id === item.id ? item : x) };
    if (commit(next)) { setEditNote(null); notify(moving ? '记录已关联到新任务；原任务的引用已移除' : '记录已更新，证据引用保持有效'); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-symbol"><Leaf size={23} strokeWidth={1.7}/></div><div><strong>见微<span>V0.1</span></strong><small>货盘组现场研究助手</small></div><button className="mobile-close icon-btn" aria-label="关闭菜单" onClick={() => setMobileMenu(false)}><X size={20}/></button></div>
      <div className="nav-label">研究工作台</div><nav aria-label="主导航">{pages.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => { setPage(item.id); setMobileMenu(false); }}><item.icon size={18}/><span>{item.label}</span>{page === item.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="task-heading"><span className="nav-label">观察任务 <b>{data.cases.length.toString().padStart(2,'0')}</b></span><button className="icon-btn" aria-label="新建观察任务" onClick={() => setCaseModal('new')}><Plus size={17}/></button></div>
      <div className="sidebar-tasks">{data.cases.length ? data.cases.map(item => <button key={item.id} className={`task-item ${item.id === selectedCase?.id ? 'selected' : ''}`} title={item.name} onClick={() => { selectCase(item.id); setMobileMenu(false); }}><span className={`status-dot ${item.status === '已结束' ? 'done' : ''}`}/><span>{item.name}</span><small>{data.notes.filter(n => n.caseId === item.id).length}</small></button>) : <div className="sidebar-empty">从一项真实任务开始<br/>不知道全貌也没关系</div>}</div>
      <button className="new-task btn" onClick={() => setCaseModal('new')}><Plus size={16}/>新建任务</button>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={18}/><div><strong>研究数据，仅留本机</strong><p>无登录 · 无上传 · 专注观察</p></div></div><button className="backup-nav" onClick={() => setBackupOpen(true)}><FolderOpen size={17}/>数据备份与恢复<ArrowRight size={15}/></button></div>
    </aside>
    {mobileMenu && <div className="sidebar-shade" onClick={() => setMobileMenu(false)}/>}
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="mobile-toggle icon-btn" aria-label="打开菜单" onClick={() => setMobileMenu(true)}><Menu size={21}/></button><span>货盘组现场研究</span><span className="slash">/</span><strong>{pages.find(x => x.id === page)?.label}</strong></div><div className={`save-status ${storeError ? 'has-error' : ''}`}><span className="status-dot"/>{storeError ? '本地保存异常' : '本地自动保存'}</div></header>
    <main>
      {storeError && <div className="alert alert-error" role="alert"><strong>{storeError}</strong><div className="button-row"><button className="btn" onClick={exportBackup}>导出当前可读数据</button><button className="btn" onClick={() => { const raw = localStorage.getItem(STORAGE_KEY); if (raw) downloadFile(raw,'见微-原始数据.json'); else notify('当前浏览器未找到可下载的原始数据'); }}>下载原始数据</button><button className="btn" onClick={() => setBackupOpen(true)}>从备份恢复</button><button className="btn" onClick={() => window.location.reload()}>刷新重读</button></div></div>}
      {page === 'capture' && <>
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> FIELD NOTES</div><h1>现场快速记录</h1><p>把注意力留给现场，一条记录就从一句话开始。</p></div><div className="today-label"><span>{new Date().toLocaleDateString('zh-CN',{ month:'long', day:'numeric' })}</span><small>{new Date().toLocaleDateString('zh-CN',{weekday:'long'})} · 现场观察</small></div></div>
        <div className="principle-strip"><Leaf size={17}/><span><strong>先观察事实，再判断问题</strong><span className="principle-more">；不要在现场急着设计解决方案。</span></span><button onClick={() => setPage('guide')}>观察指南<ArrowRight size={14}/></button></div>
        <section className="panel capture-panel" aria-label="快速记录表单"><div className="capture-top"><div className="field task-select"><label htmlFor="current-case">当前任务</label><select id="current-case" value={selectedCase?.id || ''} onChange={e => selectCase(e.target.value)}>{!selectedCase && <option value="">保存时自动创建未命名任务</option>}{data.cases.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></div><button className="btn btn-quiet" onClick={() => setCaseModal('new')}><Plus size={16}/>快速新建</button>{selectedCase && <button className="icon-btn" aria-label="编辑当前任务" title="编辑当前任务" onClick={() => setCaseModal(selectedCase)}><MoreHorizontal size={20}/></button>}</div>
        <form onSubmit={saveNote}><label htmlFor="observation" className="observation-label">观察内容<span>记录你看到的、听到的，或还不理解的。</span></label><textarea id="observation" className="capture-input" ref={inputRef} autoFocus placeholder={'此刻，发生了什么？\n例如：同学打开一张 Excel，筛选了本周套餐数据。目的还不清楚。'} value={draft.content} onChange={e => setDraft({ ...draft, content:e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); saveNote(); } }}/>
          <div className="nature-row"><span className="field-caption">记录性质</span><div className="nature-options" role="group" aria-label="记录性质">{NATURES.map((nature,i) => <button key={nature} type="button" aria-pressed={draft.nature === nature} className={`nature-choice ${natureClass(nature)} ${draft.nature === nature ? 'selected' : ''}`} onClick={() => setDraft({ ...draft,nature })}><span className="nature-symbol">{['◉','“','?','◇'][i]}</span>{nature}</button>)}</div></div>
          {draft.nature === '我的推测' && <p className="nature-hint">推测会单独标识，引用和报告中也会保留“我的推测”。</p>}
          <ExtraFields value={draft} onChange={setDraft}/><div className="capture-footer"><span className="draft-hint"><span className="status-dot"/>{draftError || (draft.content ? '草稿已保存在本机' : '信息不完整，也可以先记下来')}</span><button type="submit" className="btn btn-primary" disabled={!draft.content.trim()}><Plus size={17}/>保存记录<kbd>Ctrl ↵</kbd></button></div>
        </form></section>
        <section className="records-section" aria-label="观察记录"><div className="section-heading"><h2>观察记录<span className="count-pill">{currentNotes.length}</span></h2><span className="muted small">最新记录在上方 · 可跨日期继续</span></div>
          {currentNotes.length > 0 && <div className="records-toolbar"><div className="record-filters">{['全部记录','重要标记','疑问与推测'].map(x => <button className={filter === x ? 'active' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div><label className="search-box"><Search size={16}/><input aria-label="搜索当前任务记录" placeholder="搜索当前任务记录" value={search} onChange={e => setSearch(e.target.value)}/></label></div>}
          {!shownNotes.length ? <div className="empty-state capture-empty"><div className="empty-illustration"><FileText size={27} strokeWidth={1.3}/><span className="mini-plus"><Plus size={11}/></span></div><h3>{currentNotes.length ? '没有符合条件的记录' : '让真实工作留下第一条线索'}</h3><p>{currentNotes.length ? '试试清空搜索或切换记录筛选。' : '不必了解完整流程，也不必急着解释原因。\n先写下你刚刚看到或听到的一件事。'}</p>{!currentNotes.length && <button className="text-btn" onClick={() => inputRef.current?.focus()}>开始记录<ArrowRight size={15}/></button>}</div> : <div className="notes-list">{shownNotes.map((note,i) => <article className={`note-card ${note.important ? 'important' : ''}`} key={note.id} data-note-id={note.id}><div className="note-gutter"><span className={`note-dot ${natureClass(note.nature)}`}/>{i < shownNotes.length - 1 && <span className="note-line"/>}</div><div className="note-main"><div className="note-meta"><span className={`tag ${natureClass(note.nature)}`}>{note.nature}</span><time dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString('zh-CN')}>{shortDate(note.createdAt)}</time>{note.updatedAt !== note.createdAt && <span className="edited-label">已编辑</span>}<span className="note-id" title={note.id}>#{note.id.slice(0,8)}</span><div className="note-actions"><button className={`icon-btn ${note.important ? 'starred' : ''}`} aria-label={note.important ? '取消重要标记' : '标记重要'} aria-pressed={note.important} onClick={() => commit({ ...data,notes:data.notes.map(n => n.id === note.id ? { ...n,important:!n.important } : n) })}><Star size={16} fill={note.important ? 'currentColor' : 'none'}/></button><button className="icon-btn" aria-label="编辑记录" onClick={() => setEditNote({ ...note })}><Edit3 size={15}/></button><button className="icon-btn delete-btn" aria-label="删除记录" onClick={() => requestDeleteNote(note)}><Trash2 size={15}/></button></div></div><p className="note-content">{note.content}</p>{(note.activity || note.source || note.timeType !== '未知') && <div className="note-chips">{note.activity && <span>{note.activity}</span>}{note.source && <span>{note.source}</span>}{note.timeType !== '未知' && <span>{note.timeType} · {note.duration || '未填写耗时'}</span>}</div>}{(note.input || note.process || note.output || note.handoff || note.evidence || note.startTime || note.endTime) && <details className="note-detail"><summary>查看补充信息<ChevronDown size={13}/></summary><dl>{([['input','输入'],['process','处理 / 判断'],['output','输出'],['handoff','交接'],['evidence','证据'],['startTime','开始时间'],['endTime','结束时间']] as const).filter(([key]) => note[key]).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{note[key]}</dd></div>)}</dl></details>}</div></article>)}</div>}
        </section><div className="capture-bottom-note"><ShieldCheck size={14}/><span>数据存储在当前设备的浏览器中，清理浏览器数据可能造成丢失。请及时<button className="inline-link" onClick={exportBackup}>导出备份</button>。</span></div>
      </>}
      {page === 'guide' && <Guide onStart={() => { setPage('capture'); setTimeout(() => inputRef.current?.focus(),0); }}/>}
      {page === 'review' && <Review data={data} selectedCase={selectedCase} onSelectCase={selectCase} onUpdateCase={updateCase} onSaveFinding={saveFinding} onDeleteFinding={removeFinding} onNotify={notify}/>}
    </main><footer className="app-footer"><span>见微 · 让事实先发生，让理解慢慢来。</span><span>LOCAL FIRST <ShieldCheck size={12}/></span></footer></div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {caseModal && <Modal title={caseModal === 'new' ? '新建观察任务' : '编辑观察任务'} onClose={() => setCaseModal(null)}><CaseForm initial={caseModal === 'new' ? undefined : caseModal} onSave={saveCase} onDelete={caseModal === 'new' ? undefined : () => { const item = caseModal; const notes = data.notes.filter(x => x.caseId === item.id).length, findings = data.findings.filter(x => x.caseId === item.id).length; setConfirmAction({title:'删除整个观察任务？',body:`将删除“${item.name}”及其 ${notes} 条观察记录、${findings} 个候选问题和任务链。建议先导出备份。`,label:'删除任务及全部内容',action:()=>{ if(commit(deleteCase(data,item.id))) { setCaseModal(null); notify('任务及其关联数据已删除'); } }}); }}/></Modal>}
    {editNote && <Modal title="编辑观察记录" onClose={() => setEditNote(null)}><form onSubmit={saveEditedNote}><div className="form-grid"><label className="field full">关联任务<select value={editNote.caseId} onChange={e => setEditNote({ ...editNote,caseId:e.target.value })}>{data.cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{data.notes.find(x => x.id === editNote.id)?.caseId !== editNote.caseId && <p className="alert full">移动到另一任务后，会移除原任务链和候选问题对它的引用。</p>}<label className="field full">观察内容<textarea required rows={4} value={editNote.content} onChange={e => setEditNote({ ...editNote,content:e.target.value })}/></label><label className="field full">记录性质<select value={editNote.nature} onChange={e => setEditNote({ ...editNote,nature:e.target.value as Nature })}>{NATURES.map(x => <option key={x}>{x}</option>)}</select></label></div><ExtraFields value={editNote} onChange={next => setEditNote({ ...editNote,...next })}/><div className="modal-actions"><span className="muted small">记录 ID 保持不变，原有引用会同步显示修改。</span><button className="btn btn-primary" type="submit">保存修改</button></div></form></Modal>}
    {backupOpen && <Modal title="数据备份与恢复" onClose={() => { setBackupOpen(false); setImportData(null); }}><div className="backup-intro"><ShieldCheck size={20}/><p>所有业务数据仅存储于当前浏览器，不会上传到外部服务。更换设备、浏览器或访问地址前，请导出 JSON；清理浏览器数据可能造成丢失。</p></div><div className="backup-summary"><span><b>{data.cases.length}</b>观察任务</span><span><b>{data.notes.length}</b>现场记录</span><span><b>{data.findings.length}</b>候选问题</span></div><div className="backup-card"><div><h3>导出完整备份</h3><p>包含任务、原始记录、任务链、问题及引用关系。</p></div><button className="btn btn-primary" onClick={exportBackup}><ArrowDownToLine size={16}/>导出 JSON</button></div><div className="backup-card"><div><h3>从备份恢复</h3><p>先检查文件，再由你确认替换。导入不会自动合并。</p></div><button className="btn" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16}/>选择 JSON 文件</button><input hidden ref={fileRef} type="file" accept="application/json,.json" aria-label="导入 JSON 备份" onChange={e => void readImport(e.target.files?.[0])}/></div>{importError && <div className="alert alert-error" role="alert">{importError}</div>}{importData && <div className="import-confirm"><h3>备份检查通过</h3><p>即将恢复 {importData.cases.length} 个任务、{importData.notes.length} 条记录、{importData.findings.length} 个问题。</p><p><strong>这会替换当前数据。</strong>请先导出当前 JSON；恢复前还会保留一份本机安全副本。</p><button className="btn btn-primary" onClick={restore}>确认替换并恢复</button><button className="btn btn-quiet" onClick={() => setImportData(null)}>取消导入</button></div>}<details className="recovery-details"><summary>恢复前的本机安全副本</summary><p className="muted small">每次恢复前保留当时的数据。只保留最近一次，不能替代定期导出的文件。</p><button className="btn" onClick={() => { try { const raw = localStorage.getItem(`${STORAGE_KEY}-before-restore`); if (raw) downloadFile(raw,'见微-恢复前安全副本.json'); else notify('还没有恢复前的安全副本'); } catch { notify('浏览器存储不可用，暂时无法读取安全副本'); } }}>下载安全副本</button></details></Modal>}
    {confirmAction && <Modal title={confirmAction.title} onClose={() => setConfirmAction(null)}><p className="confirmation-body">{confirmAction.body}</p><div className="modal-actions"><button className="btn" onClick={() => setConfirmAction(null)}>保留，不删除</button><button className="btn btn-danger" onClick={() => { confirmAction.action(); setConfirmAction(null); }}>{confirmAction.label}</button></div></Modal>}
  </div>;
}
