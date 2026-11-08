// One-tap symptom buttons and follow-up questions for the patient form.
// Keys must match backend/app/quick.py, which decides urgency from them.
import type { UiLang } from "./patientText";

export type ForWhom = "self" | "child" | "parent" | "other";
export type Since = "today" | "days" | "week";

export interface QuickState {
  forWhom: ForWhom | null;
  age: string;
  ageUnit: "years" | "months";
  symptoms: string[];
  answers: string[];
  since: Since | null;
}
export const EMPTY_QUICK: QuickState = { forWhom: null, age: "", ageUnit: "years", symptoms: [], answers: [], since: null };

type L = Record<UiLang, string>;

export const SYMPTOMS: { key: string; icon: string; label: L; urgent?: boolean; asks: string[] }[] = [
  { key: "chest", icon: "🫀", label: { en: "Chest pain", ur: "سینے میں درد" }, urgent: true, asks: ["sweating", "pain_arm", "short_breath"] },
  { key: "breathing", icon: "🫁", label: { en: "Trouble breathing", ur: "سانس میں تکلیف" }, urgent: true, asks: ["lips_blue", "cant_speak"] },
  { key: "fever", icon: "🌡️", label: { en: "Fever", ur: "بخار" }, asks: ["fever_high", "stiff_neck", "fits", "drowsy"] },
  { key: "stomach", icon: "🤢", label: { en: "Stomach, vomiting, loose motions", ur: "پیٹ درد، الٹی، دست" }, asks: ["vomit_blood", "dehydrated", "severe_pain"] },
  { key: "pregnancy", icon: "🤰", label: { en: "Pregnancy problem", ur: "حمل میں مسئلہ" }, asks: ["preg_bleeding", "preg_pain", "baby_moves_less", "preg_headache"] },
  { key: "injury", icon: "🩹", label: { en: "Injury or burn", ur: "چوٹ یا جلنا" }, asks: ["bleeding_wont_stop", "head_injury", "big_burn", "broken_bone"] },
  { key: "headache", icon: "🤕", label: { en: "Headache", ur: "سر درد" }, asks: ["worst_headache", "one_side_weak"] },
  { key: "cough", icon: "😷", label: { en: "Cough or cold", ur: "کھانسی یا نزلہ" }, asks: ["cough_blood", "cough_weeks"] },
  { key: "skin", icon: "🖐️", label: { en: "Skin rash or itching", ur: "خارش یا دانے" }, asks: ["face_swelling"] },
  { key: "other", icon: "➕", label: { en: "Something else", ur: "کچھ اور" }, asks: [] },
];

export const ANSWERS: Record<string, { label: L; urgent?: boolean }> = {
  sweating: { label: { en: "Sweating", ur: "پسینہ آ رہا ہے" }, urgent: true },
  pain_arm: { label: { en: "Pain going to arm or jaw", ur: "درد بازو یا جبڑے تک" }, urgent: true },
  short_breath: { label: { en: "Short of breath", ur: "سانس پھول رہی ہے" }, urgent: true },
  lips_blue: { label: { en: "Lips or face turning blue", ur: "ہونٹ یا چہرہ نیلا" }, urgent: true },
  cant_speak: { label: { en: "Can't finish a sentence", ur: "بات پوری نہیں کر پا رہے" }, urgent: true },
  fever_high: { label: { en: "Very high (103°F or more)", ur: "بہت تیز (103 یا زیادہ)" } },
  stiff_neck: { label: { en: "Stiff neck or rash", ur: "گردن اکڑ گئی یا دانے" }, urgent: true },
  fits: { label: { en: "Fits (seizure)", ur: "دورہ (جھٹکے)" }, urgent: true },
  drowsy: { label: { en: "Very drowsy, hard to wake", ur: "بہت غنودگی، جاگ نہیں رہے" }, urgent: true },
  vomit_blood: { label: { en: "Vomiting blood or black stool", ur: "خون کی الٹی یا کالا پاخانہ" }, urgent: true },
  dehydrated: { label: { en: "Can't keep water down, little urine", ur: "پانی بھی نہیں رکتا، پیشاب کم" } },
  severe_pain: { label: { en: "Severe pain", ur: "شدید درد" } },
  preg_bleeding: { label: { en: "Bleeding", ur: "خون آ رہا ہے" }, urgent: true },
  preg_pain: { label: { en: "Severe belly pain", ur: "پیٹ میں شدید درد" }, urgent: true },
  baby_moves_less: { label: { en: "Baby moving less", ur: "بچے کی حرکت کم" }, urgent: true },
  preg_headache: { label: { en: "Bad headache or blurred vision", ur: "شدید سر درد یا دھندلا نظر" }, urgent: true },
  bleeding_wont_stop: { label: { en: "Bleeding won't stop", ur: "خون نہیں رک رہا" }, urgent: true },
  head_injury: { label: { en: "Head hit, then fainted or vomited", ur: "سر پر چوٹ، پھر بے ہوشی یا الٹی" }, urgent: true },
  big_burn: { label: { en: "Large burn or burn on the face", ur: "بڑا جلنا یا چہرے پر جلنا" }, urgent: true },
  broken_bone: { label: { en: "Bone may be broken", ur: "ہڈی ٹوٹنے کا شک" } },
  worst_headache: { label: { en: "Sudden, worst ever", ur: "اچانک اور بہت شدید" }, urgent: true },
  one_side_weak: { label: { en: "Face drooping or one side weak", ur: "چہرہ ٹیڑھا یا ایک طرف کمزوری" }, urgent: true },
  cough_blood: { label: { en: "Coughing blood", ur: "کھانسی میں خون" } },
  cough_weeks: { label: { en: "More than 2 weeks", ur: "دو ہفتے سے زیادہ" } },
  face_swelling: { label: { en: "Face or lips swelling", ur: "چہرے یا ہونٹوں پر سوجن" }, urgent: true },
};

export const WHO: { key: ForWhom; label: L; line: L }[] = [
  { key: "self", label: { en: "Me", ur: "میں خود" }, line: { en: "For me", ur: "اپنے لیے" } },
  { key: "child", label: { en: "My child", ur: "میرا بچہ" }, line: { en: "For my child", ur: "میرے بچے کے لیے" } },
  { key: "parent", label: { en: "My parent", ur: "والد / والدہ" }, line: { en: "For my parent", ur: "میرے والد یا والدہ کے لیے" } },
  { key: "other", label: { en: "Someone else", ur: "کوئی اور" }, line: { en: "For someone else", ur: "کسی اور کے لیے" } },
];

export const SINCE: { key: Since; label: L }[] = [
  { key: "today", label: { en: "Today", ur: "آج سے" } },
  { key: "days", label: { en: "2–3 days", ur: "2-3 دن سے" } },
  { key: "week", label: { en: "A week or more", ur: "ہفتے یا زیادہ سے" } },
];

export const QT = {
  en: {
    whoTitle: "Who is it for?",
    age: "Age",
    years: "years",
    months: "months",
    whatTitle: "What's the problem? Tap all that apply",
    sinceTitle: "Since when?",
    orWrite: "Or write / speak it in your own words",
    urgentNow: "This can be serious. Call 1122 now, and send this request too.",
    optional: "(optional)",
  },
  ur: {
    whoTitle: "کس کے لیے؟",
    age: "عمر",
    years: "سال",
    months: "مہینے",
    whatTitle: "کیا تکلیف ہے؟ جتنی ہوں سب پر ٹیپ کریں",
    sinceTitle: "کب سے؟",
    orWrite: "یا اپنے الفاظ میں لکھیں / بولیں",
    urgentNow: "یہ سنگین ہو سکتا ہے۔ ابھی 1122 پر کال کریں، اور یہ درخواست بھی بھیجیں۔",
    optional: "(اختیاری)",
  },
};

export function hasQuick(q: QuickState) {
  return q.symptoms.some((s) => s !== "other");
}

export function quickIsUrgent(q: QuickState) {
  const months = q.age ? Number(q.age) * (q.ageUnit === "months" ? 1 : 12) : null;
  const babyFever = q.symptoms.includes("fever") && months != null && (months < 3 || (months < 12 && q.answers.includes("fever_high")));
  return (
    babyFever ||
    q.symptoms.some((s) => SYMPTOMS.find((x) => x.key === s)?.urgent) ||
    q.answers.some((a) => ANSWERS[a]?.urgent)
  );
}

/** The taps as a readable line in the patient's language, put in front of whatever they wrote. */
export function composeMessage(q: QuickState, lang: UiLang, free: string): string {
  const stop = lang === "ur" ? "۔" : ".";
  const bits: string[] = [];
  const who = WHO.find((w) => w.key === q.forWhom);
  const age = q.age ? `${lang === "en" && who ? "age" : QT[lang].age} ${q.age} ${q.ageUnit === "months" ? QT[lang].months : QT[lang].years}` : "";
  if (who || age) bits.push([who?.line[lang], age].filter(Boolean).join(lang === "ur" ? "، " : ", "));
  for (const s of q.symptoms) {
    const sym = SYMPTOMS.find((x) => x.key === s);
    if (!sym || s === "other") continue;
    const extra = sym.asks.filter((a) => q.answers.includes(a)).map((a) => ANSWERS[a].label[lang]);
    bits.push(extra.length ? `${sym.label[lang]}: ${extra.join(lang === "ur" ? "، " : ", ")}` : sym.label[lang]);
  }
  const since = SINCE.find((x) => x.key === q.since);
  if (since) bits.push(lang === "en" ? `Since: ${since.label.en.toLowerCase()}` : since.label.ur);
  const line = bits.length ? bits.join(stop + " ") + stop : "";
  return [line, free.trim()].filter(Boolean).join("\n");
}

export function quickPayload(q: QuickState) {
  if (!q.symptoms.length && !q.forWhom && !q.age) return undefined;
  const age = q.age === "" ? null : Math.min(120, Math.max(0, Math.round(Number(q.age))));
  return {
    for_whom: q.forWhom,
    age: Number.isFinite(age) ? age : null,
    age_unit: q.ageUnit,
    symptoms: q.symptoms,
    // Only answers that belong to a tapped symptom.
    answers: q.answers.filter((a) => q.symptoms.some((s) => SYMPTOMS.find((x) => x.key === s)?.asks.includes(a))),
    since: q.since,
  };
}
