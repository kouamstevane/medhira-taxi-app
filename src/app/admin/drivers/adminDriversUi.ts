export function getApplicationActionsClassName(): string {
  return 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row';
}

export function getInvitationPreparedMessage(email: string): string {
  return `Formulaire d’invitation prérempli pour ${email}.`;
}

export function getPendingApplicationsSummary(count: number): string {
  return count === 0
    ? 'Aucune candidature en attente'
    : `${count} candidature${count === 1 ? '' : 's'} nécessitent votre attention`;
}
