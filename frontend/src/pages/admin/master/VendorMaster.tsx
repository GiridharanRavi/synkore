// frontend/src/pages/admin/VendorMaster.tsx
// Vendor Master — Full CRUD, Responsive (Mobile → Desktop)
// Address format matches CustomerMaster: full INDIA_STATES map + AddressBlock component

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  Plus,
  Search,
  X,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Loader2,
  Eye,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Building2,
  Mail,
  MapPin,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorAttachment {
  id?: number;
  file_name: string;
  file_path?: string;
  isNew?: boolean;
  file?: File;
}

interface ServiceTypeMeta    { id: number; service_type_name: string }
interface ProcessingTypeMeta { id: number; processing_type_name: string }

interface LookupData {
  serviceTypes:    ServiceTypeMeta[];
  processingTypes: ProcessingTypeMeta[];
}

interface Vendor {
  id?: number;
  vendor_id?: string;
  vendor_name:   string;
  address1:      string;
  address2:      string;
  pin_code:      string;
  district:      string;
  state:         string;
  country:       string;
  gst_no:        string;
  msme:          'Yes' | 'No';
  msme_sector:   string;
  msme_type:     string;
  msme_reg_no:   string;
  email:         string;
  contact_name:  string;
  designation:   string;
  contact_no:    string;
  contact_email: string;
  status:        string;
  type_ids:            number[];
  processing_type_ids: number[];
  attachments:         VendorAttachment[];
  __deletedAttachments?: number[];
}

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

function isValidContact(contact: string): boolean {
  if (!contact) return true;
  const digits = contact.replace(/[\s\-\+]/g, '');
  return /^\d{10,13}$/.test(digits);
}

// ─── Field Error Types ────────────────────────────────────────────────────────

interface FieldErrors {
  vendor_name?:   string;
  email?:         string;
  contact_no?:    string;
  contact_email?: string;
  gst_no?:        string;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_tid;
    setToasts((p) => [...p, { id, type, title, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, push, remove };
}

// ─── FieldError ──────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{
      display: 'flex', alignItems: 'flex-start', gap: 4,
      fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4,
    }}>
      <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{msg}</span>
    </span>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({
  label, required, children, error,
}: {
  label: string; required?: boolean; children: React.ReactNode; error?: string;
}) {
  return (
    <div>
      <label style={s.label}>{label}{required && <span style={{ color: '#ef4444' }}> *</span>}</label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

// ─── SectionHead ─────────────────────────────────────────────────────────────

function SectionHead({ title, open, onToggle, badge }: {
  title: string; open: boolean; onToggle: () => void; badge?: React.ReactNode;
}) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={s.sectionTitle}>{title}</span>
        {badge}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── ToastContainer ──────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: 'calc(100vw - 40px)', pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn 0.25s ease-out', fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8, lineHeight: 1.4 }}>{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.color, opacity: 0.6, display: 'flex', alignItems: 'center', marginTop: 1 }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Multi-checkbox selector ─────────────────────────────────────────────────

function MultiCheck({
  label, items, idKey, labelKey, selected, onChange,
}: {
  label: string; items: any[]; idKey: string; labelKey: string;
  selected: number[]; onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div>
      <label style={s.label}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 0' }}>
        {items.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>No options available</span>}
        {items.map((item) => {
          const id = item[idKey] as number;
          const active = selected.includes(id);
          return (
            <button key={id} type="button" onClick={() => toggle(id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: active ? '1.5px solid #0f766e' : '1.5px solid #cbd5e1',
              background: active ? '#f0fdfa' : '#fff',
              color: active ? '#0f766e' : '#6b7280',
              fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
            }}>
              {active ? <CheckSquare size={13} /> : <Square size={13} />}
              {item[labelKey]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── India States & Districts (full map — same as CustomerMaster) ─────────────

const INDIA_STATES: Record<string, string[]> = {
  "Tamil Nadu": [
    "Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore",
    "Dharmapuri","Dindigul","Erode","Kallakurichi","Kancheepuram",
    "Kanyakumari","Karur","Krishnagiri","Madurai","Mayiladuthurai",
    "Nagapattinam","Namakkal","Nilgiris","Perambalur","Pudukkottai",
    "Ramanathapuram","Ranipet","Salem","Sivaganga","Tenkasi",
    "Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli",
    "Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur",
    "Vellore","Viluppuram","Virudhunagar",
  ],
  "Andhra Pradesh": [
    "Alluri Sitharama Raju","Anakapalli","Anantapur","Annamayya","Bapatla",
    "Chittoor","Dr. B.R. Ambedkar Konaseema","East Godavari","Eluru",
    "Guntur","Kakinada","Krishna","Kurnool","Manyam","N T Rama Rao",
    "Nandyal","Nellore","Palnadu","Prakasam","Sri Balaji","Sri Sathya Sai",
    "Srikakulam","Tirupati","Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa",
  ],
  "Karnataka": [
    "Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban",
    "Bidar","Chamarajanagar","Chikkaballapur","Chikkamagaluru","Chitradurga",
    "Dakshina Kannada","Davanagere","Dharwad","Gadag","Hassan","Haveri",
    "Kalaburagi","Kodagu","Kolar","Koppal","Mandya","Mysuru","Raichur",
    "Ramanagara","Shivamogga","Tumakuru","Udupi","Uttara Kannada","Vijayapura","Yadgir",
  ],
  "Kerala": [
    "Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam",
    "Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta",
    "Thiruvananthapuram","Thrissur","Wayanad",
  ],
  "Maharashtra": [
    "Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara",
    "Buldhana","Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli",
    "Jalgaon","Jalna","Kolhapur","Latur","Mumbai City","Mumbai Suburban",
    "Nagpur","Nanded","Nandurbar","Nashik","Osmanabad","Palghar",
    "Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara","Sindhudurg",
    "Solapur","Thane","Wardha","Washim","Yavatmal",
  ],
  "Gujarat": [
    "Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch",
    "Bhavnagar","Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka",
    "Gandhinagar","Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch",
    "Mahisagar","Mehsana","Morbi","Narmada","Navsari","Panchmahal",
    "Patan","Porbandar","Rajkot","Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad",
  ],
  "Rajasthan": [
    "Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara",
    "Bikaner","Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur",
    "Hanumangarh","Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu",
    "Jodhpur","Karauli","Kota","Nagaur","Pali","Pratapgarh","Rajsamand",
    "Sawai Madhopur","Sikar","Sirohi","Sri Ganganagar","Tonk","Udaipur",
  ],
  "Uttar Pradesh": [
    "Agra","Aligarh","Ambedkar Nagar","Amethi","Amroha","Auraiya","Ayodhya","Azamgarh",
    "Baghpat","Bahraich","Ballia","Balrampur","Banda","Barabanki","Bareilly","Basti",
    "Bhadohi","Bijnor","Budaun","Bulandshahr","Chandauli","Chitrakoot","Deoria","Etah",
    "Etawah","Farrukhabad","Fatehpur","Firozabad","Gautam Buddha Nagar","Ghaziabad",
    "Ghazipur","Gonda","Gorakhpur","Hamirpur","Hapur","Hardoi","Hathras","Jalaun",
    "Jaunpur","Jhansi","Kannauj","Kanpur Dehat","Kanpur Nagar","Kasganj","Kaushambi",
    "Kushinagar","Lakhimpur Kheri","Lalitpur","Lucknow","Maharajganj","Mahoba","Mainpuri",
    "Mathura","Mau","Meerut","Mirzapur","Moradabad","Muzaffarnagar","Pilibhit","Pratapgarh",
    "Prayagraj","Raebareli","Rampur","Saharanpur","Sambhal","Sant Kabir Nagar","Shahjahanpur",
    "Shamli","Shravasti","Siddharthnagar","Sitapur","Sonbhadra","Sultanpur","Unnao","Varanasi",
  ],
  "West Bengal": [
    "Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur",
    "Darjeeling","Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong",
    "Kolkata","Malda","Murshidabad","Nadia","North 24 Parganas",
    "Paschim Bardhaman","Paschim Medinipur","Purba Bardhaman",
    "Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur",
  ],
  "Telangana": [
    "Adilabad","Bhadradri Kothagudem","Hanamkonda","Hyderabad","Jagtial","Jangaon",
    "Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam",
    "Kumuram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak",
    "Medchal Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal",
    "Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet",
    "Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri",
  ],
  "Delhi": [
    "Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi",
    "North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi",
  ],
  "Punjab": [
    "Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka",
    "Ferozepur","Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana",
    "Malerkotla","Mansa","Moga","Mohali","Muktsar","Pathankot","Patiala",
    "Rupnagar","Sangrur","Shaheed Bhagat Singh Nagar","Tarn Taran",
  ],
  "Haryana": [
    "Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram",
    "Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh",
    "Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar",
  ],
  "Bihar": [
    "Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur",
    "Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad",
    "Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura",
    "Madhubani","Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia",
    "Rohtas","Saharsa","Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi",
    "Siwan","Supaul","Vaishali","West Champaran",
  ],
  "Madhya Pradesh": [
    "Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul","Bhind",
    "Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas","Dhar",
    "Dindori","Guna","Gwalior","Harda","Hoshangabad","Indore","Jabalpur","Jhabua",
    "Katni","Khandwa","Khargone","Mandla","Mandsaur","Morena","Narsinghpur","Neemuch",
    "Niwari","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna","Sehore","Seoni",
    "Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli","Tikamgarh","Ujjain",
    "Umaria","Vidisha",
  ],
  "Odisha": [
    "Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh",
    "Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi",
    "Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj",
    "Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Sonepur","Sundargarh",
  ],
  "Assam": [
    "Bajali","Baksa","Barpeta","Biswanath","Bongaigaon","Cachar","Charaideo","Chirang",
    "Darrang","Dhemaji","Dhubri","Dibrugarh","Dima Hasao","Goalpara","Golaghat",
    "Hailakandi","Hojai","Jorhat","Kamrup","Kamrup Metropolitan","Karbi Anglong",
    "Karimganj","Kokrajhar","Lakhimpur","Majuli","Morigaon","Nagaon","Nalbari",
    "Sivasagar","Sonitpur","South Salmara Mankachar","Tinsukia","Udalguri","West Karbi Anglong",
  ],
  "Jharkhand": [
    "Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa","Giridih",
    "Godda","Gumla","Hazaribagh","Jamtara","Khunti","Koderma","Latehar","Lohardaga",
    "Pakur","Palamu","Ramgarh","Ranchi","Sahebganj","Seraikela Kharsawan","Simdega","West Singhbhum",
  ],
  "Himachal Pradesh": [
    "Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu","Lahaul Spiti","Mandi",
    "Shimla","Sirmaur","Solan","Una",
  ],
  "Uttarakhand": [
    "Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital",
    "Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi",
  ],
  "Chhattisgarh": [
    "Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur","Dantewada",
    "Dhamtari","Durg","Gariaband","Gaurela Pendra Marwahi","Janjgir Champa","Jashpur",
    "Kabirdham","Kanker","Khairagarh","Kondagaon","Korba","Koriya","Mahasamund",
    "Manendragarh","Mohla Manpur","Mungeli","Narayanpur","Raigarh","Raipur","Rajnandgaon",
    "Sakti","Sarangarh Bilaigarh","Sukma","Surajpur","Surguja",
  ],
  "Goa": ["North Goa","South Goa"],
  "Manipur": [
    "Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam","Kakching",
    "Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong","Tengnoupal","Thoubal","Ukhrul",
  ],
  "Meghalaya": [
    "East Garo Hills","East Jaintia Hills","East Khasi Hills","Eastern West Khasi Hills",
    "North Garo Hills","Ri Bhoi","South Garo Hills","South West Garo Hills",
    "South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills",
  ],
  "Tripura": ["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"],
  "Nagaland": [
    "Chumoukedima","Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon","Niuland",
    "Noklak","Peren","Phek","Shamator","Tseminyu","Tuensang","Wokha","Zunheboto",
  ],
  "Arunachal Pradesh": [
    "Anjaw","Changlang","Dibang Valley","East Kameng","East Siang","Kamle","Kra Daadi",
    "Kurung Kumey","Lepa Rada","Lohit","Longding","Lower Dibang Valley","Lower Siang",
    "Lower Subansiri","Namsai","Pakke Kessang","Papum Pare","Shi Yomi","Siang","Tawang",
    "Tirap","Upper Dibang Valley","Upper Siang","Upper Subansiri","West Kameng","West Siang",
  ],
  "Mizoram": ["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saitual","Serchhip"],
  "Sikkim": ["East Sikkim","North Sikkim","Pakyong","Soreng","South Sikkim","West Sikkim"],
  "Jammu & Kashmir": [
    "Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua",
    "Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi","Samba",
    "Shopian","Srinagar","Udhampur",
  ],
  "Ladakh": ["Kargil","Leh"],
  "Andaman & Nicobar Islands": ["Nicobar","North and Middle Andaman","South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal","Mahé","Puducherry","Yanam"],
};

const STATE_LIST = Object.keys(INDIA_STATES).sort();
const DEFAULT_STATE = 'Tamil Nadu';

// ─── AddressBlock (mirrors CustomerMaster exactly) ────────────────────────────

interface AddressBlockProps {
  form: Vendor;
  onChange: (updates: Partial<Vendor>) => void;
}

function AddressBlock({ form, onChange }: AddressBlockProps) {
  const state     = form.state || DEFAULT_STATE;
  const districts = INDIA_STATES[state] || [];

  const set = (key: keyof Vendor, val: string) => onChange({ [key]: val } as Partial<Vendor>);

  const handleStateChange = (newState: string) => {
    onChange({ state: newState, district: '' });
  };

  return (
    <div style={{
      border: '1.5px solid #99f6e4', borderRadius: 12,
      overflow: 'hidden', background: '#fff', marginTop: 10,
    }}>
      {/* Coloured header bar */}
      <div style={{
        background: '#f0fdfa', borderBottom: '1px solid #99f6e4',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MapPin size={15} color="#0f766e" />
        <span style={{
          fontSize: 12, fontWeight: 800, color: '#0f766e',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          Vendor Address
        </span>
      </div>

      {/* Grid of fields */}
      <div style={{
        padding: '14px 16px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px',
      }}>
        {/* Address Line 1 — full width */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={s.label}>Address Line 1</label>
          <input
            value={form.address1 || ''}
            onChange={(e) => set('address1', e.target.value)}
            placeholder="Door no, Street name"
            style={s.input}
          />
        </div>

        {/* Address Line 2 — full width */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={s.label}>Address Line 2</label>
          <input
            value={form.address2 || ''}
            onChange={(e) => set('address2', e.target.value)}
            placeholder="Area, Landmark (optional)"
            style={s.input}
          />
        </div>

        {/* State */}
        <div>
          <label style={s.label}>State</label>
          <select
            value={state}
            onChange={(e) => handleStateChange(e.target.value)}
            style={{ ...s.input, cursor: 'pointer' }}
          >
            {STATE_LIST.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>

        {/* District */}
        <div>
          <label style={s.label}>District</label>
          <select
            value={form.district || ''}
            onChange={(e) => set('district', e.target.value)}
            style={{ ...s.input, cursor: 'pointer' }}
          >
            <option value="">— Select District —</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Pin Code */}
        <div>
          <label style={s.label}>Pin Code</label>
          <input
            value={form.pin_code || ''}
            onChange={(e) => set('pin_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit pincode"
            maxLength={6}
            style={s.input}
          />
        </div>

        {/* Country */}
        <div>
          <label style={s.label}>Country</label>
          <input
            value={form.country || 'India'}
            onChange={(e) => set('country', e.target.value)}
            style={s.input}
          />
        </div>
      </div>
    </div>
  );
}

// ─── sanitizeVendor ───────────────────────────────────────────────────────────

function sanitizeVendor(data: any): Vendor {
  const safe = (v: any) => (v == null ? '' : String(v));
  const type_ids            = (data.types            ?? []).map((t: any) => t.id);
  const processing_type_ids = (data.processing_types ?? []).map((p: any) => p.id);

  // backward compat: if old `address` field exists, split into address1/address2
  let address1 = safe(data.address1);
  let address2 = safe(data.address2);
  if (!address1 && data.address) {
    const lines = String(data.address).split('\n');
    address1 = lines[0] || '';
    address2 = lines.slice(1).join('\n') || '';
  }

  return {
    ...BLANK,
    ...data,
    vendor_name:   safe(data.vendor_name),
    address1,
    address2,
    pin_code:      safe(data.pin_code),
    district:      safe(data.district),
    state:         safe(data.state) || DEFAULT_STATE,
    country:       safe(data.country) || 'India',
    gst_no:        safe(data.gst_no),
    email:         safe(data.email),
    contact_name:  safe(data.contact_name),
    designation:   safe(data.designation),
    contact_no:    safe(data.contact_no),
    contact_email: safe(data.contact_email),
    msme:          (data.msme === 'Yes' ? 'Yes' : 'No') as 'Yes' | 'No',
    msme_sector:   safe(data.msme_sector),
    msme_type:     safe(data.msme_type),
    msme_reg_no:   safe(data.msme_reg_no),
    status:        safe(data.status) || 'Active',
    type_ids,
    processing_type_ids,
    attachments:   data.attachments ?? [],
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BLANK: Vendor = {
  vendor_name: '', address1: '', address2: '', pin_code: '', district: '',
  state: DEFAULT_STATE, country: 'India',
  gst_no: '',
  msme: 'No', msme_sector: '', msme_type: '', msme_reg_no: '',
  email: '', contact_name: '', designation: '', contact_no: '', contact_email: '',
  status: 'Active',
  type_ids: [], processing_type_ids: [], attachments: [],
};

const API = '/api/vendors';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── useWidth hook ────────────────────────────────────────────────────────────

function useWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VendorMaster() {
  const [vendors, setVendors]   = useState<Vendor[]>([]);
  const [lookup, setLookup]     = useState<LookupData>({ serviceTypes: [], processingTypes: [] });
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterSt, setFilterSt] = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Vendor>(BLANK);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sec, setSec] = useState({
    basic: true, address: true, contact: true, msme: false, attach: false,
  });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef  = useRef<HTMLInputElement>(null);
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Load ──────────────────────────────────────────────────
  const loadVendors = async () => {
    setLoading(true);
    try {
      const qs  = new URLSearchParams({ search, page: String(page), limit: String(pageSize), ...(filterSt ? { status: filterSt } : {}) });
      const res = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setVendors(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch vendors.');
    }
    setLoading(false);
  };

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API}/meta/lookup`);
      setLookup(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadVendors(); }, [search, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Open form ─────────────────────────────────────────────
  const openCreate = () => {
    setForm(sanitizeVendor(BLANK));
    setEditId(null); setError(''); setFieldErrors({}); setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm(sanitizeVendor(data));
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch {
      pushToast('error', 'Load Failed', 'Could not load vendor details.');
    }
  };

  // ── Live field validation ─────────────────────────────────
  const validateField = (key: keyof FieldErrors, value: string) => {
    let msg = '';
    switch (key) {
      case 'email':
      case 'contact_email':
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
    }
    setFieldErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  // ── Validate all before save ──────────────────────────────
  const validateAll = (): boolean => {
    const errors: FieldErrors = {};
    if (!form.vendor_name.trim()) errors.vendor_name = 'Vendor Name is required.';
    if (form.email && !isValidEmail(form.email))
      errors.email = 'Enter a valid email address (e.g. user@example.com).';
    if (form.contact_email && !isValidEmail(form.contact_email))
      errors.contact_email = 'Enter a valid email address (e.g. user@example.com).';
    if (form.contact_no && !isValidContact(form.contact_no))
      errors.contact_no = 'Contact number must be 10–13 digits.';
    if (form.gst_no && form.gst_no.length !== 15)
      errors.gst_no = `GST No must be exactly 15 characters (${form.gst_no.length}/15).`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.type_ids.length) { setError('At least one Type is required'); return; }
    if (!validateAll()) {
      setError('Please fix the highlighted errors before saving.');
      const hasContactErr = !!(fieldErrors.email || fieldErrors.contact_no || fieldErrors.contact_email);
      if (hasContactErr) setSec((p) => ({ ...p, contact: true }));
      return;
    }
    setError(''); setSaving(true);

    const fd = new FormData();
    const scalars: (keyof Vendor)[] = [
      'vendor_name', 'address1', 'address2', 'pin_code', 'district', 'state', 'country',
      'gst_no', 'msme', 'msme_sector', 'msme_type', 'msme_reg_no',
      'email', 'contact_name', 'designation', 'contact_no', 'contact_email', 'status',
    ];
    scalars.forEach((k) => fd.append(k as string, String(form[k] ?? '')));
    fd.append('type_ids',            JSON.stringify(form.type_ids));
    fd.append('processing_type_ids', JSON.stringify(form.processing_type_ids));
    form.attachments.filter((a) => a.isNew && a.file).forEach((a) => fd.append('attachments', a.file!));
    if (editId) fd.append('deleted_attachments', JSON.stringify(form.__deletedAttachments ?? []));

    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Vendor Updated' : 'Vendor Created', `${form.vendor_name} saved successfully.`);
      setShowForm(false); loadVendors();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this vendor?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Vendor Deleted', 'The vendor record has been removed.');
      loadVendors();
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete vendor.');
    }
  };

  // ── Form helpers ──────────────────────────────────────────
  const setF = (key: keyof Vendor, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const inp = (key: keyof Vendor, type = 'text') => (
    <input type={type} value={form[key] == null ? '' : String(form[key])}
      onChange={(e) => setF(key, e.target.value)} style={s.input} />
  );

  const sel = (key: keyof Vendor, opts: string[]) => (
    <select value={form[key] == null ? '' : String(form[key])}
      onChange={(e) => setF(key, e.target.value)} style={s.input}>
      <option value=''>— Select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm((p) => ({ ...p, attachments: [...p.attachments, ...Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }))] }));
  };

  const removeAttachment = (i: number) => {
    setForm((p) => {
      const att = p.attachments[i];
      const deleted = p.__deletedAttachments ?? [];
      return { ...p, attachments: p.attachments.filter((_, j) => j !== i), __deletedAttachments: att.id ? [...deleted, att.id] : deleted };
    });
  };

  const handleAddressChange = (updates: Partial<Vendor>) =>
    setForm((f) => ({ ...f, ...updates }));

  const toggle = (k: keyof typeof sec) => setSec((p) => ({ ...p, [k]: !p[k] }));

  // ── Pagination ────────────────────────────────────────────
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

  const showEmail   = !isMobile;
  const showState   = !isMobile;
  const showGst     = width >= 768;
  const showMsme    = width >= 992;
  const showContact = width >= 480;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        .vm-wrap { font-family: 'DM Sans', sans-serif; font-size: 14px; color: #1e293b; }

        .vm-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .vm-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; }
        .vm-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media (min-width:576px) { .vm-page-header h1 { font-size:22px; } }

        .vm-add-btn { display:flex; align-items:center; gap:6px; background:#0f766e; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(15,118,110,0.3); white-space:nowrap; flex-shrink:0; touch-action:manipulation; }
        .vm-add-btn:hover { background:#0d6460; }

        .vm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .vm-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media (min-width:768px) { .vm-search-wrap { max-width:320px; } }
        .vm-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; }
        .vm-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .vm-search:focus { border-color:#0f766e; }
        .vm-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; }
        .vm-filters-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .vm-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .vm-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .vm-rec-count { font-size:12px; color:#64748b; white-space:nowrap; }

        .vm-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .vm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .vm-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:480px; }
        .vm-table thead tr { background:#0f766e; }
        .vm-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media (min-width:768px) { .vm-table th { font-size:13px; padding:12px 16px; } }
        .vm-table th.th-center { text-align:center; }
        .vm-table tbody tr:nth-child(odd)  td { background:#fff; }
        .vm-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .vm-table tbody tr:hover td { filter:brightness(0.97); }
        .vm-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media (min-width:768px) { .vm-table td { font-size:13px; padding:11px 16px; } }

        .vm-ven-id { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#0f766e; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .vm-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .vm-chip-active   { background:#dcfce7; color:#166534; }
        .vm-chip-inactive { background:#fee2e2; color:#991b1b; }
        .vm-chip-yes      { background:#f0fdf4; color:#15803d; border:1px solid #86efac; }
        .vm-chip-no       { background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; }

        .vm-name { font-weight:600; max-width:160px; overflow:hidden; text-overflow:ellipsis; }
        .vm-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .vm-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .vm-btn-edit:hover { background:#ccfbf1; }
        .vm-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .vm-btn-del:hover { background:#fee2e2; }
        .vm-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        .vm-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media (min-width:576px) { .vm-pagination { padding:10px 16px; font-size:13px; } }
        .vm-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .vm-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        @media (min-width:576px) { .vm-pag-btn { padding:5px 12px; height:32px; font-size:13px; } }
        .vm-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .vm-pag-btn.active { background:#0f766e; color:#fff; border-color:#0f766e; font-weight:700; }
        .vm-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        .vm-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media (min-width:576px) { .vm-modal-overlay { padding:24px 16px; } }
        @media (min-width:992px) { .vm-modal-overlay { padding:32px 24px; } }
        .vm-modal { background:#fff; border-radius:14px; width:100%; max-width:860px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media (min-width:576px) { .vm-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .vm-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#0f766e; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media (min-width:576px) { .vm-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }
        .vm-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media (min-width:576px) { .vm-modal-body { padding:20px 24px; } }
        .vm-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media (min-width:576px) { .vm-modal-footer { padding:14px 24px; border-radius:0 0 16px 16px; } }

        .vm-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media (min-width:480px) { .vm-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media (min-width:768px) { .vm-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .vm-col-full { grid-column:1 / -1; }

        .vm-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; touch-action:manipulation; }
        .vm-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); touch-action:manipulation; }
        .vm-btn-save:disabled { opacity:0.7; cursor:not-allowed; }

        .vm-hint-pill { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:20px; padding:2px 8px; margin-top:4px; }

        input:focus, select:focus, textarea:focus { outline:none; border-color:#0f766e !important; box-shadow:0 0 0 3px rgba(15,118,110,0.1) !important; }
        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="vm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="vm-page-header">
          <div>
            <h1 style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Building2 size={20} style={{ color:'#0f766e' }} />
              Vendor Master
            </h1>
            <p>{total} vendor{total !== 1 ? 's' : ''} registered</p>
          </div>
          <button className="vm-add-btn" onClick={openCreate}>
            <Plus size={15} /> New Vendor
          </button>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="vm-toolbar">
          <div className="vm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="vm-search" placeholder="Search name, email, phone, VEN-ID, GST…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="vm-filters-row">
            <select className="vm-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="vm-rec-count">{total} record(s)</span>}
          </div>
          <div className="vm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{total} record(s)</p>}

        {/* ── TABLE ── */}
        <div className="vm-card">
          <div className="vm-table-wrap">
            <table className="vm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendor ID</th>
                  <th>Vendor Name</th>
                  {showContact && <th>Contact No</th>}
                  {showEmail   && <th>Email</th>}
                  {showState   && <th>State</th>}
                  {showGst     && <th>GST No</th>}
                  {showMsme    && <th>MSME</th>}
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="vm-empty">
                    <Loader2 size={22} style={{ animation:'spin 1s linear infinite', display:'inline-block' }} />
                  </td></tr>
                ) : vendors.length === 0 ? (
                  <tr><td colSpan={10} className="vm-empty">
                    {search || filterSt ? 'No vendors match your search' : 'No vendors yet. Click "New Vendor" to create one.'}
                  </td></tr>
                ) : vendors.map((v, i) => (
                  <tr key={v.id}>
                    <td style={{ color:'#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                    <td><span className="vm-ven-id">{v.vendor_id ?? '—'}</span></td>
                    <td className="vm-name">{v.vendor_name}</td>
                    {showContact && <td>{v.contact_no || '—'}</td>}
                    {showEmail   && <td>{v.email || '—'}</td>}
                    {showState   && <td>{v.state || '—'}</td>}
                    {showGst     && <td style={{ fontFamily:'DM Mono,monospace', fontSize:11 }}>{v.gst_no || '—'}</td>}
                    {showMsme    && <td><span className={`vm-chip ${v.msme === 'Yes' ? 'vm-chip-yes' : 'vm-chip-no'}`}>{v.msme}</span></td>}
                    <td><span className={`vm-chip ${v.status === 'Active' ? 'vm-chip-active' : 'vm-chip-inactive'}`}>{v.status}</span></td>
                    <td>
                      <div className="vm-action-group">
                        <button className="vm-btn-edit" onClick={() => openEdit(v.id!)}>✏️ {!isMobile && 'Edit'}</button>
                        <button className="vm-btn-del"  onClick={() => handleDelete(v.id!)}>🗑 {!isMobile && 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="vm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="vm-pag-btns">
                <button className="vm-pag-btn" onClick={() => goTo(1)}        disabled={page === 1}>«</button>
                <button className="vm-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map((p) => <button key={p} className={`vm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>)}
                <button className="vm-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="vm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="vm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="vm-modal">

              {/* Header */}
              <div className="vm-modal-header">
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <h2 style={{ margin:0, fontSize:isMobile ? 15 : 18, fontWeight:700, color:'#fff' }}>
                    {editId ? '✏️ Edit Vendor' : '➕ New Vendor'}
                  </h2>
                  {editId && form.vendor_id && (
                    <span style={{ fontSize:11, color:'#99f6e4', fontFamily:'DM Mono,monospace' }}>{form.vendor_id}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Error banner */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink:0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', padding:0, color:'#ef4444', display:'flex', alignItems:'center', flexShrink:0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="vm-modal-body">

                {/* ── Basic Info ── */}
                <SectionHead title="Basic Information" open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="vm-grid">
                    <div className="vm-col-full">
                      <MultiCheck label="Type *" items={lookup.serviceTypes} idKey="id" labelKey="service_type_name"
                        selected={form.type_ids} onChange={(ids) => setF('type_ids', ids)} />
                    </div>
                    <div className="vm-col-full">
                      <MultiCheck label="Processing Type" items={lookup.processingTypes} idKey="id" labelKey="processing_type_name"
                        selected={form.processing_type_ids} onChange={(ids) => setF('processing_type_ids', ids)} />
                    </div>
                    <div className="vm-col-full">
                      <Field label="Vendor Name" required error={fieldErrors.vendor_name}>
                        <input type="text" value={form.vendor_name}
                          onChange={(e) => { setF('vendor_name', e.target.value); if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, vendor_name: undefined })); }}
                          style={{ ...s.input, ...(fieldErrors.vendor_name ? s.inputError : {}) }} />
                      </Field>
                    </div>
                    <Field label="Status">{sel('status', ['Active', 'Inactive'])}</Field>
                  </div>
                )}

                {/* ── Address Details — AddressBlock ── */}
                <SectionHead title="Address Details" open={sec.address} onToggle={() => toggle('address')} />
                {sec.address && (
                  <AddressBlock form={form} onChange={handleAddressChange} />
                )}

                {/* ── Contact Details ── */}
                <SectionHead title="Contact Details" open={sec.contact} onToggle={() => toggle('contact')} />
                {sec.contact && (
                  <div className="vm-grid">

                    {/* E-Mail */}
                    <Field label="E-Mail" error={fieldErrors.email}>
                      <div style={{ position:'relative' }}>
                        <input type="email" value={form.email}
                          onChange={(e) => { setF('email', e.target.value); validateField('email', e.target.value); }}
                          onBlur={(e) => validateField('email', e.target.value)}
                          placeholder="vendor@example.com"
                          style={{ ...s.input, paddingRight:36, ...(fieldErrors.email ? s.inputError : form.email && isValidEmail(form.email) ? s.inputSuccess : {}) }} />
                        {form.email && (
                          <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center' }}>
                            {isValidEmail(form.email) ? <CheckCircle2 size={14} color="#16a34a" /> : <AlertCircle size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.email && (
                        <span className="vm-hint-pill"><Mail size={9} /> Must include @ and domain</span>
                      )}
                    </Field>

                    <Field label="Contact Name">{inp('contact_name')}</Field>
                    <Field label="Designation">{inp('designation')}</Field>

                    {/* Contact No */}
                    <Field label="Contact No" error={fieldErrors.contact_no}>
                      <input type="tel" value={form.contact_no}
                        onChange={(e) => { const v = e.target.value.replace(/[^\d\s\+\-]/g,'').slice(0,15); setF('contact_no', v); validateField('contact_no', v); }}
                        onBlur={(e) => validateField('contact_no', e.target.value)}
                        placeholder="e.g. 9876543210" maxLength={15}
                        style={{ ...s.input, ...(fieldErrors.contact_no ? s.inputError : {}) }} />
                      {!fieldErrors.contact_no && (
                        <span className="vm-hint-pill">10–13 digits required</span>
                      )}
                    </Field>

                    {/* Contact E-Mail */}
                    <Field label="Contact E-Mail" error={fieldErrors.contact_email}>
                      <div style={{ position:'relative' }}>
                        <input type="email" value={form.contact_email}
                          onChange={(e) => { setF('contact_email', e.target.value); validateField('contact_email', e.target.value); }}
                          onBlur={(e) => validateField('contact_email', e.target.value)}
                          placeholder="contact@example.com"
                          style={{ ...s.input, paddingRight:36, ...(fieldErrors.contact_email ? s.inputError : form.contact_email && isValidEmail(form.contact_email) ? s.inputSuccess : {}) }} />
                        {form.contact_email && (
                          <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center' }}>
                            {isValidEmail(form.contact_email) ? <CheckCircle2 size={14} color="#16a34a" /> : <AlertCircle size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.contact_email && (
                        <span className="vm-hint-pill"><Mail size={9} /> Must include @ and domain</span>
                      )}
                    </Field>

                    {/* GST No */}
                    <Field label="GST No" error={fieldErrors.gst_no}>
                      <div style={{ position:'relative' }}>
                        <input type="text" value={form.gst_no}
                          onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,15); setF('gst_no', v); validateField('gst_no', v); }}
                          onBlur={(e) => validateField('gst_no', e.target.value)}
                          placeholder="15-character GST number" maxLength={15}
                          style={{ ...s.input, fontFamily:'DM Mono,monospace', letterSpacing:'0.05em', paddingRight:56, ...(fieldErrors.gst_no ? s.inputError : form.gst_no && isValidGst(form.gst_no) ? s.inputSuccess : {}) }} />
                        <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, pointerEvents:'none', color: form.gst_no.length === 15 ? '#16a34a' : form.gst_no.length > 0 ? '#d97706' : '#94a3b8' }}>
                          {form.gst_no.length}/15
                          {form.gst_no.length === 15 && <CheckCircle2 size={12} color="#16a34a" />}
                        </span>
                      </div>
                      {!fieldErrors.gst_no && (
                        <span className="vm-hint-pill">Exactly 15 alphanumeric characters</span>
                      )}
                    </Field>

                  </div>
                )}

                {/* ── MSME Details ── */}
                <SectionHead title="MSME Details" open={sec.msme} onToggle={() => toggle('msme')} />
                {sec.msme && (
                  <div className="vm-grid">
                    <Field label="MSME Registered">
                      <div style={{ display:'flex', gap:10, paddingTop:4, flexWrap:'wrap' }}>
                        {(['Yes','No'] as const).map((opt) => (
                          <label key={opt} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:13 }}>
                            <button type="button"
                              style={{ background:'none', border:'none', padding:0, cursor:'pointer', color: form.msme === opt ? '#0f766e' : '#9ca3af' }}
                              onClick={() => setF('msme', opt)}>
                              {form.msme === opt ? <CheckSquare size={17} /> : <Square size={17} />}
                            </button>
                            {opt}
                          </label>
                        ))}
                      </div>
                    </Field>
                    {form.msme === 'Yes' && (
                      <>
                        <Field label="MSME Sector">{sel('msme_sector', ['Manufacturing','Service','Trading'])}</Field>
                        <Field label="MSME Type">{sel('msme_type', ['Micro','Small','Medium'])}</Field>
                        <Field label="MSME Reg. No">{inp('msme_reg_no')}</Field>
                      </>
                    )}
                  </div>
                )}

                {/* ── Attachments ── */}
                <SectionHead title="Attachments" open={sec.attach} onToggle={() => toggle('attach')} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div style={s.dropZone}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}>
                      <Upload size={22} style={{ color:'#9ca3af', marginBottom:6 }} />
                      <p style={{ margin:0, fontSize:13, color:'#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'#9ca3af' }}>PDF, JPG, PNG, DOCX, XLSX — max 10 MB</p>
                      <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx"
                        style={{ display:'none' }} onChange={(e) => handleFileAdd(e.target.files)} />
                    </div>
                    {form.attachments.length === 0 && (
                      <p style={{ fontSize:13, color:'#9ca3af', textAlign:'center', padding:'10px 0 4px' }}>No files uploaded.</p>
                    )}
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow, marginTop:8 }}>
                        <FileText size={15} style={{ color:'#6b7280', flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.file_name}</span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/vendors/attachment/${a.file_path}`} target="_blank" rel="noreferrer" style={{ color:'#0f766e' }}>
                            <Eye size={14} />
                          </a>
                        )}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>{/* end modal-body */}

              {/* Footer */}
              <div className="vm-modal-footer">
                <button className="vm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="vm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Vendor')}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  closeBtn: {
    background:'none', border:'none', padding:'0 4px', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', opacity:0.85,
    touchAction:'manipulation',
  },
  errorBanner: {
    display:'flex', alignItems:'center', gap:8,
    background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
    color:'#ef4444', padding:'10px 16px', margin:'12px 16px 0', fontSize:13,
    fontFamily:"'DM Sans', sans-serif",
  },
  label: {
    display:'block', fontSize:11, fontWeight:700, color:'#64748b',
    marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em',
  },
  input: {
    width:'100%', padding:'8px 12px', borderRadius:8,
    border:'1px solid #cbd5e1', fontSize:13, color:'#1e293b',
    outline:'none', boxSizing:'border-box', transition:'border-color 0.15s',
    background:'#fff',
  },
  inputError: {
    border:'1.5px solid #fca5a5',
    background:'#fff5f5',
    boxShadow:'0 0 0 3px rgba(239,68,68,0.08)',
  },
  inputSuccess: {
    border:'1.5px solid #86efac',
    background:'#f0fdf4',
  },
  sectionHead: {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    background:'#f8fafc', border:'1px solid #e2e8f0',
    borderRadius:10, padding:'10px 14px', cursor:'pointer',
    marginTop:18, userSelect:'none',
  },
  sectionTitle: { fontWeight:700, fontSize:13, color:'#1e293b' },
  subSection: {
    background:'#fafbfc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, marginTop:10,
  },
  dropZone: {
    border:'2px dashed #cbd5e1', borderRadius:12,
    padding:'24px 16px', textAlign:'center', cursor:'pointer',
    display:'flex', flexDirection:'column', alignItems:'center',
  },
  attachRow: {
    display:'flex', alignItems:'center', gap:10,
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px',
  },
  delRowBtn: {
    background:'#fff1f2', color:'#ef4444', border:'1px solid #fca5a5',
    width:30, height:30, borderRadius:7, cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    touchAction:'manipulation',
  },
};