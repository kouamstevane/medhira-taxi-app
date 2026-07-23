import type { Step2FormData } from '@/app/driver/register/components/Step2Identity';
import type { Step3FormData } from '@/app/driver/register/components/Step3Vehicle';
import type { DriverType } from '@/types/firestore-collections';

type VehicleType = 'velo' | 'scooter' | 'moto' | 'voiture';

interface BuildDriverApplicationPublicDataInput {
  userId: string;
  email: string;
  driverType: DriverType;
  vehicleType: VehicleType;
  defaultCityId: string;
  step2Data: Partial<Step2FormData>;
  step3Data: Partial<Step3FormData>;
}

function optionalNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildDriverApplicationPublicData({
  userId,
  email,
  driverType,
  vehicleType,
  defaultCityId,
  step2Data,
  step3Data,
}: BuildDriverApplicationPublicDataInput): Record<string, unknown> {
  const publicData: Record<string, unknown> = {
    uid: userId,
    firstName: step2Data.firstName,
    lastName: step2Data.lastName,
    email,
    phone: step2Data.phone || '',
    driverType,
    vehicleType,
    cityId: defaultCityId,
    status: 'pending',
    isAvailable: false,
    rating: 0,
    tripsCompleted: 0,
  };

  const city = optionalNonEmpty(step2Data.city);
  const zipCode = optionalNonEmpty(step2Data.zipCode);
  if (city) publicData.city = city;
  if (zipCode) publicData.zipCode = zipCode;

  if (
    (driverType === 'chauffeur' || driverType === 'les_deux') &&
    step3Data.productionYear != null
  ) {
    publicData.car = { year: step3Data.productionYear };
  }

  return publicData;
}
