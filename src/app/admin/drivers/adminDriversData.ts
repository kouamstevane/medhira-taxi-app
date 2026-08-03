export type AdminDriverStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'available'
  | 'offline'
  | 'busy'
  | 'action_required'
  | 'suspended';

export type AdminDriverType = 'chauffeur' | 'livreur' | 'les_deux';

export interface DriverListFilters {
  status: 'all' | 'pending' | 'approved' | 'rejected';
  driverType: 'all' | AdminDriverType;
  search: string;
}

export interface AdminDriverRecord {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  status: string;
  driverType?: string;
}

const REVIEWED_DRIVER_STATUSES = new Set([
  'approved',
  'rejected',
  'available',
  'offline',
  'busy',
  'suspended',
]);

export function normalizeAdminEmail(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

export function filterAdminDrivers<T extends AdminDriverRecord>(drivers: T[], filters: DriverListFilters): T[] {
  const search = filters.search.trim().toLowerCase();

  return drivers.filter((driver) => {
    const matchesStatus = filters.status === 'all' || driver.status === filters.status;
    const matchesType = filters.driverType === 'all' || (driver.driverType ?? 'chauffeur') === filters.driverType;
    const searchableFields = [
      driver.firstName,
      driver.lastName,
      driver.email,
      driver.phone,
      driver.phoneNumber,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return matchesStatus && matchesType && (!search || searchableFields.includes(search));
  });
}

export function countAdminDriversByStatus<T extends Pick<AdminDriverRecord, 'status'>>(drivers: T[]) {
  return {
    all: drivers.length,
    pending: drivers.filter((driver) => driver.status === 'pending').length,
    approved: drivers.filter((driver) => driver.status === 'approved').length,
    rejected: drivers.filter((driver) => driver.status === 'rejected').length,
  };
}

export function hideReviewedDriverApplications<
  TApplication extends { email?: string },
  TDriver extends { email?: string; status: string },
>(applications: TApplication[], drivers: TDriver[]): TApplication[] {
  const reviewedEmails = new Set(
    drivers
      .filter((driver) => REVIEWED_DRIVER_STATUSES.has(driver.status))
      .map((driver) => normalizeAdminEmail(driver.email))
      .filter(Boolean),
  );

  return applications.filter((application) => !reviewedEmails.has(normalizeAdminEmail(application.email)));
}
