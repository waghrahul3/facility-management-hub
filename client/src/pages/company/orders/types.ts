export interface BagSize { id: string; size_name: string; weight_kg: number }
export interface FacilityOpt { id: string; name: string }
export interface BuyerOpt { id: string; name: string; phone: string | null; city: string | null }

export interface OrderItem {
  item: {
    id: string;
    onion_category: string | null;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
  };
  bagSize: { id: string; size_name: string; weight_kg: number };
  dispatchedBags: number;
}

export interface DispatchRow {
  dispatch: {
    id: string;
    vehicle_type: string;
    vehicle_number: string | null;
    destination: string | null;
    dispatch_date: string;
    notes: string | null;
  };
  items: Array<{
    id: string;
    order_item_id: string;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
  }>;
}

export interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

export interface OrderRow {
  order: {
    id: string;
    order_number: string;
    company_id: string;
    facility_id: string;
    buyer_id: string;
    order_date: string;
    status: string;
    total_amount: number;
    notes: string | null;
    created_at: string;
  };
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: { id: string; name: string; phone: string | null; city: string | null };
  itemCount: number;
}

export interface OrderDetail extends OrderRow {
  items: OrderItem[];
  dispatches: DispatchRow[];
  payments: PaymentRow[];
  totalBags: number;
  dispatchedBags: number;
  paidAmount: number;
  balanceAmount: number;
}

export interface SalesSummary {
  pending: number;
  partiallyDispatched: number;
  completed: number;
  totalOrderValue: number;
  totalPaid: number;
  totalBalance: number;
}

export interface LineDraft {
  key: number;
  onion_category: string;
  bag_size_id: string;
  quantity_bags: number;
  rate_per_bag: number;
}

export interface OrderFormValues {
  buyer_id: string;
  facility_id: string;
  order_date: string;
  notes: string;
}

export interface PaymentFormValues {
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  notes: string;
}
