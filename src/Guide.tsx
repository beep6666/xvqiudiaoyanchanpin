import { ArrowRight, BookOpen, Clock3, Compass, Eye, HelpCircle, ListChecks } from 'lucide-react';

const focuses = [
  ['任务', '为什么要做这件事？'],
  ['信息', '需要什么信息，从哪里获取？'],
  ['判断', '根据什么决定下一步？'],
  ['操作', '对信息进行了哪些处理？'],
  ['协作', '需要谁确认或接手？'],
  ['结果', '产出什么，如何确认正确？'],
];

const principles = [
  ['事实和推测必须区分', '“查询了三张 Excel”可以是观察事实；“因为缺少统一商品系统”属于推测。请分别记录。'],
  ['不完整比编造更好', '不知道原因，就标记待确认；没有看到结果，就保留未观察到。任务可以跨日期继续补充。'],
  ['一个案例不代表整个部门', '单次观察只说明当前案例，不能直接证明全员的时间分布、长期发生频率或总 ROI。'],
  ['记录业务判断，不只记录操作', '留意使用了什么信息、依据什么规则，以及为什么选择某一种做法。'],
  ['不要预设 AI 一定是解决方案', '改善方式也可能是流程调整、数据治理、现有系统优化、规则引擎或简单脚本。'],
  ['现场先捕捉，事后再分析', '先留下真实发生的事情。问题归因与改善方案，留到观察结束后再整理。'],
];

export default function Guide({ onStart }: { onStart?: () => void }) {
  return <div className="guide-page">
    <header className="page-heading">
      <div><p className="eyebrow">FIELD GUIDE / 现场准备</p><h1>今日指南</h1><p className="page-subtitle">带着问题进入现场，带着证据回来。</p></div>
      {onStart && <button className="btn btn-primary" onClick={onStart}>开始现场记录 <ArrowRight size={16} /></button>}
    </header>

    <div className="principle-banner"><Eye size={21} /><strong>先观察事实，再判断问题；不要在现场急着设计解决方案。</strong></div>

    <section className="panel guide-purpose">
      <div className="section-heading"><Compass size={19} /><h2>这次观察，想弄清什么</h2></div>
      <div className="purpose-grid">
        <div><span className="eyebrow">01 / 现状</span><p>已经了解货盘业务主流程，但真实工作细节和效率损耗缺乏证据。</p></div>
        <div><span className="eyebrow">02 / 差距</span><p>不清楚货盘组每天实际处理哪些任务、使用哪些信息、如何作出判断、哪些环节存在重复劳动和协作问题。</p></div>
        <div><span className="eyebrow">03 / 目的</span><p>理解真实工作的运行机制，而不是预先寻找 AI 自动化机会。</p></div>
        <div><span className="eyebrow">04 / 本次目标</span><p>完成一次有效的现场观察，尽量还原一项真实货盘任务的任务起因、输入信息、信息处理、关键判断、工作输出、交付去向与结果确认。</p><p className="muted">同时记录尚未理解的部分和需要进一步验证的问题。一次观察不必覆盖完整任务，允许跨日期继续补充。</p></div>
      </div>
    </section>

    <section className="panel">
      <div className="section-heading"><Clock3 size={19} /><h2>一份可以调整的时间安排</h2><span className="tag">参考 · 180 分钟</span></div>
      <div className="schedule-grid">
        {[['15', '了解当天任务', '先听当天要完成什么，选择可跟随的真实任务。'], ['90', '观察真实工作', '跟随操作与沟通，随手记录事实和对方原话。'], ['40', '深入追踪一项代表性任务', '补齐信息来源、判断依据和交接对象。'], ['35', '事实核对和总结', '确认理解是否准确，列出未知与下一步。']].map(([minutes, title, hint], i) => <div className="schedule-card" key={title}><span className="schedule-step">0{i + 1}</span><div className="schedule-time"><strong>{minutes}</strong><span>分钟</span></div><h3>{title}</h3><p className="muted">{hint}</p></div>)}
      </div>
      <p className="muted guide-footnote">这是参考节奏，允许跳过、延长或调整。优先跟随真实工作，不必为完成流程打断对方。</p>
    </section>

    <section className="panel">
      <div className="section-heading"><ListChecks size={19} /><h2>现场观察的六个重点</h2></div>
      <div className="focus-grid">{focuses.map(([label, question], i) => <div className="focus-card" key={label}><span className="focus-number">0{i + 1}</span><div><h3>{label}</h3><p>{question}</p></div></div>)}</div>
      <details className="question-guide"><summary><HelpCircle size={17} /> 需要追问时，再打开这份指南</summary><div className="question-guide-content">
        <p className="muted">尽量在自然停顿时追问。用具体发生的事情核对理解，避免诱导对方给出问题结论。</p>
        <ul><li>“刚才这项工作是因为什么开始的？最后需要交付给谁？”</li><li>“你刚才查的这份表，具体用到了哪几个字段？”</li><li>“刚才两个选项之间，你主要根据什么作出选择？”</li><li>“这个数字或结果，通常怎么确认是对的？”</li><li>“这里需要等谁确认？确认前后会发生什么？”</li><li>“我理解的是……，和你实际做的一致吗？还有哪里没看到？”</li></ul>
      </div></details>
    </section>

    <section className="panel">
      <div className="section-heading"><BookOpen size={19} /><h2>记在心里的研究原则</h2></div>
      <div className="principles-grid">{principles.map(([title, body], i) => <div className="principle-item" key={title}><span className="principle-index">{i + 1}</span><div><h3>{title}</h3><p className="muted">{body}</p></div></div>)}</div>
    </section>
  </div>;
}
