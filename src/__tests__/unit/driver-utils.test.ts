import { getDriverDashboardInfoMessage } from '@/utils/driver.utils';

describe('getDriverDashboardInfoMessage', () => {
  it('retourne le message de confirmation de soumission quand submissionParam="1"', () => {
    const result = getDriverDashboardInfoMessage('1', null, false, 'pending');
    expect(result).toContain('candidature a bien été enregistrée');
  });

  it('retourne le message de vérification email quand emailVerifiedParam="1"', () => {
    const result = getDriverDashboardInfoMessage(null, '1', false, 'pending');
    expect(result).toContain('adresse email est validée');
  });

  it('retourne le message email validé quand driverStatus="pending" et userEmailVerified=true', () => {
    const result = getDriverDashboardInfoMessage(null, null, true, 'pending');
    expect(result).toContain('adresse email est validée');
    expect(result).toContain('en cours d\'étude');
  });

  it('retourne le message de confirmation email nécessaire quand driverStatus="pending" et userEmailVerified=false', () => {
    const result = getDriverDashboardInfoMessage(null, null, false, 'pending');
    expect(result).toContain('confirmer votre adresse email');
  });

  it('retourne null quand tous les params sont null avec un statut non-pending', () => {
    const result = getDriverDashboardInfoMessage(null, null, false, 'approved');
    expect(result).toBeNull();
  });

  it('donne la priorité à submissionParam sur emailVerifiedParam', () => {
    const result = getDriverDashboardInfoMessage('1', '1', true, 'pending');
    expect(result).toContain('candidature a bien été enregistrée');
  });

  it('donne la priorité à emailVerifiedParam sur le statut pending', () => {
    const result = getDriverDashboardInfoMessage(null, '1', false, 'pending');
    expect(result).toContain('adresse email est validée');
    expect(result).not.toContain('confirmer votre adresse email');
  });

  it('retourne null pour un statut approved sans params', () => {
    const result = getDriverDashboardInfoMessage(null, null, true, 'approved');
    expect(result).toBeNull();
  });

  it('retourne null pour un statut undefined sans params', () => {
    const result = getDriverDashboardInfoMessage(null, null, false, undefined);
    expect(result).toBeNull();
  });
});
