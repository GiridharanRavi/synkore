import api from "./axios";

/* =========================
   AUTH
========================= */

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export const loginApi = (data: LoginPayload) =>
  api.post("/auth/login", data);

export const registerApi = (data: RegisterPayload) =>
  api.post("/auth/register", data);


/* =========================
   DASHBOARD
========================= */

export const getDashboard = () =>
  api.get("/dashboard");

/* =========================
   INWARD PROCESSED
========================= */

export const getInwardProcessed = () =>
  api.get("/inward-processed");

export const createInwardProcessed = (
  data: object
) => api.post("/inward-processed", data);

export const updateInwardProcessed = (
  id: number,
  data: object
) =>
  api.put(
    `/inward-processed/${id}`,
    data
  );

export const deleteInwardProcessed = (
  id: number
) =>
  api.delete(
    `/inward-processed/${id}`
  );

/* =========================
   DYEING
========================= */

export const getDyeing = () =>
  api.get("/dyeing");

export const createDyeing = (
  data: object
) => api.post("/dyeing", data);

export const updateDyeing = (
  id: number,
  data: object
) => api.put(`/dyeing/${id}`, data);

export const deleteDyeing = (
  id: number
) => api.delete(`/dyeing/${id}`);

/* =========================
   DISPATCH
========================= */

export const getDispatch = () =>
  api.get("/dispatch");

export const createDispatch = (
  data: object
) => api.post("/dispatch", data);

export const updateDispatch = (
  id: number,
  data: object
) =>
  api.put(`/dispatch/${id}`, data);

export const deleteDispatch = (
  id: number
) => api.delete(`/dispatch/${id}`);

/* =========================
   OUTWARD
========================= */

export const getOutward = () =>
  api.get("/outward");

export const createOutward = (
  data: object
) => api.post("/outward", data);

export const updateOutward = (
  id: number,
  data: object
) => api.put(`/outward/${id}`, data);

export const deleteOutward = (
  id: number
) => api.delete(`/outward/${id}`);

/* =========================
   SAMPLE REQUESTS
========================= */

export interface SampleRequestPayload {
  request_code: string;
  client_name: string;
  fabric_type: string;
  color_reference?: string;
  quantity_meters?: number;
  notes?: string;
  status?: string;
}

export interface SampleRequest
  extends SampleRequestPayload {
  id: number;
  request_date?: string;
}

export const getSampleRequests = (customerId?: string) =>
  api.get('/sample-requests', { params: customerId ? { customer_id: customerId } : {} });

export const createSampleRequest = (
  data: SampleRequestPayload
) => api.post("/sample-requests", data);

export const updateSampleRequest = (
  id: number,
  data: Partial<SampleRequestPayload>
) =>
  api.put(
    `/sample-requests/${id}`,
    data
  );

export const deleteSampleRequest = (
  id: number
) =>
  api.delete(
    `/sample-requests/${id}`
  );

/* =========================
   QUALITY CHECK
========================= */

export interface QualityCheckPayload {
  sample_request_id: number;
  checked_by: string;
  fabric_weight_gsm?: number;
  fabric_width_cm?: number;
  texture_grade?:
    | "A"
    | "B"
    | "C"
    | "D";
  color_fastness?:
    | "excellent"
    | "good"
    | "average"
    | "poor";
  shrinkage_percent?: number;
  defects_noted?: string;
  quality_passed: boolean;
  check_date?: string;
  remarks?: string;
}

export const saveQualityCheck = (
  data: QualityCheckPayload
) =>
  api.post(
    "/quality-check",
    data
  );

export const getQualityCheck = (
  sampleId: number
) =>
  api.get(
    `/quality-check/${sampleId}`
  );

/* =========================
   QUANTITY LOG
========================= */

export interface QuantityLogPayload {
  sample_request_id: number;
  actual_received_meters: number;
  unit: "meters" | "yards";
  log_date?: string;
  notes?: string;
}

export const saveQuantityLog = (
  data: QuantityLogPayload
) =>
  api.post(
    "/quantity-log",
    data
  );

export const getQuantityLog = (
  sampleId: number
) =>
  api.get(
    `/quantity-log/${sampleId}`
  );

/* =========================
   YARDAGE MOQ
========================= */

export interface YardageMOQPayload {
  sample_request_id:  number;
  fabric_code?:       string;
  order_type:         'sample' | 'bulk';
  moq_meters:         number;
  price_per_meter:    number;
  currency:           string;
  valid_from?:        string;
  valid_until?:       string;
}

export const saveYardageMOQ = (data: YardageMOQPayload) =>
  api.post('/yardage-moq', data);

export const getYardageMOQ = (
  sampleId: number
) =>
  api.get(
    `/yardage-moq/${sampleId}`
  );

/* =========================
   PRICE LIST
========================= */

export interface PriceListPayload {
  sample_request_id: number;
  fabric_code?: string;
  fabric_quality?: string;
  color?: string;
  list_type:
    | "sample_meter"
    | "bulk_order";
  min_quantity_meters: number;
  max_quantity_meters?: number;
  price_per_meter: number;
  discount_percent?: number;
  currency?: string;
  remarks?: string;
}

export const savePriceList = (data: any) =>
  api.post('/price-lists', data);    

export const getPriceList = (
  sampleId: number
) =>
  api.get(
    `/price-list/${sampleId}`
  );

/* =========================
   ORDER BOOKINGS
========================= */

export interface OrderBookingPayload {
  id?: number;
  order_code: string;
  sample_request_id?: number | string;
  order_date: string;
  po_no: string;
  po_date: string;
  customer_name: string;
  customer_address: string;
  customer_pincode: string;
  customer_state: string;
  customer_country: string;
  customer_gst_no: string;
  customer_contact_name: string;
  delivery_at: string;
  delivery_address: string;
  delivery_pincode: string;
  delivery_state: string;
  delivery_country: string;
  delivery_gst_no: string;
  delivery_contact_name: string;
  order_through: string;
  agent_name: string;
  commission: string;
  packing_type: string;
  confirm_mode: string;
  confirm_by: string;
  confirm_code: string;
  expect_delivery: string;
  pinning: string;
  rate_type: string;
  payment_terms: string;
  freight: string;
  transport: string;
  certification_type: string;
  certificate_no: string;
  remarks: string;
}

export const getOrderBookings = (customerId?: string) =>
  api.get('/order-bookings', { params: customerId ? { customer_id: customerId } : {} });

export const createOrderBooking = (
  data: OrderBookingPayload
) =>
  api.post(
    "/order-bookings",
    data
  );

export const updateOrderBooking = (
  id: number,
  data: OrderBookingPayload
) =>
  api.put(
    `/order-bookings/${id}`,
    data
  );

export const deleteOrderBooking = (
  id: number
) =>
  api.delete(
    `/order-bookings/${id}`
  );

/* =========================
   ORDERS
========================= */

export interface OrderItem {
  id?: number;
  order_id?: number;
  construction_po: string;
  meter: number;
  rate: number;
  basic_value?: number;
  disc_type:
    | "None"
    | "Flat"
    | "Percent";
  disc_pct: number;
  disc_value: number;
  total_value: number;
}

export interface Order {
  id: number;
  order_code: string;
  order_type:
    | "Domestic"
    | "Export";
  quality_type: string;
  hsn_code: string;
  sort_no: string;
  quality: string;
  delivery_instruction: string;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  cgst_value: number;
  sgst_value: number;
  igst_value: number;
  net_value: number;
  status:
    | "Pending"
    | "Confirmed"
    | "Dispatched"
    | "Completed"
    | "Cancelled";
  created_at: string;
  items?: OrderItem[];
}

export interface CreateOrderPayload {
  order_type:
    | "Domestic"
    | "Export";
  quality_type: string;
  hsn_code: string;
  sort_no: string;
  quality: string;
  delivery_instruction: string;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  items: Omit<
    OrderItem,
    "id" | "order_id" | "basic_value"
  >[];
}

export interface OrderListResponse {
  success: boolean;
  data: Order[];
  total: number;
  page: number;
  limit: number;
}

export const getOrders = async (
  page = 1,
  limit = 10,
  search = ""
): Promise<OrderListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search ? { search } : {}),
  });

  const { data } =
    await api.get<OrderListResponse>(
      `/orders?${params.toString()}`
    );

  return data;
};

export const getOrderById = async (
  id: number
): Promise<Order> => {
  const { data } = await api.get<{
    success: boolean;
    data: Order;
  }>(`/orders/${id}`);

  return data.data;
};

export const createOrder = async (
  payload: CreateOrderPayload
) => {
  const { data } = await api.post(
    "/orders",
    payload
  );

  return data.data;
};

export const updateOrder = async (
  id: number,
  payload: CreateOrderPayload
) => {
  const { data } = await api.put(
    `/orders/${id}`,
    payload
  );

  return data.data;
};

export const updateOrderStatus = async (
  id: number,
  status: Order["status"]
) => {
  await api.patch(
    `/orders/${id}/status`,
    { status }
  );
};

export const deleteOrder = async (
  id: number
) => {
  await api.delete(`/orders/${id}`);
};

export interface JobWorkItem {
  id?: number;
  job_work_id?: number;
  sort_no?: string;
  construction: string;
  hsn_code?: string;
  qty: number | string;
  rate: number | string;
  basic_value?: number;
}
 
export interface JobWork {
  id?: number;
  fpo_no: string;
  fpo_date: string;
  supplier: string;
  billing_from?: string;
  delivery_to?: string;
  pay_terms?: string;
  pinning?: string;
  packing_type?: string;
  rate_type?: string;
  freight?: string;
  delivery_dt?: string;
  remarks?: string;
  cgst_pct?: number;
  sgst_pct?: number;
  igst_pct?: number;
  sub_total?: number;
  net_value?: number;
  status?:
    | "Pending"
    | "Confirmed"
    | "Dispatched"
    | "Completed"
    | "Cancelled";
  created_at?: string;
  updated_at?: string;
  items: JobWorkItem[];
}
 
export interface JobWorkListResponse {
  data: JobWork[];
  total: number;
  page: number;
  limit: number;
}
 
export const getJobWorks = async (
  page = 1,
  limit = 10,
  search?: string
): Promise<JobWorkListResponse> => {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("limit", String(limit));
  if (search && search.trim() !== "") {
    params.append("search", search.trim());
  }
  const { data } = await api.get<JobWorkListResponse>(
    `/job-work?${params.toString()}`
  );
  return data;
};
 
export const getJobWorkById = async (id: number): Promise<JobWork> => {
  const { data } = await api.get<JobWork>(`/job-work/${id}`);
  return data;
};
 
export const getPendingPurchasePlans = () =>
  api.get('/production-plans/pending-purchase').then(r => r.data);
 
// ─── FIX: was "/job-work/meta/next-fpo" (wrong router)
//          now  "/fabric-purchase-orders/next-fpo" (correct router)
//          Returns { fpo_no: "FPO-2026-001" }
export const getNextFpoNo = async (): Promise<{ fpo_no: string }> => {
  const { data } = await api.get('/fabric-purchase-orders/next-fpo');
  return data; // { fpo_no: "FPO-2026-001" }
};
 
export const createJobWork = async (payload: JobWork) => {
  const { data } = await api.post("/job-work", payload);
  return data;
};
 
export const updateJobWork = async (id: number, payload: JobWork) => {
  const { data } = await api.put(`/job-work/${id}`, payload);
  return data;
};
 
export const deleteJobWork = async (id: number) => {
  const { data } = await api.delete(`/job-work/${id}`);
  return data;
};
 
export const updateJobWorkStatus = async (
  id: number,
  status: NonNullable<JobWork["status"]>
) => {
  const { data } = await api.patch(`/job-work/${id}/status`, { status });
  return data;
};

/* =========================
   FABRIC PURCHASE ORDERS
========================= */

export interface FpoItem {
  id?: number;
  fpo_id?: number;
  sort_no: string;
  construction: string;
  hsn_code: string;
  unit: string;          // ← NEW: MTR / KG / PCS / YDS ...
  qty: number;
  rate: number;
  basic_value: number;
}
 
export interface FabricPurchaseOrderPayload {
  id?: number;
  fpo_no: string;
  fpo_date: string;
  supplier: string;
  billing_from: string;
  delivery_to: string;
  pay_terms: string;
  pinning: string;
  packing_type: string;
  rate_type: string;
  freight: string;
  delivery_dt: string;
  remarks: string;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  sub_total: number;
  cgst_amt: number;
  sgst_amt: number;
  igst_amt: number;
  net_value: number;
  items: FpoItem[];
  plan_id?: number | null;
  plan_rec_no?: string | null;
  order_no?: string;
  purchase_qty?: number;
  // NEW — support the tax-invoice-style print layout
  due_dt?: string;
  place_of_supply?: string;
  advance?: number;
  terms_conditions?: string;
}

export const getFabricPurchaseOrders = () =>
     api.get('/fabric-purchase-orders').then(r => r.data);

export const getFabricPurchaseOrderById = (id: number) =>
  api.get(`/fabric-purchase-orders/${id}`);

export const createFabricPurchaseOrder = (
  data: FabricPurchaseOrderPayload
) =>
  api.post("/fabric-purchase-orders", data);

export const updateFabricPurchaseOrder = (
  id: number,
  data: FabricPurchaseOrderPayload
) =>
  api.put(`/fabric-purchase-orders/${id}`, data);

export const deleteFabricPurchaseOrder = (
  id: number
) =>
  api.delete(`/fabric-purchase-orders/${id}`);

/* =========================
   FABRIC PURCHASE INWARD
========================= */
 
export interface FpiItem {
  id?:          number;
  fpi_id?:      number;
  meter:        number;
  piece_no:     string;
  new_piece_no: string;
}
 
export interface FabricPurchaseInwardPayload {
  id?:                  number;
  fpi_no:               string;
  fpi_date:             string;
  fpo_no:               string;
  vehicle_no:           string;
  supplier:             string;
  inward_to:            string;
  sort_no:              string;
  remarks:              string;
  dc_no:                string;
  dc_date:              string;
  lot_no:               string;
  total_meters:         number;
  purchase_invoice_no?: string;   // ← new field (text, stored in DB)
  items:                FpiItem[];
}
 
// ── Auto-generate next FPI No from server ────────────────────────────────────
// Returns: { fpi_no: "FPI-2026-27-001" }
export const getNextFpiNo = () =>
  api.get("/fabric-purchase-inward/next-fpi-no");
 
export const getFabricPurchaseInwards = () =>
  api.get("/fabric-purchase-inward");
 
export const getFabricPurchaseInwardById = (id: number) =>
  api.get(`/fabric-purchase-inward/${id}`);
 
export const createFabricPurchaseInward = (
  data: FabricPurchaseInwardPayload
) =>
  api.post("/fabric-purchase-inward", data);
 
export const updateFabricPurchaseInward = (
  id: number,
  data: FabricPurchaseInwardPayload
) =>
  api.put(`/fabric-purchase-inward/${id}`, data);
 
export const deleteFabricPurchaseInward = (id: number) =>
  api.delete(`/fabric-purchase-inward/${id}`);

  
  /* =========================
   FABRICS
========================= */

export interface WarpDetail {
  id?: number;
  yarn_id: number | string;        // FK → yarn_master.id
  warp_count: string;              // yarn type/count label (text)
  act_cnt: number | string;        // actual_count column
  ends: number | string;
  crimp_pct: number | string;
  wt_per_mtr: number | string;     // vt_mtr
  wt_per_mtr_wc: number | string;  // vt_mtr_vc
  display_order?: number;
}

export interface WeftDetail {
  id?: number;
  yarn_id: number | string;        // FK → yarn_master.id
  weft_count: string;              // yarn type/count label (text)
  act_cnt: number | string;        // actual_count column
  onloom_pick: number | string;
  wt_per_mtr: number | string;     // vt_mtr
  display_order?: number;
}

export interface Fabric {
  id?: number;
  fabric_id?: string;
  sort_no: string;
  reed: number | string;
  pick: number | string;
  width: number | string;
  weave: string;
  design: string;
  onloom_reed: number | string;
  reed_space: number | string;
  total_ends: number | string;
  selvedge_ends: number | string;
  body_ends: number | string;
  construction: string;
  warp_wt_per_mtr: number | string;
  warp_wt_per_mtr_wc: number | string;
  weft_wt_per_mtr: number | string;
  fabric_wt_per_mtr: number | string;
  status: string;
  warp_details: WarpDetail[];
  weft_details: WeftDetail[];
}

export interface FabricListResponse {
  data: Fabric[];
  total: number;
  page: number;
  limit: number;
}

export interface FabricListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/* =========================
   FABRIC API
========================= */

export const listFabrics = async (
  params: FabricListParams = {}
): Promise<FabricListResponse> => {
  const query = new URLSearchParams();

  if (params.search)
    query.append("search", params.search);

  if (params.status)
    query.append("status", params.status);

  if (params.page)
    query.append("page", String(params.page));

  if (params.limit)
    query.append("limit", String(params.limit));

  const { data } =
    await api.get<FabricListResponse>(
      `/fabrics?${query.toString()}`
    );

  return data;
};

export const getFabric = async (
  id: number
): Promise<Fabric> => {
  const { data } = await api.get<Fabric>(
    `/fabrics/${id}`
  );

  return data;
};

export const createFabric = async (
  fabric: Fabric  // ← changed from FormData to Fabric
): Promise<Fabric> => {
  const { data } = await api.post<Fabric>(
    "/fabrics",
    fabric   // ← plain object, axios sends as JSON automatically
    // removed the multipart/form-data header
  );
  return data;
};
export const updateFabric = async (
  id: number,
  fabric: Fabric
): Promise<Fabric> => {
  const { data } = await api.put<Fabric>(
    `/fabrics/${id}`,
    fabric
  );

  return data;
};

export const deleteFabric = async (
  id: number
): Promise<void> => {
  await api.delete(`/fabrics/${id}`);
};



export interface TransportAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  isNew?: boolean;
  file?: File;
}

export interface Transport {
  id?: number;
  transport_code?: string;

  transport_mode: string;
  transport_type: string;
  transport_company: string;

  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;

  gst_no: string;

  msme: "Yes" | "No";
  msme_reg_no: string;

  email: string;

  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;

  status: "Active" | "Inactive";

  attachments: TransportAttachment[];
}

export interface TransportListParams {
  search?: string;
  transport_mode?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface TransportListResponse {
  data: Transport[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   HELPERS
========================= */

function buildFormData(
  data: Partial<Transport>,
  deletedAttachmentIds: number[]
): FormData {
  const fd = new FormData();

  const scalarFields: (keyof Transport)[] = [
    "transport_mode",
    "transport_type",
    "transport_company",

    "address",
    "pin_code",
    "district",
    "state",
    "country",

    "gst_no",

    "msme",
    "msme_reg_no",

    "email",

    "contact_name",
    "designation",
    "contact_no",
    "contact_email",

    "status",
  ];

  scalarFields.forEach((key) => {
    fd.append(key, String(data[key] ?? ""));
  });

  // Upload new files
  (data.attachments ?? [])
    .filter((a) => a.isNew && a.file)
    .forEach((a) => {
      fd.append("attachments", a.file!);
    });

  // Deleted attachment ids
  fd.append(
    "deleted_attachments",
    JSON.stringify(deletedAttachmentIds)
  );

  return fd;
}

/* =========================
   TRANSPORT API
========================= */

export const getTransports = async (
  params: TransportListParams = {}
): Promise<TransportListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.transport_mode) {
    query.append(
      "transport_mode",
      params.transport_mode
    );
  }

  if (params.status) {
    query.append("status", params.status);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } =
    await api.get<TransportListResponse>(
      `/transports?${query.toString()}`
    );

  return data;
};

export const getTransportById = async (
  id: number
): Promise<Transport> => {
  const { data } =
    await api.get<Transport>(
      `/transports/${id}`
    );

  return data;
};

export const createTransport = async (
  payload: Omit<
    Transport,
    "id" | "transport_code"
  >,
  deletedAttachmentIds: number[] = []
): Promise<Transport> => {
  const formData = buildFormData(
    payload,
    deletedAttachmentIds
  );

  const { data } =
    await api.post<Transport>(
      "/transports",
      formData,
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
      }
    );

  return data;
};

export const updateTransport = async (
  id: number,
  payload: Transport,
  deletedAttachmentIds: number[] = []
): Promise<Transport> => {
  const formData = buildFormData(
    payload,
    deletedAttachmentIds
  );

  const { data } =
    await api.put<Transport>(
      `/transports/${id}`,
      formData,
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
      }
    );

  return data;
};

export const deleteTransport = async (
  id: number
): Promise<{ message: string }> => {
  const { data } =
    await api.delete<{
      message: string;
    }>(`/transports/${id}`);

  return data;
};

export const getAttachmentUrl = (
  filePath: string
): string => {
  return `/api/transports/attachment/${filePath}`;
};


/* =========================
   AGENTS
========================= */

export interface Attachment {
  id?: number;
  file_name: string;
  file_path?: string;
  isNew?: boolean;
  file?: File;
}

export interface Agent {
  id?: number;
  agent_code?: string;

  type: string;
  agent_name: string;

  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;

  gst_no: string;
  pan_no: string;
  tan_no: string;

  msme: string;
  msme_sector: string;
  msme_type: string;
  msme_reg_no: string;

  email: string;

  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;

  commission_pct: string;

  status: string;

  attachments: Attachment[];

  created_at?: string;
  updated_at?: string;
}

export interface AgentListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface AgentListResponse {
  data: Agent[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   HELPERS
========================= */

function buildAgentFormData(
  data: Partial<Agent>,
  deletedAttachmentIds: number[]
): FormData {
  const fd = new FormData();

  const scalarFields: (keyof Agent)[] = [
    "type",
    "agent_name",

    "address",
    "pin_code",
    "district",
    "state",
    "country",

    "gst_no",
    "pan_no",
    "tan_no",

    "msme",
    "msme_sector",
    "msme_type",
    "msme_reg_no",

    "email",

    "contact_name",
    "designation",
    "contact_no",
    "contact_email",

    "commission_pct",

    "status",
  ];

  scalarFields.forEach((key) => {
    fd.append(key, String(data[key] ?? ""));
  });

  // Upload new files
  (data.attachments ?? [])
    .filter((a) => a.isNew && a.file)
    .forEach((a) => {
      fd.append("attachments", a.file!);
    });

  // Deleted attachment ids
  fd.append(
    "deleted_attachments",
    JSON.stringify(deletedAttachmentIds)
  );

  return fd;
}

/* =========================
   AGENT API
========================= */

export const getAgents = async (
  params: AgentListParams = {}
): Promise<AgentListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.status) {
    query.append("status", params.status);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } =
    await api.get<AgentListResponse>(
      `/agents?${query.toString()}`
    );

  return data;
};

export const getAgentById = async (
  id: number
): Promise<Agent> => {
  const { data } =
    await api.get<Agent>(
      `/agents/${id}`
    );

  return data;
};

export const createAgent = async (
  payload: Omit<
    Agent,
    "id" | "agent_code"
  >,
  deletedAttachmentIds: number[] = []
): Promise<Agent> => {
  const formData = buildAgentFormData(
    payload,
    deletedAttachmentIds
  );

  const { data } =
    await api.post<Agent>(
      "/agents",
      formData,
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
      }
    );

  return data;
};

export const updateAgent = async (
  id: number,
  payload: Agent,
  deletedAttachmentIds: number[] = []
): Promise<Agent> => {
  const formData = buildAgentFormData(
    payload,
    deletedAttachmentIds
  );

  const { data } =
    await api.put<Agent>(
      `/agents/${id}`,
      formData,
      {
        headers: {
          "Content-Type":
            "multipart/form-data",
        },
      }
    );

  return data;
};

export const deleteAgent = async (
  id: number
): Promise<{ message: string }> => {
  const { data } =
    await api.delete<{
      message: string;
    }>(`/agents/${id}`);

  return data;
};

export const getAgentAttachmentUrl = (
  filePath: string
): string => {
  return `/api/agents/attachment/${filePath}`;
};


/* =========================
   VENDORS
========================= */

export interface VendorAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  isNew?: boolean;
  file?: File;
}

export interface ServiceTypeMeta {
  id: number;
  service_type_name: string;
}

export interface ProcessingTypeMeta {
  id: number;
  processing_type_name: string;
}

export interface VendorLookup {
  serviceTypes: ServiceTypeMeta[];
  processingTypes: ProcessingTypeMeta[];
}

export interface Vendor {
  id?: number;
  vendor_id?: string; // VEN-YYYY-NNN (backend generated)

  /* Core */
  vendor_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;

  /* Tax */
  gst_no: string;

  /* MSME */
  msme: "Yes" | "No";
  msme_sector: "Manufacturing" | "Service" | "Trading" | "";
  msme_type: "Micro" | "Small" | "Medium" | "";
  msme_reg_no: string;

  /* Contact */
  email: string;
  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;

  /* Status */
  status: "Active" | "Inactive";

  /* Relations */
  type_ids: number[];
  processing_type_ids: number[];

  attachments: VendorAttachment[];

  /* Internal (frontend only) */
  __deletedAttachments?: number[];
}

export interface VendorListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface VendorListResponse {
  data: Vendor[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   HELPERS
========================= */

function buildVendorFormData(
  vendor: Vendor,
  isUpdate: boolean = false
): FormData {
  const fd = new FormData();

  const scalarFields: (keyof Vendor)[] = [
    "vendor_name",
    "address",
    "pin_code",
    "district",
    "state",
    "country",

    "gst_no",

    "msme",
    "msme_sector",
    "msme_type",
    "msme_reg_no",

    "email",
    "contact_name",
    "designation",
    "contact_no",
    "contact_email",

    "status",
  ];

  scalarFields.forEach((key) => {
    fd.append(key as string, String(vendor[key] ?? ""));
  });

  fd.append(
    "type_ids",
    JSON.stringify(vendor.type_ids ?? [])
  );

  fd.append(
    "processing_type_ids",
    JSON.stringify(vendor.processing_type_ids ?? [])
  );

  /* New attachments */
  (vendor.attachments ?? [])
    .filter((a) => a.isNew && a.file)
    .forEach((a) => {
      fd.append("attachments", a.file!);
    });

  /* Deleted attachments (only on update) */
  if (isUpdate) {
    fd.append(
      "deleted_attachments",
      JSON.stringify(vendor.__deletedAttachments ?? [])
    );
  }

  return fd;
}

/* =========================
   VENDOR API
========================= */

export const getVendors = async (
  params: VendorListParams = {}
): Promise<VendorListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.status) {
    query.append("status", params.status);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } = await api.get<VendorListResponse>(
    `/vendors?${query.toString()}`
  );

  return data;
};

export const getVendorById = async (
  id: number
): Promise<Vendor> => {
  const { data } = await api.get<Vendor>(
    `/vendors/${id}`
  );

  return data;
};

export const getVendorLookup = async (): Promise<VendorLookup> => {
  const { data } = await api.get<VendorLookup>(
    `/vendors/meta/lookup`
  );

  return data;
};

export const createVendor = async (
  payload: Vendor
): Promise<Vendor> => {
  const formData = buildVendorFormData(payload, false);

  const { data } = await api.post<Vendor>(
    "/vendors",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return data;
};

export const updateVendor = async (
  id: number,
  payload: Vendor
): Promise<Vendor> => {
  const formData = buildVendorFormData(payload, true);

  const { data } = await api.put<Vendor>(
    `/vendors/${id}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return data;
};

export const deleteVendor = async (
  id: number
): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(
    `/vendors/${id}`
  );

  return data;
};

export const getVendorAttachmentUrl = (
  filePath: string
): string => {
  return `/api/vendors/attachment/${filePath}`;
};



/* =========================
   SUPPLIER MASTER
========================= */

export interface SupplierType {
  id: number;
  type_name: string;
  supply_type: "Bulk" | "Normal";
  type_description?: string;
}

export interface SupplierAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
}

export interface Supplier {
  id?: number;
  supplier_id?: string;

  type_id: string;
  type_name?: string;
  supply_type?: string;

  supplier_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;

  gst_no: string;

  msme: "Yes" | "No";
  msme_reg_no: string;

  email: string;

  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;

  status: "Active" | "Inactive";

  attachments: SupplierAttachment[];
}

/* =========================
   LIST TYPES
========================= */

export interface SupplierListParams {
  search?: string;
  status?: string;
  type_id?: string;
  page?: number;
  limit?: number;
}

export interface SupplierListResponse {
  data: Supplier[];
  total: number;
  page: number;
  limit: number;
}

export interface SupplierLookup {
  supplierTypes: SupplierType[];
}

/* =========================
   CONSTANTS
========================= */

const SUPPLIER_BASE = "/suppliers";
const TYPE_BASE = "/supplier-types";

/* =========================
   HELPERS
========================= */

function buildSupplierFormData(
  supplier: Supplier,
  newFiles: File[] = [],
  deletedAttachmentIds: number[] = []
): FormData {
  const fd = new FormData();

  const scalarFields: (keyof Supplier)[] = [
    "type_id",
    "supplier_name",
    "address",
    "pin_code",
    "district",
    "state",
    "country",
    "gst_no",
    "msme",
    "msme_reg_no",
    "email",
    "contact_name",
    "designation",
    "contact_no",
    "contact_email",
    "status",
  ];

  scalarFields.forEach((key) => {
    const value = supplier[key];

    if (value !== undefined && value !== null) {
      fd.append(key, String(value));
    }
  });

  newFiles.forEach((file) => {
    fd.append("attachments", file);
  });

  fd.append(
    "deleted_attachments",
    JSON.stringify(deletedAttachmentIds)
  );

  return fd;
}

/* =========================
   SUPPLIER TYPE SERVICE
========================= */

export const supplierTypeService = {
  getAll(): Promise<SupplierType[]> {
    return api.get(TYPE_BASE).then((r) => r.data);
  },

  getById(id: number): Promise<SupplierType> {
    return api.get(`${TYPE_BASE}/${id}`).then((r) => r.data);
  },

  create(
    payload: Omit<SupplierType, "id">
  ): Promise<SupplierType> {
    return api.post(TYPE_BASE, payload).then((r) => r.data);
  },

  update(
    id: number,
    payload: Partial<Omit<SupplierType, "id">>
  ): Promise<SupplierType> {
    return api.put(`${TYPE_BASE}/${id}`, payload).then((r) => r.data);
  },

  delete(id: number): Promise<{ message: string }> {
    return api.delete(`${TYPE_BASE}/${id}`).then((r) => r.data);
  },
};

/* =========================
   SUPPLIER SERVICE
========================= */

export const getSuppliers = () => fetch("/api/suppliers").then(r => r.json());



export const supplierService = {
  getAll(
    params: SupplierListParams = {}
  ): Promise<SupplierListResponse> {
    const qs = new URLSearchParams();

    if (params.search) qs.append("search", params.search);
    if (params.status) qs.append("status", params.status);
    if (params.type_id) qs.append("type_id", params.type_id);

    qs.append("page", String(params.page ?? 1));
    qs.append("limit", String(params.limit ?? 10));

    return api
      .get(`${SUPPLIER_BASE}?${qs.toString()}`)
      .then((r) => r.data);
  },

  getById(id: number): Promise<Supplier> {
    return api.get(`${SUPPLIER_BASE}/${id}`).then((r) => r.data);
  },

  create(
    supplier: Supplier,
    newFiles: File[] = []
  ): Promise<Supplier> {
    const fd = buildSupplierFormData(supplier, newFiles, []);

    return api
      .post(SUPPLIER_BASE, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((r) => r.data);
  },

  update(
    id: number,
    supplier: Supplier,
    newFiles: File[] = [],
    deletedAttachmentIds: number[] = []
  ): Promise<Supplier> {
    const fd = buildSupplierFormData(
      supplier,
      newFiles,
      deletedAttachmentIds
    );

    return api
      .put(`${SUPPLIER_BASE}/${id}`, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((r) => r.data);
  },

  delete(id: number): Promise<{ message: string }> {
    return api.delete(`${SUPPLIER_BASE}/${id}`).then((r) => r.data);
  },

  getLookup(): Promise<SupplierLookup> {
    return api
      .get(`${SUPPLIER_BASE}/meta/lookup`)
      .then((r) => r.data);
  },

  attachmentUrl(filePath: string): string {
    return `${SUPPLIER_BASE}/attachment/${filePath}`;
  },
};


/* =========================
  YARN MASTER
========================= */

export interface FiberRow {
  id?: number;
  row_order?: number;

  brand_id: string;
  fiber_id: string;
  fiber_percentage: number | string;

  certification_ids: number[];

  brand_name?: string;
  fiber_name?: string;

  certifications?: {
    certification_id: number;
    certification_name: string;
  }[];
}

export interface Yarn {
  id?: number;
  yarn_code?: string;

  category: "Filament" | "Spun" | "Wet spun" | "";

  yarn_type_id: string;
  count_system_id: string;
  color_id: string;
  hsn_code_id: string;

  count_value: number | string;
  ply: number | string;
  number_of_filament: number | string;

  twist_unit: "tpi" | "tpm" | "";
  twist_value: number | string;
  twist_direction: "S" | "Z" | "";

  formula: string;

  actual_count: number | string;
  yarn_count: number | string;

  short_name: string;

  status: "Active" | "Inactive";

  fibers: FiberRow[];

  yarn_type?: string;
  count_system_name?: string;
  color_name?: string;
}

/* =========================
   HELPERS
========================= */

function buildQS(params: Record<string, any>) {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      qs.append(key, String(value));
    }
  });

  return qs.toString();
}

/* =========================
   YARN SERVICE
========================= */

export const yarnService = {
  list(params = {}) {
    const qs = buildQS(params);
    return api
      .get(`/yarns?${qs}`)
      .then((res) => res.data);
  },

  get(id: number) {
    return api
      .get(`/yarns/${id}`)
      .then((res) => res.data);
  },

  create(payload: Omit<Yarn, "id" | "yarn_code">) {
    return api
      .post(`/yarns`, payload)
      .then((res) => res.data);
  },

  update(id: number, payload: Partial<Yarn>) {
    return api
      .put(`/yarns/${id}`, payload)
      .then((res) => res.data);
  },

  delete(id: number) {
    return api
      .delete(`/yarns/${id}`)
      .then((res) => res.data);
  },

  lookup() {
    return api
      .get(`/yarns/meta/lookup`)
      .then((res) => res.data);
  },
};

/* =========================
   YARN TYPE SERVICE
========================= */

export const yarnTypeService = {
  list(params = {}) {
    const qs = buildQS(params);
    return api
      .get(`/yarn-types?${qs}`)
      .then((res) => res.data);
  },

  get(id: number) {
    return api
      .get(`/yarn-types/${id}`)
      .then((res) => res.data);
  },

  create(payload: any) {
    return api
      .post(`/yarn-types`, payload)
      .then((res) => res.data);
  },

  update(id: number, payload: any) {
    return api
      .put(`/yarn-types/${id}`, payload)
      .then((res) => res.data);
  },

  delete(id: number) {
    return api
      .delete(`/yarn-types/${id}`)
      .then((res) => res.data);
  },
};

/* =========================
   COUNT SYSTEM SERVICE
========================= */

export const countSystemService = {
  list(params = {}) {
    const qs = buildQS(params);
    return api
      .get(`/count-systems?${qs}`)
      .then((res) => res.data);
  },

  get(id: number) {
    return api
      .get(`/count-systems/${id}`)
      .then((res) => res.data);
  },

  create(payload: any) {
    return api
      .post(`/count-systems`, payload)
      .then((res) => res.data);
  },

  update(id: number, payload: any) {
    return api
      .put(`/count-systems/${id}`, payload)
      .then((res) => res.data);
  },

  delete(id: number) {
    return api
      .delete(`/count-systems/${id}`)
      .then((res) => res.data);
  },
};


/* ========================================================= OTHER MASTERS ========================================================= */ export type Status = | "Active" | "Inactive"; export interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; } export interface ListParams { search?: string; status?: Status; page?: number; limit?: number; material_type?: string; } /* ========================================================= BASE CRUD SERVICE ========================================================= */ function createCrudService< T, CreatePayload = T, UpdatePayload = Partial<T> >(endpoint: string) { return { list: async ( params: ListParams = {} ): Promise<PaginatedResponse<T>> => { const qs = buildQS(params); const { data } = await api.get< PaginatedResponse<T> >( `${endpoint}?${qs}` ); return data; }, getById: async ( id: number ): Promise<T> => { const { data } = await api.get<T>( `${endpoint}/${id}` ); return data; }, create: async ( payload: CreatePayload ): Promise<T> => { const { data } = await api.post<T>( endpoint, payload ); return data; }, update: async ( id: number, payload: UpdatePayload ): Promise<T> => { const { data } = await api.put<T>( `${endpoint}/${id}`, payload ); return data; }, remove: async ( id: number ): Promise<{ message: string; }> => { const { data } = await api.delete<{ message: string; }>( `${endpoint}/${id}` ); return data; }, }; } /* ========================================================= SERVICE TYPE ========================================================= */ export interface ServiceType { id?: number; service_type: string; description?: string; status: Status; created_at?: string; updated_at?: string; } export interface CreateServiceTypePayload { service_type: string; description?: string; status: Status; } const serviceTypeCrud = createCrudService< ServiceType, CreateServiceTypePayload >("/service-types"); export const serviceTypeService = { ...serviceTypeCrud, getOptions: async (): Promise<{ serviceTypeOptions: string[]; }> => { const { data } = await api.get<{ serviceTypeOptions: string[]; }>( "/service-types/meta/options" ); return data; }, }; /* ========================================================= PACKAGE ========================================================= */ export type MaterialType = | "Yarn" | "Fabric" | ""; export interface Package { id?: number; material_type: MaterialType; package_name: string; status: Status; created_at?: string; updated_at?: string; } export interface CreatePackagePayload { material_type: MaterialType; package_name: string; status: Status; } const packageCrud = createCrudService< Package, CreatePackagePayload >("/packages"); export const packageService = { ...packageCrud, getOptions: async (): Promise<{ packageOptions: Record< string, string[] >; }> => { const { data } = await api.get<{ packageOptions: Record< string, string[] >; }>( "/packages/meta/options" ); return data; }, }; /* ========================================================= REGION ========================================================= */ export interface Region { id?: number; region_name: string; description?: string; status: Status; created_at?: string; updated_at?: string; } export interface CreateRegionPayload { region_name: string; description?: string; status: Status; } const regionCrud = createCrudService< Region, CreateRegionPayload >("/regions"); export const regionService = { ...regionCrud, getOptions: async (): Promise<{ regionOptions: string[]; }> => { const { data } = await api.get<{ regionOptions: string[]; }>( "/regions/meta/options" ); return data; }, };



/* =========================
   CUSTOMER GROUP
========================= */

export interface CustomerGroup {
  id?: number;
  rec_no?: number;
  group_name: string;
  description?: string;
  status: "Active" | "Inactive";
  created_at?: string;
  updated_at?: string;
}

export interface CustomerGroupListParams {
  search?: string;
  status?: "Active" | "Inactive";
  page?: number;
  limit?: number;
}

export interface CustomerGroupListResponse {
  data: CustomerGroup[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   CUSTOMER GROUP API
========================= */
export const getCustomers = () => api.get('/customers');


export const getCustomerGroups = async (
  params: CustomerGroupListParams = {}
): Promise<CustomerGroupListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.status) {
    query.append("status", params.status);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } =
    await api.get<CustomerGroupListResponse>(
      `/customer-groups?${query.toString()}`
    );

  return data;
};

export const getCustomerGroupById = async (
  id: number
): Promise<CustomerGroup> => {
  const { data } =
    await api.get<CustomerGroup>(
      `/customer-groups/${id}`
    );

  return data;
};

export const createCustomerGroup = async (
  payload: Pick<
    CustomerGroup,
    "group_name" | "description" | "status"
  >
): Promise<CustomerGroup> => {
  const { data } =
    await api.post<CustomerGroup>(
      "/customer-groups",
      payload
    );

  return data;
};

export const updateCustomerGroup = async (
  id: number,
  payload: Partial<
    Pick<
      CustomerGroup,
      "group_name" |
      "description" |
      "status"
    >
  >
): Promise<CustomerGroup> => {
  const { data } =
    await api.put<CustomerGroup>(
      `/customer-groups/${id}`,
      payload
    );

  return data;
};

export const deleteCustomerGroup = async (
  id: number
): Promise<void> => {
  await api.delete(
    `/customer-groups/${id}`
  );
};

/* =========================
   PROCESSING TYPE
========================= */

export const PROCESSING_TYPE_OPTIONS = [
  "Desizing",
  "Bleaching (RFD - Ready for dyeing)",
  "Dyeing",
  "Printing",
  "Washing",
  "Zero Zero Finishing",
] as const;

export type PresetTypeName =
  (typeof PROCESSING_TYPE_OPTIONS)[number];

export interface ProcessingType {
  id?: number;
  type_id?: number;
  type_name: string;
  type_description?: string;
  status: "Active" | "Inactive";
  created_at?: string;
  updated_at?: string;
}

export interface ProcessingTypeListParams {
  search?: string;
  status?: "Active" | "Inactive";
  page?: number;
  limit?: number;
}

export interface ProcessingTypeListResponse {
  data: ProcessingType[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   PROCESSING TYPE API
========================= */

export const getProcessingTypes = async (
  params: ProcessingTypeListParams = {}
): Promise<ProcessingTypeListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.status) {
    query.append("status", params.status);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } =
    await api.get<ProcessingTypeListResponse>(
      `/processing-types?${query.toString()}`
    );

  return data;
};

export const getProcessingTypeById =
  async (
    id: number
  ): Promise<ProcessingType> => {
    const { data } =
      await api.get<ProcessingType>(
        `/processing-types/${id}`
      );

    return data;
  };

export const getProcessingTypePresets =
  async (): Promise<string[]> => {
    const { data } =
      await api.get<{
        presets: string[];
      }>(
        "/processing-types/meta/presets"
      );

    return data.presets;
  };

export const createProcessingType =
  async (
    payload: Pick<
      ProcessingType,
      | "type_name"
      | "type_description"
      | "status"
    >
  ): Promise<ProcessingType> => {
    const { data } =
      await api.post<ProcessingType>(
        "/processing-types",
        payload
      );

    return data;
  };

export const updateProcessingType =
  async (
    id: number,
    payload: Partial<
      Pick<
        ProcessingType,
        | "type_name"
        | "type_description"
        | "status"
      >
    >
  ): Promise<ProcessingType> => {
    const { data } =
      await api.put<ProcessingType>(
        `/processing-types/${id}`,
        payload
      );

    return data;
  };

export const deleteProcessingType =
  async (
    id: number
  ): Promise<void> => {
    await api.delete(
      `/processing-types/${id}`
    );
  };


  /* =========================
   PAYMENT TERMS
========================= */

export interface PaymentTerm {
  id?: number;
  rec_no?: number;
  payment_term_name: string;
  payment_term_days: string;
}

export interface PaymentTermListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaymentTermListResponse {
  data: PaymentTerm[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   PAYMENT TERMS API
========================= */

export const getPaymentTerms = async (
  params: PaymentTermListParams = {}
): Promise<PaymentTermListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  const { data } =
    await api.get<PaymentTermListResponse>(
      `/payment-terms?${query.toString()}`
    );

  return data;
};

export const getPaymentTermById = async (
  id: number
): Promise<PaymentTerm> => {
  const { data } =
    await api.get<PaymentTerm>(
      `/payment-terms/${id}`
    );

  return data;
};

export const createPaymentTerm = async (
  payload: Omit<
    PaymentTerm,
    "id" | "rec_no"
  >
): Promise<PaymentTerm> => {
  const { data } =
    await api.post<PaymentTerm>(
      "/payment-terms",
      payload
    );

  return data;
};

export const updatePaymentTerm = async (
  id: number,
  payload: Partial<PaymentTerm>
): Promise<PaymentTerm> => {
  const { data } =
    await api.put<PaymentTerm>(
      `/payment-terms/${id}`,
      payload
    );

  return data;
};

export const deletePaymentTerm =
  async (
    id: number
  ): Promise<void> => {
    await api.delete(
      `/payment-terms/${id}`
    );
  };

  /* =========================
   COLOR MASTER
========================= */

export interface ColorRecord {
  id?: number;
  rec_no?: number;
  color_name: string;
  pantone_color_name: string;
  pantone_color_number: string;
  status: string;
}

export interface ColorListParams {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
}

export interface ColorListResponse {
  data: ColorRecord[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   COLOR API
========================= */

export const getColors = async (
  params: ColorListParams = {}
): Promise<ColorListResponse> => {
  const query = new URLSearchParams();

  if (params.search) {
    query.append("search", params.search);
  }

  if (params.page) {
    query.append("page", String(params.page));
  }

  if (params.limit) {
    query.append("limit", String(params.limit));
  }

  if (params.status) {
    query.append("status", params.status);
  }

  const { data } =
    await api.get<ColorListResponse>(
      `/colors?${query.toString()}`
    );

  return data;
};

export const getColorById = async (
  id: number
): Promise<ColorRecord> => {
  const { data } =
    await api.get<ColorRecord>(
      `/colors/${id}`
    );

  return data;
};

export const createColor = async (
  payload: Omit<
    ColorRecord,
    "id" | "rec_no"
  >
): Promise<ColorRecord> => {
  const { data } =
    await api.post<ColorRecord>(
      "/colors",
      payload
    );

  return data;
};

export const updateColor = async (
  id: number,
  payload: Partial<ColorRecord>
): Promise<ColorRecord> => {
  const { data } =
    await api.put<ColorRecord>(
      `/colors/${id}`,
      payload
    );

  return data;
};

export const deleteColor = async (
  id: number
): Promise<void> => {
  await api.delete(
    `/colors/${id}`
  );
};

/* =========================
   CERTIFICATION
========================= */

export interface CertificationAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  isNew?: boolean;
  file?: File;
}

export interface CertNumberHistory {
  id: number;
  cert_number: string;
  valid_from: string | null;
  valid_to: string | null;
  replaced_at: string;
}

export interface Certification {
  id?: number;
  cert_id?: string;
  certification_name: string;
  certification_number: string;
  valid_from: string;
  valid_to: string;
  certification_body: string;
  status: "Active" | "Inactive";

  attachments: CertificationAttachment[];
  cert_number_history?: CertNumberHistory[];

  // frontend only
  __deletedAttachments?: number[];
}

export interface CertificationListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CertificationListResponse {
  data: Certification[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   HELPERS
========================= */

function buildCertificationFormData(
  data: Certification
): FormData {
  const fd = new FormData();

  fd.append(
    "certification_name",
    data.certification_name ?? ""
  );

  fd.append(
    "certification_number",
    data.certification_number ?? ""
  );

  fd.append(
    "valid_from",
    data.valid_from ?? ""
  );

  fd.append(
    "valid_to",
    data.valid_to ?? ""
  );

  fd.append(
    "certification_body",
    data.certification_body ?? ""
  );

  fd.append(
    "status",
    data.status ?? "Active"
  );

  // New attachments
  (data.attachments ?? [])
    .filter((a) => a.isNew && a.file)
    .forEach((a) => {
      fd.append(
        "attachments",
        a.file!
      );
    });

  // Deleted attachments
  fd.append(
    "deleted_attachments",
    JSON.stringify(
      data.__deletedAttachments ?? []
    )
  );

  return fd;
}

/* =========================
   CERTIFICATION API
========================= */

export const getCertifications =
  async (
    params: CertificationListParams = {}
  ): Promise<CertificationListResponse> => {
    const query =
      new URLSearchParams();

    if (params.search) {
      query.append(
        "search",
        params.search
      );
    }

    if (params.status) {
      query.append(
        "status",
        params.status
      );
    }

    if (params.page) {
      query.append(
        "page",
        String(params.page)
      );
    }

    if (params.limit) {
      query.append(
        "limit",
        String(params.limit)
      );
    }

    const { data } =
      await api.get<CertificationListResponse>(
        `/certifications?${query.toString()}`
      );

    return data;
  };

export const getCertificationById =
  async (
    id: number
  ): Promise<Certification> => {
    const { data } =
      await api.get<Certification>(
        `/certifications/${id}`
      );

    return data;
  };

export const createCertification =
  async (
    payload: Certification
  ): Promise<Certification> => {
    const formData =
      buildCertificationFormData(
        payload
      );

    const { data } =
      await api.post<Certification>(
        "/certifications",
        formData,
        {
          headers: {
            "Content-Type":
              "multipart/form-data",
          },
        }
      );

    return data;
  };

export const updateCertification =
  async (
    id: number,
    payload: Certification
  ): Promise<Certification> => {
    const formData =
      buildCertificationFormData(
        payload
      );

    const { data } =
      await api.put<Certification>(
        `/certifications/${id}`,
        formData,
        {
          headers: {
            "Content-Type":
              "multipart/form-data",
          },
        }
      );

    return data;
  };

export const deleteCertification =
  async (
    id: number
  ): Promise<void> => {
    await api.delete(
      `/certifications/${id}`
    );
  };

export const getCertificationAttachmentUrl =
  (
    filePath: string
  ): string => {
    return `/api/certifications/attachment/${filePath}`;
  };

  /* =========================
   HSN MASTER
========================= */

export interface HsnCode {
  id?: number;
  hsn_id?: string;
  hsn_code: string;
  hsn_short_desc: string;
  hsn_long_desc: string;
  gst_percent: number | string;
  status: "Active" | "Inactive";
}

export interface HsnListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface HsnListResponse {
  data: HsnCode[];
  total: number;
  page: number;
  limit: number;
}

/* =========================
   HSN API
========================= */

export const getHsnCodes = async (
  params: HsnListParams = {}
): Promise<HsnListResponse> => {
  const query =
    new URLSearchParams();

  if (params.search) {
    query.append(
      "search",
      params.search
    );
  }

  if (params.status) {
    query.append(
      "status",
      params.status
    );
  }

  if (params.page) {
    query.append(
      "page",
      String(params.page)
    );
  }

  if (params.limit) {
    query.append(
      "limit",
      String(params.limit)
    );
  }

  const { data } =
    await api.get<HsnListResponse>(
      `/hsn?${query.toString()}`
    );

  return data;
};

export const getHsnCodeById =
  async (
    id: number
  ): Promise<HsnCode> => {
    const { data } =
      await api.get<HsnCode>(
        `/hsn/${id}`
      );

    return data;
  };

export const createHsnCode =
  async (
    payload: HsnCode
  ): Promise<HsnCode> => {
    const { data } =
      await api.post<HsnCode>(
        "/hsn",
        payload
      );

    return data;
  };

export const updateHsnCode =
  async (
    id: number,
    payload: HsnCode
  ): Promise<HsnCode> => {
    const { data } =
      await api.put<HsnCode>(
        `/hsn/${id}`,
        payload
      );

    return data;
  };

export const deleteHsnCode =
  async (
    id: number
  ): Promise<void> => {
    await api.delete(
      `/hsn/${id}`
    );
  };


 // ─────────────────────────────────────────────────────────────────────────────
// ① CURRENCY MASTER
// ─────────────────────────────────────────────────────────────────────────────
 
export interface Currency {
  id?: number;
  rec_no?: string;
  currency_name: string;
  currency_code: string;
  currency_symbol: string;
  status: 'Active' | 'Inactive';
}
 
export interface CurrencyListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}
 
export interface CurrencyListResponse {
  data: Currency[];
  total: number;
  page: number;
  limit: number;
}
 
export const currencyService = {
  /** GET /currencies?search=…&status=…&page=…&limit=… */
  list: async (params: CurrencyListParams = {}): Promise<CurrencyListResponse> => {
    const { data } = await api.get<CurrencyListResponse>(
      `/currencies?${toQS(params as Record<string, string | number | undefined>)}`
    );
    return data;
  },
 
  /** GET /currencies/:id */
  get: async (id: number): Promise<Currency> => {
    const { data } = await api.get<Currency>(`/currencies/${id}`);
    return data;
  },
 
  /** POST /currencies */
  create: async (payload: Omit<Currency, 'id' | 'rec_no'>): Promise<Currency> => {
    const { data } = await api.post<Currency>('/currencies', payload);
    return data;
  },
 
  /** PUT /currencies/:id */
  update: async (id: number, payload: Partial<Currency>): Promise<Currency> => {
    const { data } = await api.put<Currency>(`/currencies/${id}`, payload);
    return data;
  },
 
  /** DELETE /currencies/:id */
  remove: async (id: number): Promise<void> => {
    await api.delete(`/currencies/${id}`);
  },
};
 
// ─────────────────────────────────────────────────────────────────────────────
// ② DISCOUNT TYPE MASTER
// ─────────────────────────────────────────────────────────────────────────────
 
export interface DiscountType {
  id?: number;
  rec_no?: string;
  discount_type_name: string;
  type: 'Trade Discount' | 'Quantity Discount' | 'Cash Discount' | 'Scheme Discount';
  status: 'Active' | 'Inactive';
}
 
export interface DiscountTypeListParams {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}
 
export interface DiscountTypeListResponse {
  data: DiscountType[];
  total: number;
  page: number;
  limit: number;
}
 
export const discountTypeService = {
  /** GET /discount-types?search=…&status=…&type=…&page=…&limit=… */
  list: async (params: DiscountTypeListParams = {}): Promise<DiscountTypeListResponse> => {
    const { data } = await api.get<DiscountTypeListResponse>(
      `/discount-types?${toQS(params as Record<string, string | number | undefined>)}`
    );
    return data;
  },
 
  /** GET /discount-types/:id */
  get: async (id: number): Promise<DiscountType> => {
    const { data } = await api.get<DiscountType>(`/discount-types/${id}`);
    return data;
  },
 
  /** POST /discount-types */
  create: async (payload: Omit<DiscountType, 'id' | 'rec_no'>): Promise<DiscountType> => {
    const { data } = await api.post<DiscountType>('/discount-types', payload);
    return data;
  },
 
  /** PUT /discount-types/:id */
  update: async (id: number, payload: Partial<DiscountType>): Promise<DiscountType> => {
    const { data } = await api.put<DiscountType>(`/discount-types/${id}`, payload);
    return data;
  },
 
  /** DELETE /discount-types/:id */
  remove: async (id: number): Promise<void> => {
    await api.delete(`/discount-types/${id}`);
  },
};

function toQS(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return qs.toString();
}


/* =========================
   YARN MASTER
========================= */

export interface FiberRow {
  id?: number;
  row_order?: number;

  brand_id: string;
  fiber_id: string;
  fiber_percentage: number | string;

  certification_ids: number[];

  // joined (read-only, returned by GET)
  brand_name?: string;
  fiber_name?: string;
  certifications?: {
    certification_id: number;
    certification_name: string;
  }[];
}

export interface Yarn {
  id?: number;
  yarn_code?: string;

  category: "Filament" | "Spun" | "Wet spun" | "";

  yarn_type_id:    string;
  count_system_id: string;
  color_id:        string;
  hsn_code_id:     string;

  count_value:        number | string;
  ply:                number | string;
  number_of_filament: number | string;

  twist_unit:      "tpi" | "tpm" | "";
  twist_value:     number | string;
  twist_direction: "S" | "Z" | "";

  formula:      string;
  actual_count: number | string;
  yarn_count:   number | string;
  short_name:   string;

  status: "Active" | "Inactive";

  fibers: FiberRow[];

  // joined (read-only)
  yarn_type?:         string;
  count_system_name?: string;
  color_name?:        string;
  hex_code?:          string | null;
  hsn_code_value?:    string | null;
}

export interface YarnType {
  id?:       number;
  yarn_type: string;
  status:    "Active" | "Inactive";
}

export interface CountSystem {
  id?:     number;
  cs_name: string;
  formula: string;
  status:  "Active" | "Inactive";
}

export interface YarnLookup {
  yarnTypes:      { id: number; yarn_type: string }[];
  countSystems:   { id: number; cs_name: string; formula: string }[];
  fibers:         { id: number; fiber_name: string }[];
  brands:         { id: number; brand_name: string }[];
  certifications: { id: number; certification_name: string }[];
  colors:         { id: number; color_name: string; hex_code: string | null }[];
  hsnCodes:       { id: number; hsn_code: string; description: string | null }[];
}

export interface YarnListParams {
  search?:   string;
  category?: string;
  status?:   string;
  page?:     number;
  limit?:    number;
}

export interface YarnListResponse {
  data:  Yarn[];
  total: number;
  page:  number;
  limit: number;
}

export interface YarnTypeListResponse {
  data:  YarnType[];
  total: number;
  page:  number;
  limit: number;
}

export interface CountSystemListResponse {
  data:  CountSystem[];
  total: number;
  page:  number;
  limit: number;
}

export interface DevAnalysisPayload {
  sample_request_id:  number;
  style_number?:      string;
  construction?:      string;  // e.g. "40×40 / 133×72"
  blend?:             string;   // e.g. "60% Cotton, 40% Polyester"
  gsm?:               string;   // grams per square meter
  weave_type?:        string;   // "plain" | "twill" | "satin" | "dobby" | "jacquard"
  analyzed_by?:       string;
  analysis_date?:     string;   // ISO date "YYYY-MM-DD"
  remarks?:           string;
}
 
/** Upsert — backend creates or updates keyed on sample_request_id */
export const saveDevAnalysis = (data: DevAnalysisPayload) =>
  api.post('/dev-analysis', data);
 
export const getDevAnalysis = (sampleId: number) =>
  api.get(`/dev-analysis?sample_request_id=${sampleId}`);
 

export interface OrderLink {
  id?: number;
  linking_date: string;
  co_no: string;
  co_date?: string;
  customer_name?: string;
  co_sort_no?: string;
  co_quantity?: number | string;
  plan_quantity_allocated?: number | string;
  // client-only
  _isNew?: boolean;
}

export interface ProductionPlan {
  id?: number;
  rec_no?: string;              // PLN-YYYY-NNNN  (auto)
  rec_date?: string;            // auto
 
  // Order reference
  order_type: string;           // 'Customer Order' | 'Open Order'
  order_no: string;
  order_date?: string;          // autofill
  order_sort_no?: string;       // autofill, editable
  customer_name?: string;
  confirmed_by?: string;
  constn_for_production?: string;
  order_quantity?: number | string;   // autofill
 
  // Stock planning
  allocated_qty?: number | string;
  stock_special_instruction?: string;
 
  // Production planning
  production_qty?: number | string;
  inhouse_prod_qty?: number | string;
  vendor_prod_qty?: number | string;
  prod_special_instruction?: string;
  vendor_id?: number | string | null;     // ← NEW: FK to vendor_master.id
  vendor_name?: string;                   // ← NEW: denormalized display name
 
  // Purchase planning
  purchase_qty?: number | string;
  purchase_special_instruction?: string;
  supplier_id?: number | string | null;   // ← NEW: FK to supplier_master.id
  supplier_name?: string;                 // ← NEW: denormalized display name
 
  // Computed (read-only from API)
  total_planned_qty?: number;
  balance_qty?: number;
  stock_total_qty?: number;
  stock_reserved_qty?: number;
  stock_available_qty?: number;
  stock_balance_qty?: number;
 
  // Relations
  order_links?: OrderLink[];
 
  created_at?: string;
  updated_at?: string;
}
 

 
export interface PlanListParams {
  search?: string;
  order_type?: string;
  page?: number;
  limit?: number;
}
 
export interface PlanListResponse {
  data: ProductionPlan[];
  total: number;
  page: number;
  limit: number;
}
 
export interface OrderOption {
  order_no: string;
  order_date: string;
  sort_no?: string;
  quantity: number;
  customer_name?: string;
}
 
export interface OrderDetails extends OrderOption {
  constn_as_po?: string;
  total_planned_qty: number;
  balance_qty: number;
}
 
// ── NEW: Vendor / Supplier option shapes, matching the search endpoints ──────
export interface VendorOption {
  id: number | string;
  vendor_name: string;
  vendor_code?: string;
  location?: string;
}
 
export interface SupplierOption {
  id: number | string;
  supplier_name: string;
  supplier_code?: string;
  location?: string;
}
 
/* ============================================================
   HELPERS
============================================================ */
 
function buildPlanBody(
  data: Partial<ProductionPlan>,
  deletedLinkIds: number[] = [],
): Record<string, unknown> {
  return {
    order_type:                   data.order_type   ?? '',
    order_no:                     data.order_no     ?? '',
    order_date:                   data.order_date   ?? '',
    order_sort_no:                data.order_sort_no ?? '',
    customer_name:                data.customer_name ?? '',
    confirmed_by:                 data.confirmed_by  ?? '',
    constn_for_production:        data.constn_for_production ?? '',
    order_quantity:               data.order_quantity ?? '',
    allocated_qty:                data.allocated_qty ?? 0,
    stock_special_instruction:    data.stock_special_instruction ?? '',
    production_qty:               data.production_qty ?? 0,
    inhouse_prod_qty:             data.inhouse_prod_qty ?? 0,
    vendor_prod_qty:              data.vendor_prod_qty ?? 0,
    prod_special_instruction:     data.prod_special_instruction ?? '',
    vendor_id:                    data.vendor_id   ?? null,   // ← NEW
    vendor_name:                  data.vendor_name ?? '',     // ← NEW
    purchase_qty:                 data.purchase_qty ?? 0,
    purchase_special_instruction: data.purchase_special_instruction ?? '',
    supplier_id:                  data.supplier_id   ?? null, // ← NEW
    supplier_name:                data.supplier_name ?? '',   // ← NEW
    // Send order links as JSON; strip client-only flags
    order_links: (data.order_links ?? []).map(({ _isNew, ...lnk }) => lnk),
    deleted_link_ids: deletedLinkIds,
  };
}
 
/* ============================================================
   API
============================================================ */
 
/** List production plans */
export const getProductionPlans = async (
  params: PlanListParams = {},
): Promise<PlanListResponse> => {
  const query = new URLSearchParams();
  if (params.search)     query.append('search',     params.search);
  if (params.order_type) query.append('order_type', params.order_type);
  if (params.page)       query.append('page',  String(params.page));
  if (params.limit)      query.append('limit', String(params.limit));
 
  const { data } = await api.get<PlanListResponse>(
    `/production-plans?${query.toString()}`,
  );
  return data;
};
 
/** Get single plan by ID (with order_links) */
export const getProductionPlanById = async (
  id: number,
): Promise<ProductionPlan> => {
  const { data } = await api.get<ProductionPlan>(`/production-plans/${id}`);
  return data;
};
 
/** Fetch customer/open order details for autofill */
export const getOrderDetails = async (
  orderNo: string,
): Promise<OrderDetails> => {
  const { data } = await api.get<OrderDetails>(
    `/production-plans/order/${encodeURIComponent(orderNo)}`,
  );
  return data;
};
 
/** Search orders for the lookup dropdown */
export const searchOrders = async (
  q: string,
  type: 'Customer Order' | 'Open Order' = 'Customer Order',
): Promise<OrderOption[]> => {
  const { data } = await api.get<OrderOption[]>('/production-plans/orders/search', {
    params: { q, type },
  });
  return data;
};
 
/** Search customer orders for order-linking grid */
export const searchCustomerOrders = async (
  q: string,
): Promise<OrderOption[]> => {
  const { data } = await api.get<OrderOption[]>('/production-plans/co/search', {
    params: { q },
  });
  return data;
};
 
/** NEW: Search vendors for the "By Production" vendor dropdown (vendor_master) */
export const searchVendors = async (
  q: string = '',
): Promise<VendorOption[]> => {
  const { data } = await api.get<VendorOption[]>('/production-plans/vendors/search', {
    params: { q },
  });
  return data;
};
 
/** NEW: Search suppliers for the "By Purchase" supplier dropdown (supplier_master) */
export const searchSuppliers = async (
  q: string = '',
): Promise<SupplierOption[]> => {
  const { data } = await api.get<SupplierOption[]>('/production-plans/suppliers/search', {
    params: { q },
  });
  return data;
};
 
/** Create a new production plan */
export const createProductionPlan = async (
  payload: Omit<ProductionPlan, 'id' | 'rec_no' | 'rec_date'>,
  deletedLinkIds: number[] = [],
): Promise<ProductionPlan> => {
  const body = buildPlanBody(payload, deletedLinkIds);
  const { data } = await api.post<ProductionPlan>('/production-plans', body);
  return data;
};
 
/** Update an existing production plan */
export const updateProductionPlan = async (
  id: number,
  payload: ProductionPlan,
  deletedLinkIds: number[] = [],
): Promise<ProductionPlan> => {
  const body = buildPlanBody(payload, deletedLinkIds);
  const { data } = await api.put<ProductionPlan>(`/production-plans/${id}`, body);
  return data;
};
 
/** Delete a production plan */
export const deleteProductionPlan = async (
  id: number,
): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(
    `/production-plans/${id}`,
  );
  return data;
};

 
export type WoStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'In Production'
  | 'Completed'
  | 'Cancelled';
 
export interface WorkOrder {
  id?: number;
  wo_no?: string;          // auto-generated
  wo_date: string;         // YYYY-MM-DD
  wo_type: 'Sample' | 'Bulk';
 
  order_plan_no?: string;
  co_no?: string;
  co_sort_no?: string;
  co_cons?: string;
  roll_length?: string;
  confirmed_by?: string;
  co_comp_date?: string;
 
  production_type: 'In-house' | 'Outsourced';
  production_location?: string;
 
  rate_type: 'Per Mtr' | 'Per Kg' | 'Fixed';
  pick_rate?: string;
  per_mtr_rate?: string;
 
  no_of_fabric_per_loom?: string;   // '1'|'2'|'3'|'4'
  total_planned_meters?: string;
  previous_wo_meters?: string;
  pwo_meter?: string;
  loom_width?: string;
  no_of_looms?: string;
 
  direct_fab_prod?: boolean;
 
  spl_instruction?: string;
  remarks?: string;
  weaver_instruction?: string;
 
  status?: WoStatus;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
 
  warp_details: WarpDetail[];
  weft_details: WeftDetail[];
 
  created_at?: string;
  updated_at?: string;
}
 
export interface WorkOrderListParams {
  search?: string;
  status?: string;
  wo_type?: string;
  page?: number;
  limit?: number;
}
 
export interface WorkOrderListResponse {
  data: WorkOrder[];
  total: number;
  page: number;
  limit: number;
}
 
// ── API calls ─────────────────────────────────────────────────
 
export const getWorkOrders = async (
  params: WorkOrderListParams = {},
): Promise<WorkOrderListResponse> => {
  const query = new URLSearchParams();
  if (params.search)  query.append('search',  params.search);
  if (params.status)  query.append('status',  params.status);
  if (params.wo_type) query.append('wo_type', params.wo_type);
  if (params.page)    query.append('page',    String(params.page));
  if (params.limit)   query.append('limit',   String(params.limit));
  const { data } = await api.get<WorkOrderListResponse>(`/work-orders?${query.toString()}`);
  return data;
};
 
export const getWorkOrderById = async (id: number): Promise<WorkOrder> => {
  const { data } = await api.get<WorkOrder>(`/work-orders/${id}`);
  return data;
};
 
export const createWorkOrder = async (payload: WorkOrder): Promise<WorkOrder> => {
  const { data } = await api.post<WorkOrder>('/work-orders', payload);
  return data;
};
 
export const updateWorkOrder = async (id: number, payload: WorkOrder): Promise<WorkOrder> => {
  const { data } = await api.put<WorkOrder>(`/work-orders/${id}`, payload);
  return data;
};
 
export const updateWorkOrderStatus = async (
  id: number,
  status: WoStatus,
  approved_by?: string,
): Promise<WorkOrder> => {
  const { data } = await api.patch<WorkOrder>(`/work-orders/${id}/status`, { status, approved_by });
  return data;
};
 
export const deleteWorkOrder = async (id: number): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(`/work-orders/${id}`);
  return data;
};

/* =========================
   YARN PURCHASE ORDERS
========================= */
 
export interface YarnPOSupplierOption {
  id: number;
  supplier_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;
  gst_no: string;
}
 
export interface YarnPOAgentOption {
  id: number;
  agent_name: string;
  commission_pct?: string;
}
 
export interface YarnPOYarnOption {
  id: number;
  yarn_code: string;
  short_name: string;
  hsn_code_value?: string;
  hsn_code_id?: number;
  category?: string;
  count?: string;
  count_type?: string;
}
 
export interface YarnPOUomOption {
  id: number;
  uom_name: string;
}
 
export interface YarnPODiscountTypeOption {
  id: number;
  discount_type_name: string;
  discount_pct?: string;
}
 
export interface YarnPOPaymentTermOption {
  id: number;
  payment_term_name: string;
  payment_term_days: string;
}
 
// Company (Print Header) — this IS company_addresses, the master already
// behind yarn_purchase_orders.company_address_id. logo_url / phone / email
// / cin_no are new (see yarn_po_schema_updates.sql) and used purely for the
// printed letterhead; all remain optional so the picker degrades gracefully
// pre-migration.
export interface YarnPOCompanyAddressOption {
  id: number;
  company_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;
  gst_no: string;
  logo_url?: string;
  phone?: string;
  email?: string;
  cin_no?: string;
}
 
export interface YarnPOCustomerOrderOption {
  id: number;
  co_no: string;
  customer_name: string;
  co_date: string;
}
 
export interface YarnPOPwoOption {
  id: number;
  wo_no: string;
  co_no: string;
  co_id?: number;
  status: string;
}
 
export interface YarnPOHsnOption {
  id: number;
  hsn_code: string;
  description?: string;
  hsn_short_desc?: string;
  gst_percent?: string;
}
 
export interface YarnPOLookupData {
  suppliers: YarnPOSupplierOption[];
  agents: YarnPOAgentOption[];
  yarns: YarnPOYarnOption[];
  uoms: YarnPOUomOption[];
  discountTypes: YarnPODiscountTypeOption[];
  paymentTerms: YarnPOPaymentTermOption[];
  companyAddresses: YarnPOCompanyAddressOption[];
  customerOrders: YarnPOCustomerOrderOption[];
  pwos: YarnPOPwoOption[];
  hsnCodes: YarnPOHsnOption[];
}
 
/* ── Line item / CO link / PO shapes ── */
 
export interface YarnPOItem {
  _id: string;
  id?: number;
  yarn_id: string;
  yarn_code?: string;
  count_for_po: string;
  hsn_code: string;
  hsn_code_id?: string;
  lot_no: string;
  uom_id: string;
  package_type: string;
  no_of_packages: string;
  weight_per_package: string;
  total_weight: string;
  cone_weight: string;
  no_of_cone_per_bag: string;
  rate: string;
  discount_type_id: string;
  discount_pct: string;
  total_po_value: string;
  instructions: string;
  gst_pct: string;
  sgst_pct: string;
  igst_pct: string;
  net_value: string;
  count?: string;
  count_type?: string;
  category?: string;
  short_name?: string;
}
 
export interface YarnPOCoLink {
  _id: string;
  id?: number;
  co_id: string;
  co_no?: string;
  customer_name?: string;
  pwo_ids: string[];
  required_kgs: string;
}
 
export interface YarnPurchaseOrder {
  id?: number;
  rec_no?: string;
  rec_date: string;
  supplier_id: string;
  order_through: string;
  agent_id: string;
  commission_pct: string;
  rate_type: string;
  sup_address: string;
  sup_pin_code: string;
  sup_district: string;
  sup_state: string;
  sup_country: string;
  sup_gst_no: string;
  billing_same_as_supplier: string;
  billing_supplier_id: string;
  bill_address: string;
  bill_pin_code: string;
  bill_district: string;
  bill_state: string;
  bill_country: string;
  bill_gst_no: string;
  mill_same_as_supplier: string;
  mill_supplier_id: string;
  mill_address: string;
  mill_pin_code: string;
  mill_district: string;
  mill_state: string;
  mill_country: string;
  mill_gst_no: string;
  // company_address_id doubles as "Company (Print Header)" — which entity's
  // logo/name/address/GSTIN prints on this PO's letterhead.
  company_address_id: string;
  comp_address: string;
  comp_pin_code: string;
  comp_district: string;
  comp_state: string;
  comp_country: string;
  comp_gst_no: string;
  exp_delivery: string;
  payment_term_id: string;
  transport_freight_terms: string;
  // NEW — print-only fields, mirroring the Fabric PO letterhead fields.
  due_date?: string;
  place_of_supply?: string;
  advance?: number;
  description?: string;
  items: YarnPOItem[];
  co_links: YarnPOCoLink[];
  status: string;
  supplier_name?: string;
}
 
export interface YarnPOListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}
 
export interface YarnPOListResponse {
  data: YarnPurchaseOrder[];
  total: number;
  page: number;
  limit: number;
}
 
/* ── Helpers ── */
 
export function computeYarnPOItem(item: YarnPOItem): YarnPOItem {
  const pkgs = parseFloat(item.no_of_packages) || 0;
  const wpp  = parseFloat(item.weight_per_package) || 0;
  const cw   = parseFloat(item.cone_weight) || 0;
  const rate = parseFloat(item.rate) || 0;
  const disc = parseFloat(item.discount_pct) || 0;
  const gst  = parseFloat(item.gst_pct) || 0;
  const sgst = parseFloat(item.sgst_pct) || 0;
  const igst = parseFloat(item.igst_pct) || 0;
 
  const total_weight       = (pkgs * wpp).toFixed(3);
  const no_of_cone_per_bag = cw > 0 ? (wpp / cw).toFixed(2) : '';
  const rawValue           = pkgs * wpp * rate;
  const total_po_value     = (rawValue - rawValue * (disc / 100)).toFixed(2);
  const poVal   = parseFloat(total_po_value) || 0;
  const net_value = (poVal + poVal * (gst / 100) + poVal * (sgst / 100) + poVal * (igst / 100)).toFixed(2);
 
  return { ...item, total_weight, no_of_cone_per_bag, total_po_value, net_value };
}
 
export function blankYarnPOItem(): YarnPOItem {
  return {
    _id: `item-${Date.now()}-${Math.random()}`,
    yarn_id: '', count_for_po: '', hsn_code: '', hsn_code_id: '', lot_no: '',
    uom_id: '', package_type: '', no_of_packages: '', weight_per_package: '',
    total_weight: '', cone_weight: '', no_of_cone_per_bag: '',
    rate: '', discount_type_id: '', discount_pct: '', total_po_value: '',
    instructions: '', gst_pct: '', sgst_pct: '', igst_pct: '', net_value: '',
  };
}
 
export function blankYarnPOCoLink(): YarnPOCoLink {
  return { _id: `co-${Date.now()}-${Math.random()}`, co_id: '', pwo_ids: [], required_kgs: '' };
}
 
export const BLANK_YARN_PO: YarnPurchaseOrder = {
  rec_date: new Date().toISOString().slice(0, 10),
  supplier_id: '', order_through: 'Direct', agent_id: '', commission_pct: '', rate_type: 'Net rate',
  sup_address: '', sup_pin_code: '', sup_district: '', sup_state: '', sup_country: '', sup_gst_no: '',
  billing_same_as_supplier: 'Yes', billing_supplier_id: '',
  bill_address: '', bill_pin_code: '', bill_district: '', bill_state: '', bill_country: '', bill_gst_no: '',
  mill_same_as_supplier: 'Yes', mill_supplier_id: '',
  mill_address: '', mill_pin_code: '', mill_district: '', mill_state: '', mill_country: '', mill_gst_no: '',
  company_address_id: '',
  comp_address: '', comp_pin_code: '', comp_district: '', comp_state: '', comp_country: '', comp_gst_no: '',
  exp_delivery: '', payment_term_id: '', transport_freight_terms: 'Paid',
  due_date: '', place_of_supply: '', advance: 0, description: '',
  items: [], co_links: [],
  status: 'Draft',
};
 
/* ── API calls ── */
 
/** GET /yarn-purchase-orders/meta/lookup */
export const getYarnPOLookup = (): Promise<{ data: YarnPOLookupData }> =>
  api.get('/yarn-purchase-orders/meta/lookup');
 
/** GET /yarn-purchase-orders?search=…&status=…&page=…&limit=… */
export const getYarnPurchaseOrders = (
  params: YarnPOListParams = {},
): Promise<{ data: YarnPOListResponse }> => {
  const qs = new URLSearchParams();
  if (params.search) qs.append('search', params.search);
  if (params.status) qs.append('status', params.status);
  qs.append('page',  String(params.page  ?? 1));
  qs.append('limit', String(params.limit ?? 10));
  return api.get(`/yarn-purchase-orders?${qs.toString()}`);
};
 
/** GET /yarn-purchase-orders/:id */
export const getYarnPurchaseOrderById = (
  id: number,
): Promise<{ data: YarnPurchaseOrder }> =>
  api.get(`/yarn-purchase-orders/${id}`);
 
/** POST /yarn-purchase-orders */
export const createYarnPurchaseOrder = (
  data: YarnPurchaseOrder,
): Promise<{ data: YarnPurchaseOrder }> =>
  api.post('/yarn-purchase-orders', data);
 
/** PUT /yarn-purchase-orders/:id */
export const updateYarnPurchaseOrder = (
  id: number,
  data: YarnPurchaseOrder,
): Promise<{ data: YarnPurchaseOrder }> =>
  api.put(`/yarn-purchase-orders/${id}`, data);
 
/** DELETE /yarn-purchase-orders/:id */
export const deleteYarnPurchaseOrder = (
  id: number,
): Promise<{ data: { message: string } }> =>
  api.delete(`/yarn-purchase-orders/${id}`);
 

  export interface YPIPurchaseOrderOption {
  id: number;
  po_no: string;
  rec_date: string;
  supplier_name: string;
  supplier_id: number;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;
  gst_no: string;
  billing_supplier_name: string;
  bill_address: string;
  bill_pin_code: string;
  bill_district: string;
  bill_state: string;
  bill_country: string;
  bill_gst_no: string;
  mill_supplier_name: string;
  mill_address: string;
  mill_pin_code: string;
  mill_district: string;
  mill_state: string;
  mill_country: string;
  mill_gst_no: string;
}
 
export interface YPIPOItemOption {
  po_id: number;
  po_item_id: number;
  yarn_id: number;
  count_desc: string;
  yarn_code: string;
  hsn_code: string;
  lot_no: string;
  count_for_po: string;
  po_kgs: string;
  packing_type: string;
  weight_per_package: string;
  cone_weight: string;
  no_of_cones: string;
  rate: string;
  discount_type: string;
  discount_pct: string;
  cgst_pct: string;
  sgst_pct: string;
  igst_pct: string;
}
 
export interface YPILocationOption {
  id: number;
  name: string;
  type: 'In-house' | 'Factory Location';
}
 
export interface YPILookupData {
  purchaseOrders: YPIPurchaseOrderOption[];
  poItems: YPIPOItemOption[];
  inwardLocations: YPILocationOption[];
}
 
// ─── Inward Item (TAB 2) ──────────────────────────────────────────────────────
 
export interface YarnInwardItem {
  _id: string;           // client-only key
  id?: number;
 
  invoice_no: string;
  invoice_date: string;
 
  // autofill from PO line
  yarn_id: string;
  count_desc: string;
  hsn_code: string;
  lot_no: string;
  po_kgs: string;
 
  received_kgs: string;  // required
 
  packing_type: string;
  weight_per_package: string;
  no_of_cones: string;
  cone_weight: string;
  unit: string;
 
  rate: string;
  discount_type: string;
  discount_pct: string;
  discount_value: string; // computed
 
  spl_instructions: string;
 
  cgst_pct: string;
  sgst_pct: string;
  igst_pct: string;
 
  // computed (generated column in DB)
  basic_value?: string;
  net_value?: string;
}
 
// ─── Weigh Bridge (TAB 3) ─────────────────────────────────────────────────────
 
export interface YarnInwardWeighbridge {
  load_wt_no: string;
  load_wt: string;
  empty_wt_no: string;
  empty_wt: string;
  // computed on read: net_wt = load_wt - empty_wt
  net_wt?: string;
  yarn_inward_total_wt: string;
  // computed: difference = net_wt - yarn_inward_total_wt
  difference?: string;
  remarks: string;
  no_of_packages: string;
  yarn_wt: string;
  total_yarn_wt: string;
}
 
// ─── Main Inward Record ───────────────────────────────────────────────────────
 
export interface YarnPurchaseInward {
  id?: number;
  inward_no?: string;        // auto-generated
  inward_date: string;
  po_id: string;
  inward_status: 'DRAFT' | 'APPROVED';
 
  // Autofill from PO supplier
  supplier_id: string;
  sup_address: string;
  sup_pin_code: string;
  sup_district: string;
  sup_state: string;
  sup_country: string;
  sup_gst_no: string;
 
  // Autofill from PO billing
  billing_supplier_name: string;
  bill_address: string;
  bill_pin_code: string;
  bill_district: string;
  bill_state: string;
  bill_country: string;
  bill_gst_no: string;
 
  // Autofill from PO mill
  mill_name: string;
  mill_address: string;
  mill_pin_code: string;
  mill_district: string;
  mill_state: string;
  mill_country: string;
  mill_gst_no: string;
 
  // Transport
  trans_type: string;
  transport: string;
  transporter_name: string;
  vehicle_no: string;
  transport_ref_no: string;
 
  // Location
  inward_type: 'In-house' | 'Factory Location';
  inward_location_id: string;
  inward_location_name: string;
 
  // Tax totals (computed)
  net_value: string;
  t_cgst_value: string;
  t_sgst_value: string;
  t_igst_value: string;
  t_value: string;
 
  // Inspection (TAB 4)
  inspection_completed: 'Yes' | 'No';
  approved_qty: string;
  rejected_qty: string;
 
  // Child records
  items: YarnInwardItem[];
  weighbridge: YarnInwardWeighbridge | null;
 
  // Joined (read-only)
  supplier_name?: string;
  po_no?: string;
}
 
// ─── List params / response ───────────────────────────────────────────────────
 
export interface YPIListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}
 
export interface YPIListResponse {
  data: YarnPurchaseInward[];
  total: number;
  page: number;
  limit: number;
}
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
/** Compute discount_value & net_value for a single inward item (client-side). */
export function computeYPIItem(item: YarnInwardItem): YarnInwardItem {
  const kgs   = parseFloat(item.received_kgs)     || 0;
  const rate  = parseFloat(item.rate)              || 0;
  const disc  = parseFloat(item.discount_pct)      || 0;
  const cgst  = parseFloat(item.cgst_pct)          || 0;
  const sgst  = parseFloat(item.sgst_pct)          || 0;
  const igst  = parseFloat(item.igst_pct)          || 0;
 
  const gross         = kgs * rate;
  const discount_value = (gross * disc / 100).toFixed(4);
  const basic_value   = (gross - parseFloat(discount_value)).toFixed(4);
  const bv            = parseFloat(basic_value);
  const net_value     = (bv + bv * cgst / 100 + bv * sgst / 100 + bv * igst / 100).toFixed(4);
 
  return { ...item, discount_value, basic_value, net_value };
}
 
/** Compute net_wt and difference for weigh-bridge (client-side). */
export function computeWeighbridge(wb: YarnInwardWeighbridge): YarnInwardWeighbridge {
  const load  = parseFloat(wb.load_wt)              || 0;
  const empty = parseFloat(wb.empty_wt)             || 0;
  const total = parseFloat(wb.yarn_inward_total_wt) || 0;
  const net_wt    = (load - empty).toFixed(4);
  const difference = (parseFloat(net_wt) - total).toFixed(4);
  return { ...wb, net_wt, difference };
}
 
/** Blank inward item. */
export function blankYPIItem(): YarnInwardItem {
  return {
    _id: `item-${Date.now()}-${Math.random()}`,
    invoice_no: '', invoice_date: '',
    yarn_id: '', count_desc: '', hsn_code: '', lot_no: '', po_kgs: '',
    received_kgs: '',
    packing_type: '', weight_per_package: '', no_of_cones: '', cone_weight: '', unit: 'KGS',
    rate: '', discount_type: '', discount_pct: '', discount_value: '',
    spl_instructions: '',
    cgst_pct: '', sgst_pct: '', igst_pct: '',
  };
}
 
/** Blank weighbridge. */
export const BLANK_WEIGHBRIDGE: YarnInwardWeighbridge = {
  load_wt_no: '', load_wt: '', empty_wt_no: '', empty_wt: '',
  yarn_inward_total_wt: '', remarks: '', no_of_packages: '', yarn_wt: '', total_yarn_wt: '',
};
 
/** Default blank Inward (use when opening the create form). */
export const BLANK_YARN_INWARD: YarnPurchaseInward = {
  inward_date: new Date().toISOString().slice(0, 10),
  po_id: '',
  inward_status: 'DRAFT',
 
  supplier_id: '', sup_address: '', sup_pin_code: '', sup_district: '',
  sup_state: '', sup_country: '', sup_gst_no: '',
 
  billing_supplier_name: '', bill_address: '', bill_pin_code: '', bill_district: '',
  bill_state: '', bill_country: '', bill_gst_no: '',
 
  mill_name: '', mill_address: '', mill_pin_code: '', mill_district: '',
  mill_state: '', mill_country: '', mill_gst_no: '',
 
  trans_type: '', transport: '', transporter_name: '', vehicle_no: '', transport_ref_no: '',
 
  inward_type: 'In-house',
  inward_location_id: '', inward_location_name: '',
 
  net_value: '', t_cgst_value: '', t_sgst_value: '', t_igst_value: '', t_value: '',
 
  inspection_completed: 'No', approved_qty: '', rejected_qty: '',
 
  items: [],
  weighbridge: null,
};
 
// ─── API Calls ────────────────────────────────────────────────────────────────
 
const BASE = '/yarn-purchase-inward';
 
/** GET /yarn-purchase-inward/meta/lookup */
export const getYPILookup = (): Promise<{ data: YPILookupData }> =>
  api.get(`${BASE}/meta/lookup`);
 
/** GET /yarn-purchase-inward?search=…&status=…&page=…&limit=… */
export const getYarnPurchaseInwards = (
  params: YPIListParams = {},
): Promise<{ data: YPIListResponse }> => {
  const qs = new URLSearchParams();
  if (params.search) qs.append('search', params.search);
  if (params.status) qs.append('status', params.status);
  qs.append('page',  String(params.page  ?? 1));
  qs.append('limit', String(params.limit ?? 10));
  return api.get(`${BASE}?${qs.toString()}`);
};
 
/** GET /yarn-purchase-inward/:id */
export const getYarnPurchaseInwardById = (
  id: number,
): Promise<{ data: YarnPurchaseInward }> =>
  api.get(`${BASE}/${id}`);
 
/** POST /yarn-purchase-inward */
export const createYarnPurchaseInward = (
  data: YarnPurchaseInward,
): Promise<{ data: YarnPurchaseInward }> =>
  api.post(BASE, data);
 
/** PUT /yarn-purchase-inward/:id */
export const updateYarnPurchaseInward = (
  id: number,
  data: YarnPurchaseInward,
): Promise<{ data: YarnPurchaseInward }> =>
  api.put(`${BASE}/${id}`, data);
 
/** DELETE /yarn-purchase-inward/:id */
export const deleteYarnPurchaseInward = (
  id: number,
): Promise<{ data: { message: string } }> =>
  api.delete(`${BASE}/${id}`);

  
 
// ── Option A: if your project exports an axios instance ──────
// import { api } from './axiosInstance';   ← use this if you have one
// const client = api;
//
// ── Option B: plain axios (no shared instance needed) ────────
const client = api.create({ baseURL: '/' });
 
// ─── Types ───────────────────────────────────────────────────
 
// Use a local type alias so it never conflicts with a global Status type
export type EmployeeStatus   = 'Active' | 'Inactive';
export type EmployeeCategory = 'User' | 'Admin';
 
export interface Employee {
  id?:               number;
  employee_code?:    string;
  employee_name:     string;
  address:           string;
  pin_code:          string;
  password:          string;
  district:          string;
  state:             string;
  contact_number:    string;
  designation_id:    string;
  employee_category: EmployeeCategory;
  unit_id:           string;
  status:            EmployeeStatus;   // ← no longer conflicts
  // joined from DB
  designation_name?: string;
  unit_name?:        string;
}
 
export interface LookupData {
  designations: { id: number; description: string }[];
  units:        { id: number; unit_name: string }[];
}
 
export interface ListResponse { data: Employee[]; total: number; }
 
export interface ListParams {
  search?:   string;
  page?:     number;
  limit?:    number;
  category?: string;
  Status?:   EmployeeStatus | '';   // typed, not raw string
  unit?:     string;
}
 
// ─── Service ─────────────────────────────────────────────────
 
export const employeeService = {
 
  async list(params: ListParams = {}): Promise<ListResponse> {
    const { data } = await client.get<ListResponse>(BASE, {
      params: {
        search:   params.search   ?? '',
        page:     params.page     ?? 1,
        limit:    params.limit    ?? 10,
        ...(params.category ? { category: params.category } : {}),
        ...(params.status   ? { status:   params.status }   : {}),
        ...(params.unit     ? { unit:     params.unit }     : {}),
      },
    });
    return data;
  },
 
  async get(id: number): Promise<Employee> {
    const { data } = await client.get<Employee>(`${BASE}/${id}`);
    return data;
  },
 
  async create(emp: Employee): Promise<Employee> {
    const { data } = await client.post<Employee>(BASE, emp);
    return data;
  },
 
  async update(id: number, emp: Employee): Promise<Employee> {
    const { data } = await client.put<Employee>(`${BASE}/${id}`, emp);
    return data;
  },
 
  async remove(id: number): Promise<void> {
    await client.delete(`${BASE}/${id}`);
  },
 
  async lookup(): Promise<LookupData> {
    const { data } = await client.get<LookupData>(`${BASE}/meta/lookup`);
    return data;
  },
};



export const getClientProfile = (userId: number) =>
  api.get(`/client-profile?user_id=${userId}`).then(r => r.data);

export const saveClientProfile = (payload: Record<string, unknown>) =>
  api.put('/client-profile', payload).then(r => r.data);

/* ── Client Notifications ─────────────────────────────── */
export const getClientNotifications = (
  customerId: string,
  opts?: { limit?: number; unread_only?: boolean }
) => {
  const params = new URLSearchParams({ customer_id: customerId });
  if (opts?.limit)       params.set('limit',       String(opts.limit));
  if (opts?.unread_only) params.set('unread_only',  'true');
  return api.get(`/client-notifications?${params}`).then(r => r.data);
};

export const markNotificationRead = (id: number) =>
  api.patch(`/client-notifications/${id}/read`).then(r => r.data);

export const markAllNotificationsRead = (customerId: string) =>
  api.patch(`/client-notifications/read-all?customer_id=${customerId}`).then(r => r.data);

export const deleteNotification = (id: number) =>
  api.delete(`/client-notifications/${id}`).then(r => r.data);


export type PaymentStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
 
export interface InvoiceRow {
  id: number;
  invoice_no: string;          // Sales Invoice No. (Payment In) OR PO No. (Payment Out)
  invoice_date: string;        // Invoice date OR PO order date
  invoice_amount: number;      // Invoice amount OR PO order amount
  payment_terms_days: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  status: PaymentStatus;
}
 
export interface SalesInvoiceRow extends InvoiceRow {
  customer_name: string;
}
 
export interface PurchaseOrderRow extends InvoiceRow {
  supplier_name: string;
}
 

 
export interface AccountPagedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
 
export interface AccountSummary {
  sales_invoice_count: number;
  sales_invoice_total: number;
  purchase_invoice_count: number;   // count of purchase orders (field name kept for backward compatibility)
  purchase_invoice_total: number;   // total value of purchase orders
  payment_in_total: number;
  payment_out_total: number;
  receivable_balance: number;
  payable_balance: number;
}
 
const ACCOUNT_BASE = '/account-details';
 
// ─── Sales Invoices / Payment IN ─────────────────────────────────────────────
 
export const fetchSalesInvoices = async (params: {
  search?: string; status?: string; page?: number; limit?: number;
}): Promise<AccountPagedResult<SalesInvoiceRow>> => {
  const { data } = await api.get<AccountPagedResult<SalesInvoiceRow>>(
    `${ACCOUNT_BASE}/sales-invoices`,
    {
      params: {
        search: params.search ?? '',
        status: params.status ?? '',
        page: params.page ?? 1,
        limit: params.limit ?? 10,
      },
    }
  );
  return data;
};
 
export const fetchSalesInvoicePayments = async (invoiceId: number): Promise<PaymentEntry[]> => {
  const { data } = await api.get<PaymentEntry[]>(
    `${ACCOUNT_BASE}/sales-invoices/${invoiceId}/payments`
  );
  return data;
};
 
export const recordPaymentIn = async (payload: {
  sales_invoice_id: number; amount: number; payment_date: string;
  mode: string; reference_no?: string; notes?: string;
}): Promise<{ id: number; message: string }> => {
  const { data } = await api.post<{ id: number; message: string }>(
    `${ACCOUNT_BASE}/payments-in`,
    payload
  );
  return data;
};
 
export const deletePaymentIn = async (id: number): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(`${ACCOUNT_BASE}/payments-in/${id}`);
  return data;
};
 
// ─── Purchase Orders / Payment OUT ───────────────────────────────────────────
 
export const fetchPurchaseOrders = async (params: {
  search?: string; status?: string; page?: number; limit?: number;
}): Promise<AccountPagedResult<PurchaseOrderRow>> => {
  const { data } = await api.get<AccountPagedResult<PurchaseOrderRow>>(
    `${ACCOUNT_BASE}/purchase-orders`,
    {
      params: {
        search: params.search ?? '',
        status: params.status ?? '',
        page: params.page ?? 1,
        limit: params.limit ?? 10,
      },
    }
  );
  return data;
};
 
export const fetchPurchaseOrderPayments = async (orderId: number): Promise<PaymentEntry[]> => {
  const { data } = await api.get<PaymentEntry[]>(
    `${ACCOUNT_BASE}/purchase-orders/${orderId}/payments`
  );
  return data;
};
 

 
export const deletePaymentOut = async (id: number): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(`${ACCOUNT_BASE}/payments-out/${id}`);
  return data;
};
 
// ─── Summary cards ────────────────────────────────────────────────────────────
 
export const fetchAccountSummary = async (): Promise<AccountSummary> => {
  const { data } = await api.get<AccountSummary>(`${ACCOUNT_BASE}/summary`);
  return data;
};

export interface FabricStockMasterRow {
  fpo_id: number;
  fpo_no: string;
  fpo_date: string;
  supplier: string;
  sort_no?: string;
  order_meter: number;
  inward_meter: number;
  last_inward_date?: string | null;
  inward_count?: number;
}
 
export interface FabricPackingListRow {
  id: number;
  piece_no: string;
  new_piece_no: string;
  meter: number;
  fpi_no: string;
  fpi_date: string;
  fpo_no: string;
  supplier: string;
  sort_no?: string;
  lot_no?: string;
  dc_no?: string;
  dc_date?: string;
  inward_to?: string;
  purchase_invoice_no?: string;
}
 
export interface FabricStockSummary {
  total_ordered: number;
  total_inward: number;
  fpo_count: number;
  fpi_count: number;
}
 
export const getFabricStockMaster = async () => {
  const res = await api.get("/fabric-stock/master");
  return res.data;
};
 
export const getFabricPackingList = async (filters?: {
  fpo_no?: string;
  sort_no?: string;
  lot_no?: string;
}) => {
  const res = await api.get("/fabric-stock/packing-list", { params: filters });
  return res.data;
};
 
export const getFabricStockSummary = async () => {
  const res = await api.get("/fabric-stock/summary");
  return res.data;
};
 


export interface FabricStockPiece {
  id: number;            // "Fabric Stock ID" == fpi_items.id
  fpi_id: number;
  fpi_no: string;
  fpi_date?: string | null;
  fpo_no: string;
  supplier: string;
  inward_to: string;
  sort_no: string;
  construction: string;
  hsn_code: string;
  lot_no: string;
  piece_no: string;
  new_piece_no: string;
  meter: number;
}
 
export interface PackingListItem {
  id?: number;
  fpi_item_id: number | null;   // Fabric Stock ID
  fpi_id?: number | null;
  fpi_no?: string;
  sort_no?: string;
  construction?: string;
  piece_no: string;
  new_piece_no?: string;
  meter: number;
  gross_wt: number;
  net_wt: number;
}
 
export interface PackingListPayload {
  id?: number;
  pl_no: string;
  pl_date: string;
  order_id?: number | null;
  order_code?: string;
  sort_no?: string;
  quality?: string;
  customer_id?: number | null;
  customer_name?: string;
  billing_address?: string;
  billing_pincode?: string;   // NEW
  billing_state?: string;     // NEW
  billing_country?: string;   // NEW
  billing_gst?: string;
  delivery_name?: string;
  delivery_address?: string;
  delivery_pincode?: string;  // NEW
  delivery_state?: string;    // NEW
  delivery_country?: string;  // NEW
  delivery_gst?: string;
  transport_name?: string;
  vehicle_no?: string;
  firm?: string;
  prepared_by?: string;
  remarks?: string;
  total_pieces?: number;
  total_meter?: number;
  total_gross_wt?: number;
  total_net_wt?: number;
  status?: "draft" | "finalized" | "invoiced";
  invoice_no?: string | null;
  items: PackingListItem[];
}

export interface OrderSnapshot {
  order_id: number;
  order_code: string;
  sort_no: string;
  quality: string;
  customer_id: number | null;
  customer_name: string;
  billing_address: string;
  billing_pincode: string;   // NEW
  billing_state: string;     // NEW
  billing_country: string;   // NEW
  billing_gst: string;
  delivery_name: string;
  delivery_address: string;
  delivery_pincode: string;  // NEW
  delivery_state: string;    // NEW
  delivery_country: string;  // NEW
  delivery_gst: string;
  transport_name: string;
  vehicle_no: string;
  firm: string;
}
 
// ── Fabric Packing List CRUD ──────────────────────────────────────────────
 
export const getNextPlNo = () =>
  api.get("/fabric-packing-list/next-pl-no");
 
export const getFabricPackingLists = () =>
  api.get("/fabric-packing-list");
 
export const getFabricPackingListById = (id: number | string) =>
  api.get(`/fabric-packing-list/${id}`);
 
export const createFabricPackingList = (payload: PackingListPayload) =>
  api.post("/fabric-packing-list", payload);
 
export const updateFabricPackingList = (id: number, payload: PackingListPayload) =>
  api.put(`/fabric-packing-list/${id}`, payload);
 
export const deleteFabricPackingList = (id: number) =>
  api.delete(`/fabric-packing-list/${id}`);
 

 
// ── Autofill helpers ───────────────────────────────────────────────────
 
export const getOrderSnapshotForPacking = (orderId: number) =>
  api.get(`/fabric-packing-list/order/${orderId}`);
 
export const getAvailableFabricStock = (params?: { sort_no?: string; search?: string }) =>
  api.get("/fabric-packing-list/available-stock", { params });


const YARN_STOCK_PATH = '/yarn-stock';
 
export interface YarnStockSummaryRow {
  yarn_id: number;
  count_desc: string;
  yarn_code: string | null;
  hsn_code: string | null;
  pieces: number;
  total_kgs: number;
  suppliers: string;
  locations: string;
  last_inward_date: string;
  stock_level: 'Healthy' | 'Low' | 'Out of Stock';
}
 
export interface YarnStockDetailRow {
  item_id: number;
  inward_id: number;
  inward_no: string;
  inward_date: string;
  inward_status: string;
  inward_type: string;
  supplier_id: number | null;
  supplier_name: string | null;
  inward_location_id: number | null;
  location_name: string | null;
  yarn_id: number | null;
  yarn_code: string | null;
  count_desc: string;
  hsn_code: string | null;
  lot_no: string | null;
  received_kgs: number;
  packing_type: string | null;
  no_of_cones: number | null;
  rate: number | null;
}
 
export interface YarnStockStats {
  total_kgs: number;
  total_pieces: number;
  total_counts: number;
  total_locations: number;
}
 
export interface YarnStockMeta {
  locations: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
}
 
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
 
export interface YarnStockFilters {
  search?: string;
  location?: string;
  supplier?: string;
  page?: number;
  limit?: number;
}
 
function cleanParams(filters: YarnStockFilters = {}) {
  const out: Record<string, string | number> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v as any;
  });
  return out;
}
 


export interface YarnPackingListItem {
  id?: number;
  yarn_item_id: number | null;
  lot_no?: string;
  count_desc?: string;
  hsn_code?: string;
  received_kgs: number;
  packed_kgs: number;
  rate?: number;
  supplier_name?: string;
  location_name?: string;
}
 
export interface YarnPackingListPayload {
  id?: number;
  pl_no: string;
  pl_date: string;
 
  order_id: number | null;
  order_code: string;
  count_desc: string;   // yarn count / sort no
  quality: string;
 
  customer_id: number | null;
  customer_name: string;
 
  billing_address: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_gst: string;
 
  delivery_name: string;
  delivery_address: string;
  delivery_pincode: string;
  delivery_state: string;
  delivery_country: string;
  delivery_gst: string;
 
  transport_name: string;
  vehicle_no: string;
  firm: string;
 
  prepared_by: string;
  remarks: string;
 
  total_pieces?: number;
  total_kgs?: number;
 
  status?: 'draft' | 'finalized' | 'invoiced';
  invoice_id?: number | null;
  invoice_no?: string | null;
 
  items: YarnPackingListItem[];
}
 
// A single unpacked lot as returned by /yarn-packing-list/available-stock
// (also matches a Yarn Stock → Piece Detail row).
export interface YarnStockPiece {
  id: number;               // yarn stock item id (== yarn_item_id on the packing line)
  item_id?: number;
  lot_no?: string;
  count_desc?: string;
  hsn_code?: string;
  received_kgs: number;
  rate?: number;
  supplier_name?: string;
  location_name?: string;
  inward_no?: string;
  inward_date?: string;
}
 
// Re-uses the same OrderSnapshot shape as Fabric Packing List where
// possible; yarn adds count_desc instead of sort_no.
export interface YarnOrderSnapshot {
  order_id: number;
  order_code: string;
  count_desc: string;
  quality: string;
  customer_id: number | null;
  customer_name: string;
  billing_address: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_gst: string;
  delivery_name: string;
  delivery_address: string;
  delivery_pincode: string;
  delivery_state: string;
  delivery_country: string;
  delivery_gst: string;
  transport_name: string;
  vehicle_no: string;
  firm: string;
}
 
// ── Yarn Packing List CRUD ────────────────────────────────────────────────
 
export const getYarnPackingLists = () =>
  api.get('/yarn-packing-list');
 
export const getYarnPackingListById = (id: number) =>
  api.get(`/yarn-packing-list/${id}`);
 
export const createYarnPackingList = (payload: YarnPackingListPayload) =>
  api.post('/yarn-packing-list', payload);
 
export const updateYarnPackingList = (id: number, payload: YarnPackingListPayload) =>
  api.put(`/yarn-packing-list/${id}`, payload);
 
export const deleteYarnPackingList = (id: number) =>
  api.delete(`/yarn-packing-list/${id}`);
 
export const convertYarnPackingListToInvoice = (id: number) =>
  api.post(`/yarn-packing-list/${id}/convert-to-invoice`);
 
export const getNextYarnPlNo = () =>
  api.get('/yarn-packing-list/next-pl-no');
 
export const getOrderSnapshotForYarnPacking = (orderId: number) =>
  api.get(`/yarn-packing-list/order/${orderId}`);
 
export const getAvailableYarnStock = (params: { count_desc?: string; search?: string }) =>
  api.get('/yarn-packing-list/available-stock', { params });


export interface ManualFabricStockPayload {
  entry_date: string;
  sort_no: string;
  construction?: string;
  hsn_code?: string;
  supplier?: string;
  inward_to?: string;
  lot_no?: string;
  piece_no?: string;
  new_piece_no?: string;
  meter: number;
  remarks?: string;
}

export const getFabricStock = async () => {
  const res = await api.get("/fabric-stock");
  return res.data;
};

export const addManualFabricStock = async (payload: ManualFabricStockPayload) => {
  const res = await api.post("/fabric-stock/manual", payload);
  return res.data;
};

export const deleteManualFabricStock = async (id: number) => {
  const res = await api.delete(`/fabric-stock/manual/${id}`);
  return res.data;
};

export const getFabricStockFilters = async () => {
  const res = await api.get("/fabric-stock/filters");
  return res.data;
};

export const updateManualFabricStock = async (id: number, payload: ManualFabricStockPayload) => {
  const res = await api.put(`/fabric-stock/manual/${id}`, payload);
  return res.data;
};

export interface YarnStockMetaOption {
  id: string;
  name: string;
}
 

 


 
export interface YarnStockStats {
  total_kgs: number;
  inward_kgs?: number;
  manual_kgs?: number;
  total_pieces: number;
  total_counts: number;
  total_locations: number;
}
 
export interface YarnStockFilters {
  search?: string;
  location?: string;
  supplier?: string;
  page?: number;
  limit?: number;
}
 
export interface ManualYarnStockPayload {
  entry_date: string;
  count_desc: string;
  yarn_code?: string;
  hsn_code?: string;
  supplier_name?: string;
  location_name?: string;
  lot_no?: string;
  received_kgs: number;
  rate?: number | string;
  remarks?: string;
}
 
export const yarnStockService = {
  getMeta: async (): Promise<YarnStockMeta> => {
    const r = await api.get('/yarn-stock/meta');
    return r.data;
  },
 
  getSummary: async (
    filters: YarnStockFilters = {},
  ): Promise<{ data: YarnStockSummaryRow[]; total: number; page: number; limit: number; stats: YarnStockStats }> => {
    const r = await api.get('/yarn-stock/summary', { params: filters });
    return r.data;
  },
 
  getDetail: async (
    filters: YarnStockFilters = {},
  ): Promise<{ data: YarnStockDetailRow[]; total: number; page: number; limit: number }> => {
    const r = await api.get('/yarn-stock/detail', { params: filters });
    return r.data;
  },
 
  // ── Manual "Add In-Stock" entries ──
  addManual: async (payload: ManualYarnStockPayload): Promise<{ id: number }> => {
    const r = await api.post('/yarn-stock/manual', payload);
    return r.data;
  },
 
  updateManual: async (id: number, payload: ManualYarnStockPayload): Promise<{ id: number }> => {
    const r = await api.put(`/yarn-stock/manual/${id}`, payload);
    return r.data;
  },
 
  deleteManual: async (id: number): Promise<{ success: boolean }> => {
    const r = await api.delete(`/yarn-stock/manual/${id}`);
    return r.data;
  },
};

export interface FabricInvoiceItem {
  id?: number;
  s_no?: number;
  description: string;
  hsn_code: string;
  no_of_rolls: number;
  qty: number;
  rate: number;
  basic_value: number;
}
 
export interface FabricInvoicePayload {
  id?: number;
  invoice_no: string;
  invoice_date: string;
 
  pl_id: number;
  pl_no?: string;
  pl_date?: string;
 
  order_id?: number | null;
  order_code?: string;
  sort_no?: string;
  quality?: string;
 
  po_no?: string;
  confirm_by?: string;
  rate_type?: string;       // e.g. "EX-MILL"
  freight_terms?: string;   // "To Pay" | "Paid"
  e_way_no?: string;
 
  customer_id?: number | null;
  customer_name?: string;
  billing_address?: string;
  billing_pincode?: string;
  billing_state?: string;
  billing_country?: string;
  billing_gst?: string;
 
  consignee_name?: string;
  consignee_address?: string;
  consignee_pincode?: string;
  consignee_state?: string;
  consignee_country?: string;
  consignee_gst?: string;
 
  transport_name?: string;
  vehicle_no?: string;
  lr_no?: string;
  lr_date?: string;
  trans_mode?: string;
 
  firm?: string;
 
  total_rolls?: number;
  total_qty?: number;
  gross_wt?: number;
  net_wt?: number;
 
  rate?: number;
  basic_value?: number;
  discount_percent?: number;
  discount_amount?: number;
  sub_total?: number;
  cgst_percent?: number;
  cgst_amount?: number;
  sgst_percent?: number;
  sgst_amount?: number;
  igst_percent?: number;
  igst_amount?: number;
  tcs_percent?: number;
  tcs_amount?: number;
  round_off?: number;
  grand_total?: number;
 
  payment_terms?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account_no?: string;
  ifsc_code?: string;
  bank_agent?: string;
 
  irn?: string;
  ack_no?: string;
  ack_date?: string;
  policy_no?: string;
 
  prepared_by?: string;
  checked_by?: string;
  authorised_by?: string;
 
  status?: string;
  items?: FabricInvoiceItem[];
}
 
// ── API calls ─────────────────────────────────────────────────────────────
// NOTE: no leading "/api" here — `api` (axios instance) already has
// baseURL 'http://localhost:5000/api', same as your other services calls.
 
export const getFabricInvoices = () => api.get("/fabric-invoices");
 
export const getFabricInvoiceById = (id: number) =>
  api.get(`/fabric-invoices/${id}`);
 
export const getNextFabricInvoiceNoPreview = (firm?: string) =>
  api.get("/fabric-invoices/next-no", { params: { firm } });
 
// This is the function FabricPackingList.tsx already calls — point it here.
export const convertPackingListToInvoice = (
  plId: number,
  extraFields?: Partial<FabricInvoicePayload>
) => api.post(`/fabric-invoices/from-packing-list/${plId}`, extraFields || {});
 
export const updateFabricInvoice = (id: number, payload: Partial<FabricInvoicePayload>) =>
  api.put(`/fabric-invoices/${id}`, payload);
 
export const cancelFabricInvoice = (id: number) =>
  api.delete(`/fabric-invoices/${id}`);
 
export const completeFabricInvoice = (id: number) =>
  api.post(`/fabric-invoices/${id}/complete`);
// api/services.ts
export const getFabricPackingListByNo = (plNo: string) =>
  api.get(`/fabric-packing-lists/by-no/${encodeURIComponent(plNo)}`);
export const deleteFabricInvoicePermanent = (id: number | string) =>
  api.delete(`/fabric-invoices/${id}/permanent`);

export const getOrderCommercialDefaults = (orderId: number | string) =>
  api.get(`/fabric-invoices/order-defaults/${orderId}`);

export const getOrderOptions = (search?: string) =>
  api.get(`/fabric-invoices/order-options`, { params: { search } });

export const getOrderDebug = (orderId: number | string) =>
  api.get(`/fabric-invoices/order-debug/${orderId}`);

export const getSchemaDebug = () => api.get(`/fabric-invoices/schema-debug`);

export const getCompanies = (params?: { search?: string; status?: string; firm?: string; page?: number; limit?: number }) =>
  api.get('/company-details', { params });
 
export const getCompanyById = (id: number | string) =>
  api.get(`/company-details/${id}`);
 
export const getCompanyLookup = () =>
  api.get('/company-details/meta/lookup');
export const getCompanyByFirm = (firm: string) =>
  api.get(`/company-details/by-firm/${firm}`);
export const createCompany = (formData: FormData) =>
  api.post('/company-details', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
 
export const updateCompany = (id: number | string, formData: FormData) =>
  api.put(`/company-details/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
 
export const deleteCompany = (id: number | string) =>
  api.delete(`/company-details/${id}`);


export interface PurchaseInvoiceItem {
  id?: number;
  s_no?: number;
  sort_no: string;
  construction: string;
  hsn_code: string;
  qty: number;
  rate?: number;
  basic_value: number;
}

export interface FabricPurchaseInvoicePayload {
  id?: number;
  internal_ref_no?: string;
  invoice_no: string;
  invoice_date: string;
  fpo_id: number;
  fpo_no?: string;
  fpo_date?: string;
  supplier?: string;
  billing_from?: string;
  delivery_to?: string;
  pay_terms?: string;
  rate_type?: string;
  freight?: string;
  remarks?: string;
  total_qty: number;
  rate: number;
  basic_value: number;
  discount_percent: number;
  discount_amount: number;
  sub_total: number;
  cgst_pct: number;
  cgst_amt: number;
  sgst_pct: number;
  sgst_amt: number;
  igst_pct: number;
  igst_amt: number;
  round_off: number;
  net_value: number;
  payment_due_date?: string;
  prepared_by?: string;
  checked_by?: string;
  authorised_by?: string;
  status?: 'active' | 'completed' | 'cancelled';
  items: PurchaseInvoiceItem[];
}

export const getFabricPurchaseInvoices        = () => api.get('/fabric-purchase-invoices');
export const getFabricPurchaseInvoiceById     = (id: number) => api.get(`/fabric-purchase-invoices/${id}`);
export const getPurchaseInvoiceFpoOptions     = (search?: string) =>
  api.get('/fabric-purchase-invoices/fpo-options', { params: { search } });
export const getPurchaseInvoiceFpoDefaults    = (fpoId: number) =>
  api.get(`/fabric-purchase-invoices/fpo-defaults/${fpoId}`);
export const createPurchaseInvoiceFromFpo     = (fpoId: number, payload: Partial<FabricPurchaseInvoicePayload>) =>
  api.post(`/fabric-purchase-invoices/from-fpo/${fpoId}`, payload);
export const updateFabricPurchaseInvoice      = (id: number, payload: Partial<FabricPurchaseInvoicePayload>) =>
  api.put(`/fabric-purchase-invoices/${id}`, payload);
export const cancelFabricPurchaseInvoice      = (id: number) => api.delete(`/fabric-purchase-invoices/${id}`);
export const completeFabricPurchaseInvoice    = (id: number) => api.post(`/fabric-purchase-invoices/${id}/complete`);
export const deleteFabricPurchaseInvoicePermanent = (id: number) =>
  api.delete(`/fabric-purchase-invoices/${id}/permanent`);

export const convertFpoToPurchaseInvoice = (id: number | string, payload: { invoice_no: string; invoice_date: string }) =>
  api.post(`/fabric-purchase-orders/${id}/convert-to-invoice`, payload).then(r => r.data);


export interface PurchaseInvoiceRow {
  id: number;
  invoice_no: string;
  internal_ref?: string | null;
  fpo_no?: string | null;
  supplier_name: string;
  invoice_date: string;
  qty?: number | null;
  invoice_amount: number;
  payment_terms_days: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  status: PaymentStatus;
}

export const fetchPurchaseInvoices = (params: { search?: string; status?: string; page?: number; limit?: number }) =>
  api.get('/account-details/purchase-invoices', { params }).then(r => r.data);

export const fetchPurchaseInvoicePayments = (purchaseInvoiceId: number) =>
  api.get(`/account-details/purchase-invoices/${purchaseInvoiceId}/payments`).then(r => r.data);

export const recordPaymentOut = (payload: {
  purchase_invoice_id: number; amount: number; payment_date: string;
  mode: string; reference_no?: string; notes?: string;
}) => api.post('/account-details/payments-out', payload).then(r => r.data);


export type PaymentType = 'Full Payment' | 'Part Payment' | 'Deposit' | 'Advance';
 
export interface PaymentEntry {
  id: number;
  amount: number;
  tds_amount?: number;          // NEW
  payment_type?: PaymentType;   // NEW
  payment_date: string;
  mode: string;
  reference_no?: string | null;
  notes?: string | null;
  created_at: string;
}
 
export interface RecordPaymentInPayload {
  sales_invoice_id: number;
  amount: number;
  tds_amount?: number;          // NEW — defaults to 0 server-side if omitted
  payment_type?: PaymentType;   // NEW — defaults to 'Part Payment' server-side
  payment_date: string;
  mode: string;
  reference_no?: string;
  notes?: string;
}
 
export interface RecordPaymentOutPayload {
  purchase_invoice_id: number;
  amount: number;
  tds_amount?: number;          // NEW
  payment_type?: PaymentType;   // NEW
  payment_date: string;
  mode: string;
  reference_no?: string;
  notes?: string;
}
 
export interface SalesInvoiceRow {
  id: number;
  invoice_no: string;
  customer_name: string;
  invoice_date: string;
  invoice_amount: number;
  paid_amount: number;             // now = cash_paid_amount + tds_paid_amount
  cash_paid_amount?: number;       // NEW
  tds_paid_amount?: number;        // NEW
  balance: number;
  payment_terms_days: number;
  due_date: string;
  status: PaymentStatus;
}
 
export interface PurchaseInvoiceRow {
  id: number;
  invoice_no: string;
  supplier_name: string;
  invoice_date: string;
  invoice_amount: number;
  paid_amount: number;             // now = cash_paid_amount + tds_paid_amount
  cash_paid_amount?: number;       // NEW
  tds_paid_amount?: number;        // NEW
  balance: number;
  payment_terms_days: number;
  due_date: string;
  status: PaymentStatus;
}
 
export interface AccountSummary {
  sales_invoice_count: number;
  sales_invoice_total: number;
  purchase_invoice_count: number;
  purchase_invoice_total: number;
  payment_in_total: number;
  payment_in_cash?: number;        // NEW
  payment_in_tds?: number;         // NEW
  payment_out_total: number;
  payment_out_cash?: number;       // NEW
  payment_out_tds?: number;        // NEW
  receivable_balance: number;
  payable_balance: number;
}
 
const API = '/api/employee-tracker';
 
export interface EmployeeLite {
  id: number;
  employee_code: string;
  employee_name: string;
  employee_category: string;
}
 
export interface EmployeeExpense {
  id?: number;
  employee_id: number;
  expense_date: string;           // 'YYYY-MM-DD'
  expense_month?: string;         // 'YYYY-MM' — derived, read-only
  transport_expense: number;
  food_expense: number;
  stationery_expense: number;
  other_expense: number;
  total_expense?: number;
  remarks?: string;
  status: 'Pending' | 'Approved' | 'Paid' | 'Rejected';
  employee_code?: string;
  employee_name?: string;
  employee_category?: string;
}
 
export interface EmployeeBudgetRow {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  budget_id: number | null;
  total_budget: number;
  budget_set_on: string | null;   // 'YYYY-MM-DD' — audit/reference date the budget was set
  allocated: number;
  entry_count: number;
}
 
export interface MonthSummary {
  expense_month: string;
  total_budget: number;
  total_allocated: number;
  remaining_budget: number;
  employee_count: number;
  budgeted_employees: number;
  transport_total: number;
  food_total: number;
  stationery_total: number;
  other_total: number;
}
 
export interface ExpenseListParams {
  month?: string;
  date?: string;
  search?: string;
  status?: string;
  employee?: string;
  page?: number;
  limit?: number;
}
 
export interface ExpenseListResult {
  data: EmployeeExpense[];
  total: number;
}
 
async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const body = await res.json(); message = body.message || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json();
}
 
export const employeeTrackerService = {
  // ── Employees for dropdown ──
  listEmployees(): Promise<EmployeeLite[]> {
    return fetch(`${API}/meta/employees`).then(res => handle(res));
  },
 
  // ── Per-employee monthly budgets ──
  listBudgets(month: string): Promise<EmployeeBudgetRow[]> {
    return fetch(`${API}/budgets/${month}`).then(res => handle(res));
  },
  saveEmployeeBudget(employeeId: number, month: string, total_budget: number, budget_set_on?: string, notes?: string): Promise<any> {
    return fetch(`${API}/budget/${employeeId}/${month}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_budget, budget_set_on, notes }),
    }).then(res => handle(res));
  },
 
  // ── Month summary (budget vs allocated vs remaining, by category) ──
  getSummary(month: string): Promise<MonthSummary> {
    return fetch(`${API}/summary/${month}`).then(res => handle(res));
  },
 
  // ── Expense records (daily, date-wise) ──
  list(params: ExpenseListParams): Promise<ExpenseListResult> {
    const qs = new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => {
        if (v !== undefined && v !== '') acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>)
    );
    return fetch(`${API}?${qs}`).then(res => handle(res));
  },
 
  get(id: number): Promise<EmployeeExpense> {
    return fetch(`${API}/${id}`).then(res => handle(res));
  },
 
  create(payload: EmployeeExpense): Promise<EmployeeExpense> {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => handle(res));
  },
 
  update(id: number, payload: Partial<EmployeeExpense>): Promise<EmployeeExpense> {
    return fetch(`${API}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => handle(res));
  },
 
  remove(id: number): Promise<{ success: boolean }> {
    return fetch(`${API}/${id}`, { method: 'DELETE' }).then(res => handle(res));
  },
};
 
export default employeeTrackerService;

export const getCompanyDetails = () =>
  api.get("/company-details").then(r => r.data);

export const searchCompanies = (q: string) =>
  api.get(`/company-details/search`, { params: { q } });
 

export const getCompanyDetailsList = (limit = 200) =>
  api.get(`/company-details`, { params: { page: 1, limit } });
 
// ─── Purchase Invoice types ─────────────────────────────────────────────
export type GstType = 'CGST_SGST' | 'IGST' | 'NONE';

export interface PurchaseInvoiceItem {
  id?: number;
  delivered_qty: number;
  piece_no: string;
  roll_no: string;
  lot_no: string;
  rate?: number;
  amount?: number;
}

export interface PurchaseInvoicePayload {
  id?: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  po_type: 'fabric' | 'yarn';
  fpo_id: number | null;
  ypo_id: number | null;
  po_item_id: number | null;
  po_no: string;
  po_date: string;
  supplier: string;
  supplier_address: string;
  supplier_gstin: string;
  quality: string;
  hsn_code: string;
  unit: string;
  rate: number;
  total_order_qty: number;
  already_invoiced_qty: number;
  delivered_qty: number;
  balance_qty: number;
  gst_type: GstType;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  advance: number;
  sub_total: number;
  gst_amount: number;
  net_value: number;
  balance_due: number;
  remarks: string;
  status: string;
  items: PurchaseInvoiceItem[];
}

export interface PoLineOption {
  key: string;
  po_type: 'fabric' | 'yarn';
  po_id: number;
  item_id: number;
  po_no: string;
  po_date: string;
  due_date?: string;
  supplier: string;
  supplier_address: string;
  supplier_gstin: string;
  quality: string;
  hsn_code: string;
  unit: string;
  rate: number;
  total_qty: number;
  already_invoiced_qty: number;
  balance_qty: number;
  gst_type: GstType;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  advance: number;
}

// ─── Purchase Invoice API ───────────────────────────────────────────────
const PINV_BASE = '/api/purchase-invoices';

async function pinvFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    // ↓ CHANGED: include body.detail (the real MySQL error from the backend)
    const full = body.detail ? `${body.message || 'Request failed'}: ${body.detail}` : body.message;
    throw new Error(full || `Request to ${url} failed (${res.status}).`);
  }
  return res.json();
}

export async function getPurchaseInvoices(params: { search: string; page: number; limit: number }) {
  const qs = new URLSearchParams({
    search: params.search,
    page: String(params.page),
    limit: String(params.limit),
  });
  return pinvFetch<{ data: PurchaseInvoicePayload[]; total: number; page: number; limit: number }>(
    `${PINV_BASE}?${qs.toString()}`
  );
}

export async function getPurchaseInvoiceById(id: number) {
  return pinvFetch<PurchaseInvoicePayload>(`${PINV_BASE}/${id}`);
}

export async function createPurchaseInvoice(payload: PurchaseInvoicePayload) {
  return pinvFetch<PurchaseInvoicePayload>(PINV_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePurchaseInvoice(id: number, payload: PurchaseInvoicePayload) {
  return pinvFetch<PurchaseInvoicePayload>(`${PINV_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseInvoice(id: number) {
  return pinvFetch<void>(`${PINV_BASE}/${id}`, { method: 'DELETE' });
}

export async function getNextInvoiceNo() {
  return pinvFetch<{ invoice_no: string }>(`${PINV_BASE}/next-invoice-no`);
}

export async function searchPoLines(query: string, poType: 'fabric' | 'yarn' | 'all' = 'all') {
  const qs = new URLSearchParams({ q: query, type: poType });
  return pinvFetch<PoLineOption[]>(`${PINV_BASE}/po-lines?${qs.toString()}`);
}



 
// ─── Row shapes returned by /sales-invoices and /purchase-invoices ───────
export interface SalesInvoiceRowExt {
  id: number;
  invoice_no: string;
  customer_name: string;
  invoice_date: string;
  pl_no?: string | null;
  order_no?: string | null;
  qty?: number | string | null;
  invoice_amount: number;
  payment_terms_label?: string | null;
  payment_terms_days: number;
  paid_amount: number;
  cash_paid_amount?: number;
  tds_paid_amount?: number;
  balance: number;
  due_date: string;
  status: PaymentStatus;
}
 
export interface PurchaseInvoiceRowExt {
  id: number;
  invoice_no: string;
  supplier_name: string;
  invoice_date: string;
  internal_ref?: string | null;
  fpo_no?: string | null;
  qty?: number | string | null;
  invoice_amount: number;
  payment_terms_label?: string | null;
  payment_terms_days: number;
  paid_amount: number;
  cash_paid_amount?: number;
  tds_paid_amount?: number;
  balance: number;
  due_date: string;
  status: PaymentStatus;
}
 
// ─── Payment History (ledger row) ─────────────────────────────────────────
export interface PaymentHistoryRow {
  id: number;
  invoice_no: string;
  party_name: string | null;
  amount: number;
  tds_amount: number;
  payment_type: PaymentType;
  payment_date: string;
  mode: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}
 
export interface PaymentHistoryListResponse {
  data: PaymentHistoryRow[];
  total: number;
  page: number;
  limit: number;
}
 
// ─── Customer / Supplier party totals (drives the dropdown + strip) ──────
export interface PartySummary {
  name: string;
  invoice_count: number;
  total_invoiced: number;
  total_paid: number;
  balance: number; // negative = advance credit available; positive = balance due
}
 
// ─── Scoped (or overall) header-card summary ──────────────────────────────
export interface ScopedAccountSummary {
  sales_invoice_count: number;
  sales_invoice_total: number;
  purchase_invoice_count: number;
  purchase_invoice_total: number;
  payment_in_total: number;
  payment_in_cash: number;
  payment_in_tds: number;
  payment_out_total: number;
  payment_out_cash: number;
  payment_out_tds: number;
  receivable_balance: number; // negative = customers owe you less than they've prepaid, overall
  payable_balance: number;    // negative = you've prepaid suppliers, overall
  scoped_customer: string | null;
  scoped_supplier: string | null;
}
 
export interface EditablePaymentFields {
  amount: number;
  tds_amount: number;
  payment_type: PaymentType;
  payment_date: string;
  mode: string;
  reference_no: string;
  notes: string;
}
 
const INVOICE_BASE = '/account-details';
 
// ─────────────────────────────────────────────────────────────────────────
// INVOICE LISTS (scoped by customer / supplier)
// ─────────────────────────────────────────────────────────────────────────
 
export const fetchSalesInvoicesScoped = async (params: {
  search?: string; status?: string; customer?: string; page?: number; limit?: number;
}): Promise<{ data: SalesInvoiceRowExt[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get(`${BASE}/sales-invoices`, {
    params: {
      search: params.search ?? '',
      status: params.status ?? '',
      customer: params.customer ?? '',
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    },
  });
  return data;
};
 
export const fetchPurchaseInvoicesScoped = async (params: {
  search?: string; status?: string; supplier?: string; page?: number; limit?: number;
}): Promise<{ data: PurchaseInvoiceRowExt[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get(`${INVOICE_BASE}/purchase-invoices`, {
    params: {
      search: params.search ?? '',
      status: params.status ?? '',
      supplier: params.supplier ?? '',
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    },
  });
  return data;
};
 
// ─────────────────────────────────────────────────────────────────────────
// PER-INVOICE PAYMENT HISTORY (used inside the Record Payment modal)
// ─────────────────────────────────────────────────────────────────────────
 
export const fetchSalesInvoicePaymentsList = async (invoiceId: number) => {
  const { data } = await api.get(`${INVOICE_BASE}/sales-invoices/${invoiceId}/payments`);
  return data as (PaymentHistoryRow & { sales_invoice_id?: number })[];
};
 
export const fetchPurchaseInvoicePaymentsList = async (invoiceId: number) => {
  const { data } = await api.get(`${INVOICE_BASE}/purchase-invoices/${invoiceId}/payments`);
  return data as (PaymentHistoryRow & { purchase_invoice_id?: number })[];
};
 
// ─────────────────────────────────────────────────────────────────────────
// FULL PAYMENT HISTORY / LEDGER (the "Payment History" tab, scoped)
// ─────────────────────────────────────────────────────────────────────────
 
export const fetchPaymentInHistory = async (params: {
  search?: string; customer?: string; page?: number; limit?: number;
}): Promise<PaymentHistoryListResponse> => {
  const { data } = await api.get(`${INVOICE_BASE}/payments-in`, {
    params: {
      search: params.search ?? '',
      customer: params.customer ?? '',
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    },
  });
  return data;
};
 
export const fetchPaymentOutHistory = async (params: {
  search?: string; supplier?: string; page?: number; limit?: number;
}): Promise<PaymentHistoryListResponse> => {
  const { data } = await api.get(`${INVOICE_BASE}/payments-out`, {
    params: {
      search: params.search ?? '',
      supplier: params.supplier ?? '',
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    },
  });
  return data;
};
 
// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER / SUPPLIER DROPDOWN + PARTY TOTALS
// ─────────────────────────────────────────────────────────────────────────
 
export const fetchCustomerList = async (search: string = ''): Promise<PartySummary[]> => {
  const { data } = await api.get(`${INVOICE_BASE}/customers`, { params: { search } });
  return data;
};
 
export const fetchSupplierList = async (search: string = ''): Promise<PartySummary[]> => {
  const { data } = await api.get(`${INVOICE_BASE}/suppliers`, { params: { search } });
  return data;
};
 
// ─────────────────────────────────────────────────────────────────────────
// SUMMARY (overall, or scoped to one customer / supplier)
// ─────────────────────────────────────────────────────────────────────────
 
export const fetchScopedSummary = async (params: {
  customer?: string; supplier?: string;
}): Promise<ScopedAccountSummary> => {
  const query: Record<string, string> = {};
  if (params.customer) query.customer = params.customer;
  if (params.supplier) query.supplier = params.supplier;
  const { data } = await api.get(`${INVOICE_BASE}/summary`, { params: query });
  return data;
};
 
// ─────────────────────────────────────────────────────────────────────────
// RECORD PAYMENT — full versions carrying tds_amount + payment_type
// (the old services.ts recordPaymentIn/recordPaymentOut only sent
//  amount/payment_date/mode/reference_no/notes — no TDS, no payment type)
// ─────────────────────────────────────────────────────────────────────────
 
export const recordPaymentInFull = async (payload: {
  sales_invoice_id: number;
  amount: number;
  tds_amount?: number;
  payment_type?: PaymentType;
  payment_date: string;
  mode: string;
  reference_no?: string;
  notes?: string;
}): Promise<{ id: number; message: string }> => {
  const { data } = await api.post(`${INVOICE_BASE}/payments-in`, payload);
  return data;
};
 
export const recordPaymentOutFull = async (payload: {
  purchase_invoice_id: number;
  amount: number;
  tds_amount?: number;
  payment_type?: PaymentType;
  payment_date: string;
  mode: string;
  reference_no?: string;
  notes?: string;
}): Promise<{ id: number; message: string }> => {
  const { data } = await api.post(`${INVOICE_BASE}/payments-out`, payload);
  return data;
};
 
// ─────────────────────────────────────────────────────────────────────────
// EDIT / DELETE an existing Payment History row
// ─────────────────────────────────────────────────────────────────────────
 
export const updatePaymentIn = async (id: number, fields: EditablePaymentFields): Promise<void> => {
  await api.put(`${INVOICE_BASE}/payments-in/${id}`, fields);
};
 
export const updatePaymentOut = async (id: number, fields: EditablePaymentFields): Promise<void> => {
  await api.put(`${INVOICE_BASE}/payments-out/${id}`, fields);
};
 
export const deletePaymentInEntry = async (id: number): Promise<void> => {
  await api.delete(`${INVOICE_BASE}/payments-in/${id}`);
};
 
export const deletePaymentOutEntry = async (id: number): Promise<void> => {
  await api.delete(`${INVOICE_BASE}/payments-out/${id}`);
};