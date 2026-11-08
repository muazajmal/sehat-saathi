// Interface text for the patient website. Replies from the clinic come in the patient's own language from the API.
export type UiLang = "ur" | "en";

export const T = {
  en: {
    dir: "ltr" as const,
    switchTo: "اردو",
    emergencyTitle: "Emergency?",
    emergencyBody: "Chest pain, trouble breathing, fainting or heavy bleeding: call Rescue 1122 now.",
    call1122: "Call 1122",
    formTitle: "Tell us what's wrong",
    formHint: "Write in any language: Urdu, Punjabi, Saraiki, Pashto, Sindhi, English…",
    placeholder: "e.g. My father has had chest pain for 20 minutes",
    name: "Your name (optional)",
    phone: "Phone number",
    phoneHint: "So the clinic can call you or send updates on WhatsApp.",
    consent: (clinic: string) =>
      `I agree that ${clinic}'s doctors and staff can see what I write and my phone number, to help me. This is not a diagnosis.`,
    submit: "Get help",
    sending: "Sending…",
    trust: "A doctor checks every request. Sehat Saathi never diagnoses or prescribes medicine.",
    previous: "Your requests on this phone",
    phoneInvalid: "Enter a phone number like 0300 1234567.",
    yourRequest: "Your request",
    received: "Received",
    reviewing: "A doctor is reviewing it",
    confirmed: "Appointment confirmed",
    clinicWillContact: "The clinic will contact you",
    suggested: "Suggested time, waiting for the doctor's approval",
    serious: "Your symptoms may be serious. Call 1122 now.",
    shareLocation: "Share my location",
    shareWhy: "So we can send a Sehat Saathi responder to take you to hospital.",
    locationShared: "Location shared. The clinic can send a responder.",
    locating: "Getting your location…",
    locationBlocked: "Location is blocked. Allow it in your browser settings, then try again.",
    onTheWay: (n: string) => `${n} is on the way to you`,
    away: (km: string, min: number) => `${km} km away · about ${min} min`,
    reached: (n: string) => `${n} has reached you`,
    toHospital: (h: string) => `On the way to ${h}`,
    arrived: (h: string) => `Arrived at ${h}`,
    demo: "Demo simulation",
    save: "Save this page to check your request later.",
    copy: "Copy link",
    copied: "Copied",
    another: "Send another request",
    calledBack: "The clinic has called you back.",
    notDiagnosis: "Sehat Saathi does not diagnose. In an emergency, call 1122.",
    sampleLocation: "Demo: use a sample Multan location",
  },
  ur: {
    dir: "rtl" as const,
    switchTo: "English",
    emergencyTitle: "ایمرجنسی؟",
    emergencyBody: "سینے میں درد، سانس میں تکلیف، بے ہوشی یا زیادہ خون بہنا ہو تو فوراً ریسکیو 1122 پر کال کریں۔",
    call1122: "1122 پر کال کریں",
    formTitle: "اپنی تکلیف بتائیں",
    formHint: "کسی بھی زبان میں لکھیں: اردو، پنجابی، سرائیکی، پشتو، سندھی، انگریزی…",
    placeholder: "مثلاً: میرے والد کو 20 منٹ سے سینے میں درد ہے",
    name: "آپ کا نام (اختیاری)",
    phone: "فون نمبر",
    phoneHint: "تاکہ کلینک آپ کو کال کر سکے یا واٹس ایپ پر اطلاع دے سکے۔",
    consent: (clinic: string) =>
      `میں اجازت دیتا/دیتی ہوں کہ ${clinic} کے ڈاکٹر اور عملہ میری لکھی ہوئی بات اور فون نمبر دیکھ سکیں تاکہ میری مدد کی جا سکے۔ یہ تشخیص نہیں ہے۔`,
    submit: "مدد حاصل کریں",
    sending: "بھیجا جا رہا ہے…",
    trust: "ہر درخواست ڈاکٹر خود دیکھتے ہیں۔ صحت ساتھی نہ تشخیص کرتا ہے نہ دوا تجویز کرتا ہے۔",
    previous: "اس فون سے آپ کی درخواستیں",
    phoneInvalid: "فون نمبر اس طرح لکھیں: 0300 1234567",
    yourRequest: "آپ کی درخواست",
    received: "موصول ہو گئی",
    reviewing: "ڈاکٹر دیکھ رہے ہیں",
    confirmed: "وقت کنفرم ہو گیا",
    clinicWillContact: "کلینک آپ سے رابطہ کرے گا",
    suggested: "تجویز کردہ وقت، ڈاکٹر کی منظوری کا انتظار ہے",
    serious: "آپ کی علامات سنگین ہو سکتی ہیں۔ ابھی 1122 پر کال کریں۔",
    shareLocation: "اپنی لوکیشن بھیجیں",
    shareWhy: "تاکہ ہم آپ کو ہسپتال لے جانے کے لیے صحت ساتھی کا رضاکار بھیج سکیں۔",
    locationShared: "لوکیشن بھیج دی گئی۔ کلینک رضاکار بھیج سکتا ہے۔",
    locating: "آپ کی لوکیشن لی جا رہی ہے…",
    locationBlocked: "لوکیشن کی اجازت نہیں ملی۔ براؤزر کی سیٹنگز میں اجازت دیں اور دوبارہ کوشش کریں۔",
    onTheWay: (n: string) => `${n} آپ کی طرف آ رہے ہیں`,
    away: (km: string, min: number) => `${km} کلومیٹر دور · تقریباً ${min} منٹ`,
    reached: (n: string) => `${n} آپ کے پاس پہنچ گئے ہیں`,
    toHospital: (h: string) => `${h} جا رہے ہیں`,
    arrived: (h: string) => `${h} پہنچ گئے`,
    demo: "ڈیمو",
    save: "بعد میں دیکھنے کے لیے یہ صفحہ محفوظ کر لیں۔",
    copy: "لنک کاپی کریں",
    copied: "کاپی ہو گیا",
    another: "نئی درخواست بھیجیں",
    calledBack: "کلینک نے آپ کو کال کر لی ہے۔",
    notDiagnosis: "صحت ساتھی تشخیص نہیں کرتا۔ ایمرجنسی میں 1122 پر کال کریں۔",
    sampleLocation: "Demo: use a sample Multan location",
  },
};

const KEY = "sehat-ui-lang";
export function loadLang(): UiLang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "ur" || saved === "en") return saved;
  } catch {}
  return "ur";
}
export function saveLang(l: UiLang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
}

// Requests sent from this phone, so a patient can reopen their status without the link.
const MINE = "sehat-my-requests";
export type MyRequest = { c: number; t: string; at: string; preview: string };
export function myRequests(): MyRequest[] {
  try {
    return JSON.parse(localStorage.getItem(MINE) ?? "[]");
  } catch {
    return [];
  }
}
export function rememberRequest(r: MyRequest) {
  try {
    localStorage.setItem(MINE, JSON.stringify([r, ...myRequests().filter((x) => x.c !== r.c)].slice(0, 5)));
  } catch {}
}
