export function shouldOpenAddressEditor(search: string): boolean {
  return new URLSearchParams(search).get('edit') === 'address';
}
