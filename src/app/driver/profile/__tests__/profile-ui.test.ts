import { getDocumentsProfileSummary, getVehicleProfileSummary } from '../profile-ui';

describe('driver profile UI summaries', () => {
  it('summarizes an empty vehicle as an action to complete', () => {
    expect(getVehicleProfileSummary({})).toEqual({
      title: 'Véhicule à compléter',
      subtitle: 'Ajoutez modèle, plaque et couleur',
      isComplete: false,
    });
  });

  it('summarizes vehicle details without repeating empty fields', () => {
    expect(getVehicleProfileSummary({ model: 'Toyota Camry', plate: 'ABC-123', color: 'Noir' })).toEqual({
      title: 'Toyota Camry',
      subtitle: 'ABC-123 • Noir',
      isComplete: true,
    });
  });

  it('prioritizes documents that require action', () => {
    expect(getDocumentsProfileSummary([
      { status: 'not_submitted' },
      { status: 'rejected' },
      { status: 'approved' },
    ])).toMatchObject({
      title: '2 documents à compléter',
      subtitle: 'Ouvrez Documents pour corriger ou téléverser les pièces.',
      tone: 'danger',
      cta: 'Compléter',
    });
  });

  it('shows pending documents as a review state', () => {
    expect(getDocumentsProfileSummary([{ status: 'pending' }, { status: 'approved' }])).toMatchObject({
      title: 'Documents en vérification',
      subtitle: '1 document en attente de validation.',
      tone: 'warning',
      cta: 'Voir',
    });
  });

  it('shows approved documents as complete', () => {
    expect(getDocumentsProfileSummary([{ status: 'approved' }, { status: 'approved' }])).toMatchObject({
      title: 'Documents validés',
      subtitle: '2/2 documents approuvés.',
      tone: 'success',
      cta: 'Consulter',
    });
  });
});
