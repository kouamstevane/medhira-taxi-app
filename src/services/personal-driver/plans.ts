import type { PersonalDriverPlan, PersonalDriverPlanId } from '@/types/personal-driver';

export const PERSONAL_DRIVER_PLAN_IDS: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

export const PERSONAL_DRIVER_PLANS: Record<PersonalDriverPlanId, PersonalDriverPlan> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    promise: 'La simplicité au quotidien',
    pricePerKm: 1.5,
    minimumBillableKm: 200,
    minimumAmount: 300,
    allowedWeekdays: [1, 2, 3, 4, 5],
    includedRegularWaitMinutes: 3,
    includedSpecialTrips: 0,
    benefits: ['Service du lundi au vendredi', '3 min d\'attente gratuites', 'Horaires fixes'],
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    badge: 'Le plus populaire',
    promise: 'Le meilleur équilibre pour vos déplacements',
    pricePerKm: 1.25,
    minimumBillableKm: 360,
    minimumAmount: 450,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    includedRegularWaitMinutes: 5,
    includedSpecialTrips: 2,
    benefits: ['Service semaine & week-end', '5 min d\'attente gratuites', '2 trajets spéciaux', 'Priorité supérieure'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    badge: 'Service prioritaire',
    promise: 'Un service privilégié, chaque jour',
    pricePerKm: 1.1,
    minimumBillableKm: 591,
    minimumAmount: 650,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    includedRegularWaitMinutes: 10,
    includedSpecialTrips: 4,
    benefits: ['Service 7j/7 & jours fériés', '10 min d\'attente gratuites', '4 trajets spéciaux', 'Priorité maximale'],
  },
};
