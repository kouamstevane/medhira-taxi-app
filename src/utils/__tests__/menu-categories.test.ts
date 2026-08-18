import { mergeMenuCategories } from '@/utils/menu-categories';

describe('mergeMenuCategories', () => {
  it('keeps all categories from the full catalog, even when the visible page is filtered', () => {
    expect(mergeMenuCategories(
      ['Entrées', 'Plats', 'Desserts'],
      [{ category: 'Salades Fraîches' }, { category: 'Plats' }],
      ['Boissons Fraîches'],
    )).toEqual(['Boissons Fraîches', 'Desserts', 'Entrées', 'Plats', 'Salades Fraîches']);
  });

  it('ignores empty and duplicate category names', () => {
    expect(mergeMenuCategories(
      ['Plats', 'Plats'],
      [{ category: ' Plats ' }, { category: '' }, { category: null }],
    )).toEqual(['Plats']);
  });
});
