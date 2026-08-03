const adminHeaderNavItemBaseClassName = 'shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap';

export function getAdminHeaderNavItemClassName(isActive: boolean): string {
  const stateClassName = isActive
    ? 'bg-primary text-white shadow-lg shadow-primary/20'
    : 'glass-card text-slate-300 border border-white/10 hover:border-primary/50';

  return `${adminHeaderNavItemBaseClassName} ${stateClassName}`;
}
