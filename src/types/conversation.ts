/**
 * Types pour le système de conversations multi-domaines (taxi, food, parcel)
 */

export type ConversationType = 'taxi' | 'food' | 'parcel';

export type ParticipantRole =
  | 'client'
  | 'chauffeur'
  | 'restaurant'
  | 'livreur'
  | 'expediteur';

export interface ConversationParticipant {
  uid: string;
  name: string;
  role: ParticipantRole;
  avatar?: string | null;
}

export interface ConversationContext {
  type: ConversationType;
  entityId: string;
  participantA: ConversationParticipant;
  participantB: ConversationParticipant;
}

/**
 * Construit un identifiant déterministe pour une conversation 1-1.
 * Format : `${type}_${entityId}_${uidA__uidB}` où uidA/uidB sont triés.
 */
export function buildConversationId(
  type: ConversationType,
  entityId: string,
  uidA: string,
  uidB: string
): string {
  const [a, b] = [uidA, uidB].sort();
  return `${type}_${entityId}_${a}__${b}`;
}

/**
 * Traduit un rôle en libellé français pour l'affichage.
 */
export function getRoleLabel(role: ParticipantRole): string {
  switch (role) {
    case 'client':
      return 'votre client';
    case 'chauffeur':
      return 'votre chauffeur';
    case 'restaurant':
      return 'le restaurant';
    case 'livreur':
      return 'le livreur';
    case 'expediteur':
      return "l'expéditeur";
    default:
      return 'votre interlocuteur';
  }
}
