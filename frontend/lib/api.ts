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

export interface Stats {
  pending: number;
  urgent_pending: number;
  callbacks_open: number;
  approved_today: number;
  open_slots_today: number;
  avg_review_minutes: number | null;
}

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
}

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
    throw new ApiError(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => call<{ ok: boolean; clinic: string; ai: string; whatsapp: boolean }>("/api/health"),
  stats: () => call<Stats>("/api/stats"),
  cases: (status: CaseStatus | "all") => call<Case[]>(`/api/cases?status=${status}`),
  slots: (days = 3) => call<Slot[]>(`/api/slots?status=open&days=${days}`),
  schedule: (day: string) => call<ScheduleSlot[]>(`/api/schedule?day=${day}`),
  lead: (body: { name: string; clinic: string; city: string; phone: string; size: string }) =>
    call<{ id: number }>("/api/leads", { method: "POST", body: JSON.stringify(body) }),
  audit: (caseId: number) => call<AuditEvent[]>(`/api/audit?case_id=${caseId}`),
  intake: (phone: string, name: string, message: string) =>
    call<Case>("/api/intake", { method: "POST", body: JSON.stringify({ phone, name, message, channel: "web" }) }),
  approve: (id: number, staff: string, slot_id: number | null, note: string) =>
    call<Case>(`/api/cases/${id}/approve`, { method: "POST", body: JSON.stringify({ staff, slot_id, note }) }),
  reject: (id: number, staff: string, note: string) =>
    call<Case>(`/api/cases/${id}/reject`, { method: "POST", body: JSON.stringify({ staff, note }) }),
  called: (id: number, staff: string, note: string) =>
    call<Case>(`/api/cases/${id}/called`, { method: "POST", body: JSON.stringify({ staff, note }) }),
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
