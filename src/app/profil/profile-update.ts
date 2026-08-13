export interface ProfileFormDataForUpdate {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  bio: string;
}

export function buildProfileUpdate(
  data: ProfileFormDataForUpdate,
  email: string | null,
  profileImageUrl: string
) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    phoneNumber: data.phone,
    address: data.address,
    city: data.city,
    country: data.country,
    bio: data.bio,
    email,
    profileImageUrl,
  };
}

export async function persistProfileUpdate(
  saveProfile: () => Promise<void>,
  reloadUser: () => Promise<void>
): Promise<void> {
  await saveProfile();
  await reloadUser();
}
