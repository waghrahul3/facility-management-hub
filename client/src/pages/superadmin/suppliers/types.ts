export interface SupplierRow {
  supplier: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    contact_person: string | null;
    address: string | null;
    city: string | null;
    status: "PENDING" | "ACTIVE";
    facility_id: string | null;
  };
  facility: { id: string; name: string } | null;
  user: { id: string; name: string; email: string } | null;
}

/** Values submitted from the new-supplier modal. */
export interface SupplierFormValues {
  name: string;
  email: string;
  phone: string;
  contact_person: string;
  address: string;
  city: string;
  create_login: boolean;
  password: string;
}

/** Values submitted from the generate-login modal. */
export interface LoginFormValues {
  email: string;
  password: string;
}

export const PAGE_SIZE = 50;

export const emptySupplierForm: SupplierFormValues = {
  name: "",
  email: "",
  phone: "",
  contact_person: "",
  address: "",
  city: "",
  create_login: false,
  password: "",
};
