// frontend/src/pages/admin/SupplierMaster.tsx
// Supplier Master — Updated to match CustomerMaster format:
//   • Full India states + all districts (via INDIA_STATES map)
//   • AddressBlock component (same as CustomerMaster)
//   • Validation: Contact No, Email, GST, PAN, TAN with inline counters + hint/error pills
//   • Toast + dismissible inline error banner (same as CustomerMaster)
//   • Export dropdown: CSV, Excel, Print Table

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  Plus,
  Search,
  Settings,
  X,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  MapPin,
  Mail,
  Download,
  Printer,
  TableIcon,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Attachment { id?: number; file_name: string; file_path?: string; isNew?: boolean; file?: File }

interface Supplier {
  id?: number;
  supplier_id?: string;
  type_id: string;
  supplier_name: string;
  address: string;
  pin_code: string;
  district: string;
  state: string;
  country: string;
  gst_no: string;
  pan_no: string;
  tan_no: string;
  msme: 'Yes' | 'No' | '';
  msme_reg_no: string;
  email: string;
  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;
  status: string;
  attachments: Attachment[];
}

interface SupplierType {
  id: number;
  type_name: string;
  supply_type: string;
  type_description?: string;
}

interface LookupData {
  supplierTypes: SupplierType[];
}

// ─── Toast Types ─────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string; }

// ─── Validation Helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email) return true;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.trim());
}
function isValidGst(gst: string): boolean {
  if (!gst) return true;
  return /^[A-Z0-9]{15}$/i.test(gst.trim());
}
function isValidPan(pan: string): boolean {
  if (!pan) return true;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan.trim());
}
function isValidTan(tan: string): boolean {
  if (!tan) return true;
  return /^[A-Z]{4}[0-9]{5}[A-Z]$/i.test(tan.trim());
}
function isValidContact(contact: string): boolean {
  if (!contact) return true;
  const digits = contact.replace(/[\s\-\+]/g, '');
  return /^\d{10,13}$/.test(digits);
}

// ─── Toast Hook ───────────────────────────────────────────────────────────────

let _toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  return { toasts, push, remove };
}

// ─── Toast Container ──────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (toasts.length === 0) return null;
  return (
    <div style={{ position:'fixed',top:20,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:10,maxWidth:360,width:'calc(100vw - 40px)',pointerEvents:'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display:'flex',alignItems:'flex-start',gap:10,background:c.bg,border:`1px solid ${c.border}`,borderRadius:10,padding:'12px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.12)',pointerEvents:'all',animation:'toastIn 0.25s ease-out',fontFamily:"'DM Sans', sans-serif" }}>
            <span style={{ flexShrink:0,marginTop:1 }}>{c.icon}</span>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:c.color }}>{t.title}</p>
              {t.message && <p style={{ margin:'2px 0 0',fontSize:12,color:c.color,opacity:0.8,lineHeight:1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink:0,background:'none',border:'none',padding:0,cursor:'pointer',color:c.color,opacity:0.6,display:'flex',alignItems:'center',marginTop:1 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── India States & Districts (full) ─────────────────────────────────────────

const INDIA_STATES: Record<string, string[]> = {
  "Tamil Nadu": ["Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri","Dindigul","Erode","Kallakurichi","Kancheepuram","Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore","Viluppuram","Virudhunagar"],
  "Andhra Pradesh": ["Alluri Sitharama Raju","Anakapalli","Anantapur","Annamayya","Bapatla","Chittoor","Dr. B.R. Ambedkar Konaseema","East Godavari","Eluru","Guntur","Kakinada","Krishna","Kurnool","Manyam","N T Rama Rao","Nandyal","Nellore","Palnadu","Prakasam","Sri Balaji","Sri Sathya Sai","Srikakulam","Tirupati","Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa"],
  "Karnataka": ["Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga","Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir"],
  "Kerala": ["Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam","Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta","Thiruvananthapuram","Thrissur","Wayanad"],
  "Maharashtra": ["Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal"],
  "Gujarat": ["Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar","Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka","Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad"],
  "Rajasthan": ["Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi","Sri Ganganagar","Tonk","Udaipur"],
  "Uttar Pradesh": ["Agra","Aligarh","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh","Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti","Bhadohi","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah","Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar","Ghaziabad","Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun","Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi","Kushinagar","Lakhimpur Kheri","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri","Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Pratapgarh","Prayagraj","Raebareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur","Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi"],
  "West Bengal": ["Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur","Darjeeling","Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong","Kolkata","Malda","Murshidabad","Nadia","North 24 Parganas","Paschim Bardhaman","Paschim Medinipur","Purba Bardhaman","Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur"],
  "Telangana": ["Adilabad","Bhadradri Kothagudem","Hanamkonda","Hyderabad","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam","Kumuram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak","Medchal Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal","Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet","Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri"],
  "Delhi": ["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi"],
  "Punjab": ["Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Malerkotla","Mansa","Moga","Mohali","Muktsar","Pathankot","Patiala","Rupnagar","Sangrur","Shaheed Bhagat Singh Nagar","Tarn Taran"],
  "Haryana": ["Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram","Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh","Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar"],
  "Bihar": ["Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur","Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad","Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura","Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa","Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi","Siwan","Supaul","Vaishali","West Champaran"],
  "Madhya Pradesh": ["Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul","Bhind","Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas","Dhar","Dindori","Guna","Gwalior","Harda","Hoshangabad","Indore","Jabalpur","Jhabua","Katni","Khandwa","Khargone","Mandla","Mandsaur","Morena","Narsinghpur","Neemuch","Niwari","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna","Sehore","Seoni","Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli","Tikamgarh","Ujjain","Umaria","Vidisha"],
  "Odisha": ["Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh","Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi","Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj","Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Sonepur","Sundargarh"],
  "Assam": ["Bajali","Baksa","Barpeta","Biswanath","Bongaigaon","Cachar","Charaideo","Chirang","Darrang","Dhemaji","Dhubri","Dibrugarh","Dima Hasao","Goalpara","Golaghat","Hailakandi","Hojai","Jorhat","Kamrup","Kamrup Metropolitan","Karbi Anglong","Karimganj","Kokrajhar","Lakhimpur","Majuli","Morigaon","Nagaon","Nalbari","Sivasagar","Sonitpur","South Salmara Mankachar","Tinsukia","Udalguri","West Karbi Anglong"],
  "Jharkhand": ["Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa","Giridih","Godda","Gumla","Hazaribagh","Jamtara","Khunti","Koderma","Latehar","Lohardaga","Pakur","Palamu","Ramgarh","Ranchi","Sahebganj","Seraikela Kharsawan","Simdega","West Singhbhum"],
  "Himachal Pradesh": ["Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu","Lahaul Spiti","Mandi","Shimla","Sirmaur","Solan","Una"],
  "Uttarakhand": ["Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital","Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi"],
  "Chhattisgarh": ["Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur","Dantewada","Dhamtari","Durg","Gariaband","Gaurela Pendra Marwahi","Janjgir Champa","Jashpur","Kabirdham","Kanker","Khairagarh","Kondagaon","Korba","Koriya","Mahasamund","Manendragarh","Mohla Manpur","Mungeli","Narayanpur","Raigarh","Raipur","Rajnandgaon","Sakti","Sarangarh Bilaigarh","Sukma","Surajpur","Surguja"],
  "Goa": ["North Goa","South Goa"],
  "Manipur": ["Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam","Kakching","Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong","Tengnoupal","Thoubal","Ukhrul"],
  "Meghalaya": ["East Garo Hills","East Jaintia Hills","East Khasi Hills","Eastern West Khasi Hills","North Garo Hills","Ri Bhoi","South Garo Hills","South West Garo Hills","South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills"],
  "Tripura": ["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"],
  "Nagaland": ["Chumoukedima","Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon","Niuland","Noklak","Peren","Phek","Shamator","Tseminyu","Tuensang","Wokha","Zunheboto"],
  "Arunachal Pradesh": ["Anjaw","Changlang","Dibang Valley","East Kameng","East Siang","Kamle","Kra Daadi","Kurung Kumey","Lepa Rada","Lohit","Longding","Lower Dibang Valley","Lower Siang","Lower Subansiri","Namsai","Pakke Kessang","Papum Pare","Shi Yomi","Siang","Tawang","Tirap","Upper Dibang Valley","Upper Siang","Upper Subansiri","West Kameng","West Siang"],
  "Mizoram": ["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saitual","Serchhip"],
  "Sikkim": ["East Sikkim","North Sikkim","Pakyong","Soreng","South Sikkim","West Sikkim"],
  "Jammu & Kashmir": ["Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua","Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi","Samba","Shopian","Srinagar","Udhampur"],
  "Ladakh": ["Kargil","Leh"],
  "Andaman & Nicobar Islands": ["Nicobar","North and Middle Andaman","South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal","Mahé","Puducherry","Yanam"],
};

const STATE_LIST = Object.keys(INDIA_STATES).sort();
const DEFAULT_STATE = 'Tamil Nadu';

// ─── FieldError ──────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#dc2626',marginTop:4,lineHeight:1.4 }}>
      <AlertCircle size={11} style={{ flexShrink:0 }} />
      {msg}
    </span>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({ label, required, children, error }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string;
}) {
  return (
    <div>
      <label style={s.label}>
        {label}{required && <span style={{ color:'#ef4444' }}> *</span>}
      </label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHead({ title, open, onToggle, badge }: {
  title: string; open: boolean; onToggle: () => void; badge?: React.ReactNode;
}) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display:'flex',alignItems:'center',gap:8 }}>
        <span style={s.sectionTitle}>{title}</span>
        {badge}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── AddressBlock ─────────────────────────────────────────────────────────────

interface AddressBlockProps {
  form: Supplier;
  onChange: (updates: Partial<Supplier>) => void;
  title: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
}

function AddressBlock({ form, onChange, title, accent, accentLight, accentBorder }: AddressBlockProps) {
  const state     = form.state || DEFAULT_STATE;
  const districts = INDIA_STATES[state] || [];

  const set = (key: keyof Supplier, val: string) => onChange({ [key]: val } as Partial<Supplier>);

  const handleStateChange = (newState: string) => {
    onChange({ state: newState, district: '' });
  };

  return (
    <div style={{ border:`1.5px solid ${accentBorder}`,borderRadius:12,overflow:'hidden',background:'#fff',marginTop:10 }}>
      <div style={{ background:accentLight,borderBottom:`1px solid ${accentBorder}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:8 }}>
        <MapPin size={15} color={accent} />
        <span style={{ fontSize:12,fontWeight:800,color:accent,textTransform:'uppercase',letterSpacing:'0.07em' }}>{title}</span>
      </div>
      <div style={{ padding:'14px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 16px' }}>
        <div style={{ gridColumn:'1 / -1' }}>
          <label style={s.label}>Address Line 1</label>
          <input value={form.address || ''} onChange={(e) => set('address', e.target.value)}
            placeholder="Door no, Street name" style={s.input} />
        </div>
  
        <div>
          <label style={s.label}>State</label>
          <select value={state} onChange={(e) => handleStateChange(e.target.value)} style={s.input}>
            {STATE_LIST.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div>
          <label style={s.label}>District</label>
          <select value={form.district || ''} onChange={(e) => set('district', e.target.value)} style={s.input}>
            <option value="">— Select District —</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={s.label}>Pin Code</label>
          <input value={form.pin_code || ''}
            onChange={(e) => set('pin_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit pincode" maxLength={6} style={s.input} />
        </div>
        <div>
          <label style={s.label}>Country</label>
          <input value={form.country || 'India'} onChange={(e) => set('country', e.target.value)} style={s.input} />
        </div>
      </div>
    </div>
  );
}

// ─── Validation state type ────────────────────────────────────────────────────

interface FieldErrors {
  supplier_name?: string;
  type_id?: string;
  email?: string;
  contact_no?: string;
  gst_no?: string;
  pan_no?: string;
  tan_no?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BLANK: Supplier = {
  type_id: '', supplier_name: '',
  address: '', pin_code: '', district: '', state: DEFAULT_STATE, country: 'India',
  gst_no: '', pan_no: '', tan_no: '',
  msme: 'No', msme_reg_no: '',
  email: '', contact_name: '', designation: '', contact_no: '', contact_email: '',
  status: 'Active', attachments: [],
};

const API = '/api/suppliers';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportToCSV(rows: Supplier[]) {
  const headers = ['Supplier ID','Type','Supplier Name','Contact No','Email','GST No','PAN No','TAN No','MSME','State','District','Status'];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.supplier_id ?? '',
        (r as any).type_name ?? '',
        `"${(r.supplier_name ?? '').replace(/"/g, '""')}"`,
        r.contact_no ?? '',
        r.email ?? '',
        r.gst_no ?? '',
        r.pan_no ?? '',
        r.tan_no ?? '',
        r.msme ?? '',
        r.state ?? '',
        r.district ?? '',
        r.status ?? '',
      ].join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `suppliers_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToExcel(rows: Supplier[]) {
  // Build a simple HTML table and use the Excel mime type trick
  const headers = ['Supplier ID','Type','Supplier Name','Contact No','Email','GST No','PAN No','TAN No','MSME','State','District','Status'];
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const trs = rows.map((r) =>
    `<tr>
      <td>${r.supplier_id ?? ''}</td>
      <td>${(r as any).type_name ?? ''}</td>
      <td>${r.supplier_name ?? ''}</td>
      <td>${r.contact_no ?? ''}</td>
      <td>${r.email ?? ''}</td>
      <td>${r.gst_no ?? ''}</td>
      <td>${r.pan_no ?? ''}</td>
      <td>${r.tan_no ?? ''}</td>
      <td>${r.msme ?? ''}</td>
      <td>${r.state ?? ''}</td>
      <td>${r.district ?? ''}</td>
      <td>${r.status ?? ''}</td>
    </tr>`
  ).join('');
  const html = `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `suppliers_${new Date().toISOString().slice(0,10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function printTable(rows: Supplier[]) {
  const headers = ['Sup. ID','Type','Supplier Name','Contact No','Email','GST No','MSME','State','Status'];
  const th  = headers.map((h) => `<th>${h}</th>`).join('');
  const trs = rows.map((r, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td>${r.supplier_id ?? '—'}</td>
      <td>${(r as any).type_name ?? '—'}</td>
      <td><strong>${r.supplier_name ?? ''}</strong></td>
      <td>${r.contact_no ?? '—'}</td>
      <td>${r.email ?? '—'}</td>
      <td style="font-family:monospace">${r.gst_no ?? '—'}</td>
      <td>${r.msme === 'Yes' ? 'MSME' : '—'}</td>
      <td>${r.state ?? '—'}</td>
      <td>${r.status ?? '—'}</td>
    </tr>`
  ).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html><head><title>Supplier Master</title>
    <style>
      body { font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
      h2 { margin: 0 0 4px; font-size: 18px; }
      p  { margin: 0 0 16px; font-size: 12px; color: #64748b; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #0f766e; color: #fff; padding: 8px 10px; text-align: left; white-space: nowrap; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
      @media print { body { margin: 8px; } }
    </style>
    </head><body>
    <h2>Supplier Master</h2>
    <p>Printed on ${new Date().toLocaleString()} &nbsp;·&nbsp; ${rows.length} record(s)</p>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ suppliers, isMobile }: { suppliers: Supplier[]; isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: open ? '#f0fdfa' : '#fff',
          color: '#0f766e',
          border: `1.5px solid ${open ? '#0f766e' : '#5eead4'}`,
          borderRadius: 8, padding: '9px 14px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: 'nowrap', transition: 'all 0.15s',
          boxShadow: open ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none',
        }}
      >
        <Download size={14} />
        {!isMobile && 'Export'}
        <ChevronDown size={13} style={{ transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: 192, zIndex: 500, overflow: 'hidden',
          animation: 'toastIn 0.15s ease-out',
        }}>
          {/* Dropdown label */}
          <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Export / Print
            </span>
          </div>

          {/* CSV */}
          <button
            onClick={() => { exportToCSV(suppliers); setOpen(false); }}
            style={dropItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdfa')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ ...dropIconWrap, background: '#eff6ff', color: '#3b82f6' }}>
              <FileText size={13} />
            </span>
            Export as CSV
          </button>

          {/* Excel */}
          <button
            onClick={() => { exportToExcel(suppliers); setOpen(false); }}
            style={dropItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdfa')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ ...dropIconWrap, background: '#f0fdf4', color: '#16a34a' }}>
              <TableIcon size={13} />
            </span>
            Export as Excel
          </button>

          {/* Print */}
          <button
            onClick={() => { printTable(suppliers); setOpen(false); }}
            style={{ ...dropItemStyle, borderTop: '1px solid #f1f5f9' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdfa')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ ...dropIconWrap, background: '#fef3c7', color: '#d97706' }}>
              <Printer size={13} />
            </span>
            Print Table
          </button>
        </div>
      )}
    </div>
  );
}

const dropItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '9px 14px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 500, color: '#1e293b',
  fontFamily: "'DM Sans', sans-serif",
  textAlign: 'left', transition: 'background 0.12s',
};

const dropIconWrap: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6, flexShrink: 0,
};

// ─── Responsive hook ─────────────────────────────────────────────────────────
function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Sanitise ────────────────────────────────────────────────────────────────

function sanitizeSupplier(data: any): Supplier {
  const safe = (v: any) => (v == null ? '' : String(v));
  let address = safe(data.address);
  if (!address && data.address) {
    const lines = String(data.address).split('\n');
    address = lines[0] || '';
  }
  return {
    ...BLANK,
    ...data,
    address,
    type_id:    safe(data.type_id),
    state:      safe(data.state) || DEFAULT_STATE,
    country:    safe(data.country) || 'India',
    status:     safe(data.status) || 'Active',
    msme:       (data.msme === 'Yes' ? 'Yes' : 'No') as 'Yes' | 'No',
    gst_no:     safe(data.gst_no),
    pan_no:     safe(data.pan_no),
    tan_no:     safe(data.tan_no),
    attachments: data.attachments ?? [],
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SupplierMaster() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lookup, setLookup]       = useState<LookupData>({ supplierTypes: [] });
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filterSt, setFilterSt]   = useState('');
  const [filterType, setFilterType] = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Supplier>(BLANK);
  const [editId, setEditId]       = useState<number | null>(null);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sec, setSec]             = useState({ basic: true, address: true, contact: true, tax: true, attach: false });

  // ── Supplier Type Manager state ──────────────────────────────────────────
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [typeForm, setTypeForm] = useState({ type_name: '', supply_type: 'Normal', type_description: '' });
  const [typeEditId, setTypeEditId] = useState<number | null>(null);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState('');
  const [typeList, setTypeList] = useState<SupplierType[]>([]);

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const width   = useWidth();
  const isMobile = width < 576;

  // ── Load list ─────────────────────────────────────────────────────────────
  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterSt   ? { status: filterSt }    : {}),
        ...(filterType ? { type_id: filterType }  : {}),
      });
      const res = await fetch(`${API}?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuppliers((data.data ?? []).map(sanitizeSupplier));
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch suppliers. Please try again.');
    }
    setLoading(false);
  };

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API}/meta/lookup`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLookup((prev) => ({
        supplierTypes: Array.isArray(data.supplierTypes) ? data.supplierTypes : prev.supplierTypes,
      }));
    } catch (err) {
      console.warn('[SupplierMaster] lookup failed:', err);
    }
  };

  const loadTypes = async () => {
    try {
      const res = await fetch(`${API}/types`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTypeList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[SupplierMaster] loadTypes failed:', err);
    }
  };

  const openTypeManager = () => {
    loadTypes();
    setTypeForm({ type_name: '', supply_type: 'Normal', type_description: '' });
    setTypeEditId(null); setTypeError(''); setShowTypeManager(true);
  };

  const handleTypeSave = async () => {
    if (!typeForm.type_name.trim()) { setTypeError('Type Name is required'); return; }
    if (!typeForm.supply_type)      { setTypeError('Supply Type is required'); return; }
    setTypeError(''); setTypeSaving(true);
    try {
      const res = await fetch(
        typeEditId ? `${API}/types/${typeEditId}` : `${API}/types`,
        { method: typeEditId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeForm) }
      );
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', typeEditId ? 'Type Updated' : 'Type Created', `"${typeForm.type_name}" saved.`);
      setTypeForm({ type_name: '', supply_type: 'Normal', type_description: '' }); setTypeEditId(null);
      await loadTypes(); await loadLookup();
    } catch (e: any) { setTypeError(e.message ?? 'Save failed'); }
    setTypeSaving(false);
  };

  const handleTypeEdit = (t: SupplierType) => {
    setTypeForm({ type_name: t.type_name, supply_type: t.supply_type, type_description: t.type_description ?? '' });
    setTypeEditId(t.id); setTypeError('');
  };

  const handleTypeDelete = async (id: number, name: string) => {
    if (!confirm(`Delete type "${name}"?`)) return;
    try {
      const res = await fetch(`${API}/types/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      pushToast('success', 'Type Deleted', `"${name}" removed.`);
      await loadTypes(); await loadLookup();
    } catch (e: any) { pushToast('error', 'Delete Failed', e.message); }
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadSuppliers(); }, [search, filterSt, filterType, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt, filterType]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Form open ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setFieldErrors({});
    setShowForm(true);
  };
  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setForm(sanitizeSupplier(data));
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch {
      pushToast('error', 'Load Failed', 'Could not load supplier details.');
    }
  };

  // ── Live field validation ─────────────────────────────────────────────────

  const validateField = (key: keyof FieldErrors, value: string) => {
    let msg = '';
    switch (key) {
      case 'email':
        if (value && !isValidEmail(value))
          msg = 'Enter a valid email (e.g. user@example.com). Format like "@domain.com" or "user.domain" is not valid.';
        break;
      case 'contact_no':
        if (value && !isValidContact(value))
          msg = 'Contact number must be 10–13 digits (digits only, + or spaces allowed).';
        break;
      case 'gst_no':
        if (value && value.length !== 15)
          msg = `GST No must be exactly 15 characters (${value.length}/15).`;
        break;
      case 'pan_no':
        if (value && !isValidPan(value))
          msg = `PAN must be 10 characters in format AAAAA9999A (${value.length}/10).`;
        break;
      case 'tan_no':
        if (value && !isValidTan(value))
          msg = `TAN must be 10 characters in format AAAA99999A (${value.length}/10).`;
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  // ── Validate all before save ───────────────────────────────────────────────

  const validateAll = (): boolean => {
    const errors: FieldErrors = {};
    if (!form.supplier_name.trim()) errors.supplier_name = 'Supplier Name is required.';
    if (!form.type_id)              errors.type_id       = 'Supplier Type is required.';
    if (form.email && !isValidEmail(form.email))
      errors.email = 'Enter a valid email address (e.g. user@example.com).';
    if (form.contact_no && !isValidContact(form.contact_no))
      errors.contact_no = 'Contact number must be 10–13 digits.';
    if (form.gst_no && form.gst_no.length !== 15)
      errors.gst_no = `GST No must be exactly 15 characters (${form.gst_no.length}/15).`;
    if (form.pan_no && !isValidPan(form.pan_no))
      errors.pan_no = `PAN No must be 10 characters in format AAAAA9999A (${form.pan_no.length}/10).`;
    if (form.tan_no && !isValidTan(form.tan_no))
      errors.tan_no = `TAN No must be 10 characters in format AAAA99999A (${form.tan_no.length}/10).`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validateAll()) {
      setError('Please fix the highlighted errors before saving.');
      const hasContactErr = !!(fieldErrors.email || fieldErrors.contact_no);
      const hasTaxErr     = !!(fieldErrors.gst_no || fieldErrors.pan_no || fieldErrors.tan_no);
      if (hasContactErr) setSec((p) => ({ ...p, contact: true }));
      if (hasTaxErr)     setSec((p) => ({ ...p, tax: true }));
      return;
    }
    setError(''); setSaving(true);
    const fd = new FormData();
    const scalar: (keyof Supplier)[] = [
      'type_id','supplier_name','address','pin_code','district','state','country',
      'gst_no','pan_no','tan_no','msme','msme_reg_no',
      'email','contact_name','designation','contact_no','contact_email','status',
    ];
    scalar.forEach((k) => fd.append(k, String(form[k] ?? '')));
    form.attachments.filter((a) => a.isNew && a.file).forEach((a) => fd.append('attachments', a.file!));
    fd.append('deleted_attachments', JSON.stringify((form as any).__deletedAttachments ?? []));
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const saved = sanitizeSupplier(await res.json());
      if (editId) {
        setSuppliers((prev) => prev.map((s) => s.id === editId ? saved : s));
      } else {
        setSuppliers((prev) => [saved, ...prev].slice(0, pageSize));
        setTotal((prev) => prev + 1);
      }
      pushToast('success', editId ? 'Supplier Updated' : 'Supplier Created',
        `${form.supplier_name} has been ${editId ? 'updated' : 'saved'} successfully.`);
      setShowForm(false);
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      pushToast('success', 'Supplier Deleted', 'The supplier record has been removed.');
      if (suppliers.length === 1 && page > 1) setPage((p) => p - 1);
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete supplier. Please try again.');
    }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────
  const set = (key: keyof Supplier, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const inp = (key: keyof Supplier, type = 'text') => (
    <input type={type} value={String(form[key] ?? '')} onChange={(e) => set(key, e.target.value)} style={s.input} />
  );
  const sel = (key: keyof Supplier, opts: string[]) => (
    <select value={String(form[key] ?? '')} onChange={(e) => set(key, e.target.value)} style={s.input}>
      <option value=''>— Select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm((prev) => ({
      ...prev,
      attachments: [...prev.attachments, ...Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }))],
    }));
  };
  const removeAttachment = (i: number) => {
    setForm((prev) => {
      const att = prev.attachments[i];
      const deleted = (prev as any).__deletedAttachments ?? [];
      return {
        ...prev,
        attachments: prev.attachments.filter((_, j) => j !== i),
        __deletedAttachments: att.id ? [...deleted, att.id] : deleted,
      };
    });
  };

  const toggle = (k: keyof typeof sec) => setSec((p) => ({ ...p, [k]: !p[k] }));

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end  = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const showContact = width >= 480;
  const showGst     = !isMobile;
  const showType    = width >= 768;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

        .sm-wrap { font-family: 'DM Sans', sans-serif; font-size: 14px; color: #1e293b; }

        .sm-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .sm-page-header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1e293b; }
        .sm-page-header p  { margin: 3px 0 0; font-size: 13px; color: #64748b; }

        .sm-add-btn { display: flex; align-items: center; gap: 6px; background: #0f766e; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(15,118,110,0.3); white-space: nowrap; flex-shrink: 0; }
        .sm-add-btn:hover { background: #0d6961; }

        .sm-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
        .sm-search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
        .sm-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .sm-search { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; outline: none; }
        .sm-search:focus { border-color: #0f766e; }
        .sm-filter-sel { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #374151; cursor: pointer; outline: none; }
        .sm-page-size { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; margin-left: auto; }
        .sm-page-size select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; cursor: pointer; outline: none; }
        .sm-rec-count { font-size: 12px; color: #64748b; white-space: nowrap; }

        .sm-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.07); margin-bottom: 24px; }
        .sm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .sm-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'DM Sans', sans-serif; min-width: 480px; }
        .sm-table thead tr { background: #0f766e; }
        .sm-table th { padding: 11px 12px; color: #fff; font-weight: 600; text-align: left; white-space: nowrap; font-size: 12px; }
        .sm-table th.th-center { text-align: center; }
        .sm-table tbody tr:nth-child(odd) td { background: #fff; }
        .sm-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .sm-table tbody tr:hover td { filter: brightness(0.97); }
        .sm-table td { padding: 10px 12px; color: #374151; font-size: 12px; white-space: nowrap; }
        .sm-sup-id { display: inline-block; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; color: #065f46; background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 6px; padding: 2px 7px; }
        .sm-chip { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .sm-chip-active   { background: #dcfce7; color: #166534; }
        .sm-chip-inactive { background: #fee2e2; color: #991b1b; }
        .sm-chip-msme     { background: #fef3c7; color: #92400e; }
        .sm-name { font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
        .sm-action-group { display: flex; align-items: center; gap: 5px; justify-content: center; }
        .sm-btn-edit { display: inline-flex; align-items: center; gap: 3px; background: #f0fdfa; color: #0f766e; border: 1px solid #5eead4; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .sm-btn-edit:hover { background: #ccfbf1; }
        .sm-btn-del { display: inline-flex; align-items: center; gap: 3px; background: #fff1f2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .sm-btn-del:hover { background: #fee2e2; }
        .sm-empty { text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 13px; }

        .sm-pagination { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-top: 1px solid #f1f5f9; background: #f8fafc; font-size: 12px; color: #64748b; flex-wrap: wrap; gap: 8px; font-family: 'DM Sans', sans-serif; }
        .sm-pag-btns { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .sm-pag-btn { padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; min-width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }
        .sm-pag-btn:hover:not(:disabled) { background: #f1f5f9; }
        .sm-pag-btn.active { background: #0f766e; color: #fff; border-color: #0f766e; font-weight: 700; }
        .sm-pag-btn:disabled { border-color: #e2e8f0; background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }

        .sm-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: flex-start; justify-content: center; z-index: 2000; overflow-y: auto; padding: 16px 8px; -webkit-overflow-scrolling: touch; }
        .sm-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 860px; box-shadow: 0 8px 40px rgba(0,0,0,0.22); display: flex; flex-direction: column; max-height: calc(100vh - 32px); }
        .sm-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #0f766e; border-radius: 14px 14px 0 0; flex-shrink: 0; }
        .sm-modal-body { padding: 16px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; }
        .sm-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid #f1f5f9; background: #f8fafc; flex-shrink: 0; border-radius: 0 0 14px 14px; }

        .sm-grid { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px 0; }
        @media (min-width: 480px) { .sm-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
        @media (min-width: 768px) { .sm-grid { grid-template-columns: repeat(3, 1fr); gap: 14px 16px; } }
        .sm-col-full { grid-column: 1 / -1; }

        .sm-btn-cancel { padding: 9px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; font-family: 'DM Sans', sans-serif; }
        .sm-btn-save { display: flex; align-items: center; gap: 6px; padding: 9px 20px; border: none; background: #16a34a; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(22,163,74,0.3); }
        .sm-btn-save:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Hint pill */
        .sm-hint-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 2px 8px; margin-top: 4px; }

        input:focus, select:focus, textarea:focus { outline: none; border-color: #0f766e !important; box-shadow: 0 0 0 3px rgba(15,118,110,0.1) !important; }
        select, input, textarea { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      <div className="sm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="sm-page-header">
          <div>
            <h1>Supplier Master</h1>
            <p>{total} supplier{total !== 1 ? 's' : ''} registered</p>
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button
              style={{ display:'flex',alignItems:'center',gap:6,background:'#f0fdfa',color:'#0f766e',border:'1px solid #5eead4',borderRadius:8,padding:'9px 14px',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap' }}
              onClick={openTypeManager}
            >
              <Settings size={14} /> Manage Types
            </button>
            {/* ── EXPORT DROPDOWN ── */}
            <ExportDropdown suppliers={suppliers} isMobile={isMobile} />
            <button className="sm-add-btn" onClick={openCreate}>
              <Plus size={15} /> New Supplier
            </button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="sm-toolbar">
          <div className="sm-search-wrap">
            <Search size={14} />
            <input className="sm-search" placeholder="Search name, email, phone, SUP-ID, GST…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
            <select className="sm-filter-sel" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
              <option value=''>All Types</option>
              {lookup.supplierTypes.map((t) => <option key={t.id} value={String(t.id)}>{t.type_name}</option>)}
            </select>
            <select className="sm-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="sm-rec-count">{total} record(s)</span>}
          </div>
          <div className="sm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* ── TABLE CARD ── */}
        <div className="sm-card">
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sup. ID</th>
                  {showType    && <th>Type</th>}
                  <th>Name</th>
                  {showContact && <th>Contact</th>}
                  {showGst     && <th>GST No</th>}
                  <th>MSME</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="sm-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite',display:'inline-block' }} />
                  </td></tr>
                ) : suppliers.length === 0 ? (
                  <tr><td colSpan={9} className="sm-empty">
                    {search || filterSt || filterType
                      ? 'No suppliers match your search'
                      : 'No suppliers yet. Click "New Supplier" to create one.'}
                  </td></tr>
                ) : (
                  suppliers.map((sup, i) => (
                    <tr key={sup.id}>
                      <td style={{ color:'#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="sm-sup-id">{sup.supplier_id ?? '—'}</span></td>
                      {showType    && <td style={{ fontSize:12,color:'#475569' }}>{(sup as any).type_name ?? '—'}</td>}
                      <td className="sm-name">{sup.supplier_name}</td>
                      {showContact && <td>{sup.contact_no || '—'}</td>}
                      {showGst     && <td style={{ fontFamily:'DM Mono, monospace',fontSize:11 }}>{sup.gst_no || '—'}</td>}
                      <td>
                        {sup.msme === 'Yes'
                          ? <span className="sm-chip sm-chip-msme">MSME</span>
                          : <span style={{ fontSize:12,color:'#9ca3af' }}>—</span>}
                      </td>
                      <td>
                        <span className={`sm-chip ${sup.status === 'Active' ? 'sm-chip-active' : 'sm-chip-inactive'}`}>
                          {sup.status}
                        </span>
                      </td>
                      <td>
                        <div className="sm-action-group">
                          <button className="sm-btn-edit" onClick={() => openEdit(sup.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="sm-btn-del"  onClick={() => handleDelete(sup.id!)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="sm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="sm-pag-btns">
                <button className="sm-pag-btn" onClick={() => goTo(1)}        disabled={page === 1}>«</button>
                <button className="sm-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`sm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="sm-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="sm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="sm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="sm-modal">

              {/* Header */}
              <div className="sm-modal-header">
                <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
                  <h2 style={{ margin:0,fontSize:isMobile ? 15 : 18,fontWeight:700,color:'#fff' }}>
                    {editId ? '✏️ Edit Supplier' : '➕ New Supplier'}
                  </h2>
                  {editId && form.supplier_id && (
                    <span style={{ fontSize:11,color:'#99f6e4',fontFamily:'DM Mono, monospace' }}>{form.supplier_id}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Inline error */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',padding:0,color:'#ef4444',display:'flex',alignItems:'center',flexShrink:0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="sm-modal-body">

                {/* ── Basic Info ── */}
                <SectionHead title='Basic Information' open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="sm-grid">
                    <Field label='Supplier Type' required error={fieldErrors.type_id}>
                      <select
                        value={form.type_id}
                        onChange={(e) => {
                          set('type_id', e.target.value);
                          if (e.target.value) setFieldErrors((p) => ({ ...p, type_id: undefined }));
                        }}
                        style={{ ...s.input, ...(fieldErrors.type_id ? s.inputError : {}) }}
                      >
                        <option value=''>— Select Type —</option>
                        {lookup.supplierTypes.map((t) => (
                          <option key={t.id} value={String(t.id)}>{t.type_name} ({t.supply_type})</option>
                        ))}
                      </select>
                    </Field>

                    <div className="sm-col-full">
                      <Field label='Supplier Name' required error={fieldErrors.supplier_name}>
                        <input
                          type="text"
                          value={form.supplier_name}
                          onChange={(e) => {
                            set('supplier_name', e.target.value);
                            if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, supplier_name: undefined }));
                          }}
                          style={{ ...s.input, ...(fieldErrors.supplier_name ? s.inputError : {}) }}
                        />
                      </Field>
                    </div>

                    <Field label='MSME Registered'>{sel('msme', ['Yes', 'No'])}</Field>
                    {form.msme === 'Yes' && (
                      <Field label='MSME Reg. No'>{inp('msme_reg_no')}</Field>
                    )}
                    <Field label='Status'>{sel('status', ['Active', 'Inactive'])}</Field>
                  </div>
                )}

                {/* ── Address ── */}
                <SectionHead title='Address Details' open={sec.address} onToggle={() => toggle('address')} />
                {sec.address && (
                  <AddressBlock
                    form={form}
                    onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
                    title="Supplier Address"
                    accent="#0f766e"
                    accentLight="#f0fdfa"
                    accentBorder="#5eead4"
                  />
                )}

                {/* ── Contact Details ── */}
                <SectionHead title='Contact Details' open={sec.contact} onToggle={() => toggle('contact')} />
                {sec.contact && (
                  <div className="sm-grid">
                    <Field label='Contact Name'>{inp('contact_name')}</Field>
                    <Field label='Designation'>{inp('designation')}</Field>

                    {/* Contact No — 10–13 digits */}
                    <Field label='Contact No' error={fieldErrors.contact_no}>
                      <input
                        type="tel"
                        value={form.contact_no}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d\s\+\-]/g, '').slice(0, 15);
                          set('contact_no', val);
                          validateField('contact_no', val);
                        }}
                        onBlur={(e) => validateField('contact_no', e.target.value)}
                        placeholder="e.g. 9876543210"
                        maxLength={15}
                        style={{ ...s.input, ...(fieldErrors.contact_no ? s.inputError : {}) }}
                      />
                      {!fieldErrors.contact_no && (
                        <span className="sm-hint-pill">10–13 digits required</span>
                      )}
                    </Field>

                    {/* Supplier Email */}
                    <Field label='Supplier E-Mail' error={fieldErrors.email}>
                      <div style={{ position:'relative' }}>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => {
                            set('email', e.target.value);
                            validateField('email', e.target.value);
                          }}
                          onBlur={(e) => validateField('email', e.target.value)}
                          placeholder="user@example.com"
                          style={{
                            ...s.input,
                            paddingRight: 36,
                            ...(fieldErrors.email ? s.inputError
                              : form.email && isValidEmail(form.email) ? s.inputSuccess : {}),
                          }}
                        />
                        {form.email && (
                          <span style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'flex',alignItems:'center' }}>
                            {isValidEmail(form.email)
                              ? <CheckCircle2 size={14} color="#16a34a" />
                              : <AlertCircle  size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.email && (
                        <span className="sm-hint-pill">
                          <Mail size={9} /> Must include @ and domain (e.g. user@gmail.com)
                        </span>
                      )}
                    </Field>

                    {/* Contact Email */}
                    <Field label='Contact E-Mail'>
                      {inp('contact_email', 'email')}
                    </Field>
                  </div>
                )}

                {/* ── Tax & Compliance ── */}
                <SectionHead title='Tax & Compliance' open={sec.tax} onToggle={() => toggle('tax')} />
                {sec.tax && (
                  <div className="sm-grid">

                    {/* GST No — exactly 15 chars */}
                    <Field label='GST No' error={fieldErrors.gst_no}>
                      <div style={{ position:'relative' }}>
                        <input
                          type="text"
                          value={form.gst_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                            set('gst_no', val);
                            validateField('gst_no', val);
                          }}
                          onBlur={(e) => validateField('gst_no', e.target.value)}
                          placeholder="15-character GST number"
                          maxLength={15}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.gst_no ? s.inputError
                              : form.gst_no && isValidGst(form.gst_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                          display:'flex',alignItems:'center',gap:4,
                          fontSize:10,fontWeight:700,
                          color: form.gst_no.length === 15 ? '#16a34a' : form.gst_no.length > 0 ? '#d97706' : '#94a3b8',
                        }}>
                          {form.gst_no.length}/15
                          {form.gst_no.length === 15 && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.gst_no && (
                        <span className="sm-hint-pill">Exactly 15 alphanumeric characters</span>
                      )}
                    </Field>

                    {/* PAN No — AAAAA9999A */}
                    <Field label='PAN No' error={fieldErrors.pan_no}>
                      <div style={{ position:'relative' }}>
                        <input
                          type="text"
                          value={form.pan_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                            set('pan_no', val);
                            validateField('pan_no', val);
                          }}
                          onBlur={(e) => validateField('pan_no', e.target.value)}
                          placeholder="AAAAA9999A"
                          maxLength={10}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.pan_no ? s.inputError
                              : form.pan_no && isValidPan(form.pan_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                          display:'flex',alignItems:'center',gap:4,
                          fontSize:10,fontWeight:700,
                          color: form.pan_no.length === 10 && isValidPan(form.pan_no) ? '#16a34a' : form.pan_no.length > 0 ? '#d97706' : '#94a3b8',
                        }}>
                          {form.pan_no.length}/10
                          {form.pan_no.length === 10 && isValidPan(form.pan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.pan_no && (
                        <span className="sm-hint-pill">10 chars: 5 letters + 4 digits + 1 letter</span>
                      )}
                    </Field>

                    {/* TAN No — AAAA99999A */}
                    <Field label='TAN No' error={fieldErrors.tan_no}>
                      <div style={{ position:'relative' }}>
                        <input
                          type="text"
                          value={form.tan_no}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                            set('tan_no', val);
                            validateField('tan_no', val);
                          }}
                          onBlur={(e) => validateField('tan_no', e.target.value)}
                          placeholder="AAAA99999A"
                          maxLength={10}
                          style={{
                            ...s.input,
                            fontFamily: 'DM Mono, monospace',
                            letterSpacing: '0.05em',
                            paddingRight: 56,
                            ...(fieldErrors.tan_no ? s.inputError
                              : form.tan_no && isValidTan(form.tan_no) ? s.inputSuccess : {}),
                          }}
                        />
                        <span style={{
                          position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                          display:'flex',alignItems:'center',gap:4,
                          fontSize:10,fontWeight:700,
                          color: form.tan_no.length === 10 && isValidTan(form.tan_no) ? '#16a34a' : form.tan_no.length > 0 ? '#d97706' : '#94a3b8',
                        }}>
                          {form.tan_no.length}/10
                          {form.tan_no.length === 10 && isValidTan(form.tan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.tan_no && (
                        <span className="sm-hint-pill">10 chars: 4 letters + 5 digits + 1 letter</span>
                      )}
                    </Field>

                  </div>
                )}

                {/* ── Attachments ── */}
                <SectionHead title='Attachments' open={sec.attach} onToggle={() => toggle('attach')} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div style={s.dropZone}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}>
                      <Upload size={22} style={{ color:'#9ca3af',marginBottom:6 }} />
                      <p style={{ margin:0,fontSize:13,color:'#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin:'4px 0 0',fontSize:11,color:'#9ca3af' }}>PDF, JPG, PNG, DOCX — max 10 MB</p>
                      <input ref={fileRef} type='file' multiple accept='.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'
                        style={{ display:'none' }} onChange={(e) => handleFileAdd(e.target.files)} />
                    </div>
                    {form.attachments.length === 0 && (
                      <p style={{ fontSize:13,color:'#9ca3af',textAlign:'center',padding:'12px 0 0' }}>No attachments uploaded.</p>
                    )}
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow,marginTop:8 }}>
                        <FileText size={15} style={{ color:'#6b7280',flexShrink:0 }} />
                        <span style={{ flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.file_name}</span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/suppliers/attachment/${a.file_path}`} target='_blank' rel='noreferrer' style={{ color:'#0f766e' }}>
                            <Eye size={14} />
                          </a>
                        )}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="sm-modal-footer">
                <button className="sm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="sm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Supplier')}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── SUPPLIER TYPE MANAGER MODAL ── */}
        {showTypeManager && (
          <div className="sm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTypeManager(false); }}>
            <div className="sm-modal" style={{ maxWidth:560 }}>
              <div className="sm-modal-header">
                <h2 style={{ margin:0,fontSize:isMobile ? 15 : 17,fontWeight:700,color:'#fff' }}>
                  ⚙️ Manage Supplier Types
                </h2>
                <button style={s.closeBtn} onClick={() => setShowTypeManager(false)}><X size={20} color="#fff" /></button>
              </div>

              {typeError && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{typeError}</span>
                  <button onClick={() => setTypeError('')} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',padding:0,color:'#ef4444',display:'flex',alignItems:'center',flexShrink:0 }}><X size={14} /></button>
                </div>
              )}

              <div className="sm-modal-body" style={{ display:'flex',flexDirection:'column',gap:16 }}>
                <div style={{ background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:14 }}>
                  <p style={{ margin:'0 0 10px',fontWeight:700,fontSize:13,color:'#1e293b' }}>
                    {typeEditId ? '✏️ Edit Type' : '➕ Add New Type'}
                  </p>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                    <div>
                      <label style={s.label}>Type Name <span style={{ color:'#ef4444' }}>*</span></label>
                      <input value={typeForm.type_name} onChange={(e) => setTypeForm((f) => ({ ...f, type_name: e.target.value }))} style={s.input} placeholder="e.g. Raw Material" />
                    </div>
                    <div>
                      <label style={s.label}>Supply Type <span style={{ color:'#ef4444' }}>*</span></label>
                      <select value={typeForm.supply_type} onChange={(e) => setTypeForm((f) => ({ ...f, supply_type: e.target.value }))} style={s.input}>
                        <option value="Normal">Normal</option>
                        <option value="Bulk">Bulk</option>
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={s.label}>Description (optional)</label>
                      <input value={typeForm.type_description} onChange={(e) => setTypeForm((f) => ({ ...f, type_description: e.target.value }))} style={s.input} placeholder="Brief description…" />
                    </div>
                  </div>
                  <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                    {typeEditId && (
                      <button style={{ padding:'7px 14px',border:'1px solid #cbd5e1',background:'#fff',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',color:'#475569',fontFamily:"'DM Sans',sans-serif" }}
                        onClick={() => { setTypeEditId(null); setTypeForm({ type_name:'',supply_type:'Normal',type_description:'' }); setTypeError(''); }}>
                        Cancel
                      </button>
                    )}
                    <button onClick={handleTypeSave} disabled={typeSaving}
                      style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 16px',border:'none',background:'#0f766e',color:'#fff',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}
                    >
                      {typeSaving ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} /> Saving…</> : (typeEditId ? '✏️ Update' : '💾 Save Type')}
                    </button>
                  </div>
                </div>

                <div>
                  <p style={{ margin:'0 0 8px',fontWeight:700,fontSize:13,color:'#1e293b' }}>Existing Types ({typeList.length})</p>
                  {typeList.length === 0 ? (
                    <p style={{ fontSize:13,color:'#9ca3af',textAlign:'center',padding:'16px 0' }}>No types yet. Add one above.</p>
                  ) : (
                    <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                      {typeList.map((t) => (
                        <div key={t.id} style={{ display:'flex',alignItems:'center',gap:10,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'9px 12px' }}>
                          <div style={{ flex:1,minWidth:0 }}>
                            <span style={{ fontWeight:600,fontSize:13,color:'#1e293b' }}>{t.type_name}</span>
                            <span style={{ marginLeft:8,display:'inline-block',padding:'1px 8px',borderRadius:20,fontSize:11,fontWeight:600,background: t.supply_type==='Bulk'?'#fef3c7':'#f0fdfa',color: t.supply_type==='Bulk'?'#92400e':'#0f766e' }}>{t.supply_type}</span>
                            {t.type_description && <p style={{ margin:'2px 0 0',fontSize:11,color:'#94a3b8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{t.type_description}</p>}
                          </div>
                          <button onClick={() => handleTypeEdit(t)} style={{ background:'#f0fdfa',color:'#0f766e',border:'1px solid #5eead4',width:28,height:28,borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>✏️</button>
                          <button onClick={() => handleTypeDelete(t.id, t.type_name)} style={{ background:'#fff1f2',color:'#ef4444',border:'1px solid #fca5a5',width:28,height:28,borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="sm-modal-footer">
                <button className="sm-btn-cancel" onClick={() => setShowTypeManager(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  closeBtn: {
    background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85,
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
    color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
    background: '#fff',
  } as React.CSSProperties,
  inputError: {
    border: '1.5px solid #fca5a5',
    background: '#fff5f5',
    boxShadow: '0 0 0 3px rgba(239,68,68,0.08)',
  },
  inputSuccess: {
    border: '1.5px solid #86efac',
    background: '#f0fdf4',
  },
  sectionHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
    marginTop: 18, userSelect: 'none',
  },
  sectionTitle: { fontWeight: 700, fontSize: 13, color: '#1e293b' },
  subSection: {
    background: '#fafbfc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: 14, marginTop: 10,
  },
  dropZone: {
    border: '2px dashed #cbd5e1', borderRadius: 12,
    padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  attachRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
  },
  delRowBtn: {
    background: '#fff1f2', color: '#ef4444', border: '1px solid #fca5a5',
    width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
};