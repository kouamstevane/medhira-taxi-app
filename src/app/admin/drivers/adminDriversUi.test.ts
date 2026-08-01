import { getPendingApplicationsSummary } from './adminDriversUi';

describe('getPendingApplicationsSummary', () => {
  it('gives the admin an actionable summary when applications are pending', () => {
    expect(getPendingApplicationsSummary(3)).toBe('3 candidatures nécessitent votre attention');
  });

  it('explains the empty state without creating urgency', () => {
    expect(getPendingApplicationsSummary(0)).toBe('Aucune candidature en attente');
  });
});
