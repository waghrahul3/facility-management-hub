export interface FacilityRow {
  facility: {
    id: string;
    name: string;
    location: string;
    city: string | null;
    capacity: number | null;
    is_active: boolean;
  };
  admin: { id: string; name: string; email: string } | null;
}

export interface FacilityAdminRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  facility_id: string | null;
  created_at: string;
}

/** Values submitted from the onboard/edit facility modal. */
export interface FacilitySaveValues {
  name: string;
  location: string;
  city: string | null;
  capacity: number;
  admin?: { name: string; email: string; phone: string; password: string };
}

/** Values submitted from the add-facility-admin modal. */
export interface AdminSaveValues {
  facilityId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

export const ADMINS_PAGE_SIZE = 25;
