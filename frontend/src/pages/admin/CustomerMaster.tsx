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
  PlusCircle,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  MapPin,
  Copy,
  Mail,
  Lock,
  Download,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GstEntry    { gst_no: string; state: string; is_primary: boolean }
interface DeliveryAddr {
  label: string; address1: string; address2: string; pin_code: string; district: string;
  state: string; country: string; contact_name: string; contact_no: string; is_default: boolean;
}
interface Attachment   { id?: number; file_name: string; file_path?: string; isNew?: boolean; file?: File }
interface PaymentAcct  { bank_account_id: string; is_primary: boolean; account_label?: string }

interface Customer {
  id?: number;
  customer_id?: string;
  category: string;
  customer_name: string;
  customer_group_id: string;
  billing_address1: string;
  billing_address2: string;
  billing_pin_code: string;
  billing_district: string;
  billing_state: string;
  billing_country: string;
  shipping_address1: string;
  shipping_address2: string;
  shipping_pin_code: string;
  shipping_district: string;
  shipping_state: string;
  shipping_country: string;
  is_same_as_billing: boolean;
  email: string;
  contact_name: string;
  designation: string;
  contact_no: string;
  email_password: string;
  agent: string;
  region_id: string;
  company_type: string;
  gst_no: string;
  pan_no: string;
  tan_no: string;
  status: string;
  gst_numbers: GstEntry[];
  delivery_addresses: DeliveryAddr[];
  attachments: Attachment[];
  payment_accounts: PaymentAcct[];
}

interface LookupData {
  groups: { id: number; group_name: string }[];
  regions: { id: number; region_name: string }[];
  bankAccounts: { id: number; account_name: string; bank_name: string; account_no: string }[];
}

// ─── Toast Types ─────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
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
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxWidth: 360, width: 'calc(100vw - 40px)', pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
            padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            pointerEvents: 'all', animation: 'toastIn 0.25s ease-out',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.color }}>{t.title}</p>
              {t.message && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: c.color, opacity: 0.8, lineHeight: 1.4 }}>
                  {t.message}
                </p>
              )}
            </div>
            <button onClick={() => onRemove(t.id)} style={{
              flexShrink: 0, background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: c.color, opacity: 0.6,
              display: 'flex', alignItems: 'center', marginTop: 1,
            }}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── SearchableDropdown ───────────────────────────────────────────────────────

interface SearchableDropdownOption {
  value: string;
  label: string;
}

interface SearchableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableDropdownOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  noResultsText?: string;
}

function SearchableDropdown({
  value, onChange, options,
  placeholder = '— Select —',
  searchPlaceholder = 'Search…',
  disabled = false,
  noResultsText = '0 of 0 codes',
}: SearchableDropdownProps) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef           = useRef<HTMLDivElement>(null);
  const searchRef         = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  const handleSelect = (opt: SearchableDropdownOption) => {
    onChange(opt.value); setOpen(false); setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); onChange(''); setOpen(false); setQuery('');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', fontFamily: "'DM Sans', sans-serif" }}>
      <div
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px 8px 12px',
          border: `1px solid ${open ? '#2563eb' : '#cbd5e1'}`,
          borderRadius: 8, background: disabled ? '#f1f5f9' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13, color: selected ? '#1e293b' : '#94a3b8',
          outline: 'none', userSelect: 'none',
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          minHeight: 37,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#1e293b' : '#9ca3af' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 6 }}>
          {selected && !disabled && (
            <span onClick={handleClear} title="Clear" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#e2e8f0', color: '#64748b', cursor: 'pointer' }}>
              <X size={10} />
            </span>
          )}
          <ChevronDown size={15} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </span>
      </div>

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          zIndex: 9000, overflow: 'hidden', animation: 'dropdownIn 0.15s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#1e293b', background: 'transparent', fontFamily: "'DM Sans', sans-serif" }} />
            {query && (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                {query ? `0 of ${options.length} result${options.length !== 1 ? 's' : ''}` : noResultsText}
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div key={opt.value} onClick={() => handleSelect(opt)}
                    style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: isSelected ? '#eff6ff' : 'transparent', color: isSelected ? '#1d4ed8' : '#374151', fontWeight: isSelected ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                    {isSelected && <CheckCircle2 size={14} color="#2563eb" style={{ flexShrink: 0, marginLeft: 6 }} />}
                  </div>
                );
              })
            )}
          </div>
          <div style={{ padding: '6px 14px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', justifyContent: 'space-between' }}>
            <span>{filtered.length} of {options.length} group{options.length !== 1 ? 's' : ''}</span>
            {query && filtered.length > 0 && <span style={{ color: '#2563eb', fontWeight: 600 }}>{filtered.length} match{filtered.length !== 1 ? 'es' : ''}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── India States & Districts ─────────────────────────────────────────────────

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

const COUNTRY_LIST = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (Brazzaville)","Congo (DRC)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
].sort();

// ─── Sanitise ────────────────────────────────────────────────────────────────

function sanitizeCustomer(data: any): Customer {
  const safe = (v: any) => (v == null ? '' : String(v));

  let billing_address1 = safe(data.billing_address1);
  let billing_address2 = safe(data.billing_address2);
  if (!billing_address1 && data.address) {
    const lines = String(data.address).split('\n');
    billing_address1 = lines[0] || '';
    billing_address2 = lines.slice(1).join('\n') || '';
  }

  let shipping_address1 = safe(data.shipping_address1);
  let shipping_address2 = safe(data.shipping_address2);
  if (!shipping_address1 && data.shipping_address) {
    const lines = String(data.shipping_address).split('\n');
    shipping_address1 = lines[0] || '';
    shipping_address2 = lines.slice(1).join('\n') || '';
  }

  return {
    ...BLANK,
    ...data,
    customer_group_id: safe(data.customer_group_id),
    region_id:         safe(data.region_id),
    category:          safe(data.category)     || 'Domestic',
    company_type:      safe(data.company_type) || 'Individual',
    status:            safe(data.status)        || 'Active',
    billing_address1,
    billing_address2,
    billing_pin_code: safe(data.billing_pin_code) || safe(data.pin_code),
    billing_district: safe(data.billing_district) || safe(data.district),
    billing_state:    safe(data.billing_state)    || safe(data.state)   || DEFAULT_STATE,
    billing_country:  safe(data.billing_country)  || safe(data.country) || 'India',
    shipping_address1,
    shipping_address2,
    shipping_pin_code: safe(data.shipping_pin_code),
    shipping_district: safe(data.shipping_district),
    shipping_state:    safe(data.shipping_state)   || DEFAULT_STATE,
    shipping_country:  safe(data.shipping_country) || 'India',
    is_same_as_billing: data.is_same_as_billing === 1 || data.is_same_as_billing === true || data.is_same_as_billing === '1',
    email:          safe(data.email),
    contact_name:   safe(data.contact_name),
    designation:    safe(data.designation),
    contact_no:     safe(data.contact_no),
    email_password: safe(data.email_password),
    agent:          safe(data.agent),
    gst_no:         safe(data.gst_no),
    pan_no:         safe(data.pan_no),
    tan_no:         safe(data.tan_no),
    customer_name:  safe(data.customer_name),
    gst_numbers:        data.gst_numbers        ?? [],
    delivery_addresses: data.delivery_addresses ?? [],
    attachments:        data.attachments        ?? [],
    payment_accounts:   data.payment_accounts   ?? [],
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BLANK: Customer = {
  category: 'Domestic', customer_name: '', customer_group_id: '',
  billing_address1: '', billing_address2: '', billing_pin_code: '',
  billing_district: '', billing_state: DEFAULT_STATE, billing_country: 'India',
  shipping_address1: '', shipping_address2: '', shipping_pin_code: '',
  shipping_district: '', shipping_state: DEFAULT_STATE, shipping_country: 'India',
  is_same_as_billing: false,
  email: '', contact_name: '', designation: '', contact_no: '',
  email_password: '',
  agent: '', region_id: '', company_type: 'Individual',
  gst_no: '', pan_no: '', tan_no: '',
  status: 'Active',
  gst_numbers: [], delivery_addresses: [], attachments: [], payment_accounts: [],
};

const API = '/api/customers';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

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

// ─── FieldError ──────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>
      <AlertCircle size={11} style={{ flexShrink: 0 }} />
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
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={s.sectionTitle}>{title}</span>
        {badge}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── AddressBlock ─────────────────────────────────────────────────────────────

interface AddressBlockProps {
  prefix: 'billing' | 'shipping';
  form: Customer;
  onChange: (updates: Partial<Customer>) => void;
  title: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
  disabled?: boolean;
}

function AddressBlock({ prefix, form, onChange, title, accent, accentLight, accentBorder, disabled }: AddressBlockProps) {
  const stateKey    = `${prefix}_state`    as keyof Customer;
  const districtKey = `${prefix}_district` as keyof Customer;
  const addr1Key    = `${prefix}_address1` as keyof Customer;
  const addr2Key    = `${prefix}_address2` as keyof Customer;
  const pinKey      = `${prefix}_pin_code` as keyof Customer;
  const countryKey  = `${prefix}_country`  as keyof Customer;

  const country   = (form[countryKey] as string) || 'India';
  const state     = (form[stateKey] as string) || DEFAULT_STATE;
  const districts = INDIA_STATES[state] || [];
  const isIndia   = country === 'India';

  const set = (key: keyof Customer, val: string) => onChange({ [key]: val } as Partial<Customer>);

  const handleStateChange = (newState: string) => {
    onChange({ [stateKey]: newState, [districtKey]: '' } as Partial<Customer>);
  };

  const handleCountryChange = (newCountry: string) => {
    if (newCountry === 'India') {
      onChange({ [countryKey]: newCountry, [stateKey]: DEFAULT_STATE, [districtKey]: '' } as Partial<Customer>);
    } else {
      onChange({ [countryKey]: newCountry, [stateKey]: '', [districtKey]: '' } as Partial<Customer>);
    }
  };

  const baseInput: React.CSSProperties = { ...s.input, ...(disabled ? s.inputDisabled : {}) };

  return (
    <div style={{ border: `1.5px solid ${accentBorder}`, borderRadius: 12, overflow: 'hidden', background: '#fff', marginTop: 10 }}>
      <div style={{ background: accentLight, borderBottom: `1px solid ${accentBorder}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={15} color={accent} />
        <span style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={s.label}>Address Line 1</label>
          <input value={form[addr1Key] as string || ''} onChange={(e) => set(addr1Key, e.target.value)} placeholder="Door no, Street name" disabled={disabled} style={baseInput} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={s.label}>Address Line 2</label>
          <input value={form[addr2Key] as string || ''} onChange={(e) => set(addr2Key, e.target.value)} placeholder="Area, Landmark (optional)" disabled={disabled} style={baseInput} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={s.label}>Country</label>
          <select value={country} onChange={(e) => handleCountryChange(e.target.value)} disabled={disabled} style={{ ...baseInput, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {COUNTRY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {isIndia ? (
          <>
            <div>
              <label style={s.label}>State</label>
              <select value={state} onChange={(e) => handleStateChange(e.target.value)} disabled={disabled} style={{ ...baseInput, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                {STATE_LIST.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>District</label>
              <select value={form[districtKey] as string || ''} onChange={(e) => set(districtKey, e.target.value)} disabled={disabled} style={{ ...baseInput, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <option value="">— Select District —</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={s.label}>State / Province</label>
              <input value={form[stateKey] as string || ''} onChange={(e) => set(stateKey, e.target.value)} placeholder="State / Province / Region" disabled={disabled} style={baseInput} />
            </div>
            <div>
              <label style={s.label}>District / City</label>
              <input value={form[districtKey] as string || ''} onChange={(e) => set(districtKey, e.target.value)} placeholder="District / City" disabled={disabled} style={baseInput} />
            </div>
          </>
        )}
        <div>
          <label style={s.label}>{isIndia ? 'Pin Code' : 'Postal / ZIP Code'}</label>
          <input
            value={form[pinKey] as string || ''}
            onChange={(e) => set(pinKey, isIndia ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value.slice(0, 20))}
            placeholder={isIndia ? '6-digit pincode' : 'Postal / ZIP code'}
            maxLength={isIndia ? 6 : 20} disabled={disabled} style={baseInput}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Password cell ────────────────────────────────────────────────────────────

function PasswordCell({ password }: { password: string }) {
  const [show, setShow] = useState(false);
  if (!password) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: show ? 'inherit' : 'monospace', fontSize: 12, letterSpacing: show ? 'normal' : '0.12em' }}>
        {show ? password : '•'.repeat(Math.min(password.length, 10))}
      </span>
      <button onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Reveal'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', color: '#64748b', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {show ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </span>
  );
}

// ─── Validation state type ────────────────────────────────────────────────────

interface FieldErrors {
  customer_name?: string;
  category?: string;
  email?: string;
  contact_no?: string;
  gst_no?: string;
  pan_no?: string;
  tan_no?: string;
}

// ─── Export Menu ──────────────────────────────────────────────────────────────

function ExportMenu({ total, search, filterCat, filterSt }: {
  total: number;
  search: string;
  filterCat: string;
  filterSt: string;
}) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState<'csv' | 'excel' | 'print' | null>(null);
  const wrapRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const fetchAll = async (): Promise<Customer[]> => {
    const qs = new URLSearchParams({
      search, page: '1', limit: String(Math.max(total, 1)),
      ...(filterCat ? { category: filterCat } : {}),
      ...(filterSt  ? { status: filterSt }    : {}),
    });
    const res  = await fetch(`${API}?${qs}`);
    const data = await res.json();
    return (data.data ?? []).map(sanitizeCustomer);
  };

  const COLS = [
    { key: 'customer_id'      as keyof Customer, label: 'Customer ID'    },
    { key: 'category'         as keyof Customer, label: 'Category'       },
    { key: 'customer_name'    as keyof Customer, label: 'Customer Name'  },
    { key: 'company_type'     as keyof Customer, label: 'Company Type'   },
    { key: 'contact_name'     as keyof Customer, label: 'Contact Name'   },
    { key: 'designation'      as keyof Customer, label: 'Designation'    },
    { key: 'contact_no'       as keyof Customer, label: 'Contact No'     },
    { key: 'email'            as keyof Customer, label: 'Email'          },
    { key: 'billing_address1' as keyof Customer, label: 'Address Line 1' },
    { key: 'billing_address2' as keyof Customer, label: 'Address Line 2' },
    { key: 'billing_district' as keyof Customer, label: 'District'       },
    { key: 'billing_state'    as keyof Customer, label: 'State'          },
    { key: 'billing_pin_code' as keyof Customer, label: 'Pin Code'       },
    { key: 'billing_country'  as keyof Customer, label: 'Country'        },
    { key: 'gst_no'           as keyof Customer, label: 'GST No'         },
    { key: 'pan_no'           as keyof Customer, label: 'PAN No'         },
    { key: 'tan_no'           as keyof Customer, label: 'TAN No'         },
    { key: 'agent'            as keyof Customer, label: 'Agent'          },
    { key: 'status'           as keyof Customer, label: 'Status'         },
  ];

  // ── CSV ───────────────────────────────────────────────────────────────────
  const exportCsv = async () => {
    setLoading('csv');
    try {
      const rows = await fetchAll();
      const escape = (v: any) => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = COLS.map((c) => c.label).join(',');
      const body   = rows.map((r) => COLS.map((c) => escape(r[c.key])).join(',')).join('\n');
      const blob   = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { alert('CSV export failed. Please try again.'); }
    setLoading(null); setOpen(false);
  };

  // ── Excel ─────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    setLoading('excel');
    try {
      const rows = await fetchAll();
      if (!(window as any).XLSX) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.onload  = () => resolve();
          script.onerror = () => reject(new Error('SheetJS load failed'));
          document.head.appendChild(script);
        });
      }
      const XLSX = (window as any).XLSX;
      const wsData = [
        COLS.map((c) => c.label),
        ...rows.map((r) => COLS.map((c) => r[c.key] ?? '')),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = COLS.map((_, i) =>
        ({ wch: [14,10,28,18,20,18,14,28,28,20,16,16,10,12,18,12,12,16,10][i] ?? 16 })
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      XLSX.writeFile(wb, `customers_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) { alert('Excel export failed: ' + (e?.message ?? 'Unknown error')); }
    setLoading(null); setOpen(false);
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const exportPrint = async () => {
    setLoading('print');
    try {
      const rows = await fetchAll();
      const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const filterNote = [
        search    ? `Search: "${search}"`    : '',
        filterCat ? `Category: ${filterCat}` : '',
        filterSt  ? `Status: ${filterSt}`    : '',
      ].filter(Boolean).join(' · ') || 'All records';

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
        <title>Customer Master — ${date}</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px}
          .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;border-bottom:2px solid #2563eb;padding-bottom:10px}
          .header h1{font-size:18px;font-weight:700;color:#2563eb}
          .meta{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
          .filter-note{font-size:10px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;margin-bottom:12px;display:inline-block}
          table{width:100%;border-collapse:collapse;font-size:10px}
          thead tr{background:#2563eb}
          th{color:#fff;padding:7px 8px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
          td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
          tr:nth-child(even) td{background:#f8fafc}
          .cus-id{font-family:monospace;font-size:9px;color:#2563eb;background:#eff6ff;border-radius:4px;padding:1px 5px;white-space:nowrap}
          .chip{display:inline-block;padding:1px 6px;border-radius:10px;font-weight:600;font-size:9px}
          .chip-domestic{background:#e0f2fe;color:#0369a1}
          .chip-export{background:#fef3c7;color:#b45309}
          .chip-active{background:#dcfce7;color:#166534}
          .chip-inactive{background:#fee2e2;color:#991b1b}
          .footer{margin-top:14px;font-size:9px;color:#94a3b8;text-align:right;border-top:1px solid #e2e8f0;padding-top:8px}
          @media print{body{padding:10px}@page{margin:12mm;size:A4 landscape}}
        </style>
      </head><body>
        <div class="header">
          <div><h1>Customer Master</h1><p style="font-size:11px;color:#64748b;margin-top:2px">${rows.length} customer${rows.length !== 1 ? 's' : ''} exported</p></div>
          <div class="meta"><div>Exported on ${date}</div><div style="margin-top:2px">Filter: ${filterNote}</div></div>
        </div>
        <span class="filter-note">🔍 ${filterNote} — ${rows.length} record${rows.length !== 1 ? 's' : ''}</span>
        <table>
          <thead><tr>
            <th>#</th><th>Cust. ID</th><th>Category</th><th>Customer Name</th>
            <th>Company Type</th><th>Contact</th><th>Email</th>
            <th>State</th><th>GST No</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${rows.map((r, i) => `<tr>
              <td style="color:#94a3b8">${i + 1}</td>
              <td><span class="cus-id">${r.customer_id ?? '—'}</span></td>
              <td><span class="chip ${r.category === 'Export' ? 'chip-export' : 'chip-domestic'}">${r.category}</span></td>
              <td style="font-weight:600">${r.customer_name}</td>
              <td>${r.company_type || '—'}</td>
              <td>${r.contact_no || '—'}</td>
              <td>${r.email || '—'}</td>
              <td>${r.billing_state || '—'}</td>
              <td style="font-family:monospace;font-size:9px">${r.gst_no || '—'}</td>
              <td><span class="chip ${r.status === 'Active' ? 'chip-active' : 'chip-inactive'}">${r.status}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="footer">Customer Master · Generated ${date} · ${rows.length} record${rows.length !== 1 ? 's' : ''}</div>
        <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`;

      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    } catch { alert('Print export failed. Please try again.'); }
    setLoading(null); setOpen(false);
  };

  const isLoading = loading !== null;

  const options = [
    {
      id: 'csv'   as const,
      icon: <FileText size={16} color="#16a34a" />,
      label: 'Export as CSV',
      desc: 'Comma-separated, opens in Excel',
      bg: '#f0fdf4', border: '#bbf7d0', color: '#166534',
      onClick: exportCsv,
    },
    {
      id: 'excel' as const,
      icon: <FileSpreadsheet size={16} color="#2563eb" />,
      label: 'Export as Excel',
      desc: '.xlsx with column widths set',
      bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8',
      onClick: exportExcel,
    },
    {
      id: 'print' as const,
      icon: <Printer size={16} color="#7c3aed" />,
      label: 'Print / Save PDF',
      desc: 'Opens print-ready view',
      bg: '#faf5ff', border: '#ddd6fe', color: '#6d28d9',
      onClick: exportPrint,
    },
  ];

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isLoading || total === 0}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: open ? '#f1f5f9' : '#fff',
          color: '#374151',
          border: '1px solid #cbd5e1',
          borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600,
          cursor: isLoading || total === 0 ? 'not-allowed' : 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          transition: 'all 0.15s',
          opacity: total === 0 ? 0.5 : 1,
          boxShadow: open ? 'inset 0 1px 3px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
          whiteSpace: 'nowrap',
        }}
      >
        {isLoading
          ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          : <Download size={14} />}
        Export
        <ChevronDown size={13} color="#94a3b8"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          zIndex: 4000, minWidth: 230, overflow: 'hidden',
          animation: 'dropdownIn 0.15s ease-out',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Export Options
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {total} record{total !== 1 ? 's' : ''}{(search || filterCat || filterSt) ? ' (filtered)' : ' (all)'}
            </div>
          </div>

          {/* Options */}
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={opt.onClick}
              disabled={loading === opt.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                width: '100%', padding: '11px 14px',
                background: loading === opt.id ? opt.bg : 'transparent',
                border: 'none', borderBottom: '1px solid #f8fafc',
                cursor: loading === opt.id ? 'not-allowed' : 'pointer',
                textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                if (loading !== opt.id) (e.currentTarget as HTMLButtonElement).style.background = opt.bg;
              }}
              onMouseLeave={(e) => {
                if (loading !== opt.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: opt.bg, border: `1px solid ${opt.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {loading === opt.id
                  ? <Loader2 size={15} color={opt.color} style={{ animation: 'spin 1s linear infinite' }} />
                  : opt.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </button>
          ))}

          {/* Footer */}
          <div style={{ padding: '8px 14px', fontSize: 10, color: '#94a3b8', background: '#fafbfc' }}>
            💡 Exports all matching records, not just this page
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CustomerMaster() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lookup, setLookup]       = useState<LookupData>({ groups: [], regions: [], bankAccounts: [] });
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterSt, setFilterSt]   = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Customer>(BLANK);
  const [editId, setEditId]       = useState<number | null>(null);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [sec, setSec] = useState({
    basic: true, billing: true, shipping: true, contact: true,
    tax: true, delivery: false, attach: false, payment: false,
  });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const width   = useWidth();
  const isMobile  = width < 576;

  const groupOptions: SearchableDropdownOption[] = lookup.groups.map((g) => ({
    value: String(g.id),
    label: g.group_name,
  }));

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterCat ? { category: filterCat } : {}),
        ...(filterSt  ? { status: filterSt }    : {}),
      });
      const res = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setCustomers((data.data ?? []).map(sanitizeCustomer));
      setTotal(data.total ?? 0);
    } catch {
      pushToast('error', 'Load Failed', 'Could not fetch customers. Please try again.');
    }
    setLoading(false);
  };

  const loadLookup = async () => {
    try {
      const res = await fetch(`${API}/meta/lookup`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLookup(await res.json());
    } catch {
      pushToast('warning', 'Lookup Failed', 'Could not load groups/regions. Retrying…');
      setTimeout(async () => {
        try { const res = await fetch(`${API}/meta/lookup`); setLookup(await res.json()); } catch { }
      }, 2000);
    }
  };

  useEffect(() => { loadLookup(); }, []);
  useEffect(() => { loadCustomers(); }, [search, filterCat, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterCat, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Form open ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setFieldErrors({});
    setShowLoginPwd(false); setShowForm(true);
  };

  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm(sanitizeCustomer(data));
      setEditId(id); setError(''); setFieldErrors({});
      setShowLoginPwd(false); setShowForm(true);
    } catch {
      pushToast('error', 'Load Failed', 'Could not load customer details.');
    }
  };

  // ── Address sync ───────────────────────────────────────────────────────────
  const syncShipping = (source: Customer): Customer => ({
    ...source,
    shipping_address1: source.billing_address1,
    shipping_address2: source.billing_address2,
    shipping_pin_code: source.billing_pin_code,
    shipping_district: source.billing_district,
    shipping_state:    source.billing_state,
    shipping_country:  source.billing_country,
    is_same_as_billing: true,
  });

  const toggleSameAsBilling = (checked: boolean) => {
    if (checked) setForm((f) => syncShipping({ ...f, is_same_as_billing: true }));
    else         setForm((f) => ({ ...f, is_same_as_billing: false }));
  };

  const handleAddressChange = (updates: Partial<Customer>) => {
    setForm((f) => {
      const next = { ...f, ...updates };
      if (next.is_same_as_billing && Object.keys(updates).some((k) => k.startsWith('billing_')))
        return syncShipping(next);
      return next;
    });
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateField = (key: keyof FieldErrors, value: string) => {
    let msg = '';
    switch (key) {
      case 'email':      if (value && !isValidEmail(value))   msg = 'Enter a valid email (e.g. user@example.com).'; break;
      case 'contact_no': if (value && !isValidContact(value)) msg = 'Contact number must be 10–13 digits.'; break;
      case 'gst_no':     if (value && value.length !== 15)    msg = `GST No must be exactly 15 characters (${value.length}/15).`; break;
      case 'pan_no':     if (value && !isValidPan(value))     msg = `PAN must be 10 characters in format AAAAA9999A (${value.length}/10).`; break;
      case 'tan_no':     if (value && !isValidTan(value))     msg = `TAN must be 10 characters in format AAAA99999A (${value.length}/10).`; break;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  const validateAll = (): boolean => {
    const errors: FieldErrors = {};
    if (!form.customer_name.trim()) errors.customer_name = 'Customer Name is required.';
    if (!form.category)             errors.category      = 'Category is required.';
    if (form.email      && !isValidEmail(form.email))      errors.email      = 'Enter a valid email address.';
    if (form.contact_no && !isValidContact(form.contact_no)) errors.contact_no = 'Contact number must be 10–13 digits.';
    if (form.gst_no     && form.gst_no.length !== 15)      errors.gst_no     = `GST No must be exactly 15 characters (${form.gst_no.length}/15).`;
    if (form.pan_no     && !isValidPan(form.pan_no))       errors.pan_no     = `PAN No must be 10 characters in format AAAAA9999A.`;
    if (form.tan_no     && !isValidTan(form.tan_no))       errors.tan_no     = `TAN No must be 10 characters in format AAAA99999A.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validateAll()) {
      setError('Please fix the highlighted errors before saving.');
      if (fieldErrors.email || fieldErrors.contact_no) setSec((p) => ({ ...p, contact: true }));
      if (fieldErrors.gst_no || fieldErrors.pan_no || fieldErrors.tan_no) setSec((p) => ({ ...p, tax: true }));
      return;
    }
    setError(''); setSaving(true);
    const fd = new FormData();
    const scalar: (keyof Customer)[] = [
      'category','customer_name','customer_group_id',
      'billing_address1','billing_address2','billing_pin_code','billing_district','billing_state','billing_country',
      'shipping_address1','shipping_address2','shipping_pin_code','shipping_district','shipping_state','shipping_country',
      'email','contact_name','designation','contact_no','email_password',
      'agent','region_id','company_type','gst_no','pan_no','tan_no','status',
    ];
    scalar.forEach((k) => fd.append(k, String(form[k] ?? '')));
    fd.append('is_same_as_billing', form.is_same_as_billing ? '1' : '0');
    fd.append('gst_numbers',        JSON.stringify(form.gst_numbers));
    fd.append('delivery_addresses', JSON.stringify(form.delivery_addresses));
    fd.append('payment_accounts',   JSON.stringify(form.payment_accounts));
    form.attachments.filter((a) => a.isNew && a.file).forEach((a) => fd.append('attachments', a.file!));
    fd.append('deleted_attachments', JSON.stringify((form as any).__deletedAttachments ?? []));
    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const saved     = await res.json();
      const sanitized = sanitizeCustomer(saved);
      if (editId) {
        setCustomers((prev) => prev.map((c) => c.id === editId ? sanitized : c));
      } else {
        setCustomers((prev) => [sanitized, ...prev].slice(0, pageSize));
        setTotal((prev) => prev + 1);
      }
      const emailResult = saved.emailNotification;
      if (emailResult?.sent) pushToast('info', '📧 Email Sent', `Notification dispatched to ${emailResult.to}`);
      else if (sanitized.email && emailResult && !emailResult.sent)
        pushToast('warning', '📧 Email Not Sent', emailResult.error || emailResult.reason || 'Check email settings');
      pushToast('success', editId ? 'Customer Updated' : 'Customer Created', `${form.customer_name} has been ${editId ? 'updated' : 'saved'} successfully.`);
      setShowForm(false);
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg);
      pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this customer?')) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      pushToast('success', 'Customer Deleted', 'The customer record has been removed.');
      if (customers.length === 1 && page > 1) setPage((p) => p - 1);
    } catch {
      pushToast('error', 'Delete Failed', 'Could not delete customer. Please try again.');
    }
  };

  // ── Form helpers ───────────────────────────────────────────────────────────
  const set = (key: keyof Customer, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const inp = (key: keyof Customer, type = 'text', disabled = false) => (
    <input type={type} value={form[key] == null ? '' : String(form[key])} onChange={(e) => set(key, e.target.value)}
      disabled={disabled} style={{ ...s.input, ...(disabled ? s.inputDisabled : {}) }} />
  );

  const sel = (key: keyof Customer, opts: string[], disabled = false) => (
    <select value={form[key] == null ? '' : String(form[key])} onChange={(e) => set(key, e.target.value)}
      disabled={disabled} style={{ ...s.input, ...(disabled ? s.inputDisabled : {}) }}>
      <option value=''>— Select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const addGst = () => setForm((f) => ({ ...f, gst_numbers: [...f.gst_numbers, { gst_no: '', state: '', is_primary: false }] }));
  const setGst = (i: number, k: keyof GstEntry, v: any) =>
    setForm((f) => { const a = [...f.gst_numbers]; (a[i] as any)[k] = v; return { ...f, gst_numbers: a }; });
  const delGst = (i: number) => setForm((f) => ({ ...f, gst_numbers: f.gst_numbers.filter((_, j) => j !== i) }));

  const addAddr = () => setForm((f) => ({
    ...f, delivery_addresses: [...f.delivery_addresses, { label: '', address1: '', address2: '', pin_code: '', district: '', state: DEFAULT_STATE, country: 'India', contact_name: '', contact_no: '', is_default: false }],
  }));
  const setAddr = (i: number, k: keyof DeliveryAddr, v: any) =>
    setForm((f) => { const a = [...f.delivery_addresses]; (a[i] as any)[k] = v; return { ...f, delivery_addresses: a }; });
  const delAddr = (i: number) => setForm((f) => ({ ...f, delivery_addresses: f.delivery_addresses.filter((_, j) => j !== i) }));

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...Array.from(files).map((f) => ({ file_name: f.name, isNew: true, file: f }))] }));
  };
  const removeAttachment = (i: number) => {
    setForm((prev) => {
      const att = prev.attachments[i];
      const deleted = (prev as any).__deletedAttachments ?? [];
      return { ...prev, attachments: prev.attachments.filter((_, j) => j !== i), __deletedAttachments: att.id ? [...deleted, att.id] : deleted };
    });
  };

  const addPayment = () => setForm((f) => ({ ...f, payment_accounts: [...f.payment_accounts, { bank_account_id: '', is_primary: false }] }));
  const setPayment = (i: number, k: keyof PaymentAcct, v: any) =>
    setForm((f) => { const a = [...f.payment_accounts]; (a[i] as any)[k] = v; return { ...f, payment_accounts: a }; });
  const delPayment = (i: number) => setForm((f) => ({ ...f, payment_accounts: f.payment_accounts.filter((_, j) => j !== i) }));

  const toggle = (k: keyof typeof sec) => setSec((p) => ({ ...p, [k]: !p[k] }));

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const showEmail   = !isMobile;
  const showState   = !isMobile;
  const showType    = width >= 768;
  const showContact = width >= 480;
  const showPwdCol  = width >= 900;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes dropdownIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes rowFlash { 0% { background: #fef9c3 !important; } 100% { background: transparent; } }
        .cm-wrap { font-family: 'DM Sans', sans-serif; font-size: 14px; color: #1e293b; }
        .cm-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .cm-page-header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1e293b; }
        .cm-page-header p  { margin: 3px 0 0; font-size: 13px; color: #64748b; }
        .cm-add-btn { display: flex; align-items: center; gap: 6px; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(37,99,235,0.3); white-space: nowrap; flex-shrink: 0; }
        .cm-add-btn:hover { background: #1d4ed8; }
        .cm-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
        .cm-search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
        .cm-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .cm-search { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; outline: none; }
        .cm-search:focus { border-color: #2563eb; }
        .cm-filter-sel { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; color: #374151; cursor: pointer; outline: none; }
        .cm-page-size { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; margin-left: auto; }
        .cm-page-size select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: 13px; font-family: 'DM Sans', sans-serif; background: #fff; cursor: pointer; outline: none; }
        .cm-rec-count { font-size: 12px; color: #64748b; white-space: nowrap; }
        .cm-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.07); margin-bottom: 24px; }
        .cm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .cm-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'DM Sans', sans-serif; min-width: 480px; }
        .cm-table thead tr { background: #2563eb; }
        .cm-table th { padding: 11px 12px; color: #fff; font-weight: 600; text-align: left; white-space: nowrap; font-size: 12px; }
        .cm-table th.th-center { text-align: center; }
        .cm-table tbody tr:nth-child(odd) td { background: #fff; }
        .cm-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .cm-table tbody tr:hover td { filter: brightness(0.97); }
        .cm-table td { padding: 10px 12px; color: #374151; font-size: 12px; white-space: nowrap; }
        .cm-table tbody tr.row-new td { animation: rowFlash 1.6s ease-out; }
        .cm-cus-id { display: inline-block; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 2px 7px; }
        .cm-chip { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .cm-chip-domestic { background: #e0f2fe; color: #0369a1; }
        .cm-chip-export   { background: #fef3c7; color: #b45309; }
        .cm-chip-active   { background: #dcfce7; color: #166534; }
        .cm-chip-inactive { background: #fee2e2; color: #991b1b; }
        .cm-name { font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
        .cm-action-group { display: flex; align-items: center; gap: 5px; justify-content: center; }
        .cm-btn-edit { display: inline-flex; align-items: center; gap: 3px; background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .cm-btn-edit:hover { background: #dbeafe; }
        .cm-btn-del { display: inline-flex; align-items: center; gap: 3px; background: #fff1f2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
        .cm-btn-del:hover { background: #fee2e2; }
        .cm-empty { text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 13px; }
        .cm-pagination { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-top: 1px solid #f1f5f9; background: #f8fafc; font-size: 12px; color: #64748b; flex-wrap: wrap; gap: 8px; font-family: 'DM Sans', sans-serif; }
        .cm-pag-btns { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .cm-pag-btn { padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; min-width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }
        .cm-pag-btn:hover:not(:disabled) { background: #f1f5f9; }
        .cm-pag-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; font-weight: 700; }
        .cm-pag-btn:disabled { border-color: #e2e8f0; background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
        .cm-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: flex-start; justify-content: center; z-index: 2000; overflow-y: auto; padding: 16px 8px; -webkit-overflow-scrolling: touch; }
        .cm-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 860px; box-shadow: 0 8px 40px rgba(0,0,0,0.22); display: flex; flex-direction: column; max-height: calc(100vh - 32px); }
        .cm-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #2563eb; border-radius: 14px 14px 0 0; flex-shrink: 0; }
        .cm-modal-body { padding: 16px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; }
        .cm-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid #f1f5f9; background: #f8fafc; flex-shrink: 0; border-radius: 0 0 14px 14px; }
        .cm-grid { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 12px 0; }
        @media (min-width: 480px) { .cm-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
        @media (min-width: 768px) { .cm-grid { grid-template-columns: repeat(3, 1fr); gap: 14px 16px; } }
        .cm-col-full { grid-column: 1 / -1; }
        .cm-gst-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
        .cm-gst-row input, .cm-gst-row select { min-width: 120px; flex: 1; }
        .cm-login-pwd-panel { border: 1.5px solid #c4b5fd; border-radius: 12px; overflow: hidden; background: #fff; margin-top: 16px; }
        .cm-login-pwd-header { background: #faf5ff; border-bottom: 1px solid #c4b5fd; padding: 10px 16px; display: flex; align-items: center; gap: 8px; }
        .cm-login-pwd-body { padding: 14px 16px; }
        .cm-pwd-wrap { position: relative; }
        .cm-pwd-wrap input { padding-right: 38px; }
        .cm-pwd-eye { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #64748b; display: flex; align-items: center; padding: 0; }
        .cm-pwd-eye:hover { color: #334155; }
        .cm-same-billing-bar { display: flex; align-items: center; gap: 12px; background: linear-gradient(90deg, #f0fdfa, #eff6ff); border: 1.5px solid #99f6e4; border-radius: 10px; padding: 12px 16px; margin-top: 18px; flex-wrap: wrap; }
        .cm-toggle-wrap { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
        .cm-toggle-wrap input { opacity: 0; width: 0; height: 0; position: absolute; }
        .cm-toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #cbd5e1; border-radius: 24px; transition: 0.3s; }
        .cm-toggle-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .cm-toggle-wrap input:checked + .cm-toggle-slider { background: #2563eb; }
        .cm-toggle-wrap input:checked + .cm-toggle-slider::before { transform: translateX(20px); }
        .cm-btn-cancel { padding: 9px 16px; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; color: #475569; font-family: 'DM Sans', sans-serif; }
        .cm-btn-save { display: flex; align-items: center; gap: 6px; padding: 9px 20px; border: none; background: #16a34a; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 2px 6px rgba(22,163,74,0.3); }
        .cm-btn-save:disabled { opacity: 0.7; cursor: not-allowed; }
        .cm-group-badge { display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 20px; padding: 2px 10px 2px 8px; font-size: 11px; font-weight: 700; margin-top: 4px; }
        .cm-hint-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 2px 8px; margin-top: 4px; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
        select, input, textarea { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      <div className="cm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="cm-page-header">
          <div>
            <h1>Customer Master</h1>
            <p>{total} customer{total !== 1 ? 's' : ''} registered</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ExportMenu
              total={total}
              search={search}
              filterCat={filterCat}
              filterSt={filterSt}
            />
            <button className="cm-add-btn" onClick={openCreate}>
              <Plus size={15} /> New Customer
            </button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search size={14} />
            <input className="cm-search" placeholder="Search name, email, phone, CUS-ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="cm-filter-sel" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}>
              <option value=''>All Categories</option>
              <option>Domestic</option>
              <option>Export</option>
            </select>
            <select className="cm-filter-sel" value={filterSt} onChange={(e) => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="cm-rec-count">{total} record(s)</span>}
          </div>
          <div className="cm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {/* ── TABLE CARD ── */}
        <div className="cm-card">
          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cust. ID</th>
                  <th>Cat.</th>
                  <th>Name</th>
                  {showContact && <th>Contact</th>}
                  {showEmail   && <th>Email</th>}
                  {showPwdCol  && <th>Login Password</th>}
                  {showState   && <th>State</th>}
                  {showType    && <th>Type</th>}
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="cm-empty">
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                  </td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={10} className="cm-empty">
                    {search || filterCat || filterSt
                      ? 'No customers match your search'
                      : 'No customers yet. Click "New Customer" to create one.'}
                  </td></tr>
                ) : (
                  customers.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="cm-cus-id">{c.customer_id ?? '—'}</span></td>
                      <td>
                        <span className={`cm-chip ${c.category === 'Export' ? 'cm-chip-export' : 'cm-chip-domestic'}`}>
                          {c.category}
                        </span>
                      </td>
                      <td className="cm-name">{c.customer_name}</td>
                      {showContact && <td>{c.contact_no || '—'}</td>}
                      {showEmail   && <td>{c.email || '—'}</td>}
                      {showPwdCol  && <td><PasswordCell password={c.email_password || ''} /></td>}
                      {showState   && <td>{c.billing_state || '—'}{c.billing_country && c.billing_country !== 'India' ? ` (${c.billing_country})` : ''}</td>}
                      {showType    && <td>{c.company_type || '—'}</td>}
                      <td>
                        <span className={`cm-chip ${c.status === 'Active' ? 'cm-chip-active' : 'cm-chip-inactive'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div className="cm-action-group">
                          <button className="cm-btn-edit" onClick={() => openEdit(c.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="cm-btn-del"  onClick={() => handleDelete(c.id!)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="cm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="cm-pag-btns">
                <button className="cm-pag-btn" onClick={() => goTo(1)} disabled={page === 1}>«</button>
                <button className="cm-pag-btn" onClick={() => goTo(page - 1)} disabled={page === 1}>‹</button>
                {pageNums.map((p) => (
                  <button key={p} className={`cm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="cm-pag-btn" onClick={() => goTo(page + 1)} disabled={page === totalPages}>›</button>
                <button className="cm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="cm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="cm-modal">

              <div className="cm-modal-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                    {editId ? '✏️ Edit Customer' : '➕ New Customer'}
                  </h2>
                  {editId && form.customer_id && (
                    <span style={{ fontSize: 11, color: '#bfdbfe', fontFamily: 'DM Mono, monospace' }}>{form.customer_id}</span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="cm-modal-body">

                {/* ── Basic Info ── */}
                <SectionHead title='Basic Information' open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="cm-grid">
                    <Field label='Category' required error={fieldErrors.category}>
                      {sel('category', ['Domestic', 'Export'])}
                    </Field>
                    <div className="cm-col-full">
                      <Field label='Customer Name' required error={fieldErrors.customer_name}>
                        <input type="text" value={form.customer_name}
                          onChange={(e) => { set('customer_name', e.target.value); if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, customer_name: undefined })); }}
                          style={{ ...s.input, ...(fieldErrors.customer_name ? s.inputError : {}) }} />
                      </Field>
                    </div>
                    <Field label='Customer Group'>
                      <SearchableDropdown
                        value={form.customer_group_id}
                        onChange={(val) => set('customer_group_id', val)}
                        options={groupOptions}
                        placeholder='Select customer group…'
                        searchPlaceholder='Search group name…'
                        noResultsText={groupOptions.length === 0 ? 'No groups loaded yet' : '0 of 0 groups'}
                      />
                      {form.customer_group_id && (() => {
                        const grp = lookup.groups.find((g) => String(g.id) === form.customer_group_id);
                        return grp ? (
                          <div className="cm-group-badge"><CheckCircle2 size={10} color="#2563eb" />{grp.group_name}</div>
                        ) : null;
                      })()}
                    </Field>
                    <Field label='Company Type'>
                      {sel('company_type', ['Individual','Sole Proprietary','Partnership','LLP','Private Limited','Limited'])}
                    </Field>
                    <Field label='Region'>
                      <select value={form.region_id} onChange={(e) => set('region_id', e.target.value)} style={s.input}>
                        <option value=''>— None —</option>
                        {lookup.regions.map((r) => <option key={r.id} value={String(r.id)}>{r.region_name}</option>)}
                      </select>
                    </Field>
                    <Field label='Agent'>{inp('agent')}</Field>
                    <Field label='Status'>{sel('status', ['Active', 'Inactive'])}</Field>
                  </div>
                )}

                {/* ── Billing Address ── */}
                <SectionHead title='Billing Address' open={sec.billing} onToggle={() => toggle('billing')} />
                {sec.billing && (
                  <AddressBlock prefix="billing" form={form} onChange={handleAddressChange}
                    title="Billing Address" accent="#2563eb" accentLight="#eff6ff" accentBorder="#bfdbfe" />
                )}

                {/* ── Same-as-billing toggle ── */}
                <div className="cm-same-billing-bar">
                  <label className="cm-toggle-wrap">
                    <input type="checkbox" checked={!!form.is_same_as_billing} onChange={(e) => toggleSameAsBilling(e.target.checked)} />
                    <span className="cm-toggle-slider" />
                  </label>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Shipping address same as billing address</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {form.is_same_as_billing
                        ? 'Shipping address is auto-filled from billing. Uncheck to enter separately.'
                        : 'Toggle on to copy billing address to shipping, or fill in shipping address below.'}
                    </div>
                  </div>
                  {form.is_same_as_billing && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
                      ✓ Synced
                    </span>
                  )}
                </div>

                {/* ── Shipping Address ── */}
                <SectionHead title='Shipping Address' open={sec.shipping} onToggle={() => toggle('shipping')}
                  badge={form.is_same_as_billing ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 20, padding: '1px 8px' }}>
                      Same as Billing
                    </span>
                  ) : undefined}
                />
                {sec.shipping && (
                  <div style={{ position: 'relative' }}>
                    {form.is_same_as_billing && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(240,253,250,0.80)',
                        borderRadius: 12, zIndex: 2, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: '2px dashed #99f6e4', pointerEvents: 'all', marginTop: 10,
                      }}>
                        <div style={{ textAlign: 'center', padding: '20px 24px' }}>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eff6ff', border: '2px solid #2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                            <Copy size={20} color="#2563eb" />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Shipping = Billing Address</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Uncheck the toggle above to enter a different shipping address</div>
                        </div>
                      </div>
                    )}
                    <AddressBlock prefix="shipping" form={form} onChange={handleAddressChange}
                      title="Shipping Address" accent="#7c3aed" accentLight="#faf5ff" accentBorder="#c4b5fd"
                      disabled={form.is_same_as_billing} />
                  </div>
                )}

                {/* ── Contact Details ── */}
                <SectionHead title='Contact Details' open={sec.contact} onToggle={() => toggle('contact')} />
                {sec.contact && (
                  <div>
                    <div className="cm-grid">
                      <Field label='Contact Name'>{inp('contact_name')}</Field>
                      <Field label='Designation'>{inp('designation')}</Field>
                      <Field label='Contact No' required error={fieldErrors.contact_no}>
                        <input type="tel" value={form.contact_no}
                          onChange={(e) => { const val = e.target.value.replace(/[^\d\s\+\-]/g, '').slice(0, 15); set('contact_no', val); validateField('contact_no', val); }}
                          onBlur={(e) => validateField('contact_no', e.target.value)}
                          placeholder="e.g. 9876543210" maxLength={15}
                          style={{ ...s.input, ...(fieldErrors.contact_no ? s.inputError : {}) }} />
                        {!fieldErrors.contact_no && <span className="cm-hint-pill">10–13 digits required</span>}
                      </Field>
                      <Field label='E-Mail' error={fieldErrors.email}>
                        <div style={{ position: 'relative' }}>
                          <input type="email" value={form.email}
                            onChange={(e) => { set('email', e.target.value); validateField('email', e.target.value); }}
                            onBlur={(e) => validateField('email', e.target.value)}
                            placeholder="user@example.com"
                            style={{
                              ...s.input, paddingRight: 36,
                              ...(fieldErrors.email ? s.inputError : form.email && isValidEmail(form.email) ? s.inputSuccess : {}),
                            }} />
                          {form.email && (
                            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                              {isValidEmail(form.email) ? <CheckCircle2 size={14} color="#16a34a" /> : <AlertCircle size={14} color="#dc2626" />}
                            </span>
                          )}
                        </div>
                        {!fieldErrors.email && <span className="cm-hint-pill"><Mail size={9} /> Must include @ and domain</span>}
                      </Field>
                    </div>

                    {/* Login Password */}
                    <div className="cm-login-pwd-panel">
                      <div className="cm-login-pwd-header">
                        <Lock size={14} color="#7c3aed" />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Customer Login Password</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Used by customer to log in — email is the username</span>
                      </div>
                      <div className="cm-login-pwd-body">
                        <div style={{ maxWidth: 360 }}>
                          <label style={s.label}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Password</span></label>
                          <div className="cm-pwd-wrap">
                            <input type={showLoginPwd ? 'text' : 'password'} value={form.email_password}
                              onChange={(e) => set('email_password', e.target.value)}
                              placeholder="Set a login password" autoComplete="new-password" style={s.input} />
                            <button type="button" className="cm-pwd-eye" onClick={() => setShowLoginPwd((v) => !v)}>
                              {showLoginPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                            💡 The customer will log in using their <strong>email</strong> as username and this password. Leave blank to disable client portal access.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Tax ── */}
                <SectionHead title='Tax & Compliance' open={sec.tax} onToggle={() => toggle('tax')} />
                {sec.tax && (
                  <div>
                    <div className="cm-grid">
                      <Field label='GST No' error={fieldErrors.gst_no}>
                        <div style={{ position: 'relative' }}>
                          <input type="text" value={form.gst_no}
                            onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); set('gst_no', val); validateField('gst_no', val); }}
                            onBlur={(e) => validateField('gst_no', e.target.value)}
                            placeholder="15-character GST number" maxLength={15}
                            style={{ ...s.input, fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', paddingRight: 56, ...(fieldErrors.gst_no ? s.inputError : form.gst_no && isValidGst(form.gst_no) ? s.inputSuccess : {}) }} />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: form.gst_no.length === 15 ? '#16a34a' : form.gst_no.length > 0 ? '#d97706' : '#94a3b8' }}>
                            {form.gst_no.length}/15{form.gst_no.length === 15 && <CheckCircle2 size={12} color="#16a34a" />}
                          </span>
                        </div>
                        {!fieldErrors.gst_no && <span className="cm-hint-pill">Exactly 15 alphanumeric characters</span>}
                      </Field>
                      <Field label='PAN No' error={fieldErrors.pan_no}>
                        <div style={{ position: 'relative' }}>
                          <input type="text" value={form.pan_no}
                            onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); set('pan_no', val); validateField('pan_no', val); }}
                            onBlur={(e) => validateField('pan_no', e.target.value)}
                            placeholder="AAAAA9999A" maxLength={10}
                            style={{ ...s.input, fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', paddingRight: 56, ...(fieldErrors.pan_no ? s.inputError : form.pan_no && isValidPan(form.pan_no) ? s.inputSuccess : {}) }} />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: form.pan_no.length === 10 && isValidPan(form.pan_no) ? '#16a34a' : form.pan_no.length > 0 ? '#d97706' : '#94a3b8' }}>
                            {form.pan_no.length}/10{form.pan_no.length === 10 && isValidPan(form.pan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                          </span>
                        </div>
                        {!fieldErrors.pan_no && <span className="cm-hint-pill">10 chars: 5 letters + 4 digits + 1 letter</span>}
                      </Field>
                      <Field label='TAN No' error={fieldErrors.tan_no}>
                        <div style={{ position: 'relative' }}>
                          <input type="text" value={form.tan_no}
                            onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); set('tan_no', val); validateField('tan_no', val); }}
                            onBlur={(e) => validateField('tan_no', e.target.value)}
                            placeholder="AAAA99999A" maxLength={10}
                            style={{ ...s.input, fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', paddingRight: 56, ...(fieldErrors.tan_no ? s.inputError : form.tan_no && isValidTan(form.tan_no) ? s.inputSuccess : {}) }} />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: form.tan_no.length === 10 && isValidTan(form.tan_no) ? '#16a34a' : form.tan_no.length > 0 ? '#d97706' : '#94a3b8' }}>
                            {form.tan_no.length}/10{form.tan_no.length === 10 && isValidTan(form.tan_no) && <CheckCircle2 size={12} color="#16a34a" />}
                          </span>
                        </div>
                        {!fieldErrors.tan_no && <span className="cm-hint-pill">10 chars: 4 letters + 5 digits + 1 letter</span>}
                      </Field>
                    </div>

                    <div style={s.subSection}>
                      <div style={s.subSectionHeader}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Multiple GST Numbers</span>
                        <button style={s.addRowBtn} onClick={addGst}><PlusCircle size={14} /> Add</button>
                      </div>
                      {form.gst_numbers.map((g, i) => {
                        const gstLen = g.gst_no.length;
                        const gstOk  = gstLen === 15;
                        return (
                          <div key={i} className="cm-gst-row">
                            <div style={{ position: 'relative', flex: 2, minWidth: 140 }}>
                              <input placeholder='GST No (15 chars)' value={g.gst_no}
                                onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15); setGst(i, 'gst_no', val); }}
                                maxLength={15}
                                style={{ ...s.input, fontFamily: 'DM Mono, monospace', paddingRight: 48, borderColor: gstLen > 0 && !gstOk ? '#fca5a5' : gstOk ? '#86efac' : '#cbd5e1' }} />
                              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: gstOk ? '#16a34a' : gstLen > 0 ? '#d97706' : '#94a3b8' }}>
                                {gstLen}/15
                              </span>
                            </div>
                            <select value={g.state} onChange={(e) => setGst(i, 'state', e.target.value)} style={{ ...s.input, flex: 1, minWidth: 120 }}>
                              <option value=''>State</option>
                              {STATE_LIST.map((st) => <option key={st}>{st}</option>)}
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input type='checkbox' checked={g.is_primary} onChange={(e) => setGst(i, 'is_primary', e.target.checked)} />
                              Primary
                            </label>
                            <button style={s.delRowBtn} onClick={() => delGst(i)}><X size={14} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Attachments ── */}
                <SectionHead title='Attachments' open={sec.attach} onToggle={() => toggle('attach')} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div style={s.dropZone} onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}>
                      <Upload size={22} style={{ color: '#9ca3af', marginBottom: 6 }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG, DOCX, XLSX — max 10 MB</p>
                      <input ref={fileRef} type='file' multiple accept='.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'
                        style={{ display: 'none' }} onChange={(e) => handleFileAdd(e.target.files)} />
                    </div>
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow, marginTop: 8 }}>
                        <FileText size={15} style={{ color: '#6b7280', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/customers/attachment/${a.file_path}`} target='_blank' rel='noreferrer' style={{ color: '#2563eb' }}>
                            <Eye size={14} />
                          </a>
                        )}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Payment Accounts ── */}
                <SectionHead title='Payment Accounts' open={sec.payment} onToggle={() => toggle('payment')} />
                {sec.payment && (
                  <div style={s.subSection}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                      <button style={s.addRowBtn} onClick={addPayment}><PlusCircle size={14} /> Add Account</button>
                    </div>
                    {form.payment_accounts.length === 0 && (
                      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>No bank accounts linked.</p>
                    )}
                    {form.payment_accounts.map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <select value={p.bank_account_id} onChange={(e) => setPayment(i, 'bank_account_id', e.target.value)} style={{ ...s.input, flex: 3, minWidth: 200 }}>
                          <option value=''>— Select Bank Account —</option>
                          {lookup.bankAccounts.map((b) => (
                            <option key={b.id} value={String(b.id)}>{b.account_name} — {b.bank_name} ({b.account_no})</option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
                          <input type='checkbox' checked={p.is_primary} onChange={(e) => setPayment(i, 'is_primary', e.target.checked)} />
                          Primary
                        </label>
                        <button style={s.delRowBtn} onClick={() => delPayment(i)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              <div className="cm-modal-footer">
                <button className="cm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="cm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Customer')}
                </button>
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
  closeBtn: { background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', padding: '10px 16px', margin: '12px 16px 0', fontSize: 13, fontFamily: "'DM Sans', sans-serif" },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, color: '#1e293b', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', background: '#fff' },
  inputDisabled: { background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed', border: '1px solid #e2e8f0' },
  inputError:   { border: '1.5px solid #fca5a5', background: '#fff5f5', boxShadow: '0 0 0 3px rgba(239,68,68,0.08)' },
  inputSuccess: { border: '1.5px solid #86efac', background: '#f0fdf4' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', marginTop: 18, userSelect: 'none' },
  sectionTitle: { fontWeight: 700, fontSize: 13, color: '#1e293b' },
  subSection: { background: '#fafbfc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 10 },
  subSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addRowBtn: { display: 'flex', alignItems: 'center', gap: 5, background: '#eff6ff', color: '#2563eb', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' },
  delRowBtn: { background: '#fff1f2', color: '#ef4444', border: '1px solid #fca5a5', width: 30, height: 30, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dropZone: { border: '2px dashed #cbd5e1', borderRadius: 12, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  attachRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' },
};