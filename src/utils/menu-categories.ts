export interface MenuCategorySource {
  category?: string | null;
}

export function mergeMenuCategories(
  defaultCategories: string[],
  visibleItems: MenuCategorySource[] = [],
  catalogCategories: string[] = [],
): string[] {
  const categories = new Set<string>();
  for (const value of [...defaultCategories, ...catalogCategories, ...visibleItems.map((item) => item.category ?? '')]) {
    const category = value.trim();
    if (category) categories.add(category);
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}
