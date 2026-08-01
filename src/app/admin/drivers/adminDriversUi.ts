export function getApplicationActionsClassName(): string {
  return 'flex w-full flex-col gap-2 sm:w-auto sm:flex-row';
}

export function getPendingApplicationsSummary(count: number): string {
  return count === 0
    ? 'Aucune candidature en attente'
    : `${count} candidature${count === 1 ? '' : 's'} nécessitent votre attention`;
}
