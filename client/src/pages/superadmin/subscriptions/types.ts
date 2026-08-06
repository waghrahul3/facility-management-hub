export interface SubscriptionPlan {
  id: string;
  name: string;
  type: "COMPANY" | "SUPPLIER";
  price: number;
  billing_cycle: string;
  description: string | null;
  features: string[] | null;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "PENDING" | "CANCELLED";
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  notes: string | null;
  created_at: string;
  plan_id: string;
  plan_name: string;
  plan_type: string;
  plan_price: number;
  company_id: string | null;
  company_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface SubscriptionStats {
  active: number;
  expired: number;
  pending: number;
  totalRevenue: number;
}

export interface EntityOption {
  id: string;
  name: string;
}
