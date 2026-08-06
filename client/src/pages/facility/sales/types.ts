export interface OrderRow {
  order: {
    id: string;
    order_number: string;
    order_date: string;
    status: string;
    total_amount: number;
  };
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: { id: string; name: string; phone: string | null; city: string | null };
  itemCount: number;
}

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
  items: Array<{ id: string; order_item_id: string; quantity_bags: number; rate_per_bag: number; total_amount: number }>;
}

export interface OrderDetail {
  order: OrderRow["order"];
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: OrderRow["buyer"];
  items: OrderItem[];
  dispatches: DispatchRow[];
  totalBags: number;
  dispatchedBags: number;
}

export interface SalesSummary {
  pending: number;
  partiallyDispatched: number;
  completed: number;
  totalOrderValue: number;
  totalPaid: number;
  totalBalance: number;
}

export const PAGE_SIZE = 50;
export const vehicleTypes = ["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"];
