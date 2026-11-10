export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Urgency = "urgent" | "today" | "routine";
export type CaseStatus = "pending_review" | "approved" | "rejected";

export interface Slot {
  id: number;
  doctor: string;
  specialty: string;
  starts_at: string;
  minutes: number;
  status: "open" | "held" | "booked";
}

export interface Case {
  id: number;
  patient: { id: number; phone: string; name: string };
  channel: string;
  message: string;
  language: string; // ur, roman_ur, en, pa, skr, ps, sd, bal, ar, fa, or another ISO code
  urgency: Urgency;
  summary: string;
  red_flags: string[];
  specialty: string;
  reply_ur: string;
  engine: string;
  confidence: number;
  status: CaseStatus;
  needs_callback: boolean;
  called_back: boolean;
  proposed_slot: Slot | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface IntakeResult extends Case {
  access_token: string;
  status_link: string;
}

export interface PatientStatus {
  case_id: number;
  clinic: string;
  name: string;
  status: CaseStatus;
  urgency: Urgency;
  language: string;
  reply: string;
  call_1122: boolean;
  held_slot: { starts_at: string; doctor: string } | null;
  booked_slot: { starts_at: string; doctor: string } | null;
  called_back: boolean;
  location_shared: boolean;
  out_of_area: boolean;
  nearest_hospital_km: number | null;
  trip: {
    status: DispatchStatus;
    responder: string;
    vehicle: string;
    hospital: string;
    phase: "to_patient" | "waiting_at_patient" | "to_hospital" | "at_hospital" | "cancelled";
    km_away: number;
    eta_min: number;
    mode: "live" | "simulated" | "no_signal" | "finished";
    position?: Pt | null;
    start?: Pt | null;
    patient?: Pt | null;
    hospital_position?: Pt | null;
    progress?: number;
  } | null;
  charges: { id: number; kind: string; description: string; amount_pkr: number; status: "due" | "paid" | "waived"; method: PayMethod | null }[];
  first_aid: string[];
  email_to?: string | null;
  patient_reply?: "coming" | "cancelled" | null;
  attendance?: "arrived" | "no_show" | null;
  created_at: string;
}

export interface Stats {
  pending: number;
  urgent_pending: number;
  callbacks_open: number;
  approved_today: number;
  open_slots_today: number;
  avg_review_minutes: number | null;
  dispatches_active?: number;
  responders_free?: number;
  dues_pkr?: number;
  ambulances_pending?: number;
}

export type VehicleType = "basic" | "oxygen" | "icu" | "car";
export const VEHICLE_LABEL: Record<VehicleType, string> = {
  basic: "Ambulance (basic)",
  oxygen: "Ambulance with oxygen",
  icu: "ICU ambulance (ventilator)",
  car: "Patient transport car",
};
export type MemberStatus = "pending" | "approved" | "rejected" | "suspended";
export interface AmbulanceMember {
  id: number;
  driver_name: string;
  phone: string;
  organisation: string;
  vehicle_type: VehicleType;
  vehicle: string;
  vehicle_reg: string;
  area: string;
  lat: number;
  lng: number;
  status: MemberStatus;
  online: boolean;
  busy: boolean;
  review_note: string;
  reviewed_by: string;
  created_at: string;
  last_seen_at: string | null;
  trip_link: string;
  in_area: boolean;
  trip_tier: string;
  link: string;
}
export interface AmbulanceSignup {
  driver_name: string;
  phone: string;
  organisation: string;
  vehicle_type: VehicleType;
  vehicle_reg: string;
  area: string;
  lat: number | null;
  lng: number | null;
  agree: boolean;
}

export type PayMethod = "cash" | "jazzcash" | "easypaisa" | "card" | "sehat_card";
export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Cash",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  sehat_card: "Sehat Card",
};

export interface Charge {
  id: number;
  case_id: number;
  dispatch_id: number | null;
  kind: "transport" | "visit";
  description: string;
  amount_pkr: number;
  status: "due" | "paid" | "waived";
  method: PayMethod | null;
  added_by: string;
  settled_by: string | null;
  note: string;
  created_at: string;
  settled_at: string | null;
}

export interface Prices {
  transport_base_pkr: number;
  transport_per_km_pkr: number;
  visit_fee_pkr: number;
}

export const rupees = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

export interface PatientLocation {
  lat: number;
  lng: number;
  label: string;
  source: "web" | "whatsapp" | "sample" | "staff";
  at: string;
}

export interface Responder {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  area: string;
  lat: number;
  lng: number;
  status: "available" | "busy" | "off";
  is_demo: boolean;
}

export interface ResponderOption extends Responder {
  distance_km: number;
  eta_minutes: number;
}

export interface HospitalOption {
  id: string;
  name: string;
  short: string;
  area: string;
  lat: number;
  lng: number;
  specialties: string[];
  phone: string;
  distance_km: number;
  eta_minutes: number;
  match: boolean;
}

export type DispatchStatus = "dispatched" | "reached_patient" | "at_hospital" | "cancelled";

export interface Dispatch {
  id: number;
  case_id: number;
  responder: Responder;
  hospital_id: string;
  hospital_name: string;
  tier: "emergency" | "transport";
  status: DispatchStatus;
  eta_minutes: number;
  approved_by: string;
  note: string;
  created_at: string;
  updated_at: string;
  tracking_link: string;
}

export interface Pt {
  lat: number;
  lng: number;
}

export interface Track {
  dispatch_id: number;
  status: DispatchStatus;
  tier: "emergency" | "transport";
  mode: "live" | "simulated" | "no_signal" | "finished";
  phase: "to_patient" | "waiting_at_patient" | "to_hospital" | "at_hospital" | "cancelled";
  responder: string;
  vehicle: string;
  hospital: string;
  position: Pt;
  patient: Pt;
  hospital_position: Pt;
  start: Pt;
  km_to_patient: number;
  km_to_hospital: number;
  eta_patient_min: number;
  eta_hospital_min: number;
  progress: number;
  trail: Pt[];
  last_fix_seconds: number | null;
  updated_at: string;
}

export interface ResponderTrip {
  dispatch_id: number;
  status: DispatchStatus;
  tier: "emergency" | "transport";
  responder: string;
  patient: string;
  patient_phone: string;
  summary: string;
  pickup: Pt;
  pickup_label: string;
  hospital: string;
  hospital_position: Pt;
  hospital_phone: string;
}

export interface Transport {
  case_id: number;
  tier: "emergency" | "transport";
  call_1122: boolean;
  need: string;
  reason: string;
  location: PatientLocation | null;
  hospitals: HospitalOption[];
  responders: ResponderOption[];
  dispatch: Dispatch | null;
  out_of_area: boolean;
  nearest_hospital_km: number | null;
  responders_too_far: number;
}

// Where the website demo puts a visitor who can't share a real location (matches the API).
export const SAMPLE_LOCATION = { lat: 30.2297, lng: 71.4789, label: "Gulgasht Colony, Multan (sample location)" };
export const IN_MULTAN = (lat: number, lng: number) => lat >= 29.95 && lat <= 30.4 && lng >= 71.25 && lng <= 71.7;
export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const directionsLink = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;

export interface AuditEvent {
  id: number;
  case_id: number | null;
  actor: string;
  action: string;
  detail: string;
  at: string;
}

export interface ScheduleSlot {
  id: number;
  doctor: string;
  specialty: string;
  starts_at: string;
  minutes: number;
  status: "open" | "held" | "booked";
  case_id: number | null;
  patient: string | null;
  urgency: Urgency | null;
  patient_reply?: "coming" | "cancelled" | null;
  attendance?: "arrived" | "no_show" | null;
}

export class ApiError extends Error {
  status?: number;
}

// Staff access code for the clinic desk, kept on this device only.
const STAFF_KEY = "sehat-staff-code";
export const staffCode = {
  get: () => {
    try {
      return localStorage.getItem(STAFF_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set: (code: string) => {
    try {
      if (code) localStorage.setItem(STAFF_KEY, code);
      else localStorage.removeItem(STAFF_KEY);
    } catch {}
  },
};

// ---------- Logins (hospital admin, doctor, patient) ----------

export type Role = "owner" | "admin" | "doctor" | "patient";

export interface Account {
  id: number;
  role: Role;
  phone: string;
  name: string;
  hospital: string;
  specialty: string;
  active: boolean;
}

export interface SessionInfo {
  token: string;
  account: Account;
}

export interface MyCase {
  case_id: number;
  token: string;
  created_at: string;
  message: string;
  urgency: Urgency;
  status: CaseStatus;
  slot: { starts_at: string; doctor: string } | null;
}

const SESSION_KEY = "sehat.session";
export const session = {
  get: (): SessionInfo | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionInfo) : null;
    } catch {
      return null;
    }
  },
  set: (s: SessionInfo | null) => {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch {}
  },
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const code = typeof window === "undefined" ? "" : staffCode.get();
  const token = typeof window === "undefined" ? "" : session.get()?.token ?? "";
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(code ? { "X-Staff-Key": code } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Can't reach the API at ${API}. Start the backend with: uvicorn app.main:app --port 8000`);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join(", ");
    } catch {}
    const err = new ApiError(detail);
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (phone: string, password: string, portal: "patient" | "staff") =>
    call<SessionInfo>("/api/auth/login", { method: "POST", body: JSON.stringify({ phone, password, portal }) }),
  signup: (phone: string, name: string, password: string, email = "") =>
    call<SessionInfo>("/api/auth/signup", { method: "POST", body: JSON.stringify({ phone, name, password, email }) }),
  me: () => call<Account>("/api/auth/me"),
  changePassword: (old_password: string, new_password: string) =>
    call<{ ok: boolean }>("/api/auth/password", { method: "POST", body: JSON.stringify({ old_password, new_password }) }),
  myCases: () => call<MyCase[]>("/api/me/cases"),
  team: () => call<Account[]>("/api/admin/accounts?role=staff"),
  patientAccounts: () => call<Account[]>("/api/admin/accounts?role=patient"),
  addStaff: (b: { role: "doctor" | "admin"; phone: string; name: string; password: string; specialty: string }) =>
    call<Account>("/api/admin/accounts", { method: "POST", body: JSON.stringify(b) }),
  setActive: (id: number, active: boolean) =>
    call<Account>(`/api/admin/accounts/${id}/active`, { method: "POST", body: JSON.stringify({ active }) }),
  resetPassword: (id: number, new_password: string) =>
    call<Account>(`/api/admin/accounts/${id}/password`, { method: "POST", body: JSON.stringify({ new_password }) }),
  ambulanceRegister: (b: AmbulanceSignup) =>
    call<AmbulanceMember>("/api/ambulances/register", { method: "POST", body: JSON.stringify(b) }),
  ambulanceMe: (m: number, t: string) => call<AmbulanceMember>(`/api/ambulances/me?m=${m}&t=${encodeURIComponent(t)}`),
  ambulanceOnline: (m: number, t: string, online: boolean, lat: number | null = null, lng: number | null = null) =>
    call<AmbulanceMember>("/api/ambulances/me/online", { method: "POST", body: JSON.stringify({ m, t, online, lat, lng }) }),
  ambulances: () => call<AmbulanceMember[]>("/api/ambulances"),
  ambulanceReview: (id: number, staff: string, decision: "approve" | "reject" | "suspend", note = "") =>
    call<AmbulanceMember>(`/api/ambulances/${id}/review`, { method: "POST", body: JSON.stringify({ staff, decision, note }) }),
  health: () =>
    call<{ ok: boolean; clinic: string; ai: string; whatsapp: boolean; staff_code_required: boolean; login_required?: boolean }>("/api/health"),
  staffCheck: () => call<{ ok: boolean }>("/api/staff/check"),
  stats: () => call<Stats>("/api/stats"),
  cases: (status: CaseStatus | "all") => call<Case[]>(`/api/cases?status=${status}`),
  slots: (days = 3) => call<Slot[]>(`/api/slots?status=open&days=${days}`),
  schedule: (day: string) => call<ScheduleSlot[]>(`/api/schedule?day=${day}`),
  lead: (body: { name: string; clinic: string; city: string; phone: string; email: string; size: string }) =>
    call<{ id: number }>("/api/leads", { method: "POST", body: JSON.stringify(body) }),
  audit: (caseId: number) => call<AuditEvent[]>(`/api/audit?case_id=${caseId}`),
  intake: (phone: string, name: string, message: string, quick?: object, email?: string, hospital?: string) =>
    call<IntakeResult>("/api/intake", {
      method: "POST",
      body: JSON.stringify({ phone, name, message, channel: "web", quick, email: email || "", hospital: hospital || "" }),
    }),
  transcribe: (audio_b64: string, ui_lang: "ur" | "en") =>
    call<{ text: string }>("/api/transcribe", { method: "POST", body: JSON.stringify({ audio_b64, mime: "audio/wav", ui_lang }) }),
  patientStatus: (c: number, t: string) =>
    call<PatientStatus>(`/api/patient/status?c=${c}&t=${encodeURIComponent(t)}`),
  patientLocation: (c: number, t: string, lat: number, lng: number, label: string) =>
    call<PatientStatus>("/api/patient/location", { method: "POST", body: JSON.stringify({ c, t, lat, lng, label }) }),
  responderStatus: (d: number, token: string, status: "reached_patient" | "at_hospital") =>
    call<Dispatch>(`/api/dispatches/${d}/responder-status`, { method: "POST", body: JSON.stringify({ token, status }) }),
  approve: (id: number, staff: string, slot_id: number | null, note: string) =>
    call<Case>(`/api/cases/${id}/approve`, { method: "POST", body: JSON.stringify({ staff, slot_id, note }) }),
  reject: (id: number, staff: string, note: string) =>
    call<Case>(`/api/cases/${id}/reject`, { method: "POST", body: JSON.stringify({ staff, note }) }),
  called: (id: number, staff: string, note: string) =>
    call<Case>(`/api/cases/${id}/called`, { method: "POST", body: JSON.stringify({ staff, note }) }),
  shareLocation: (id: number, loc: { lat: number; lng: number; label: string; source: PatientLocation["source"] }) =>
    call<PatientLocation>(`/api/cases/${id}/location`, { method: "POST", body: JSON.stringify(loc) }),
  transport: (id: number) => call<Transport>(`/api/cases/${id}/transport`),
  dispatch: (id: number, staff: string, responder_id: number, hospital_id: string, note: string) =>
    call<Dispatch>(`/api/cases/${id}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ staff, responder_id, hospital_id, note }),
    }),
  prices: () => call<Prices>("/api/prices"),
  charges: (caseId: number) => call<Charge[]>(`/api/cases/${caseId}/charges`),
  addVisitFee: (caseId: number, staff: string, amount_pkr: number | null, note = "") =>
    call<Charge>(`/api/cases/${caseId}/charges`, { method: "POST", body: JSON.stringify({ staff, amount_pkr, note }) }),
  settleCharge: (id: number, staff: string, status: "paid" | "waived", method: PayMethod | null, note = "") =>
    call<Charge>(`/api/charges/${id}/settle`, { method: "POST", body: JSON.stringify({ staff, status, method, note }) }),
  track: (dispatchId: number) => call<Track>(`/api/dispatches/${dispatchId}/track`),
  responderTrack: (d: number, t: string) => call<Track>(`/api/responder-track?d=${d}&t=${encodeURIComponent(t)}`),
  responderTrip: (d: number, t: string) =>
    call<ResponderTrip>(`/api/responder-trip?d=${d}&t=${encodeURIComponent(t)}`),
  postPosition: (d: number, token: string, lat: number, lng: number, accuracy_m: number | null) =>
    call<Track>(`/api/dispatches/${d}/position`, {
      method: "POST",
      body: JSON.stringify({ token, lat, lng, accuracy_m }),
    }),
  dispatchStatus: (dispatchId: number, staff: string, status: Exclude<DispatchStatus, "dispatched">, note = "") =>
    call<Dispatch>(`/api/dispatches/${dispatchId}/status`, {
      method: "POST",
      body: JSON.stringify({ staff, status, note }),
    }),
};

// ---------- formatting helpers ----------

// The API stores clinic-local times without an offset; attach it here.
const CLINIC_OFFSET = process.env.NEXT_PUBLIC_CLINIC_UTC_OFFSET ?? "+05:00";
export const toDate = (iso: string) =>
  new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + CLINIC_OFFSET);

export const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: "Urgent",
  today: "See today",
  routine: "Routine",
};

export function slotTime(iso: string) {
  const d = toDate(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day =
    d.toDateString() === today.toDateString()
      ? "Today"
      : d.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time}`;
}

export function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - toDate(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

// Arabic script: Urdu, Punjabi, Saraiki, Pashto, Sindhi, Balochi, Arabic, Persian.
export const isUrduScript = (s: string) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);

export const LANGUAGE_LABEL: Record<string, string> = {
  ur: "Urdu",
  roman_ur: "Roman Urdu",
  en: "English",
  pa: "Punjabi",
  skr: "Saraiki",
  ps: "Pashto",
  sd: "Sindhi",
  bal: "Balochi",
  ar: "Arabic",
  fa: "Persian",
};

export const languageLabel = (code: string) => {
  if (LANGUAGE_LABEL[code]) return LANGUAGE_LABEL[code];
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

// Urdu, Punjabi and Saraiki read best in Nastaliq. Pashto, Sindhi, Balochi,
// Arabic and Persian use letters Nastaliq fonts often lack, so they get Naskh.
const NASTALIQ = new Set(["ur", "roman_ur", "pa", "skr"]);
export function scriptClass(text: string, language?: string) {
  if (!isUrduScript(text)) return "";
  if (language && language !== "roman_ur") return NASTALIQ.has(language) ? "urdu" : "naskh";
  // Language unknown: Pashto, Sindhi and Arabic letters, or no Urdu-only letters, mean Naskh.
  return /[ټډړښږځڅېۍګڼڪٽٺٿڊڌڍڏڙڱڻڦڇڃڀةىي]/.test(text) || !/[ٹڈڑںھے]/.test(text) ? "naskh" : "urdu";
}

/** Shared request helper for feature modules (lib/community.ts). */
export const apiCall = call;
