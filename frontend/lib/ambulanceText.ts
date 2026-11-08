// Interface text for ambulance drivers. Urdu first, English switch, like the patient pages.
import type { UiLang } from "./patientText";
import type { VehicleType } from "./api";

const en = {
  dir: "ltr" as "ltr" | "rtl",
  joinTitle: "Register your ambulance",
  joinLede: "Drive an ambulance or patient car in Multan? Join Sehat Saathi. When a patient near you needs to get to a government hospital, the clinic can send you, like a ride app.",
  how: ["Register here (2 minutes)", "The clinic calls you and checks your papers", "Go online from your phone and get trips near you"],
  driverName: "Driver's name",
  phone: "Mobile number",
  org: "Ambulance service (optional)",
  orgHint: "For example Al-Noor Ambulance Service. Leave blank if it's your own vehicle.",
  vehicleType: "Vehicle",
  vehicles: {
    basic: "Ambulance (basic)",
    oxygen: "Ambulance with oxygen",
    icu: "ICU ambulance (ventilator)",
    car: "Patient transport car",
  } as Record<VehicleType, string>,
  reg: "Vehicle registration number",
  area: "Area you usually work in",
  areaPh: "Gulgasht, Cantt, Bosan Road…",
  useLocation: "Add my current location (optional)",
  locationAdded: "Location added",
  rules: "I have a valid driving licence and vehicle papers and will show them to the clinic. In an emergency I follow Rescue 1122's crew. I don't take money from patients directly: the clinic settles fees after the trip.",
  submit: "Register",
  sending: "Registering…",
  phoneInvalid: "Enter a mobile number like 0300 1234567.",
  doneTitle: "You're registered",
  doneBody: "The clinic will call you to check your driving licence, vehicle registration and CNIC. Once approved you can go online.",
  saveLink: "Save this private link. It's your driver page, so don't share it.",
  copy: "Copy my link",
  copied: "Copied",
  openPage: "Open my driver page",
  already: "Already registered on this phone?",
  switchTo: "اردو",
  // driver page
  pending: "Waiting for approval",
  pendingBody: "The clinic will call you to check your papers. This page updates by itself.",
  rejected: "Not approved",
  suspended: "Paused by the clinic",
  approved: "Approved",
  contactClinic: "Contact the clinic if you have questions.",
  online: "You're online",
  onlineBody: "Keep this page open. The clinic sees where you are and can send you trips.",
  offline: "You're offline",
  offlineBody: "Go online when you're free to take patients.",
  goOnline: "Go online",
  goOffline: "Go offline",
  newTrip: "New trip",
  emergencyTrip: "Emergency trip. Rescue 1122 has been called too.",
  openTrip: "Open the trip",
  onTrip: "You're on a trip",
  gpsOff: "Location is blocked, so the clinic can't see how near you are. Allow location for this site.",
  lastSent: (s: string) => `Location sent ${s}`,
  outside: "You're outside the service area. Sehat Saathi only sends trips in and around Multan, so you won't get trips where you are now.",
};

const ur: typeof en = {
  dir: "rtl",
  joinTitle: "اپنی ایمبولینس رجسٹر کریں",
  joinLede: "ملتان میں ایمبولینس یا مریض کی گاڑی چلاتے ہیں؟ صحت ساتھی میں شامل ہوں۔ جب آپ کے قریب کسی مریض کو سرکاری ہسپتال جانا ہو تو کلینک آپ کو بھیج سکتا ہے، بالکل رائیڈ ایپ کی طرح۔",
  how: ["یہاں رجسٹر کریں (2 منٹ)", "کلینک آپ کو کال کر کے کاغذات چیک کرے گا", "فون سے آن لائن ہوں اور قریب کے ٹرپ لیں"],
  driverName: "ڈرائیور کا نام",
  phone: "موبائل نمبر",
  org: "ایمبولینس سروس (اختیاری)",
  orgHint: "مثلاً النور ایمبولینس سروس۔ اپنی گاڑی ہو تو خالی چھوڑ دیں۔",
  vehicleType: "گاڑی",
  vehicles: {
    basic: "ایمبولینس (عام)",
    oxygen: "آکسیجن والی ایمبولینس",
    icu: "آئی سی یو ایمبولینس (وینٹی لیٹر)",
    car: "مریض کی گاڑی",
  },
  reg: "گاڑی کا رجسٹریشن نمبر",
  area: "آپ عموماً کس علاقے میں ہوتے ہیں",
  areaPh: "گلگشت، کینٹ، بوسن روڈ…",
  useLocation: "میری موجودہ جگہ شامل کریں (اختیاری)",
  locationAdded: "جگہ شامل ہو گئی",
  rules: "میرے پاس درست ڈرائیونگ لائسنس اور گاڑی کے کاغذات ہیں جو میں کلینک کو دکھاؤں گا۔ ایمرجنسی میں ریسکیو 1122 کے عملے کی بات مانوں گا۔ میں مریض سے براہ راست پیسے نہیں لوں گا، فیس ٹرپ کے بعد کلینک طے کرے گا۔",
  submit: "رجسٹر کریں",
  sending: "رجسٹر ہو رہا ہے…",
  phoneInvalid: "موبائل نمبر اس طرح لکھیں: 0300 1234567",
  doneTitle: "آپ رجسٹر ہو گئے",
  doneBody: "کلینک آپ کو کال کر کے ڈرائیونگ لائسنس، گاڑی کی رجسٹریشن اور شناختی کارڈ چیک کرے گا۔ منظوری کے بعد آپ آن لائن ہو سکیں گے۔",
  saveLink: "یہ نجی لنک محفوظ کر لیں۔ یہ آپ کا ڈرائیور پیج ہے، کسی کو نہ دیں۔",
  copy: "لنک کاپی کریں",
  copied: "کاپی ہو گیا",
  openPage: "میرا ڈرائیور پیج کھولیں",
  already: "اس فون پر پہلے سے رجسٹر ہیں؟",
  switchTo: "English",
  pending: "منظوری کا انتظار",
  pendingBody: "کلینک آپ کو کال کر کے کاغذات چیک کرے گا۔ یہ پیج خود اپ ڈیٹ ہوتا ہے۔",
  rejected: "منظور نہیں ہوا",
  suspended: "کلینک نے روک دیا ہے",
  approved: "منظور",
  contactClinic: "سوال ہو تو کلینک سے رابطہ کریں۔",
  online: "آپ آن لائن ہیں",
  onlineBody: "یہ پیج کھلا رکھیں۔ کلینک آپ کی جگہ دیکھ کر آپ کو ٹرپ بھیج سکتا ہے۔",
  offline: "آپ آف لائن ہیں",
  offlineBody: "جب مریض لے جانے کے لیے فارغ ہوں تو آن لائن ہوں۔",
  goOnline: "آن لائن ہوں",
  goOffline: "آف لائن ہوں",
  newTrip: "نیا ٹرپ",
  emergencyTrip: "ایمرجنسی ٹرپ۔ ریسکیو 1122 کو بھی کال کی گئی ہے۔",
  openTrip: "ٹرپ کھولیں",
  onTrip: "آپ ٹرپ پر ہیں",
  gpsOff: "لوکیشن بند ہے، اس لیے کلینک نہیں دیکھ سکتا کہ آپ کتنے قریب ہیں۔ اس سائٹ کو لوکیشن کی اجازت دیں۔",
  lastSent: (s: string) => `جگہ بھیجی گئی ${s}`,
  outside: "آپ سروس کے علاقے سے باہر ہیں۔ صحت ساتھی صرف ملتان اور آس پاس ٹرپ بھیجتا ہے، اس لیے جہاں آپ ابھی ہیں وہاں ٹرپ نہیں ملیں گے۔",
};

export const AT = { en, ur } satisfies Record<UiLang, typeof en>;

const KEY = "sehat.ambulance";
export function savedMember(): { m: number; t: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.m === "number" && typeof v.t === "string" ? v : null;
  } catch {
    return null;
  }
}
export function rememberMember(m: number, t: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ m, t }));
  } catch {}
}
