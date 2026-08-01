export function getPendingApplicationsSummary(count: number): string {
  return count === 0
    ? 'Aucune candidature en attente'
    : `${count} candidature${count === 1 ? '' : 's'} nécessitent votre attention`;
}
