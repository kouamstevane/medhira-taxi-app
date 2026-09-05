import { getApplicationActionsClassName, getInvitationPreparedMessage, getPendingApplicationsSummary } from './adminDriversUi';

describe('getInvitationPreparedMessage', () => {
  it('confirms which applicant is ready for invitation', () => {
    expect(getInvitationPreparedMessage('candidate@example.com')).toBe('Formulaire d’invitation prérempli pour candidate@example.com.');
  });
});

describe('getApplicationActionsClassName', () => {
  it('keeps application actions compact and usable on mobile', () => {
    expect(getApplicationActionsClassName()).toContain('grid-cols-2');
    expect(getApplicationActionsClassName()).toContain('sm:flex-row');
  });
});

describe('getPendingApplicationsSummary', () => {
  it('gives the admin an actionable summary when applications are pending', () => {
    expect(getPendingApplicationsSummary(3)).toBe('3 candidatures nécessitent votre attention');
  });

  it('explains the empty state without creating urgency', () => {
    expect(getPendingApplicationsSummary(0)).toBe('Aucune candidature en attente');
  });
});
