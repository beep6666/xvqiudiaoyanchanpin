export const NATURES = ['直接观察', '对方原话', '我的疑问', '我的推测'] as const;
export type Nature = typeof NATURES[number];
export const CHAIN_LABELS = ['任务触发', '信息输入', '信息加工', '业务判断', '形成输出', '后续执行', '结果确认'] as const;
export interface ChainNode { description: string; status: '待确认' | '已确认'; noteIds: string[]; evidence: string }
export interface Case {
  id: string; name: string; type: string; purpose: string; startDate: string;
  status: '观察中' | '待补充' | '已结束'; description: string; chain: ChainNode[];
  limitations: string;
}
export interface Note {
  id: string; caseId: string; createdAt: string; updatedAt: string; content: string;
  nature: Nature; important: boolean; activity: string;
  timeType: '未知' | '估算' | '实测'; duration: string; startTime: string; endTime: string;
  source: string; input: string; process: string; output: string; handoff: string; evidence: string;
}
export interface Finding {
  id: string; caseId: string; description: string; facts: string; hypothesis: string;
  noteIds: string[]; unknowns: string; nextSteps: string;
  status: '待验证' | '验证中' | '已核对' | '暂不追踪'; includeInReport: boolean;
}
export interface AppData { version: 1; cases: Case[]; notes: Note[]; findings: Finding[]; selectedCaseId: string }
export interface ReviewProps {
  data: AppData; selectedCase: Case | undefined;
  onSelectCase: (id: string) => void;
  onUpdateCase: (item: Case) => boolean;
  onSaveFinding: (item: Finding) => boolean;
  onDeleteFinding: (id: string) => void;
  onNotify: (message: string) => void;
}
