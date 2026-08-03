import {
  countAdminDriversByStatus,
  filterAdminDrivers,
  hideReviewedDriverApplications,
  normalizeAdminEmail,
} from './adminDriversData';

const drivers = [
  { id: 'pending-1', firstName: 'Bilion', lastName: 'Mani', email: ' bilion@example.com ', phone: '+237600000001', status: 'pending', driverType: 'chauffeur' },
  { id: 'approved-1', firstName: 'Olive', lastName: 'Ndi', email: 'olive@example.com', phone: '+237600000002', status: 'approved', driverType: 'livreur' },
  { id: 'rejected-1', firstName: 'Jean', lastName: 'Mba', email: 'jean@example.com', phone: '+237600000003', status: 'rejected', driverType: 'les_deux' },
  { id: 'available-1', firstName: 'Ada', lastName: 'Nana', email: 'ada@example.com', phone: '+237600000004', status: 'available', driverType: 'chauffeur' },
];

describe('admin driver data helpers', () => {
  it('normalizes emails before comparing records from different collections', () => {
    expect(normalizeAdminEmail('  Bilion@Example.COM ')).toBe('bilion@example.com');
    expect(normalizeAdminEmail(undefined)).toBe('');
  });

  it('filters by status, profile type, and searchable driver fields', () => {
    expect(filterAdminDrivers(drivers, { status: 'pending', driverType: 'all', search: '' })).toHaveLength(1);
    expect(filterAdminDrivers(drivers, { status: 'all', driverType: 'livreur', search: '' }).map((driver) => driver.id)).toEqual(['approved-1']);
    expect(filterAdminDrivers(drivers, { status: 'all', driverType: 'all', search: '  BILION ' }).map((driver) => driver.id)).toEqual(['pending-1']);
    expect(filterAdminDrivers(drivers, { status: 'all', driverType: 'all', search: '+237600000004' }).map((driver) => driver.id)).toEqual(['available-1']);
  });

  it('counts each status from the complete driver collection, independently of the active filter', () => {
    expect(countAdminDriversByStatus(drivers)).toEqual({
      all: 4,
      pending: 1,
      approved: 1,
      rejected: 1,
    });
  });

  it('hides legacy applications whose matching driver was already reviewed', () => {
    const applications = [
      { id: 'application-approved', email: 'OLIVE@EXAMPLE.COM' },
      { id: 'application-pending', email: 'new@example.com' },
      { id: 'application-rejected', email: 'jean@example.com' },
    ];

    expect(hideReviewedDriverApplications(applications, drivers).map((application) => application.id)).toEqual(['application-pending']);
  });
});
