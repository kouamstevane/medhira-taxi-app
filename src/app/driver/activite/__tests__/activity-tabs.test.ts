import { getInitialActivityTab } from '../activity-tabs';

describe('driver activity tabs', () => {
  it('uses the requested tab when it is supported', () => {
    expect(getInitialActivityTab('gains')).toBe('gains');
    expect(getInitialActivityTab('historique')).toBe('historique');
    expect(getInitialActivityTab('evaluations')).toBe('evaluations');
  });

  it('falls back to history when the requested tab is missing or invalid', () => {
    expect(getInitialActivityTab(null)).toBe('historique');
    expect(getInitialActivityTab('unknown')).toBe('historique');
  });
});
