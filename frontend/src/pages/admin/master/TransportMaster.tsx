// frontend/src/pages/admin/TransportMaster.tsx
// Transport Master — Fully Responsive (Mobile → Tablet → Laptop → Desktop)
// Updated: Added Export menu (CSV / Excel / Print Table)

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Plus, Search, X, Upload, FileText, ChevronDown, ChevronUp,
  Loader2, Eye, AlertCircle, CheckCircle2, Info, AlertTriangle,
  Truck, Mail, MapPin, Download, Printer, Sheet,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  id?: number;
  file_name: string;
  file_path?: string;
  isNew?: boolean;
  file?: File;
}

interface Transport {
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
  msme: string;
  msme_reg_no: string;
  email: string;
  contact_name: string;
  designation: string;
  contact_no: string;
  contact_email: string;
  status: string;
  attachments: Attachment[];
}

// ─── Field error map ──────────────────────────────────────────────────────────

interface FieldErrors {
  transport_company?: string;
  transport_mode?: string;
  email?: string;
  contact_email?: string;
  contact_no?: string;
  gst_no?: string;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function isValidContact(contact: string): boolean {
  if (!contact) return true;
  return /^\d{10,13}$/.test(contact.replace(/[\s\-\+]/g, ''));
}

function isValidGST(gst: string): boolean {
  if (!gst) return true;
  return /^[A-Z0-9]{15}$/i.test(gst.trim());
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; type: ToastType; title: string; message?: string }
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
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: <CheckCircle2 size={16} color="#16a34a" /> },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: <AlertCircle  size={16} color="#dc2626" /> },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: <AlertTriangle size={16} color="#d97706" /> },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: <Info          size={16} color="#2563eb" /> },
  };
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: 'calc(100vw - 40px)', pointerEvents: 'none' }}>
      {toasts.map(t => {
        const c = cfg[t.type];
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', pointerEvents: 'all', animation: 'toastIn 0.25s ease-out', fontFamily: "'DM Sans',sans-serif" }}>
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

// ─── FieldError ───────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>
      <AlertCircle size={11} style={{ flexShrink: 0 }} />
      {msg}
    </span>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, required, children, error }: {
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

function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={s.sectionHead} onClick={onToggle}>
      <span style={s.sectionTitle}>{title}</span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </div>
  );
}

// ─── Export Menu Component ────────────────────────────────────────────────────

function ExportMenu({
  transports,
  onExportCSV,
  onExportExcel,
  onPrint,
}: {
  transports: Transport[];
  onExportCSV: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="tm-export-btn"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Download size={14} />
        Export
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="tm-export-dropdown">
          <p className="tm-export-label">EXPORT / PRINT</p>

          <button
            className="tm-export-item"
            onClick={() => { onExportCSV(); setOpen(false); }}
          >
            <span className="tm-export-icon tm-export-icon-csv">
              <FileText size={14} />
            </span>
            Export as CSV
          </button>

          <button
            className="tm-export-item"
            onClick={() => { onExportExcel(); setOpen(false); }}
          >
            <span className="tm-export-icon tm-export-icon-excel">
              {/* Sheet icon fallback if not in lucide version */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
            </span>
            Export as Excel
          </button>

          <div className="tm-export-divider" />

          <button
            className="tm-export-item"
            onClick={() => { onPrint(); setOpen(false); }}
          >
            <span className="tm-export-icon tm-export-icon-print">
              <Printer size={14} />
            </span>
            Print Table
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_COLUMNS: { key: keyof Transport; label: string }[] = [
  { key: 'transport_code',    label: 'Transport Code' },
  { key: 'transport_company', label: 'Company Name' },
  { key: 'transport_mode',    label: 'Mode' },
  { key: 'transport_type',    label: 'Type' },
  { key: 'contact_no',        label: 'Contact No' },
  { key: 'email',             label: 'Email' },
  { key: 'gst_no',            label: 'GST No' },
  { key: 'state',             label: 'State' },
  { key: 'district',          label: 'District' },
  { key: 'pin_code',          label: 'Pin Code' },
  { key: 'status',            label: 'Status' },
];

function toCSV(rows: Transport[]): string {
  const header = CSV_COLUMNS.map(c => `"${c.label}"`).join(',');
  const lines  = rows.map(r =>
    CSV_COLUMNS.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return [header, ...lines].join('\r\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Full India States & Districts (all 28 states + 8 UTs) ───────────────────

const INDIA_STATES: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Alluri Sitharama Raju","Anakapalli","Anantapur","Annamayya","Bapatla",
    "Chittoor","Dr. B.R. Ambedkar Konaseema","East Godavari","Eluru","Guntur",
    "Kakinada","Krishna","Kurnool","Manyam","N T Rama Rao","Nandyal","Nellore",
    "Palnadu","Prakasam","Sri Balaji","Sri Sathya Sai","Srikakulam","Tirupati",
    "Visakhapatnam","Vizianagaram","West Godavari","YSR Kadapa",
  ],
  "Arunachal Pradesh": [
    "Anjaw","Changlang","Dibang Valley","East Kameng","East Siang","Kamle",
    "Kra Daadi","Kurung Kumey","Lepa Rada","Lohit","Longding","Lower Dibang Valley",
    "Lower Siang","Lower Subansiri","Namsai","Pakke Kessang","Papum Pare","Shi Yomi",
    "Siang","Tawang","Tirap","Upper Dibang Valley","Upper Siang","Upper Subansiri",
    "West Kameng","West Siang",
  ],
  "Assam": [
    "Bajali","Baksa","Barpeta","Biswanath","Bongaigaon","Cachar","Charaideo",
    "Chirang","Darrang","Dhemaji","Dhubri","Dibrugarh","Dima Hasao","Goalpara",
    "Golaghat","Hailakandi","Hojai","Jorhat","Kamrup","Kamrup Metropolitan",
    "Karbi Anglong","Karimganj","Kokrajhar","Lakhimpur","Majuli","Morigaon",
    "Nagaon","Nalbari","Sivasagar","Sonitpur","South Salmara Mankachar",
    "Tinsukia","Udalguri","West Karbi Anglong",
  ],
  "Bihar": [
    "Araria","Arwal","Aurangabad","Banka","Begusarai","Bhagalpur","Bhojpur",
    "Buxar","Darbhanga","East Champaran","Gaya","Gopalganj","Jamui","Jehanabad",
    "Kaimur","Katihar","Khagaria","Kishanganj","Lakhisarai","Madhepura","Madhubani",
    "Munger","Muzaffarpur","Nalanda","Nawada","Patna","Purnia","Rohtas","Saharsa",
    "Samastipur","Saran","Sheikhpura","Sheohar","Sitamarhi","Siwan","Supaul",
    "Vaishali","West Champaran",
  ],
  "Chhattisgarh": [
    "Balod","Baloda Bazar","Balrampur","Bastar","Bemetara","Bijapur","Bilaspur",
    "Dantewada","Dhamtari","Durg","Gariaband","Gaurela Pendra Marwahi",
    "Janjgir Champa","Jashpur","Kabirdham","Kanker","Khairagarh","Kondagaon",
    "Korba","Koriya","Mahasamund","Manendragarh","Mohla Manpur","Mungeli",
    "Narayanpur","Raigarh","Raipur","Rajnandgaon","Sakti","Sarangarh Bilaigarh",
    "Sukma","Surajpur","Surguja",
  ],
  "Goa": ["North Goa","South Goa"],
  "Gujarat": [
    "Ahmedabad","Amreli","Anand","Aravalli","Banaskantha","Bharuch","Bhavnagar",
    "Botad","Chhota Udaipur","Dahod","Dang","Devbhoomi Dwarka","Gandhinagar",
    "Gir Somnath","Jamnagar","Junagadh","Kheda","Kutch","Mahisagar","Mehsana",
    "Morbi","Narmada","Navsari","Panchmahal","Patan","Porbandar","Rajkot",
    "Sabarkantha","Surat","Surendranagar","Tapi","Vadodara","Valsad",
  ],
  "Haryana": [
    "Ambala","Bhiwani","Charkhi Dadri","Faridabad","Fatehabad","Gurugram",
    "Hisar","Jhajjar","Jind","Kaithal","Karnal","Kurukshetra","Mahendragarh",
    "Nuh","Palwal","Panchkula","Panipat","Rewari","Rohtak","Sirsa","Sonipat","Yamunanagar",
  ],
  "Himachal Pradesh": [
    "Bilaspur","Chamba","Hamirpur","Kangra","Kinnaur","Kullu",
    "Lahaul Spiti","Mandi","Shimla","Sirmaur","Solan","Una",
  ],
  "Jharkhand": [
    "Bokaro","Chatra","Deoghar","Dhanbad","Dumka","East Singhbhum","Garhwa",
    "Giridih","Godda","Gumla","Hazaribagh","Jamtara","Khunti","Koderma",
    "Latehar","Lohardaga","Pakur","Palamu","Ramgarh","Ranchi","Sahebganj",
    "Seraikela Kharsawan","Simdega","West Singhbhum",
  ],
  "Karnataka": [
    "Bagalkot","Ballari","Belagavi","Bengaluru Rural","Bengaluru Urban","Bidar",
    "Chamarajanagar","Chikballapur","Chikkamagaluru","Chitradurga","Dakshina Kannada",
    "Davanagere","Dharwad","Gadag","Hassan","Haveri","Kalaburagi","Kodagu","Kolar",
    "Koppal","Mandya","Mysuru","Raichur","Ramanagara","Shivamogga","Tumakuru",
    "Udupi","Uttara Kannada","Vijayapura","Yadgir",
  ],
  "Kerala": [
    "Alappuzha","Ernakulam","Idukki","Kannur","Kasaragod","Kollam",
    "Kottayam","Kozhikode","Malappuram","Palakkad","Pathanamthitta",
    "Thiruvananthapuram","Thrissur","Wayanad",
  ],
  "Madhya Pradesh": [
    "Agar Malwa","Alirajpur","Anuppur","Ashoknagar","Balaghat","Barwani","Betul",
    "Bhind","Bhopal","Burhanpur","Chhatarpur","Chhindwara","Damoh","Datia","Dewas",
    "Dhar","Dindori","Guna","Gwalior","Harda","Hoshangabad","Indore","Jabalpur",
    "Jhabua","Katni","Khandwa","Khargone","Mandla","Mandsaur","Morena","Narsinghpur",
    "Neemuch","Niwari","Panna","Raisen","Rajgarh","Ratlam","Rewa","Sagar","Satna",
    "Sehore","Seoni","Shahdol","Shajapur","Sheopur","Shivpuri","Sidhi","Singrauli",
    "Tikamgarh","Ujjain","Umaria","Vidisha",
  ],
  "Maharashtra": [
    "Ahmednagar","Akola","Amravati","Aurangabad","Beed","Bhandara","Buldhana",
    "Chandrapur","Dhule","Gadchiroli","Gondia","Hingoli","Jalgaon","Jalna","Kolhapur",
    "Latur","Mumbai City","Mumbai Suburban","Nagpur","Nanded","Nandurbar","Nashik",
    "Osmanabad","Palghar","Parbhani","Pune","Raigad","Ratnagiri","Sangli","Satara",
    "Sindhudurg","Solapur","Thane","Wardha","Washim","Yavatmal",
  ],
  "Manipur": [
    "Bishnupur","Chandel","Churachandpur","Imphal East","Imphal West","Jiribam",
    "Kakching","Kamjong","Kangpokpi","Noney","Pherzawl","Senapati","Tamenglong",
    "Tengnoupal","Thoubal","Ukhrul",
  ],
  "Meghalaya": [
    "East Garo Hills","East Jaintia Hills","East Khasi Hills","Eastern West Khasi Hills",
    "North Garo Hills","Ri Bhoi","South Garo Hills","South West Garo Hills",
    "South West Khasi Hills","West Garo Hills","West Jaintia Hills","West Khasi Hills",
  ],
  "Mizoram": ["Aizawl","Champhai","Hnahthial","Khawzawl","Kolasib","Lawngtlai","Lunglei","Mamit","Saitual","Serchhip"],
  "Nagaland": [
    "Chumoukedima","Dimapur","Kiphire","Kohima","Longleng","Mokokchung","Mon",
    "Niuland","Noklak","Peren","Phek","Shamator","Tseminyu","Tuensang","Wokha","Zunheboto",
  ],
  "Odisha": [
    "Angul","Balangir","Balasore","Bargarh","Bhadrak","Boudh","Cuttack","Deogarh",
    "Dhenkanal","Gajapati","Ganjam","Jagatsinghpur","Jajpur","Jharsuguda","Kalahandi",
    "Kandhamal","Kendrapara","Kendujhar","Khordha","Koraput","Malkangiri","Mayurbhanj",
    "Nabarangpur","Nayagarh","Nuapada","Puri","Rayagada","Sambalpur","Sonepur","Sundargarh",
  ],
  "Punjab": [
    "Amritsar","Barnala","Bathinda","Faridkot","Fatehgarh Sahib","Fazilka","Ferozepur",
    "Gurdaspur","Hoshiarpur","Jalandhar","Kapurthala","Ludhiana","Malerkotla","Mansa",
    "Moga","Mohali","Muktsar","Pathankot","Patiala","Rupnagar","Sangrur",
    "Shaheed Bhagat Singh Nagar","Tarn Taran",
  ],
  "Rajasthan": [
    "Ajmer","Alwar","Banswara","Baran","Barmer","Bharatpur","Bhilwara","Bikaner",
    "Bundi","Chittorgarh","Churu","Dausa","Dholpur","Dungarpur","Hanumangarh",
    "Jaipur","Jaisalmer","Jalore","Jhalawar","Jhunjhunu","Jodhpur","Karauli","Kota",
    "Nagaur","Pali","Pratapgarh","Rajsamand","Sawai Madhopur","Sikar","Sirohi",
    "Sri Ganganagar","Tonk","Udaipur",
  ],
  "Sikkim": ["East Sikkim","North Sikkim","Pakyong","Soreng","South Sikkim","West Sikkim"],
  "Tamil Nadu": [
    "Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri",
    "Dindigul","Erode","Kallakurichi","Kancheepuram","Kanyakumari","Karur",
    "Krishnagiri","Madurai","Mayiladuthurai","Nagapattinam","Namakkal","Nilgiris",
    "Perambalur","Pudukkottai","Ramanathapuram","Ranipet","Salem","Sivaganga",
    "Tenkasi","Thanjavur","Theni","Thoothukudi","Tiruchirappalli","Tirunelveli",
    "Tirupathur","Tiruppur","Tiruvallur","Tiruvannamalai","Tiruvarur","Vellore",
    "Viluppuram","Virudhunagar",
  ],
  "Telangana": [
    "Adilabad","Bhadradri Kothagudem","Hanamkonda","Hyderabad","Jagtial","Jangaon",
    "Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Karimnagar","Khammam",
    "Kumuram Bheem","Mahabubabad","Mahabubnagar","Mancherial","Medak",
    "Medchal Malkajgiri","Mulugu","Nagarkurnool","Nalgonda","Narayanpet","Nirmal",
    "Nizamabad","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Siddipet",
    "Suryapet","Vikarabad","Wanaparthy","Warangal","Yadadri Bhuvanagiri",
  ],
  "Tripura": ["Dhalai","Gomati","Khowai","North Tripura","Sepahijala","South Tripura","Unakoti","West Tripura"],
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
  "Uttarakhand": [
    "Almora","Bageshwar","Chamoli","Champawat","Dehradun","Haridwar","Nainital",
    "Pauri Garhwal","Pithoragarh","Rudraprayag","Tehri Garhwal","Udham Singh Nagar","Uttarkashi",
  ],
  "West Bengal": [
    "Alipurduar","Bankura","Birbhum","Cooch Behar","Dakshin Dinajpur","Darjeeling",
    "Hooghly","Howrah","Jalpaiguri","Jhargram","Kalimpong","Kolkata","Malda",
    "Murshidabad","Nadia","North 24 Parganas","Paschim Bardhaman","Paschim Medinipur",
    "Purba Bardhaman","Purba Medinipur","Purulia","South 24 Parganas","Uttar Dinajpur",
  ],
  // ── Union Territories ──
  "Andaman & Nicobar Islands": ["Nicobar","North and Middle Andaman","South Andaman"],
  "Chandigarh": ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
  "Delhi": [
    "Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi",
    "North West Delhi","Shahdara","South Delhi","South East Delhi","South West Delhi","West Delhi",
  ],
  "Jammu & Kashmir": [
    "Anantnag","Bandipora","Baramulla","Budgam","Doda","Ganderbal","Jammu","Kathua",
    "Kishtwar","Kulgam","Kupwara","Poonch","Pulwama","Rajouri","Ramban","Reasi",
    "Samba","Shopian","Srinagar","Udhampur",
  ],
  "Ladakh": ["Kargil","Leh"],
  "Lakshadweep": ["Lakshadweep"],
  "Puducherry": ["Karaikal","Mahé","Puducherry","Yanam"],
};

const STATE_LIST = Object.keys(INDIA_STATES).sort();

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSPORT_MODES = ['Road', 'Courier', 'Train', 'Air'];
const TRANSPORT_TYPES = ['LTL', 'FTL', 'Express', 'Part Load', 'Full Load'];
const COUNTRIES       = ['India', 'USA', 'UAE', 'UK', 'Singapore', 'Germany', 'Australia', 'Canada'];

const BLANK: Transport = {
  transport_mode: '', transport_type: '', transport_company: '',
  address: '', pin_code: '', district: '', state: '', country: 'India',
  gst_no: '', msme: 'No', msme_reg_no: '',
  email: '', contact_name: '', designation: '', contact_no: '', contact_email: '',
  status: 'Active', attachments: [],
};

const API              = '/api/transports';
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

export default function TransportMaster() {
  const [transports, setTransports] = useState<Transport[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterSt, setFilterSt]     = useState('');
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState<Transport>(BLANK);
  const [editId, setEditId]         = useState<number | null>(null);
  const [error, setError]           = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sec, setSec] = useState({ basic: true, address: true, contact: true, attach: false });

  const { toasts, push: pushToast, remove: removeToast } = useToast();
  const fileRef  = useRef<HTMLInputElement>(null);
  const width    = useWidth();
  const isMobile = width < 576;

  // ── Live validation ───────────────────────────────────────────────────────

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
    setFieldErrors(prev => ({ ...prev, [key]: msg || undefined }));
  };

  // ── Validate all before save ──────────────────────────────────────────────

  const validateAll = (): boolean => {
    const errors: FieldErrors = {};

    if (!form.transport_company.trim()) errors.transport_company = 'Transport Company Name is required.';
    if (!form.transport_mode)           errors.transport_mode    = 'Transport Mode is required.';

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

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadTransports = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search, page: String(page), limit: String(pageSize),
        ...(filterMode ? { transport_mode: filterMode } : {}),
        ...(filterSt   ? { status: filterSt }           : {}),
      });
      const res  = await fetch(`${API}?${qs}`);
      const data = await res.json();
      setTransports(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch { pushToast('error', 'Load Failed', 'Could not fetch transports.'); }
    setLoading(false);
  };

  useEffect(() => { loadTransports(); }, [search, filterMode, filterSt, page, pageSize]);
  useEffect(() => { setPage(1); }, [search, filterMode, filterSt]);
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  // ── Export handlers ───────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const csv = toCSV(transports);
    downloadBlob(csv, 'transports.csv', 'text/csv;charset=utf-8;');
    pushToast('success', 'CSV Exported', `${transports.length} record(s) downloaded.`);
  };

  const handleExportExcel = () => {
    // Tab-separated values with .xls extension — opens in Excel without a library dependency
    const tsv = [
      CSV_COLUMNS.map(c => c.label).join('\t'),
      ...transports.map(r => CSV_COLUMNS.map(c => String(r[c.key] ?? '')).join('\t')),
    ].join('\r\n');
    downloadBlob(tsv, 'transports.xls', 'application/vnd.ms-excel;charset=utf-8;');
    pushToast('success', 'Excel Exported', `${transports.length} record(s) downloaded.`);
  };

  const handlePrint = () => {
    const rows = transports.map(r =>
      `<tr>${CSV_COLUMNS.map(c => `<td>${String(r[c.key] ?? '')}</td>`).join('')}</tr>`
    ).join('');
    const html = `
      <html><head><title>Transport Master</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        h2   { margin-bottom: 8px; color: #1e293b; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #2563eb; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
        td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        @media print { @page { margin: 15mm; } }
      </style></head>
      <body>
        <h2>🚛 Transport Master</h2>
        <p style="font-size:11px;color:#64748b;margin-bottom:12px;">
          Exported on ${new Date().toLocaleString()} — ${transports.length} record(s)
        </p>
        <table>
          <thead><tr>${CSV_COLUMNS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Open ──────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(BLANK); setEditId(null); setError(''); setFieldErrors({}); setShowForm(true);
  };
  const openEdit = async (id: number) => {
    try {
      const res  = await fetch(`${API}/${id}`);
      const data = await res.json();
      setForm({ ...data, attachments: data.attachments ?? [] });
      setEditId(id); setError(''); setFieldErrors({}); setShowForm(true);
    } catch { pushToast('error', 'Load Failed', 'Could not load transport details.'); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validateAll()) {
      setError('Please fix the highlighted errors before saving.');
      if (fieldErrors.email || fieldErrors.contact_email || fieldErrors.contact_no)
        setSec(p => ({ ...p, contact: true }));
      if (fieldErrors.gst_no)
        setSec(p => ({ ...p, address: true }));
      return;
    }

    setError(''); setSaving(true);
    const fd = new FormData();
    const fields: (keyof Transport)[] = [
      'transport_mode', 'transport_type', 'transport_company',
      'address', 'pin_code', 'district', 'state', 'country',
      'gst_no', 'msme', 'msme_reg_no',
      'email', 'contact_name', 'designation', 'contact_no', 'contact_email', 'status',
    ];
    fields.forEach(k => fd.append(k as string, String(form[k] ?? '')));
    form.attachments.filter(a => a.isNew && a.file).forEach(a => fd.append('attachments', a.file!));
    fd.append('deleted_attachments', JSON.stringify((form as any).__deletedAttachments ?? []));

    try {
      const res = await fetch(editId ? `${API}/${editId}` : API, { method: editId ? 'PUT' : 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      pushToast('success', editId ? 'Transport Updated' : 'Transport Created',
        `${form.transport_company} has been saved successfully.`);
      setShowForm(false); loadTransports();
    } catch (e: any) {
      const msg = e.message ?? 'Save failed';
      setError(msg); pushToast('error', 'Save Failed', msg);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this transport?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      pushToast('success', 'Transport Deleted', 'The transport record has been removed.');
      loadTransports();
    } catch { pushToast('error', 'Delete Failed', 'Could not delete transport.'); }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────

  const set    = (key: keyof Transport, val: any) => setForm(f => ({ ...f, [key]: val }));
  const selF   = (key: keyof Transport, opts: string[]) => (
    <select value={String(form[key] ?? '')} onChange={e => set(key, e.target.value)} style={s.input}>
      <option value=''>— Select —</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const toggle = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));

  const handleFileAdd = (files: FileList | null) => {
    if (!files) return;
    setForm(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...Array.from(files).map(f => ({
        file_name: f.name, isNew: true, file: f,
      }))],
    }));
  };
  const removeAttachment = (i: number) => {
    setForm(prev => {
      const att     = prev.attachments[i];
      const deleted = (prev as any).__deletedAttachments ?? [];
      return {
        ...prev,
        attachments: prev.attachments.filter((_, j) => j !== i),
        __deletedAttachments: att.id ? [...deleted, att.id] : deleted,
      };
    });
  };

  const stateDistricts = INDIA_STATES[form.state] ?? [];

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNums   = (() => {
    const pages: number[] = [];
    let start = Math.max(1, page - 2);
    const end  = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  })();
  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const showMode    = !isMobile;
  const showContact = width >= 480;
  const showState   = !isMobile;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes toastIn    { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes spin       { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes dropdownIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }

        .tm-wrap { font-family:'DM Sans',sans-serif; font-size:14px; color:#1e293b; }

        /* ── Page header ── */
        .tm-page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
        .tm-page-header h1 { margin:0; font-size:20px; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:8px; }
        .tm-page-header p  { margin:3px 0 0; font-size:13px; color:#64748b; }
        @media(min-width:576px){ .tm-page-header h1 { font-size:22px; } }

        .tm-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

        .tm-add-btn { display:flex; align-items:center; gap:6px; background:#2563eb; color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(37,99,235,0.3); white-space:nowrap; flex-shrink:0; touch-action:manipulation; }
        .tm-add-btn:hover { background:#1d4ed8; }

        /* ── Export button ── */
        .tm-export-btn {
          display:flex; align-items:center; gap:6px;
          background:#fff; color:#16a34a;
          border:1.5px solid #16a34a; border-radius:8px;
          padding:8px 14px; font-size:13px; font-weight:600;
          cursor:pointer; font-family:'DM Sans',sans-serif;
          white-space:nowrap; flex-shrink:0; touch-action:manipulation;
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tm-export-btn:hover { background:#f0fdf4; box-shadow:0 2px 6px rgba(22,163,74,0.18); }

        /* ── Export dropdown ── */
        .tm-export-dropdown {
          position:absolute; top:calc(100% + 6px); right:0;
          min-width:190px;
          background:#fff; border:1px solid #e2e8f0; border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,0.12);
          padding:6px 0; z-index:3000;
          animation:dropdownIn 0.18s ease-out;
          font-family:'DM Sans',sans-serif;
        }
        .tm-export-label {
          padding:6px 14px 4px;
          font-size:10px; font-weight:700; color:#94a3b8;
          letter-spacing:0.07em; margin:0;
          text-transform:uppercase;
        }
        .tm-export-item {
          display:flex; align-items:center; gap:10px;
          width:100%; padding:9px 14px;
          background:none; border:none; cursor:pointer;
          font-size:13px; font-weight:500; color:#1e293b;
          font-family:'DM Sans',sans-serif;
          text-align:left; transition:background 0.12s;
        }
        .tm-export-item:hover { background:#f8fafc; }
        .tm-export-divider { height:1px; background:#f1f5f9; margin:4px 0; }
        .tm-export-icon {
          width:26px; height:26px; border-radius:6px;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .tm-export-icon-csv   { background:#fef3c7; color:#92400e; }
        .tm-export-icon-excel { background:#dcfce7; color:#16a34a; }
        .tm-export-icon-print { background:#eff6ff; color:#2563eb; }

        /* ── Toolbar ── */
        .tm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
        .tm-search-wrap { position:relative; flex:1; min-width:180px; max-width:100%; }
        @media(min-width:768px){ .tm-search-wrap { max-width:320px; } }
        .tm-search-wrap svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none; }
        .tm-search { width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; outline:none; }
        .tm-search:focus { border-color:#2563eb; }
        .tm-filter-sel { border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; color:#374151; cursor:pointer; outline:none; max-width:150px; }
        .tm-filters-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .tm-page-size { display:flex; align-items:center; gap:6px; font-size:13px; color:#64748b; margin-left:auto; flex-shrink:0; }
        .tm-page-size select { border:1px solid #cbd5e1; border-radius:6px; padding:5px 8px; font-size:13px; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; }
        .tm-rec-count { font-size:12px; color:#64748b; white-space:nowrap; }

        /* ── Table card ── */
        .tm-card { background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07); margin-bottom:24px; }
        .tm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .tm-table { width:100%; border-collapse:collapse; font-size:13px; font-family:'DM Sans',sans-serif; min-width:520px; }
        .tm-table thead tr { background:#2563eb; }
        .tm-table th { padding:11px 12px; color:#fff; font-weight:600; text-align:left; white-space:nowrap; font-size:12px; }
        @media(min-width:768px){ .tm-table th { font-size:13px; padding:12px 16px; } }
        .tm-table th.th-center { text-align:center; }
        .tm-table tbody tr:nth-child(odd) td  { background:#fff; }
        .tm-table tbody tr:nth-child(even) td { background:#f8fafc; }
        .tm-table tbody tr:hover td { filter:brightness(0.97); }
        .tm-table td { padding:10px 12px; color:#374151; font-size:12px; white-space:nowrap; }
        @media(min-width:768px){ .tm-table td { font-size:13px; padding:11px 16px; } }

        .tm-tr-code { display:inline-block; font-family:'DM Mono',monospace; font-size:11px; font-weight:500; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:2px 7px; letter-spacing:0.03em; }
        .tm-mode-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .tm-mode-road    { background:#fef3c7; color:#92400e; }
        .tm-mode-courier { background:#ede9fe; color:#5b21b6; }
        .tm-mode-train   { background:#dbeafe; color:#1d4ed8; }
        .tm-mode-air     { background:#e0f2fe; color:#0369a1; }
        .tm-chip { display:inline-block; padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; }
        .tm-chip-active   { background:#dcfce7; color:#166534; }
        .tm-chip-inactive { background:#fee2e2; color:#991b1b; }
        .tm-name { font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; }
        .tm-action-group { display:flex; align-items:center; gap:5px; justify-content:center; }
        .tm-btn-edit { display:inline-flex; align-items:center; gap:3px; background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .tm-btn-edit:hover { background:#dbeafe; }
        .tm-btn-del  { display:inline-flex; align-items:center; gap:3px; background:#fff1f2; color:#dc2626; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; touch-action:manipulation; }
        .tm-btn-del:hover { background:#fee2e2; }
        .tm-empty { text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px; }

        /* ── Pagination ── */
        .tm-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid #f1f5f9; background:#f8fafc; font-size:12px; color:#64748b; flex-wrap:wrap; gap:8px; font-family:'DM Sans',sans-serif; }
        @media(min-width:576px){ .tm-pagination { padding:10px 16px; font-size:13px; } }
        .tm-pag-btns { display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
        .tm-pag-btn { padding:4px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; color:#1e293b; min-width:30px; height:30px; display:flex; align-items:center; justify-content:center; touch-action:manipulation; }
        .tm-pag-btn:hover:not(:disabled) { background:#f1f5f9; }
        .tm-pag-btn.active { background:#2563eb; color:#fff; border-color:#2563eb; font-weight:700; }
        .tm-pag-btn:disabled { border-color:#e2e8f0; background:#f1f5f9; color:#94a3b8; cursor:not-allowed; }

        /* ── Modal ── */
        .tm-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.5); display:flex; align-items:flex-start; justify-content:center; z-index:2000; overflow-y:auto; padding:16px 8px; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .tm-modal-overlay { padding:24px 16px; } }
        .tm-modal { background:#fff; border-radius:14px; width:100%; max-width:860px; box-shadow:0 8px 40px rgba(0,0,0,0.22); display:flex; flex-direction:column; max-height:calc(100vh - 32px); }
        @media(min-width:576px){ .tm-modal { border-radius:16px; max-height:calc(100vh - 48px); } }
        .tm-modal-header { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#2563eb; border-radius:14px 14px 0 0; flex-shrink:0; }
        @media(min-width:576px){ .tm-modal-header { padding:16px 24px; border-radius:16px 16px 0 0; } }
        .tm-modal-body { padding:16px; overflow-y:auto; flex:1; -webkit-overflow-scrolling:touch; }
        @media(min-width:576px){ .tm-modal-body { padding:20px 24px; } }
        .tm-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #f1f5f9; background:#f8fafc; flex-shrink:0; border-radius:0 0 14px 14px; }
        @media(min-width:576px){ .tm-modal-footer { padding:14px 24px; } }

        /* ── Form grid ── */
        .tm-grid { display:grid; grid-template-columns:1fr; gap:12px; padding:12px 0; }
        @media(min-width:480px){ .tm-grid { grid-template-columns:repeat(2,1fr); gap:14px; } }
        @media(min-width:768px){ .tm-grid { grid-template-columns:repeat(3,1fr); gap:14px 16px; } }
        .tm-col-full { grid-column:1/-1; }

        /* ── Buttons ── */
        .tm-btn-cancel { padding:9px 16px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; font-family:'DM Sans',sans-serif; touch-action:manipulation; }
        .tm-btn-save { display:flex; align-items:center; gap:6px; padding:9px 20px; border:none; background:#16a34a; color:#fff; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; box-shadow:0 2px 6px rgba(22,163,74,0.3); touch-action:manipulation; }
        .tm-btn-save:disabled { opacity:0.7; cursor:not-allowed; }

        /* ── Hint pill ── */
        .tm-hint-pill { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:20px; padding:2px 8px; margin-top:4px; }

        /* ── Focus ring ── */
        input:focus, select:focus, textarea:focus { outline:none; border-color:#2563eb !important; box-shadow:0 0 0 3px rgba(37,99,235,0.1) !important; }

        select, input, textarea { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      <div className="tm-wrap">

        {/* ── PAGE HEADER ── */}
        <div className="tm-page-header">
          <div>
            <h1><Truck size={20} style={{ color: '#2563eb' }} /> Transport Master</h1>
            <p>{total} transport{total !== 1 ? 's' : ''} registered</p>
          </div>
          <div className="tm-header-actions">
            {/* ── EXPORT MENU ── */}
            <ExportMenu
              transports={transports}
              onExportCSV={handleExportCSV}
              onExportExcel={handleExportExcel}
              onPrint={handlePrint}
            />
            <button className="tm-add-btn" onClick={openCreate}><Plus size={15} /> New Transport</button>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="tm-toolbar">
          <div className="tm-search-wrap" style={{ flexBasis: isMobile ? '100%' : undefined }}>
            <Search size={14} />
            <input className="tm-search" placeholder="Search company, code, contact…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="tm-filters-row">
            <select className="tm-filter-sel" value={filterMode} onChange={e => { setFilterMode(e.target.value); setPage(1); }}>
              <option value=''>All Modes</option>
              {TRANSPORT_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
            <select className="tm-filter-sel" value={filterSt} onChange={e => { setFilterSt(e.target.value); setPage(1); }}>
              <option value=''>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            {!isMobile && <span className="tm-rec-count">{total} record(s)</span>}
          </div>
          <div className="tm-page-size">
            {!isMobile && <span>Show</span>}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {!isMobile && <span>entries</span>}
          </div>
        </div>

        {isMobile && <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{total} record(s)</p>}

        {/* ── TABLE ── */}
        <div className="tm-card">
          <div className="tm-table-wrap">
            <table className="tm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Trans. Code</th>
                  <th>Company Name</th>
                  {showMode    && <th>Mode</th>}
                  {showContact && <th>Contact No</th>}
                  {showState   && <th>State</th>}
                  <th>GST No</th>
                  <th>Status</th>
                  <th className="th-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="tm-empty">
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                  </td></tr>
                ) : transports.length === 0 ? (
                  <tr><td colSpan={9} className="tm-empty">
                    {search || filterMode || filterSt
                      ? 'No transports match your search'
                      : 'No transports yet. Click "New Transport" to create one.'}
                  </td></tr>
                ) : transports.map((t, i) => {
                  const modeClass = `tm-mode-chip tm-mode-${t.transport_mode?.toLowerCase() || 'road'}`;
                  const modeIcon  = ({ Road: '🚛', Courier: '📦', Train: '🚆', Air: '✈️' } as Record<string, string>)[t.transport_mode] ?? '🚛';
                  return (
                    <tr key={t.id}>
                      <td style={{ color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                      <td><span className="tm-tr-code">{t.transport_code ?? '—'}</span></td>
                      <td className="tm-name">{t.transport_company}</td>
                      {showMode    && <td><span className={modeClass}>{modeIcon} {t.transport_mode || '—'}</span></td>}
                      {showContact && <td>{t.contact_no || '—'}</td>}
                      {showState   && <td>{t.state || '—'}</td>}
                      <td style={{ fontFamily: 'DM Mono,monospace', fontSize: 11 }}>{t.gst_no || '—'}</td>
                      <td><span className={`tm-chip ${t.status === 'Active' ? 'tm-chip-active' : 'tm-chip-inactive'}`}>{t.status}</span></td>
                      <td>
                        <div className="tm-action-group">
                          <button className="tm-btn-edit" onClick={() => openEdit(t.id!)}>✏️ {!isMobile && 'Edit'}</button>
                          <button className="tm-btn-del"  onClick={() => handleDelete(t.id!)}>🗑 {!isMobile && 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && total > 0 && (
            <div className="tm-pagination">
              <span>Page {page} of {totalPages}</span>
              <div className="tm-pag-btns">
                <button className="tm-pag-btn" onClick={() => goTo(1)}          disabled={page === 1}>«</button>
                <button className="tm-pag-btn" onClick={() => goTo(page - 1)}   disabled={page === 1}>‹</button>
                {pageNums.map(p => (
                  <button key={p} className={`tm-pag-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p)}>{p}</button>
                ))}
                <button className="tm-pag-btn" onClick={() => goTo(page + 1)}   disabled={page === totalPages}>›</button>
                <button className="tm-pag-btn" onClick={() => goTo(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL ── */}
        {showForm && (
          <div className="tm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="tm-modal">

              {/* Header */}
              <div className="tm-modal-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: '#fff' }}>
                    {editId ? '✏️ Edit Transport' : '🚛 New Transport'}
                  </h2>
                  {editId && form.transport_code && (
                    <span style={{ fontSize: 11, color: '#bfdbfe', fontFamily: 'DM Mono,monospace' }}>
                      {form.transport_code}
                    </span>
                  )}
                </div>
                <button style={s.closeBtn} onClick={() => setShowForm(false)}><X size={20} color="#fff" /></button>
              </div>

              {/* Error banner */}
              {error && (
                <div style={s.errorBanner}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                  <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ef4444', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="tm-modal-body">

                {/* ══ BASIC INFORMATION ══ */}
                <SectionHead title='Basic Information' open={sec.basic} onToggle={() => toggle('basic')} />
                {sec.basic && (
                  <div className="tm-grid">

                    <Field label='Transport Mode' required error={fieldErrors.transport_mode}>
                      <select
                        value={form.transport_mode}
                        onChange={e => {
                          set('transport_mode', e.target.value);
                          if (e.target.value) setFieldErrors(p => ({ ...p, transport_mode: undefined }));
                        }}
                        style={{ ...s.input, ...(fieldErrors.transport_mode ? s.inputError : {}) }}
                      >
                        <option value=''>— Select —</option>
                        {TRANSPORT_MODES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>

                    <Field label='Transport Type'>
                      {selF('transport_type', TRANSPORT_TYPES)}
                    </Field>

                    <Field label='Transport Company Name' required error={fieldErrors.transport_company}>
                      <input
                        type="text"
                        value={form.transport_company}
                        onChange={e => {
                          set('transport_company', e.target.value);
                          if (e.target.value.trim()) setFieldErrors(p => ({ ...p, transport_company: undefined }));
                        }}
                        style={{ ...s.input, ...(fieldErrors.transport_company ? s.inputError : {}) }}
                      />
                    </Field>

                    <Field label='Status'>
                      {selF('status', ['Active', 'Inactive'])}
                    </Field>

                  </div>
                )}

                {/* ══ ADDRESS DETAILS ══ */}
                <SectionHead title='Address Details' open={sec.address} onToggle={() => toggle('address')} />
                {sec.address && (
                  <div style={{
                    border: '1.5px solid #bfdbfe',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#fff',
                    marginTop: 10,
                  }}>
                    <div style={{
                      background: '#eff6ff',
                      borderBottom: '1px solid #bfdbfe',
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <MapPin size={15} color="#2563eb" />
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: '#2563eb',
                        textTransform: 'uppercase', letterSpacing: '0.07em',
                      }}>Address Details</span>
                    </div>

                    <div style={{ padding: '14px 16px' }}>
                      <div className="tm-grid">

                        <div className="tm-col-full">
                          <Field label='Address'>
                            <textarea
                              value={form.address}
                              onChange={e => set('address', e.target.value)}
                              placeholder='Door no, Street, Area, Landmark…'
                              style={{ ...s.input, height: 76, resize: 'vertical' }}
                            />
                          </Field>
                        </div>

                        <Field label='Pin Code'>
                          <input
                            type='text'
                            inputMode='numeric'
                            value={form.pin_code}
                            placeholder='6-digit pincode'
                            maxLength={6}
                            onChange={e => set('pin_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                            style={s.input}
                          />
                        </Field>

                        <Field label='State'>
                          <select
                            value={form.state}
                            onChange={e => { set('state', e.target.value); set('district', ''); }}
                            style={s.input}
                          >
                            <option value=''>— Select State —</option>
                            {STATE_LIST.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </Field>

                        <Field label='District'>
                          <select
                            value={form.district}
                            onChange={e => set('district', e.target.value)}
                            disabled={stateDistricts.length === 0}
                            style={{
                              ...s.input,
                              ...(stateDistricts.length === 0 ? s.inputDisabled : {}),
                              cursor: stateDistricts.length === 0 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value=''>
                              {stateDistricts.length === 0 ? '— Select State first —' : '— Select District —'}
                            </option>
                            {stateDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </Field>

                        <Field label='Country'>
                          <select value={form.country} onChange={e => set('country', e.target.value)} style={s.input}>
                            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>

                        <Field label='GST No' error={fieldErrors.gst_no}>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              value={form.gst_no}
                              onChange={e => {
                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                                set('gst_no', val);
                                validateField('gst_no', val);
                              }}
                              onBlur={e => validateField('gst_no', e.target.value)}
                              placeholder="15-character GST number"
                              maxLength={15}
                              style={{
                                ...s.input,
                                fontFamily: 'DM Mono, monospace',
                                letterSpacing: '0.05em',
                                paddingRight: 58,
                                ...(fieldErrors.gst_no
                                  ? s.inputError
                                  : form.gst_no && isValidGST(form.gst_no)
                                    ? s.inputSuccess
                                    : {}),
                              }}
                            />
                            <span style={{
                              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                              display: 'flex', alignItems: 'center', gap: 3,
                              fontSize: 10, fontWeight: 700, pointerEvents: 'none',
                              color: form.gst_no.length === 15 ? '#16a34a'
                                   : form.gst_no.length > 0   ? '#d97706'
                                   : '#94a3b8',
                            }}>
                              {form.gst_no.length}/15
                              {form.gst_no.length === 15 && <CheckCircle2 size={12} color="#16a34a" />}
                            </span>
                          </div>
                          {!fieldErrors.gst_no && (
                            <span className="tm-hint-pill">Exactly 15 alphanumeric characters</span>
                          )}
                        </Field>

                        <Field label='MSME'>
                          <select
                            value={form.msme}
                            onChange={e => {
                              set('msme', e.target.value);
                              if (e.target.value === 'No') set('msme_reg_no', '');
                            }}
                            style={s.input}
                          >
                            <option value='No'>No</option>
                            <option value='Yes'>Yes</option>
                          </select>
                        </Field>

                        {form.msme === 'Yes' && (
                          <Field label='MSME Reg. No'>
                            <input
                              value={form.msme_reg_no}
                              onChange={e => set('msme_reg_no', e.target.value.toUpperCase())}
                              placeholder='e.g. UDYAM-TN-01-0012345'
                              style={{ ...s.input, fontFamily: 'DM Mono,monospace', fontSize: 12 }}
                            />
                          </Field>
                        )}

                      </div>
                    </div>
                  </div>
                )}

                {/* ══ CONTACT DETAILS ══ */}
                <SectionHead title='Contact Details' open={sec.contact} onToggle={() => toggle('contact')} />
                {sec.contact && (
                  <div className="tm-grid">

                    <Field label='E-Mail ID' error={fieldErrors.email}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => { set('email', e.target.value); validateField('email', e.target.value); }}
                          onBlur={e => validateField('email', e.target.value)}
                          placeholder="office@example.com"
                          style={{
                            ...s.input,
                            paddingRight: 36,
                            ...(fieldErrors.email
                              ? s.inputError
                              : form.email && isValidEmail(form.email)
                                ? s.inputSuccess
                                : {}),
                          }}
                        />
                        {form.email && (
                          <span style={{
                            position: 'absolute', right: 10, top: '50%',
                            transform: 'translateY(-50%)', display: 'flex', alignItems: 'center',
                            pointerEvents: 'none',
                          }}>
                            {isValidEmail(form.email)
                              ? <CheckCircle2 size={14} color="#16a34a" />
                              : <AlertCircle  size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.email && (
                        <span className="tm-hint-pill">
                          <Mail size={9} /> Must include @ and domain (e.g. user@gmail.com)
                        </span>
                      )}
                    </Field>

                    <Field label='Contact Name'>
                      <input type="text" value={form.contact_name}
                        onChange={e => set('contact_name', e.target.value)} style={s.input} />
                    </Field>

                    <Field label='Designation'>
                      <input type="text" value={form.designation} placeholder='e.g. Manager'
                        onChange={e => set('designation', e.target.value)} style={s.input} />
                    </Field>

                    <Field label='Contact Number' error={fieldErrors.contact_no}>
                      <input
                        type="tel"
                        value={form.contact_no}
                        onChange={e => {
                          const v = e.target.value.replace(/[^\d\s\+\-]/g, '').slice(0, 15);
                          set('contact_no', v);
                          validateField('contact_no', v);
                        }}
                        onBlur={e => validateField('contact_no', e.target.value)}
                        placeholder="e.g. 9876543210"
                        maxLength={15}
                        style={{
                          ...s.input,
                          ...(fieldErrors.contact_no ? s.inputError : {}),
                        }}
                      />
                      {!fieldErrors.contact_no && (
                        <span className="tm-hint-pill">10–13 digits required</span>
                      )}
                    </Field>

                    <Field label='Contact E-Mail' error={fieldErrors.contact_email}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="email"
                          value={form.contact_email}
                          onChange={e => { set('contact_email', e.target.value); validateField('contact_email', e.target.value); }}
                          onBlur={e => validateField('contact_email', e.target.value)}
                          placeholder="contact@example.com"
                          style={{
                            ...s.input,
                            paddingRight: 36,
                            ...(fieldErrors.contact_email
                              ? s.inputError
                              : form.contact_email && isValidEmail(form.contact_email)
                                ? s.inputSuccess
                                : {}),
                          }}
                        />
                        {form.contact_email && (
                          <span style={{
                            position: 'absolute', right: 10, top: '50%',
                            transform: 'translateY(-50%)', display: 'flex', alignItems: 'center',
                            pointerEvents: 'none',
                          }}>
                            {isValidEmail(form.contact_email)
                              ? <CheckCircle2 size={14} color="#16a34a" />
                              : <AlertCircle  size={14} color="#dc2626" />}
                          </span>
                        )}
                      </div>
                      {!fieldErrors.contact_email && (
                        <span className="tm-hint-pill">
                          <Mail size={9} /> Must include @ and domain (e.g. user@gmail.com)
                        </span>
                      )}
                    </Field>

                  </div>
                )}

                {/* ══ ATTACHMENTS ══ */}
                <SectionHead title='Attachments' open={sec.attach} onToggle={() => toggle('attach')} />
                {sec.attach && (
                  <div style={s.subSection}>
                    <div
                      style={s.dropZone}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); handleFileAdd(e.dataTransfer.files); }}
                    >
                      <Upload size={22} style={{ color: '#9ca3af', marginBottom: 6 }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Click or drag files here</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG, DOCX, XLSX — max 10 MB</p>
                      <input
                        ref={fileRef} type='file' multiple
                        accept='.pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx'
                        style={{ display: 'none' }}
                        onChange={e => handleFileAdd(e.target.files)}
                      />
                    </div>
                    {form.attachments.length === 0 && (
                      <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '10px 0 4px' }}>
                        No files attached yet.
                      </p>
                    )}
                    {form.attachments.map((a, i) => (
                      <div key={i} style={{ ...s.attachRow, marginTop: 8 }}>
                        <FileText size={15} style={{ color: '#6b7280', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.file_name}
                        </span>
                        {!a.isNew && a.file_path && (
                          <a href={`/api/transports/attachment/${a.file_path}`} target='_blank' rel='noreferrer'
                            style={{ color: '#2563eb' }}>
                            <Eye size={14} />
                          </a>
                        )}
                        <button style={s.delRowBtn} onClick={() => removeAttachment(i)}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="tm-modal-footer">
                <button className="tm-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="tm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : (editId ? '✏️ Update' : '💾 Save Transport')}
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
    background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: 0.85, touchAction: 'manipulation',
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
  },
  inputDisabled: {
    background: '#f1f5f9', color: '#94a3b8',
    cursor: 'not-allowed', border: '1px solid #e2e8f0',
  },
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
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, touchAction: 'manipulation',
  },
};