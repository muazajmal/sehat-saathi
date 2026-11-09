import data from "./firstAid.json";
import type { UiLang } from "./patientText";

export interface AidStep {
  icon: string;
  en: string;
  ur: string;
  next?: string;
}
export interface AidGuide {
  key: string;
  title: Record<UiLang, string>;
  source_url?: string;
  steps: AidStep[];
}

export const GUIDES = data.cards as AidGuide[];
export const REVIEWED_BY: string = data.reviewed_by;
export const SOURCE = data.source;
export const guide = (key: string) => GUIDES.find((g) => g.key === key);

export const AT = {
  en: {
    whatToDo: "What to do until help arrives",
    firstAid: "First aid",
    play: "Play",
    pause: "Pause",
    replay: "Play again",
    prev: "Back",
    next: "Next",
    step: (i: number, n: number) => `Step ${i} of ${n}`,
    openNext: "Open the CPR guide",
    onlyFirstAid: "First aid only. It does not replace 1122 or a doctor.",
    basedOn: (s: string) => `Based on ${s} guidance`,
    checkedBy: (d: string) => `Checked by ${d}`,
    officialPage: "Official page",
    noVoice: "Your phone has no voice for this language, so the steps play with captions only.",
    helpIn: (m: number) => `Help is about ${m} min away`,
    hide: "Hide",
    show: "First aid: what to do now",
    library: "First aid guide",
    librarySub: "Short step-by-step videos with pictures, captions and voice. Call 1122 first.",
    choose: "Choose what is happening",
  },
  ur: {
    whatToDo: "مدد پہنچنے تک کیا کریں",
    firstAid: "ابتدائی طبی امداد",
    play: "چلائیں",
    pause: "روکیں",
    replay: "دوبارہ چلائیں",
    prev: "پیچھے",
    next: "آگے",
    step: (i: number, n: number) => `مرحلہ ${i} از ${n}`,
    openNext: "CPR کا طریقہ کھولیں",
    onlyFirstAid: "یہ صرف ابتدائی طبی امداد ہے۔ یہ 1122 یا ڈاکٹر کی جگہ نہیں لیتی۔",
    basedOn: (s: string) => `${s} کی ہدایات کے مطابق`,
    checkedBy: (d: string) => `${d} نے چیک کیا`,
    officialPage: "اصل صفحہ",
    noVoice: "آپ کے فون میں اس زبان کی آواز نہیں، اس لیے مراحل صرف لکھے ہوئے چلیں گے۔",
    helpIn: (m: number) => `مدد تقریباً ${m} منٹ میں پہنچ رہی ہے`,
    hide: "چھپائیں",
    show: "ابتدائی طبی امداد: ابھی کیا کریں",
    library: "ابتدائی طبی امداد",
    librarySub: "تصویروں، لکھائی اور آواز کے ساتھ مختصر ویڈیوز۔ پہلے 1122 پر کال کریں۔",
    choose: "چنیں کیا ہو رہا ہے",
  },
};
