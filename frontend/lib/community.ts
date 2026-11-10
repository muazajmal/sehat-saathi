import { apiCall as call } from "./api";

export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export interface AreaAlertT {
  id: number;
  area: string;
  group: string;
  group_en: string;
  group_ur: string;
  level: "watch" | "alert";
  cases_week: number;
  baseline_week: number;
  title_en: string;
  body_en: string;
  title_ur: string;
  body_ur: string;
  drafted_by?: string;
  status: "draft" | "published" | "closed";
  approved_by: string | null;
  created_at: string;
  published_at: string | null;
  expires_at: string | null;
  reached?: number;
}
export interface Rise {
  area: string;
  group: string;
  group_en: string;
  group_ur: string;
  level: "watch" | "alert";
  cases_week: number;
  baseline_week: number;
  ratio: number;
  daily: number[];
  lat: number;
  lng: number;
  alert: AreaAlertT | null;
}
export interface AreaHealth {
  rises: Rise[];
  map: { area: string; lat: number; lng: number; cases: number }[];
  alerts: AreaAlertT[];
  areas: { name: string; lat: number; lng: number }[];
}
export interface DonorT {
  id: number;
  name: string;
  phone: string;
  blood_group: BloodGroup;
  area: string;
  available: boolean;
  ready: boolean;
  last_donated: string | null;
  token: string;
}
export interface BloodRequestT {
  id: number;
  blood_group: BloodGroup;
  units: number;
  hospital: string;
  note: string;
  status: "open" | "filled" | "closed";
  case_id: number | null;
  created_by: string;
  created_at: string;
  yes: number;
  asks: { id: number; donor: string; phone: string; blood_group: BloodGroup; area: string; km: number | null; answer: "waiting" | "yes" | "no" | "donated"; answered_at: string | null }[];
}
export interface BloodAskT {
  donor: string;
  blood_group: BloodGroup;
  units: number;
  hospital: string;
  hospital_phone: string;
  hospital_position: { lat: number; lng: number } | null;
  km: number | null;
  answer: "waiting" | "yes" | "no";
  request_status: "open" | "filled" | "closed";
  created_at: string;
  token: string;
}
export interface MedDraft {
  name: string;
  dose: string;
  times: string[];
  with_food: "before" | "after" | "any";
  days: number | null;
  instructions_en: string;
  instructions_ur: string;
  source: "photo" | "manual";
}
export interface Dose {
  medicine_id: number;
  name: string;
  dose: string;
  time: string;
  status: "taken" | "due" | "missed" | "upcoming";
  with_food: "before" | "after" | "any";
  instructions_en: string;
  instructions_ur: string;
  days_left: number | null;
  taken_at: string | null;
}
export interface MedT extends MedDraft {
  id: number;
  start_date: string;
  active: boolean;
}
export interface ElderT {
  id: number;
  name: string;
  phone: string;
  checkin_time: string;
  grace_min: number;
  lang: "ur" | "en";
  status: "ok" | "help" | "upcoming" | "waiting" | "missed";
  checked_at: string | null;
  week: { day: string; status: "ok" | "help" }[];
  link: string;
}
export interface InboxItem {
  id: number;
  kind: string;
  title: string;
  title_ur: string;
  body_ur: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

const j = (b: unknown) => ({ method: "POST", body: JSON.stringify(b) });

export const cx = {
  // area health
  areaHealth: () => call<AreaHealth>("/api/area-health"),
  draftAlert: (area: string, group: string) =>
    call<AreaAlertT>(`/api/area-health/draft?area=${encodeURIComponent(area)}&group=${group}`, { method: "POST" }),
  editAlert: (id: number, b: Pick<AreaAlertT, "title_en" | "body_en" | "title_ur" | "body_ur">) =>
    call<AreaAlertT>(`/api/area-health/alerts/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  publishAlert: (id: number) => call<AreaAlertT>(`/api/area-health/alerts/${id}/publish`, { method: "POST" }),
  closeAlert: (id: number) => call<AreaAlertT>(`/api/area-health/alerts/${id}/close`, { method: "POST" }),
  publicAlerts: () => call<AreaAlertT[]>("/api/alerts"),
  // blood
  donorSignup: (b: { phone: string; name: string; blood_group: BloodGroup; area: string; lat?: number; lng?: number; last_donated?: string | null; eligible: boolean }) =>
    call<DonorT>("/api/donors", j(b)),
  myDonor: () => call<DonorT | null>("/api/me/donor"),
  donorsSummary: () =>
    call<{ total: number; by_group: Record<BloodGroup, number>; hospitals: { id: string; name: string }[]; requests: BloodRequestT[] }>("/api/donors/summary"),
  bloodRequest: (b: { blood_group: BloodGroup; units: number; hospital_id: string; note: string; case_id?: number | null }) =>
    call<BloodRequestT>("/api/blood-requests", j(b)),
  bloodStatus: (id: number, status: "open" | "filled" | "closed") =>
    call<BloodRequestT>(`/api/blood-requests/${id}/status?status=${status}`, { method: "POST" }),
  bloodAsk: (a: number, t: string) => call<BloodAskT>(`/api/blood-asks/${a}?t=${encodeURIComponent(t)}`),
  bloodAnswer: (a: number, t: string, answer: "yes" | "no") =>
    call<BloodAskT>(`/api/blood-asks/${a}/answer?t=${encodeURIComponent(t)}&answer=${answer}`, { method: "POST" }),
  // medicines
  readRx: (image_b64: string, mime: string) =>
    call<{ medicines: MedDraft[]; unclear: string[]; engine: string }>("/api/me/prescriptions/read", j({ image_b64, mime })),
  addMeds: (list: MedDraft[]) => call<MedT[]>("/api/me/medicines", j(list)),
  meds: () => call<{ today: Dose[]; medicines: MedT[] }>("/api/me/medicines"),
  taken: (id: number, time: string) => call<{ today: Dose[] }>(`/api/me/medicines/${id}/taken?time=${time}`, { method: "POST" }),
  stopMed: (id: number) => call<{ ok: boolean }>(`/api/me/medicines/${id}`, { method: "DELETE" }),
  // elders
  elders: () => call<ElderT[]>("/api/me/elders"),
  addElder: (b: { name: string; phone: string; checkin_time: string; grace_min: number; lang: "ur" | "en" }) => call<ElderT>("/api/me/elders", j(b)),
  removeElder: (id: number) => call<{ ok: boolean }>(`/api/me/elders/${id}`, { method: "DELETE" }),
  checkinInfo: (e: number, t: string) =>
    call<{ name: string; lang: "ur" | "en"; status: ElderT["status"]; checked_at: string | null; checkin_time: string }>(`/api/checkin?e=${e}&t=${encodeURIComponent(t)}`),
  checkin: (e: number, t: string, status: "ok" | "help") =>
    call<{ name: string; lang: "ur" | "en"; status: ElderT["status"]; checked_at: string | null; checkin_time: string }>(
      `/api/checkin?e=${e}&t=${encodeURIComponent(t)}&status=${status}`, { method: "POST" }),
  // inbox + push
  inbox: () => call<InboxItem[]>("/api/me/inbox"),
  inboxRead: () => call<{ ok: boolean }>("/api/me/inbox/read", { method: "POST" }),
  pushKey: () => call<{ key: string }>("/api/push/key"),
  pushSubscribe: (b: { subscription: PushSubscriptionJSON; elder?: number; token?: string; donor_token?: string; lang?: "ur" | "en" }) =>
    call<{ ok: boolean }>("/api/push/subscribe", j(b)),
};

/** Turn on phone notifications for this person / elder / donor. Returns a short status. */
export async function enablePush(owner: { elder?: number; token?: string; donor_token?: string; lang?: "ur" | "en" } = {}): Promise<"on" | "denied" | "unsupported" | "error"> {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
      return "unsupported";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const { key } = await cx.pushKey();
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
    const appKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }));
    let lang: "ur" | "en" = "ur";
    try {
      lang = localStorage.getItem("sehat-ui-lang") === "en" ? "en" : "ur";
    } catch {}
    await cx.pushSubscribe({ subscription: sub.toJSON(), lang, ...owner });
    return "on";
  } catch {
    return "error";
  }
}

export const fmtTime = (hhmm: string, lang: "en" | "ur") => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(lang === "ur" ? "ur-PK" : "en-PK", { hour: "numeric", minute: "2-digit" });
};
