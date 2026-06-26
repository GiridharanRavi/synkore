import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Plus, Search, X, ChevronDown, ChevronUp,
  Loader2, Eye, EyeOff, AlertCircle, CheckCircle2,
  Info, AlertTriangle, Lock, User, Mail, Shield, Check, Minus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
interface Employee {
  id?: number;
  employee_code?: string;
  employee_name: string;
  address: string;
  pin_code: string;
  password: string;
  email: string;
  district: string;
  state: string;
  country: string;
  contact_number: string;
  designation_id: string;
  employee_category: string;
  unit_id: string;
  status: string;
  designation_name?: string;
  unit_name?: string;
  module_access?: string[];
  stage_access?: string[];
}

interface LookupData {
  designations: { id: number; description: string }[];
  units: { id: number; unit_name: string }[];
}

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string; }
interface FieldErrors {
  employee_name?: string;
  contact_number?: string;
  pin_code?: string;
  email?: string;
}

// ─── Module & Stage Definitions (matches sidebar) ─────────────
const MODULES = [
  { id: 'master_data',         label: 'Master Data',           icon: '👤' },
  { id: 'production_workflow', label: 'Production Workflow',   icon: '🏭' },
  { id: 'order_management',    label: 'Order Management',      icon: '📋' },
  { id: 'production_ops',      label: 'Production Operations', icon: '⚙️' },
  { id: 'purchase_ops',        label: 'Purchase Operations',   icon: '📦' },
  { id: 'sales_ops',           label: 'Sales Operations',      icon: '📈' },
  { id: 'dispatch_logistics',  label: 'Dispatch & Logistics',  icon: '🚚' },
  { id: 'reports_analytics',   label: 'Reports & Analytics',   icon: '📊' },
  { id: 'finance_billing',     label: 'Finance & Billing',     icon: '💰' },
];

// A stage item can either be a plain leaf ("Customer Master") or a group
// that itself contains sub-items ("Other Master" → Employee Master, …).
// Only leaf ids are ever stored in stage_access — a group's checked /
// indeterminate state is always derived from its children.
interface StageLeaf { id: string; label: string; }
interface StageNode extends StageLeaf { children?: StageLeaf[]; }

const STAGES: Record<string, StageNode[]> = {
  master_data: [
    { id: 'customer_master',  label: 'Customer Master' },
    { id: 'agent_master',     label: 'Agent Master' },
    { id: 'fabric_master',    label: 'Fabric Master' },
    { id: 'transport_master', label: 'Transport Master' },
    { id: 'vendor_master',    label: 'Vendor Master' },
    { id: 'supplier_master',  label: 'Supplier Master' },
    { id: 'yarn_master',      label: 'Yarn Master' },
    {
      id: 'other_master', label: 'Other Master', children: [
        { id: 'employee_master',       label: 'Employee Master' },
        { id: 'service_type_master',   label: 'Service Type Master' },
        { id: 'package_master',        label: 'Package Master' },
        { id: 'region_master',         label: 'Region Master' },
        { id: 'customer_group_master', label: 'Customer Group Master' },
        { id: 'processing_types',      label: 'Processing Types' },
        { id: 'payment_terms',         label: 'Payment Terms' },
        { id: 'color_master',          label: 'Color Master' },
        { id: 'certification_master',  label: 'Certification Master' },
        { id: 'currency_master',       label: 'Currency Master' },
        { id: 'discount_type_master',  label: 'Discount Type Master' },
        { id: 'hsn_code_master',       label: 'HSN Code Master' },
      ],
    },
  ],
  production_workflow: [
    { id: 'request_analysis', label: 'Request Analysis' },
  ],
  order_management: [
    { id: 'customer_order', label: 'Customer Order' },
    { id: 'order_status',   label: 'Order Status' }, 
  ],
  production_ops: [
    { id: 'production_planning', label: 'Production Planning' },
    { id: 'work_order',          label: 'Work Order' },
  ],
  purchase_ops: [
    {
      id: 'fabric_purchase', label: 'Fabric Purchase', children: [
        { id: 'fabric_purchase_order',  label: 'Fabric Purchase Order' },
        { id: 'fabric_purchase_inward', label: 'Fabric Purchase Inward' },
      ],
    },
    {
      id: 'yarn_purchase', label: 'Yarn Purchase', children: [
        { id: 'yarn_purchase_order',  label: 'Yarn Purchase Order' },
        { id: 'yarn_purchase_inward', label: 'Yarn Purchase Inward' },
      ],
    },
  ],
  sales_ops: [
    { id: 'quotation',   label: 'Quotation' },
    { id: 'invoice',     label: 'Invoice' },
    { id: 'credit_note', label: 'Credit Note' },
  ],
  dispatch_logistics: [
    { id: 'dispatch_order',   label: 'Dispatch Order' },
    { id: 'delivery_challan', label: 'Delivery Challan' },
    { id: 'tracking',         label: 'Tracking' },
  ],
  reports_analytics: [
    { id: 'sales_report',       label: 'Sales Report' },
    { id: 'production_report',  label: 'Production Report' },
    { id: 'stock_report',       label: 'Stock Report' },
  ],
  finance_billing: [
    { id: 'payment', label: 'Payment' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'ledger',  label: 'Ledger' },
  ],
};

// Flattens a module's stage tree down to leaf ids only (group container
// ids such as "other_master" are never selectable themselves).
function flattenStageIds(nodes: StageNode[]): string[] {
  return nodes.flatMap(n => (n.children && n.children.length ? n.children.map(c => c.id) : [n.id]));
}

// ─── India States ──────────────────────────────────────────────
const INDIA_STATES_DISTRICTS: Record<string, string[]> = {
  "Tamil Nadu": ["Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri","Dindigul","Erode","Kallakurichi","Kancheepuram","Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore","Viluppuram","Virudhunagar"],
  "Andhra Pradesh": ["Alluri Sitharama Raju","Anakapalli","Anantapur","Annamayya","Bapatla","Chittoor","East Godavari","Eluru","Guntur","Kakinada","Krishna","Kurnool","Nandyal","Nellore","Palnadu","Prakasam","Srikakulam","Tirupati","Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa"],
  "Karnataka": ["Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga","Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir"],
  "Kerala": ["Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam","Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta","Thiruvananthapuram","Thrissur","Wayanad"],
  "Maharashtra": ["Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal"],
  "Gujarat": ["Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar","Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka","Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad"],
  "Delhi": ["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi"],
  "Rajasthan": ["Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi","Sri Ganganagar","Tonk","Udaipur"],
  "Uttar Pradesh": ["Agra","Aligarh","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh","Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti","Bhadohi","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah","Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar","Ghaziabad","Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun","Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi","Kushinagar","Lakhimpur Kheri","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri","Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Pratapgarh","Prayagraj","Raebareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur","Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi"],
  "Goa": ["North Goa","South Goa"],
  "Punjab": ["Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Malerkotla","Mansa","Moga","Mohali","Muktsar","Pathankot","Patiala","Rupnagar","Sangrur","Shaheed Bhagat Singh Nagar","Tarn Taran"],
  "Haryana": ["Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram","Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh","Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar"],
  "Bihar": ["Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur","Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad","Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura","Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa","Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi","Siwan","Supaul","Vaishali","West Champaran"],
  "Telangana": ["Adilabad","Bhadradri Kothagudem","Hanamkonda","Hyderabad","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam","Kumuram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak","Medchal Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal","Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet","Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri"],
};
const STATE_LIST = Object.keys(INDIA_STATES_DISTRICTS).sort();

const STATIC_DESIGNATIONS = [
  { id:1,description:'ADMINISTRATOR' },{ id:2,description:'MARKETING MANAGER' },
  { id:3,description:'SALES EXECUTIVE' },{ id:4,description:'SALES MANAGER' },
  { id:5,description:'PURCHASE MANAGER' },{ id:6,description:'WAREHOUSE EXECUTIVE' },
  { id:7,description:'ERP ASSISTANT' },{ id:8,description:'SIZING MANAGER' },
  { id:9,description:'Production Executive' },{ id:10,description:'System Admin' },
];
const STATIC_UNITS = [
  { id:1,unit_name:'Unit 1' },{ id:2,unit_name:'Unit 2' },
  { id:3,unit_name:'Unit 3' },{ id:4,unit_name:'Unit 4' },
];

function isValidContact(v: string) { if (!v) return true; return /^\d{10,13}$/.test(v.replace(/[\s\-\+]/g,'')); }
function isValidPin(v: string) { if (!v) return true; return /^\d{6}$/.test(v.trim()); }
function isValidEmail(v: string) { if (!v) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }

let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, push, remove };
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg:'#f0fdf4', border:'#86efac', color:'#166534', icon:<CheckCircle2 size={16} color="#16a34a"/> },
    error:   { bg:'#fef2f2', border:'#fca5a5', color:'#991b1b', icon:<AlertCircle  size={16} color="#dc2626"/> },
    warning: { bg:'#fffbeb', border:'#fde68a', color:'#92400e', icon:<AlertTriangle size={16} color="#d97706"/> },
    info:    { bg:'#eff6ff', border:'#93c5fd', color:'#1e40af', icon:<Info          size={16} color="#2563eb"/> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed',top:20,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:10,maxWidth:360,width:'calc(100vw - 40px)',pointerEvents:'none' }}>
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex',alignItems:'flex-start',gap:10,background:c.bg,border:`1px solid ${c.border}`,borderRadius:10,padding:'12px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.12)',pointerEvents:'all',animation:'toastIn 0.25s ease-out',fontFamily:"'DM Sans',sans-serif" }}>
            <span style={{ flexShrink:0,marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0',fontSize:12,color:c.color,opacity:0.8,lineHeight:1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0,background:'none',border:'none',padding:0,cursor:'pointer',color:c.color,opacity:0.6,display:'flex',alignItems:'center' }}><X size={14}/></button>
          </div>
        );
      })}
    </div>
  );
}

interface SDOption { value: string; label: string; }
function SearchableDropdown({ value, onChange, options, placeholder='— Select —', searchPlaceholder='Search…', disabled=false }: {
  value: string; onChange: (v: string) => void; options: SDOption[];
  placeholder?: string; searchPlaceholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find(o => o.value === value);
  const filtered = query.trim() ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 60); }, [open]);
  return (
    <div ref={wrapRef} style={{ position:'relative',fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={() => { if (!disabled) setOpen(v => !v); }} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px 8px 12px',border:`1px solid ${open?'#2563eb':'#cbd5e1'}`,borderRadius:8,background:disabled?'#f1f5f9':'#fff',cursor:disabled?'not-allowed':'pointer',fontSize:13,boxShadow:open?'0 0 0 3px rgba(37,99,235,0.12)':'none',transition:'border-color 0.15s,box-shadow 0.15s',minHeight:37 }}>
        <span style={{ flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:selected?'#1e293b':'#9ca3af' }}>{selected ? selected.label : placeholder}</span>
        <span style={{ display:'flex',alignItems:'center',gap:2,flexShrink:0,marginLeft:6 }}>
          {selected && !disabled && (<span onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }} style={{ display:'flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',background:'#e2e8f0',color:'#64748b',cursor:'pointer' }}><X size={10}/></span>)}
          <ChevronDown size={15} color="#94a3b8" style={{ transform:open?'rotate(180deg)':'none',transition:'transform 0.2s' }}/>
        </span>
      </div>
      {open && !disabled && (
        <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.13)',zIndex:9000,overflow:'hidden',animation:'dropdownIn 0.15s ease-out' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderBottom:'1px solid #f1f5f9',background:'#fafbfc' }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink:0 }}/>
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} style={{ flex:1,border:'none',outline:'none',fontSize:13,color:'#1e293b',background:'transparent',fontFamily:"'DM Sans',sans-serif" }}/>
            {query && <button onClick={() => setQuery('')} style={{ background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',color:'#94a3b8' }}><X size={12}/></button>}
          </div>
          <div style={{ maxHeight:220,overflowY:'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding:'12px 14px',fontSize:12,color:'#94a3b8',textAlign:'center',fontStyle:'italic' }}>No results</div>
              : filtered.map(opt => {
                  const isSel = opt.value === value;
                  return (
                    <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }}
                      style={{ padding:'9px 14px',fontSize:13,cursor:'pointer',background:isSel?'#eff6ff':'transparent',color:isSel?'#1d4ed8':'#374151',fontWeight:isSel?600:400,display:'flex',alignItems:'center',justifyContent:'space-between',transition:'background 0.1s' }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background='#f8fafc'; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background='transparent'; }}>
                      <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{opt.label}</span>
                      {isSel && <CheckCircle2 size={14} color="#2563eb" style={{ flexShrink:0,marginLeft:6 }}/>}
                    </div>
                  );
                })}
          </div>
          <div style={{ padding:'6px 14px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9',background:'#fafbfc' }}>{filtered.length} of {options.length}</div>
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, open, onToggle, badge }: { title: string; open: boolean; onToggle: () => void; badge?: React.ReactNode }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={s.sectionTitle}>{title}</span>{badge}
      </span>
      {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
    </div>
  );
}

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color:'#ef4444' }}> *</span>}</label>
      {children}
      {error && <span style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#dc2626',marginTop:4 }}><AlertCircle size={11} style={{ flexShrink:0 }}/>{error}</span>}
    </div>
  );
}

function AddressBlock({ form, onChange, fieldErrors }: { form: Employee; onChange: (u: Partial<Employee>) => void; fieldErrors: FieldErrors }) {
  const state = form.state || '';
  const districts = INDIA_STATES_DISTRICTS[state] || [];
  const set = (key: keyof Employee, val: string) => onChange({ [key]: val } as Partial<Employee>);
  return (
    <div style={{ padding:'12px 0' }}>
      <div style={{ marginBottom:14 }}>
        <label style={s.label}>Address</label>
        <textarea value={form.address||''} onChange={e => set('address',e.target.value)} placeholder="Door no, Street, Area…" rows={3} style={{ ...s.input,resize:'vertical',lineHeight:1.6,minHeight:80 }}/>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px 16px',marginBottom:14 }}>
        <div>
          <label style={s.label}>Pin Code</label>
          <input type="text" value={form.pin_code||''} onChange={e => { const v=e.target.value.replace(/\D/g,'').slice(0,6); set('pin_code',v); }} placeholder="6-digit" maxLength={6}
            style={{ ...s.input,...(fieldErrors.pin_code?s.inputError:form.pin_code&&form.pin_code.length===6?s.inputSuccess:{}) }}/>
          {fieldErrors.pin_code ? <span style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#dc2626',marginTop:4 }}><AlertCircle size={11}/>{fieldErrors.pin_code}</span> : <span className="em-hint-pill">6 digits</span>}
        </div>
        <div>
          <label style={s.label}>State</label>
          <select value={state} onChange={e => onChange({ state:e.target.value,district:'' })} style={s.input}>
            <option value="">— Select State —</option>
            {STATE_LIST.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div>
          <label style={s.label}>District</label>
          <select value={form.district||''} onChange={e => set('district',e.target.value)} disabled={!state} style={{ ...s.input,...(!state?s.inputDisabled:{}) }}>
            <option value="">{state?'— Select District —':'— Select State first —'}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div style={{ maxWidth:240 }}>
        <label style={s.label}>Country</label>
        <input type="text" value={form.country||''} onChange={e => set('country',e.target.value)} placeholder="India" style={s.input}/>
      </div>
    </div>
  );
}

// ─── Module Access Panel ─────────────────────────────────────
// Renders Module → (Stage | Stage-group → sub-stage) — a 3-tier tree that
// mirrors the real sidebar. Only leaf-level ids ever live in stageAccess;
// a group's checkbox state (checked / indeterminate) is always derived
// from how many of its children are selected.
function ModuleAccessPanel({ moduleAccess, stageAccess, onChange }: {
  moduleAccess: string[];
  stageAccess: string[];
  onChange: (modules: string[], stages: string[]) => void;
}) {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    let newModules: string[];
    let newStages: string[];
    if (moduleAccess.includes(moduleId)) {
      newModules = moduleAccess.filter(m => m !== moduleId);
      const moduleLeafIds = flattenStageIds(STAGES[moduleId] || []);
      newStages = stageAccess.filter(s => !moduleLeafIds.includes(s));
    } else {
      newModules = [...moduleAccess, moduleId];
      newStages = stageAccess;
    }
    onChange(newModules, newStages);
  };

  const toggleStage = (moduleId: string, stageId: string) => {
    let newStages: string[];
    if (stageAccess.includes(stageId)) {
      newStages = stageAccess.filter(s => s !== stageId);
    } else {
      newStages = [...stageAccess, stageId];
      if (!moduleAccess.includes(moduleId)) {
        onChange([...moduleAccess, moduleId], newStages);
        return;
      }
    }
    onChange(moduleAccess, newStages);
  };

  const toggleGroup = (moduleId: string, group: StageNode) => {
    const childIds = (group.children || []).map(c => c.id);
    const allSelected = childIds.length > 0 && childIds.every(id => stageAccess.includes(id));
    const newStages = allSelected
      ? stageAccess.filter(s => !childIds.includes(s))
      : Array.from(new Set([...stageAccess, ...childIds]));
    const newModules = moduleAccess.includes(moduleId) ? moduleAccess : [...moduleAccess, moduleId];
    onChange(newModules, newStages);
  };

  const selectAll = () => {
    onChange(MODULES.map(m => m.id), Object.values(STAGES).flatMap(arr => flattenStageIds(arr)));
  };
  const clearAll = () => onChange([], []);

  return (
    <div style={{ marginTop:4 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,color:'#1d4ed8' }}>
            {moduleAccess.length}/{MODULES.length} Modules
          </div>
          <div style={{ background:'#f0fdf4',border:'1px solid #86efac',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700,color:'#166534' }}>
            {stageAccess.length} Stages
          </div>
        </div>
        <div style={{ display:'flex',gap:6 }}>
          <button onClick={selectAll} style={{ background:'#2563eb',color:'#fff',border:'none',borderRadius:6,padding:'5px 10px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>Select All</button>
          <button onClick={clearAll} style={{ background:'#f1f5f9',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:6,padding:'5px 10px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>Clear All</button>
        </div>
      </div>

      <div style={{ border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden',background:'#fff' }}>
        {MODULES.map((mod, idx) => {
          const isChecked = moduleAccess.includes(mod.id);
          const moduleItems = STAGES[mod.id] || [];
          const moduleLeafIds = flattenStageIds(moduleItems);
          const checkedLeafIds = moduleLeafIds.filter(id => stageAccess.includes(id));
          const isExpanded = expandedModule === mod.id;

          return (
            <div key={mod.id} style={{ borderBottom: idx < MODULES.length-1 ? '1px solid #f1f5f9' : 'none' }}>
              {/* Module row */}
              <div style={{ display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:isChecked?'#f8faff':'#fff',transition:'background 0.15s',cursor:'pointer' }}
                onClick={() => setExpandedModule(isExpanded ? null : mod.id)}>
                <div onClick={e => { e.stopPropagation(); toggleModule(mod.id); }}
                  style={{ width:18,height:18,borderRadius:5,border:`2px solid ${isChecked?'#2563eb':'#cbd5e1'}`,background:isChecked?'#2563eb':'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'all 0.15s' }}>
                  {isChecked && <Check size={11} color="#fff" strokeWidth={3}/>}
                </div>
                <span style={{ fontSize:16 }}>{mod.icon}</span>
                <span style={{ flex:1,fontSize:13,fontWeight:isChecked?600:400,color:isChecked?'#1e293b':'#475569' }}>{mod.label}</span>
                <span style={{ display:'flex',alignItems:'center',gap:6 }}>
                  {checkedLeafIds.length > 0 && (
                    <span style={{ background:'#eff6ff',color:'#2563eb',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,border:'1px solid #bfdbfe' }}>
                      {checkedLeafIds.length}/{moduleLeafIds.length}
                    </span>
                  )}
                  {moduleItems.length > 0 && (isExpanded ? <ChevronUp size={14} color="#94a3b8"/> : <ChevronDown size={14} color="#94a3b8"/>)}
                </span>
              </div>

              {/* Stage / stage-group list */}
              {isExpanded && moduleItems.length > 0 && (
                <div style={{ background:'#f8fafc',borderTop:'1px solid #f1f5f9',padding:'10px 14px 12px 44px' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                    <span style={{ fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em' }}>
                      Stage Access — {checkedLeafIds.length}/{moduleLeafIds.length} selected
                    </span>
                    <div style={{ display:'flex',gap:6 }}>
                      <button onClick={() => {
                        onChange(moduleAccess.includes(mod.id)?moduleAccess:[...moduleAccess,mod.id], Array.from(new Set([...stageAccess,...moduleLeafIds])));
                      }} style={{ fontSize:10,color:'#2563eb',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:'2px 4px' }}>
                        ✓ All
                      </button>
                      <span style={{ color:'#e2e8f0',fontSize:10 }}>|</span>
                      <button onClick={() => {
                        onChange(moduleAccess, stageAccess.filter(s => !moduleLeafIds.includes(s)));
                      }} style={{ fontSize:10,color:'#94a3b8',background:'none',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",padding:'2px 4px' }}>
                        Clear
                      </button>
                    </div>
                  </div>

                  <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                    {moduleItems.map(item => {
                      // ── Group item (has its own sub-stages, e.g. "Other Master") ──
                      if (item.children && item.children.length) {
                        const childIds = item.children.map(c => c.id);
                        const checkedChildIds = childIds.filter(id => stageAccess.includes(id));
                        const isGroupChecked = checkedChildIds.length === childIds.length;
                        const isGroupPartial = checkedChildIds.length > 0 && !isGroupChecked;
                        const isGroupExpanded = expandedGroups.has(item.id);
                        return (
                          <div key={item.id} style={{ border:`1px solid ${isGroupChecked||isGroupPartial?'#bfdbfe':'#e2e8f0'}`,borderRadius:8,background:'#fff',overflow:'hidden' }}>
                            <div style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',cursor:'pointer',background:isGroupChecked?'#eff6ff':'#fff',transition:'background 0.12s' }}
                              onClick={() => toggleGroupExpand(item.id)}>
                              <div onClick={e => { e.stopPropagation(); toggleGroup(mod.id, item); }}
                                style={{ width:14,height:14,borderRadius:3,border:`2px solid ${isGroupChecked||isGroupPartial?'#2563eb':'#cbd5e1'}`,background:isGroupChecked?'#2563eb':isGroupPartial?'#bfdbfe':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s' }}>
                                {isGroupChecked && <Check size={9} color="#fff" strokeWidth={3}/>}
                                {isGroupPartial && <Minus size={9} color="#1d4ed8" strokeWidth={3}/>}
                              </div>
                              <span style={{ flex:1,fontSize:12.5,fontWeight:isGroupChecked||isGroupPartial?600:400,color:isGroupChecked||isGroupPartial?'#1d4ed8':'#475569' }}>{item.label}</span>
                              <span style={{ background:'#f1f5f9',color:'#64748b',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,border:'1px solid #e2e8f0' }}>
                                {checkedChildIds.length}/{childIds.length}
                              </span>
                              {isGroupExpanded ? <ChevronUp size={12} color="#94a3b8"/> : <ChevronDown size={12} color="#94a3b8"/>}
                            </div>
                            {isGroupExpanded && (
                              <div style={{ padding:'9px 10px 10px 30px',borderTop:'1px solid #f1f5f9',background:'#fafbfc',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px' }}>
                                {item.children.map(child => {
                                  const isChildChecked = stageAccess.includes(child.id);
                                  return (
                                    <div key={child.id} onClick={() => toggleStage(mod.id, child.id)}
                                      style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'6px 10px',borderRadius:7,background:isChildChecked?'#eff6ff':'#fff',border:`1px solid ${isChildChecked?'#bfdbfe':'#e2e8f0'}`,transition:'all 0.12s',userSelect:'none' }}>
                                      <div style={{ width:13,height:13,borderRadius:3,border:`2px solid ${isChildChecked?'#2563eb':'#cbd5e1'}`,background:isChildChecked?'#2563eb':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s' }}>
                                        {isChildChecked && <Check size={8} color="#fff" strokeWidth={3}/>}
                                      </div>
                                      <span style={{ fontSize:12,color:isChildChecked?'#1d4ed8':'#475569',fontWeight:isChildChecked?600:400 }}>{child.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // ── Plain leaf stage (e.g. "Customer Master") ──
                      const isStageChecked = stageAccess.includes(item.id);
                      return (
                        <div key={item.id} onClick={() => toggleStage(mod.id, item.id)}
                          style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',borderRadius:8,background:isStageChecked?'#eff6ff':'#fff',border:`1px solid ${isStageChecked?'#bfdbfe':'#e2e8f0'}`,transition:'all 0.12s',userSelect:'none' }}>
                          <div style={{ width:14,height:14,borderRadius:3,border:`2px solid ${isStageChecked?'#2563eb':'#cbd5e1'}`,background:isStageChecked?'#2563eb':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s' }}>
                            {isStageChecked && <Check size={9} color="#fff" strokeWidth={3}/>}
                          </div>
                          <span style={{ fontSize:12.5,color:isStageChecked?'#1d4ed8':'#475569',fontWeight:isStageChecked?600:400 }}>{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PasswordCell({ password }: { password: string }) {
  const [show, setShow] = useState(false);
  if (!password) return <span style={{ color:'#94a3b8' }}>—</span>;
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:4 }}>
      <span style={{ fontFamily:show?'inherit':'monospace',fontSize:12 }}>{show ? password : '•'.repeat(Math.min(password.length,10))}</span>
      <button onClick={() => setShow(v => !v)} style={{ background:'none',border:'none',cursor:'pointer',padding:'1px 3px',color:'#64748b',display:'flex',alignItems:'center' }}>
        {show ? <EyeOff size={12}/> : <Eye size={12}/>}
      </button>
    </span>
  );
}

const BLANK: Employee = {
  employee_name:'', address:'', pin_code:'', password:'', email:'',
  district:'', state:'', country:'India', contact_number:'',
  designation_id:'', employee_category:'User', unit_id:'', status:'Active',
  module_access:[], stage_access:[],
};
const API = '/api/employees';
const PAGE_SIZE_OPTIONS = [5,10,25,50];

function useWidth() {
  const [w,setW] = useState(typeof window!=='undefined' ? window.innerWidth : 1200);
  useEffect(() => { const fn = () => setW(window.innerWidth); window.addEventListener('resize',fn); return () => window.removeEventListener('resize',fn); },[]);
  return w;
}

export default function EmployeeMaster() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lookup, setLookup]       = useState<LookupData>({ designations:[],units:[] });
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterSt, setFilterSt]   = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Employee>(BLANK);
  const [editId, setEditId]       = useState<number|null>(null);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPwd, setShowPwd]     = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [sec, setSec]             = useState({ details:true, address:false, access:true });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const width   = useWidth();
  const isMobile = width < 576;

  const desigOptions: SDOption[] = lookup.designations.map(d => ({ value:String(d.id), label:d.description }));
  const unitOptions:  SDOption[] = lookup.units.map(u => ({ value:String(u.id), label:u.unit_name }));

  const loadList = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, page:String(page), limit:String(pageSize),
        ...(filterCat?{category:filterCat}:{}),
        ...(filterSt?{status:filterSt}:{}),
        ...(filterUnit?{unit:filterUnit}:{}),
      });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setEmployees(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error','Load Failed','Could not fetch employees.'); }
    setLoading(false);
  };

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API}/meta/lookup`);
      if (!res.ok) throw new Error();
      setLookup(await res.json());
    } catch {
      setLookup({ designations:STATIC_DESIGNATIONS, units:STATIC_UNITS });
    }
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadList(); }, [search,filterCat,filterSt,filterUnit,page,pageSize]);
  useEffect(() => { setPage(1); }, [search,filterCat,filterSt,filterUnit]);
  useEffect(() => { document.body.style.overflow = showForm ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [showForm]);

  const openCreate = () => { setForm(BLANK); setEditId(null); setError(''); setFieldErrors({}); setShowPwd(false); setSendEmail(true); setShowForm(true); };
  const openEdit = async (id: number) => {
  try {
    const res  = await fetch(`${API}/${id}`);
    const data = await res.json();
    setForm({
      ...BLANK,
      ...data,
      // ← coerce every field to string/empty — never null
      employee_name:     data.employee_name     ?? '',
      email:             data.email             ?? '',
      address:           data.address           ?? '',
      pin_code:          data.pin_code          ?? '',
      district:          data.district          ?? '',
      state:             data.state             ?? '',
      country:           data.country           ?? 'India',
      contact_number:    data.contact_number    ?? '',
      password:          data.password          ?? '',
      designation_id:    data.designation_id    != null ? String(data.designation_id) : '',
      unit_id:           data.unit_id           != null ? String(data.unit_id)        : '',
      employee_category: data.employee_category ?? 'User',
      status:            data.status            ?? 'Active',
      module_access: data.module_access
        ? (typeof data.module_access === 'string' ? JSON.parse(data.module_access) : data.module_access)
        : [],
      stage_access: data.stage_access
        ? (typeof data.stage_access === 'string' ? JSON.parse(data.stage_access) : data.stage_access)
        : [],
    });
    setEditId(id); setError(''); setFieldErrors({});
    setShowPwd(false); setSendEmail(false); setShowForm(true);
  } catch { pushToast('error', 'Load Failed', 'Could not load employee.'); }
};

  const validateAll = (): boolean => {
    const e: FieldErrors = {};
    if (!form.employee_name.trim()) e.employee_name = 'Employee Name is required.';
    if (form.contact_number && !isValidContact(form.contact_number)) e.contact_number = 'Must be 10–13 digits.';
    if (form.pin_code && !isValidPin(form.pin_code)) e.pin_code = 'Must be exactly 6 digits.';
    if (form.email && !isValidEmail(form.email)) e.email = 'Enter a valid email address.';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) { setError('Please fix the highlighted errors before saving.'); return; }
    setError(''); setSaving(true);
    try {
      const payload = {
        ...form,
        module_access: JSON.stringify(form.module_access || []),
        stage_access:  JSON.stringify(form.stage_access  || []),
        send_email_notification: sendEmail && !!form.email,
      };
      const res = await fetch(editId ? `${API}/${editId}` : API, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: Employee = await res.json();
      const desig = lookup.designations.find(d => d.id === Number(saved.designation_id));
      const unit  = lookup.units.find(u => u.id === Number(saved.unit_id));
      const enriched = { ...saved, designation_name:desig?.description||'', unit_name:unit?.unit_name||'' };

      if (editId) setEmployees(prev => prev.map(e => e.id===editId ? enriched : e));
      else { setEmployees(prev => [enriched,...prev].slice(0,pageSize)); setTotal(p => p+1); }

      if (sendEmail && form.email) pushToast('info','📧 Welcome Email Sent',`Login credentials sent to ${form.email}`);
      pushToast('success', editId?'Employee Updated':'Employee Created', `${form.employee_name} saved successfully.`);
      setShowForm(false);
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error','Save Failed',msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this employee?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method:'DELETE' });
      if (!res.ok) throw new Error();
      setEmployees(prev => prev.filter(e => e.id!==id));
      setTotal(p => Math.max(0,p-1));
      pushToast('success','Employee Deleted','Record removed.');
      if (employees.length===1 && page>1) setPage(p => p-1);
    } catch { pushToast('error','Delete Failed','Could not delete.'); }
  };

  const set = (key: keyof Employee, val: any) => setForm(f => ({ ...f,[key]:val }));
  const handleAddressChange = (updates: Partial<Employee>) => setForm(f => ({ ...f,...updates }));
  const handleAccessChange = (modules: string[], stages: string[]) => setForm(f => ({ ...f, module_access:modules, stage_access:stages }));
  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p,[k]:!p[k] }));

  const totalPages = Math.max(1, Math.ceil(total/pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1,page-2);
    const end  = Math.min(totalPages, start+4);
    if (end-start<4) start = Math.max(1,end-4);
    for (let i=start;i<=end;i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1,p),totalPages));

  const showDesig   = width >= 768;
  const showUnit    = width >= 900;
  const showContact = width >= 480;

  const accessBadge = (form.module_access||[]).length > 0 ? (
    <span style={{ background:'#eff6ff',color:'#1d4ed8',fontSize:10,fontWeight:700,padding:'1px 8px',borderRadius:20,border:'1px solid #bfdbfe' }}>
      {(form.module_access||[]).length} modules
    </span>
  ) : undefined;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast}/>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box}
        @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes dropdownIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .em-wrap{font-family:'DM Sans',sans-serif;font-size:14px;color:#1e293b}
        .em-page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .em-page-header h1{margin:0;font-size:20px;font-weight:700;color:#1e293b}
        .em-page-header p{margin:3px 0 0;font-size:13px;color:#64748b}
        .em-add-btn{display:flex;align-items:center;gap:6px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 2px 6px rgba(37,99,235,0.3);white-space:nowrap;flex-shrink:0}
        .em-add-btn:hover{background:#1d4ed8}
        .em-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
        .em-search-wrap{position:relative;flex:1;min-width:180px;max-width:320px}
        .em-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8}
        .em-search{width:100%;padding:8px 12px 8px 34px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;color:#1e293b;outline:none}
        .em-search:focus{border-color:#2563eb}
        .em-filter-sel{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;color:#374151;cursor:pointer;outline:none}
        .em-page-size{display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;margin-left:auto}
        .em-page-size select{border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:13px;font-family:'DM Sans',sans-serif;background:#fff;cursor:pointer;outline:none}
        .em-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);margin-bottom:24px}
        .em-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .em-table{width:100%;border-collapse:collapse;font-size:13px;font-family:'DM Sans',sans-serif;min-width:480px}
        .em-table thead tr{background:#2563eb}
        .em-table th{padding:11px 12px;color:#fff;font-weight:600;text-align:left;white-space:nowrap;font-size:12px}
        .em-table th.th-center{text-align:center}
        .em-table tbody tr:nth-child(odd) td{background:#fff}
        .em-table tbody tr:nth-child(even) td{background:#f8fafc}
        .em-table tbody tr:hover td{filter:brightness(0.97)}
        .em-table td{padding:10px 12px;color:#374151;font-size:12px;white-space:nowrap}
        .em-emp-id{display:inline-block;font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:2px 7px}
        .em-chip{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
        .em-chip-user{background:#e0f2fe;color:#0369a1}
        .em-chip-admin{background:#faf5ff;color:#6d28d9}
        .em-chip-active{background:#dcfce7;color:#166534}
        .em-chip-inactive{background:#fee2e2;color:#991b1b}
        .em-name{font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis}
        .em-action-group{display:flex;align-items:center;gap:5px;justify-content:center}
        .em-btn-edit{display:inline-flex;align-items:center;gap:3px;background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}
        .em-btn-edit:hover{background:#dbeafe}
        .em-btn-del{display:inline-flex;align-items:center;gap:3px;background:#fff1f2;color:#dc2626;border:1px solid #fca5a5;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer}
        .em-btn-del:hover{background:#fee2e2}
        .em-empty{text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px}
        .em-pagination{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-top:1px solid #f1f5f9;background:#f8fafc;font-size:12px;color:#64748b;flex-wrap:wrap;gap:8px;font-family:'DM Sans',sans-serif}
        .em-pag-btns{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
        .em-pag-btn{padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;min-width:30px;height:30px;display:flex;align-items:center;justify-content:center}
        .em-pag-btn:hover:not(:disabled){background:#f1f5f9}
        .em-pag-btn.active{background:#2563eb;color:#fff;border-color:#2563eb;font-weight:700}
        .em-pag-btn:disabled{border-color:#e2e8f0;background:#f1f5f9;color:#94a3b8;cursor:not-allowed}
        .em-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.5);display:flex;align-items:flex-start;justify-content:center;z-index:2000;overflow-y:auto;padding:16px 8px;-webkit-overflow-scrolling:touch}
        .em-modal{background:#fff;border-radius:14px;width:100%;max-width:900px;box-shadow:0 8px 40px rgba(0,0,0,0.22);display:flex;flex-direction:column;max-height:calc(100vh - 32px)}
        .em-modal-header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#2563eb;border-radius:14px 14px 0 0;flex-shrink:0}
        .em-modal-body{padding:16px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch}
        .em-modal-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #f1f5f9;background:#f8fafc;flex-shrink:0;border-radius:0 0 14px 14px}
        .em-grid{display:grid;grid-template-columns:1fr;gap:12px;padding:12px 0}
        @media(min-width:480px){.em-grid{grid-template-columns:repeat(2,1fr);gap:14px}}
        @media(min-width:768px){.em-grid{grid-template-columns:repeat(3,1fr);gap:14px 16px}}
        .em-col-full{grid-column:1/-1}
        .em-hint-pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:2px 8px;margin-top:4px}
        .em-btn-cancel{padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#475569;font-family:'DM Sans',sans-serif}
        .em-btn-save{display:flex;align-items:center;gap:6px;padding:9px 20px;border:none;background:#16a34a;color:#fff;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 2px 6px rgba(22,163,74,0.3)}
        .em-btn-save:disabled{opacity:0.7;cursor:not-allowed}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,0.1)!important}
        select,input,textarea{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
      `}</style>

      <div className="em-wrap">
        <div className="em-page-header">
          <div>
            <h1>Employee Master</h1>
            <p>{total} employee{total!==1?'s':''} registered</p>
          </div>
          <button className="em-add-btn" onClick={openCreate}><Plus size={15}/> New Employee</button>
        </div>

        <div className="em-toolbar">
          <div className="em-search-wrap">
            <Search size={14}/>
            <input className="em-search" placeholder="Search name, code, contact…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
            <select className="em-filter-sel" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
              <option value=''>All Categories</option>
              <option>User</option><option>Admin</option>
            </select>
            <select className="em-filter-sel" value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option><option>Inactive</option>
            </select>
            <select className="em-filter-sel" value={filterUnit} onChange={e => { setFilterUnit(e.target.value); setPage(1); }}>
              <option value=''>All Units</option>
              {lookup.units.map(u => <option key={u.id} value={String(u.id)}>{u.unit_name}</option>)}
            </select>
            {!isMobile && <span style={{ fontSize:12,color:'#64748b',whiteSpace:'nowrap' }}>{total} record(s)</span>}
          </div>
          <div className="em-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        <div className="em-card">
          <div className="em-table-wrap">
            <table className="em-table">
              <thead>
                <tr>
                  <th>#</th><th>Emp. Code</th><th>Name</th>
                  {showContact && <th>Contact</th>}
                  {showContact && <th>Email</th>}
                  {showDesig   && <th>Designation</th>}
                  <th>Category</th>
                  {showUnit    && <th>Unit</th>}
                  <th>Module Access</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="em-empty"><Loader2 size={22} style={{ animation:'spin 1s linear infinite',display:'inline-block' }}/></td></tr>
                ) : employees.length === 0 ? (
                  <tr><td colSpan={12} className="em-empty">{search||filterCat||filterSt||filterUnit ? 'No employees match your search' : 'No employees yet. Click "New Employee" to create one.'}</td></tr>
                ) : employees.map((emp, i) => {
                  const mods = emp.module_access ? (typeof emp.module_access==='string'?JSON.parse(emp.module_access):emp.module_access) : [];
                  return (
                    <tr key={emp.id}>
                      <td style={{ color:'#94a3b8' }}>{(page-1)*pageSize+i+1}</td>
                      <td><span className="em-emp-id">{emp.employee_code??'—'}</span></td>
                      <td className="em-name">{emp.employee_name}</td>
                      {showContact && <td>{emp.contact_number||'—'}</td>}
                      {showContact && <td style={{ maxWidth:140,overflow:'hidden',textOverflow:'ellipsis' }}>{emp.email||'—'}</td>}
                      {showDesig   && <td style={{ maxWidth:140,overflow:'hidden',textOverflow:'ellipsis' }}>{emp.designation_name||'—'}</td>}
                      <td><span className={`em-chip ${emp.employee_category==='Admin'?'em-chip-admin':'em-chip-user'}`}>{emp.employee_category}</span></td>
                      {showUnit && <td>{emp.unit_name||'—'}</td>}
                      <td>
                        {mods.length > 0
                          ? <span style={{ background:'#eff6ff',color:'#1d4ed8',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:'1px solid #bfdbfe' }}>{mods.length} modules</span>
                          : <span style={{ color:'#94a3b8',fontSize:11 }}>No access</span>}
                      </td>
                      <td><span className={`em-chip ${emp.status==='Active'?'em-chip-active':'em-chip-inactive'}`}>{emp.status}</span></td>
                      <td>
                        <div className="em-action-group">
                          <button className="em-btn-edit" onClick={() => openEdit(emp.id!)}>✏️ {!isMobile&&'Edit'}</button>
                          <button className="em-btn-del"  onClick={() => handleDelete(emp.id!)}>🗑 {!isMobile&&'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && total > 0 && (
            <div className="em-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="em-pag-btns">
                <button className="em-pag-btn" onClick={() => goTo(1)} disabled={page===1}>«</button>
                <button className="em-pag-btn" onClick={() => goTo(page-1)} disabled={page===1}>‹</button>
                {pageNums.map(p => <button key={p} className={`em-pag-btn${p===page?' active':''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="em-pag-btn" onClick={() => goTo(page+1)} disabled={page===totalPages}>›</button>
                <button className="em-pag-btn" onClick={() => goTo(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL */}
        {showForm && (
          <div className="em-modal-overlay" onClick={e => { if (e.target===e.currentTarget) setShowForm(false); }}>
            <div className="em-modal">
              <div className="em-modal-header">
                <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
                  <h2 style={{ margin:0,fontSize:isMobile?15:18,fontWeight:700,color:'#fff' }}>
                    {editId ? '✏️ Edit Employee' : '➕ New Employee'}
                  </h2>
                  {editId && form.employee_code && (
                    <span style={{ fontSize:11,color:'#bfdbfe',fontFamily:'DM Mono,monospace' }}>{form.employee_code}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff"/></button>
              </div>

              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }}/>
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',padding:0,color:'#ef4444',display:'flex',alignItems:'center' }}><X size={14}/></button>
                </div>
              )}

              <div className="em-modal-body">

                {/* ── Employee Details ── */}
                <SectionHead title="Employee Details" open={sec.details} onToggle={() => toggle('details')}/>
                {sec.details && (
                  <div className="em-grid">
                    <Field label="Employee Code">
                      <input type="text" value={editId?(form.employee_code||''):'Auto-generated'} readOnly
                        style={{ ...s.input,...s.inputDisabled,fontFamily:'DM Mono,monospace',letterSpacing:'0.05em',color:'#475569' }}/>
                    </Field>

                    <Field label="Employee Name" required error={fieldErrors.employee_name}>
                      <input type="text" value={form.employee_name}
                        onChange={e => { set('employee_name',e.target.value); if (e.target.value.trim()) setFieldErrors(p => ({...p,employee_name:undefined})); }}
                        placeholder="Full name" style={{ ...s.input,...(fieldErrors.employee_name?s.inputError:{}) }}/>
                    </Field>

                    <Field label="Contact Number" error={fieldErrors.contact_number}>
                      <input type="tel" value={form.contact_number}
                        onChange={e => { const v=e.target.value.replace(/[^\d\s\+\-]/g,'').slice(0,15); set('contact_number',v); }}
                        placeholder="e.g. 9876543210" maxLength={15}
                        style={{ ...s.input,...(fieldErrors.contact_number?s.inputError:{}) }}/>
                      {!fieldErrors.contact_number && <span className="em-hint-pill">10–13 digits</span>}
                    </Field>

                    {/* ── Email Field ── */}
                    <Field label="Email Address" error={fieldErrors.email}>
                      <div style={{ position:'relative' }}>
                        <input type="email" value={form.email}
                          onChange={e => { set('email',e.target.value); setFieldErrors(p => ({...p,email:undefined})); }}
                          onBlur={e => { if (e.target.value && !isValidEmail(e.target.value)) setFieldErrors(p => ({...p,email:'Enter a valid email.'})); }}
                          placeholder="employee@company.com"
                          style={{ ...s.input,paddingRight:36,...(fieldErrors.email?s.inputError:form.email&&isValidEmail(form.email)?s.inputSuccess:{}) }}/>
                        {form.email && (
                          <span style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center' }}>
                            {isValidEmail(form.email) ? <CheckCircle2 size={14} color="#16a34a"/> : <AlertCircle size={14} color="#dc2626"/>}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.email && <span className="em-hint-pill"><Mail size={9}/> Used for login & welcome email</span>}
                    </Field>

                    <Field label="Designation">
                      <SearchableDropdown value={form.designation_id} onChange={val => set('designation_id',val)} options={desigOptions} placeholder="Select designation…" searchPlaceholder="Search designation…"/>
                    </Field>

                    <Field label="Unit">
                      <SearchableDropdown value={form.unit_id} onChange={val => set('unit_id',val)} options={unitOptions} placeholder="Select unit…" searchPlaceholder="Search unit…"/>
                    </Field>

                    <Field label="Employee Category">
                      <div style={{ display:'flex',gap:10 }}>
                        {(['User','Admin'] as const).map(cat => (
                          <label key={cat} style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1,padding:'8px 12px',border:`2px solid ${form.employee_category===cat?'#2563eb':'#e2e8f0'}`,borderRadius:8,background:form.employee_category===cat?'#eff6ff':'#fff',transition:'all 0.15s',fontSize:13,fontWeight:form.employee_category===cat?700:400,color:form.employee_category===cat?'#1d4ed8':'#374151' }}>
                            <input type="radio" name="employee_category" value={cat} checked={form.employee_category===cat} onChange={() => set('employee_category',cat)} style={{ accentColor:'#2563eb' }}/>
                            <User size={13} color={form.employee_category===cat?'#2563eb':'#94a3b8'}/>{cat}
                          </label>
                        ))}
                      </div>
                    </Field>

                    <Field label="Status">
                      <div style={{ display:'flex',gap:10 }}>
                        {(['Active','Inactive'] as const).map(st => (
                          <label key={st} style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1,padding:'8px 12px',border:`2px solid ${form.status===st?(st==='Active'?'#16a34a':'#dc2626'):'#e2e8f0'}`,borderRadius:8,background:form.status===st?(st==='Active'?'#f0fdf4':'#fef2f2'):'#fff',transition:'all 0.15s',fontSize:13,fontWeight:form.status===st?700:400,color:form.status===st?(st==='Active'?'#166534':'#991b1b'):'#374151' }}>
                            <input type="radio" name="status" value={st} checked={form.status===st} onChange={() => set('status',st)} style={{ accentColor:st==='Active'?'#16a34a':'#dc2626' }}/>{st}
                          </label>
                        ))}
                      </div>
                    </Field>

                    {/* Password */}
                    <div className="em-col-full">
                      <div style={{ border:'1.5px solid #c4b5fd',borderRadius:12,overflow:'hidden',background:'#fff',marginTop:4 }}>
                        <div style={{ background:'#faf5ff',borderBottom:'1px solid #c4b5fd',padding:'10px 16px',display:'flex',alignItems:'center',gap:8 }}>
                          <Lock size={14} color="#7c3aed"/>
                          <span style={{ fontSize:12,fontWeight:800,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.07em' }}>Login Password</span>
                          <span style={{ marginLeft:'auto',fontSize:11,color:'#94a3b8' }}>ERP login credential</span>
                        </div>
                        <div style={{ padding:'14px 16px' }}>
                          <div style={{ maxWidth:360 }}>
                            <label style={s.label}><Lock size={11}/> Password</label>
                            <div style={{ position:'relative' }}>
                              <input type={showPwd?'text':'password'} value={form.password} onChange={e => set('password',e.target.value)} placeholder="Set a login password" autoComplete="new-password" style={{ ...s.input,paddingRight:38 }}/>
                              <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#64748b',display:'flex',alignItems:'center',padding:0 }}>
                                {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                              </button>
                            </div>
                            <p style={{ margin:'6px 0 0',fontSize:11,color:'#64748b',lineHeight:1.5 }}>
                              💡 Employee logs in using <strong>Employee Code</strong> + this password. Leave blank to keep existing.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                   
                  </div>
                )}

                {/* ── Address ── */}
                <SectionHead title="Residential Address" open={sec.address} onToggle={() => toggle('address')}/>
                {sec.address && <AddressBlock form={form} onChange={handleAddressChange} fieldErrors={fieldErrors}/>}

                {/* ── Module & Stage Access ── */}
                <SectionHead
                  title="Module & Stage Access"
                  open={sec.access}
                  onToggle={() => toggle('access')}
                  badge={accessBadge}
                />
                {sec.access && (
                  <div style={{ padding:'12px 0' }}>
                    <div style={{ display:'flex',alignItems:'flex-start',gap:10,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 14px',marginBottom:14 }}>
                      <Shield size={15} color="#2563eb" style={{ flexShrink:0,marginTop:1 }}/>
                      <div style={{ fontSize:12,color:'#1e40af',lineHeight:1.5 }}>
                        <strong>Access Control:</strong> Select which modules this employee can see in the sidebar. Expand each module to pick specific stages/pages — some stages (like "Other Master" or "Fabric Purchase") have their own sub-pages, expand them too. Unchecked items are hidden from the employee.
                      </div>
                    </div>
                    <ModuleAccessPanel
                      moduleAccess={form.module_access || []}
                      stageAccess={form.stage_access || []}
                      onChange={handleAccessChange}
                    />
                  </div>
                )}

              </div>

              <div className="em-modal-footer">
                <button className="em-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="em-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Employee')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  closeBtn:     { background:'none',border:'none',padding:'0 4px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:0.85 },
  errorBanner:  { display:'flex',alignItems:'center',gap:8,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,color:'#ef4444',padding:'10px 16px',margin:'12px 16px 0',fontSize:13,fontFamily:"'DM Sans',sans-serif" },
  label:        { display:'block',fontSize:11,fontWeight:700,color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em' },
  input:        { width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #cbd5e1',fontSize:13,color:'#1e293b',outline:'none',boxSizing:'border-box',transition:'border-color 0.15s',background:'#fff' },
  inputDisabled:{ background:'#f1f5f9',color:'#94a3b8',cursor:'not-allowed',border:'1px solid #e2e8f0' },
  inputError:   { border:'1.5px solid #fca5a5',background:'#fff5f5',boxShadow:'0 0 0 3px rgba(239,68,68,0.08)' },
  inputSuccess: { border:'1.5px solid #86efac',background:'#f0fdf4' },
  sectionHead:  { display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 14px',cursor:'pointer',marginTop:18,userSelect:'none' },
  sectionTitle: { fontWeight:700,fontSize:13,color:'#1e293b' },
};