export type ActivityTab = 'historique' | 'gains' | 'evaluations';

const ACTIVITY_TABS: ActivityTab[] = ['historique', 'gains', 'evaluations'];

export function getInitialActivityTab(tab: string | null): ActivityTab {
  return ACTIVITY_TABS.includes(tab as ActivityTab) ? (tab as ActivityTab) : 'historique';
}
