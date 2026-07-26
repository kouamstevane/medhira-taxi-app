import React from 'react';
import { render, screen } from '@testing-library/react';
import { OrderStatusBadge } from '@/components/food/OrderStatusBadge';
import type { FoodOrderStatus } from '@/types/food-delivery';

describe('OrderStatusBadge — Unit Tests', () => {
  const allStatuses: { status: FoodOrderStatus; expectedText: string }[] = [
    { status: 'pending_payment', expectedText: 'Paiement en attente' },
    { status: 'pending', expectedText: 'En attente' },
    { status: 'confirmed', expectedText: 'Confirmée' },
    { status: 'accepted', expectedText: 'Acceptée par le resto' },
    { status: 'preparing', expectedText: 'En préparation' },
    { status: 'ready', expectedText: 'Prête' },
    { status: 'driver_heading_to_restaurant', expectedText: 'Livreur en route vers resto' },
    { status: 'driver_arrived_restaurant', expectedText: 'Livreur au resto' },
    { status: 'picked_up', expectedText: 'Récupérée par livreur' },
    { status: 'out_for_delivery', expectedText: 'En cours de livraison' },
    { status: 'delivering', expectedText: 'En cours de livraison' },
    { status: 'arriving', expectedText: 'Livreur tout proche' },
    { status: 'delivered', expectedText: 'Livrée' },
    { status: 'no_driver_available', expectedText: 'Aucun livreur disponible' },
    { status: 'cancelled', expectedText: 'Annulée' },
    { status: 'cancelled_by_restaurant', expectedText: 'Refusée par le restaurant' },
  ];

  allStatuses.forEach(({ status, expectedText }) => {
    it(`affiche le libellé correct pour le statut '${status}' sans afficher 'Inconnu'`, () => {
      render(<OrderStatusBadge status={status} />);
      expect(screen.getByText(expectedText)).toBeInTheDocument();
      expect(screen.queryByText('Inconnu')).not.toBeInTheDocument();
    });
  });
});
