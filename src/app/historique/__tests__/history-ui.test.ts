import {
  getHistoryAction,
  getHistoryStatusPresentation,
  getHistoryTypePresentation,
} from '../history-ui';

describe('history UI presentation', () => {
  it('identifies taxi and parcel orders with readable labels', () => {
    expect(getHistoryTypePresentation('Taxi')).toEqual({
      label: 'Course taxi',
      icon: 'directions_car',
    });
    expect(getHistoryTypePresentation('Livraison')).toEqual({
      label: 'Livraison de colis',
      icon: 'delivery_dining',
    });
  });

  it('explains a pending parcel in plain French', () => {
    expect(getHistoryStatusPresentation('Livraison', 'pending')).toEqual({
      label: 'En attente d’un chauffeur',
      description: 'Nous recherchons un chauffeur pour votre livraison.',
      tone: 'warning',
    });
  });

  it('adapts the available action to the order state', () => {
    expect(getHistoryAction('Livraison', 'in_transit')).toEqual({
      label: 'Suivre la livraison',
      icon: 'my_location',
    });
    expect(getHistoryAction('Livraison', 'delivered')).toEqual({
      label: 'Voir le détail',
      icon: 'receipt_long',
    });
    expect(getHistoryAction('Livraison', 'cancelled')).toBeNull();
  });
});
