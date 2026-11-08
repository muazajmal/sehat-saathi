import Link from "next/link";
import "./landing.css";
import DemoForm from "../components/DemoForm";
import DeskPreview from "../components/DeskPreview";
import { LogoMark } from "../components/Logo";
import PhoneDemo from "../components/PhoneDemo";
import SiteNav from "../components/SiteNav";

const STEPS = [
  {
    title: "Patient sends a message",
    body: "A voice note, a typed message or a prescription photo, on the WhatsApp number they already have saved.",
    who: "Patient",
  },
  {
    title: "Sehat Saathi sorts it",
    body: "Symptoms summarised, danger signs flagged, urgency set and the right slot held. Usually in under ten seconds.",
    who: "Sehat Saathi",
  },
  {
    title: "Your doctor decides",
    body: "Approve, move or decline from the desk. Danger signs ring the duty doctor straight away.",
    who: "Doctor or front desk",
  },
  {
    title: "Patient gets the time",
    body: "A confirmation in their own language with the doctor, date and time. Every step is signed and logged.",
    who: "Patient",
  },
];

const PLANS = [
  {
    name: "Clinic",
    price: "PKR 9,900",
    per: "per month",
    for: "For a single clinic with up to 3 doctors.",
    items: ["One WhatsApp number", "Triage in 10+ Pakistani and regional languages", "Clinic desk for 5 staff", "Danger-sign call-backs"],
    cta: "Start a free pilot",
  },
  {
    name: "Hospital",
    price: "PKR 49,000",
    per: "per month",
    for: "For hospitals and polyclinics with several departments.",
    items: [
      "Everything in Clinic",
      "Unlimited doctors and staff",
      "Department routing by specialty",
      "Voice notes and prescription photos",
      "Hospital system integration",
    ],
    cta: "Book a demo",
    featured: true,
  },
  {
    name: "Network",
    price: "Custom",
    per: "",
    for: "For chains, labs and health programmes across cities.",
    items: ["Everything in Hospital", "Multiple numbers and branches", "Private cloud hosting", "Dedicated onboarding team"],
    cta: "Talk to us",
  },
];

const FAQ = [
  {
    q: "Does Sehat Saathi diagnose patients?",
    a: "No. It summarises what the patient said, flags danger signs and suggests an urgency. A doctor reviews every case and makes every booking. The patient is told this in each reply.",
  },
  {
    q: "What happens if a patient describes an emergency?",
    a: "Built-in checks for danger signs such as chest pain, breathing difficulty, fainting and stroke signs run on every message. The patient is told to call 1122 if things get worse, and your duty doctor is alerted to call them back.",
  },
  {
    q: "Do patients need to install anything?",
    a: "No. They message your clinic's WhatsApp number like they already do, by voice note or text.",
  },
  {
    q: "Which languages does Sehat Saathi speak?",
    a: "It replies in the language the patient writes in, and sends the booking confirmation in that language too. It understands Urdu, Roman Urdu, English, Punjabi, Saraiki, Pashto, Sindhi, Balochi, Arabic and Persian, and with the AI switched on it can reply in almost any language. The danger-sign checks run in every one of these languages, so an emergency is caught even if the AI is down.",
  },
  {
    q: "Does Sehat Saathi replace 1122?",
    a: "No. For any emergency the patient is told to call Rescue 1122 straight away, with a one-tap button. Sehat Saathi responders help on top of that: they support the family and meet them at hospital, and they take seriously ill patients who are stable but have no transport to the nearest suitable government hospital. A staff member approves every trip.",
  },
  {
    q: "What if the AI service goes down?",
    a: "Triage falls back to the built-in danger-sign checks and keeps working. Nothing is lost, and every case still reaches your desk.",
  },
  {
    q: "Where is patient data kept?",
    a: "In your own Postgres database. You can host it in Pakistan on the Network plan. Every action on a case is logged with the staff member's name and time.",
  },
  {
    q: "How long does setup take?",
    a: "Most clinics are live within a day: connect your WhatsApp Business number, add your doctors' timings and you're ready.",
  },
];

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="check">
      <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="landing">
      <SiteNav />

      {/* ---------- Hero ---------- */}
      <section className="hero-dark">
        <div className="hero-glow" aria-hidden />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="pill">Built for clinics in Pakistan</p>
            <h1>The WhatsApp front desk for Pakistani clinics.</h1>
            <p className="hero-lede">
              Patients message in Urdu, Punjabi, Pashto, Sindhi or English. Sehat Saathi sorts the urgent from the routine, holds the right slot and hands
              every decision to your doctors.
            </p>
            <div className="hero-actions">
              <a href="#demo" className="btn btn-mint btn-lg">
                Book a demo
              </a>
              <Link href="/desk" className="btn btn-ghost btn-lg">
                Try the clinic desk
              </Link>
            </div>
            <p className="hero-patient">
              Feeling unwell? <Link href="/patient">Tell a doctor what&apos;s wrong, in any language →</Link>
            </p>
            <ul className="hero-ticks">
              <li>
                <Check /> No app for patients
              </li>
              <li>
                <Check /> Live in a day
              </li>
              <li>
                <Check /> Doctors approve every booking
              </li>
            </ul>
          </div>

          <div className="hero-stage">
            <PhoneDemo />
            <div className="float-chip chip-a" aria-hidden>
              <span className="dot dot-urgent" />
              <div>
                <strong>Danger sign found</strong>
                <small>Duty doctor alerted</small>
              </div>
            </div>
            <div className="float-chip chip-b" aria-hidden>
              <span className="dot dot-routine" />
              <div>
                <strong>Booked by Dr. Ayesha</strong>
                <small>Today, 9:45 am</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Languages ---------- */}
      <section className="langs">
        <div className="wrap">
          <h2 className="langs-title">However your patients write it, it understands.</h2>
          <div className="langs-grid">
            <figure>
              <blockquote className="urdu">میرے بچے کو تیز بخار ہے</blockquote>
              <figcaption>Urdu script</figcaption>
            </figure>
            <figure>
              <blockquote>Mere bachay ko tez bukhar hai</blockquote>
              <figcaption>Roman Urdu</figcaption>
            </figure>
            <figure>
              <blockquote>My child has a high fever</blockquote>
              <figcaption>English</figcaption>
            </figure>
            <figure className="langs-result">
              <span className="tag tag-urgent">Urgent</span>
              <p>High fever in a child. Duty doctor alerted, paediatrics slot held.</p>
              <figcaption>One answer for your doctor</figcaption>
            </figure>
          </div>
          <ul className="langs-more" aria-label="Also understood">
            <li className="urdu" lang="pa">پنجابی<span>Punjabi</span></li>
            <li className="urdu" lang="skr">سرائیکی<span>Saraiki</span></li>
            <li className="naskh" lang="ps">پښتو<span>Pashto</span></li>
            <li className="naskh" lang="sd">سنڌي<span>Sindhi</span></li>
            <li className="naskh" lang="bal">بلوچی<span>Balochi</span></li>
            <li className="naskh" lang="ar">العربية<span>Arabic</span></li>
            <li className="naskh" lang="fa">فارسی<span>Persian</span></li>
          </ul>
        </div>
      </section>

      {/* ---------- Product ---------- */}
      <section className="block" id="product">
        <div className="wrap">
          <div className="block-head">
            <h2>One desk for every WhatsApp message.</h2>
            <p>
              Your front desk stops scrolling through chats. Every message arrives sorted, summarised and attached to a
              slot, with the most urgent patient always at the top.
            </p>
          </div>
          <DeskPreview />
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="block block-tint">
        <div className="wrap">
          <div className="block-head">
            <h2>Everything a busy clinic needs. Nothing a doctor has to fight with.</h2>
          </div>
          <div className="features">
            <article className="feat feat-wide">
              <div>
                <h3>Triage in seconds</h3>
                <p>
                  Each message gets a plain-English summary for the doctor with age, duration and symptoms pulled out,
                  plus one of three urgency levels.
                </p>
              </div>
              <div className="feat-visual triage-visual">
                <div>
                  <span className="tag tag-urgent">Urgent</span>
                  <small>Call back within minutes</small>
                </div>
                <div>
                  <span className="tag tag-today">See today</span>
                  <small>Same-day slot held</small>
                </div>
                <div>
                  <span className="tag tag-routine">Routine</span>
                  <small>Next fitting slot held</small>
                </div>
              </div>
            </article>

            <article className="feat">
              <h3>Danger signs never wait</h3>
              <p>Chest pain, breathing trouble, fainting or stroke signs ring the duty doctor and tell the patient to call 1122 if it gets worse.</p>
              <div className="feat-visual alert-visual">Duty doctor alerted for Rashid Ahmed</div>
            </article>

            <article className="feat">
              <h3>Replies in their language</h3>
              <p>Warm, short replies in the patient&apos;s own language and script. Never a diagnosis, never a medicine name.</p>
              <div className="feat-visual bubble-visual urdu">ڈاکٹر کی منظوری کے بعد آپ کو تصدیقی پیغام ملے گا۔</div>
            </article>

            <article className="feat">
              <h3>Your timings, your doctors</h3>
              <p>Slots follow each doctor&apos;s schedule and specialty. Children go to paediatrics, pregnancy to gynaecology.</p>
              <div className="feat-visual slot-visual">
                <span className="slot s-booked">9:00</span>
                <span className="slot s-held">9:45</span>
                <span className="slot">10:30</span>
                <span className="slot">11:15</span>
              </div>
            </article>

            <article className="feat">
              <h3>Every decision signed</h3>
              <p>A full activity log shows what the AI suggested and which doctor approved, moved or declined it.</p>
              <ol className="feat-visual log-visual">
                <li>
                  <b>Sehat Saathi</b> held 9:45 am
                </li>
                <li>
                  <b>Dr. Ayesha</b> approved booking
                </li>
              </ol>
            </article>

            <article className="feat feat-wide feat-full">
              <div>
                <h3>Gets them to hospital</h3>
                <p>
                  For a real emergency, the patient is told to call Rescue 1122 first, with one tap. When a patient is
                  seriously ill or has no way to travel, they share their location and the desk suggests the right
                  government hospital and the nearest free Sehat Saathi responder. A staff member approves, and the
                  patient gets the responder&apos;s name and arrival time in their own language.
                </p>
              </div>
              <ol className="feat-visual route-visual" aria-label="Example trip">
                <li className="sos-chip">1122 advised first</li>
                <li>
                  <b>Patient shares location</b>
                  <small>Gulgasht Colony, Multan</small>
                </li>
                <li>
                  <b>Responder on the way</b>
                  <small>Nearest free car, about 6 min</small>
                </li>
                <li>
                  <b>Institute of Cardiology</b>
                  <small>Chest pain goes to the heart hospital</small>
                </li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="block" id="how">
        <div className="wrap">
          <div className="block-head">
            <h2>From a voice note to a confirmed visit.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <span className="who">{s.who}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Safety ---------- */}
      <section className="safety" id="safety">
        <div className="wrap safety-grid">
          <div>
            <h2>The AI suggests. Your doctor decides.</h2>
            <p>
              Sehat Saathi is built so it can&apos;t make the final call. That&apos;s not a setting you can switch off.
              It&apos;s how the system works.
            </p>
          </div>
          <dl className="promises">
            <div>
              <dt>0</dt>
              <dd>bookings confirmed without a named doctor or staff member</dd>
            </div>
            <div>
              <dt>2</dt>
              <dd>independent danger-sign checks on every message, and the more urgent one always wins</dd>
            </div>
            <div>
              <dt>10+</dt>
              <dd>languages understood, from Urdu and Punjabi to Pashto, Sindhi and Saraiki</dd>
            </div>
            <div>
              <dt>24/7</dt>
              <dd>intake on WhatsApp, even when the AI service is down</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section className="block" id="pricing">
        <div className="wrap">
          <div className="block-head center">
            <h2>Simple monthly pricing in rupees.</h2>
            <p>Every plan starts with a free 30-day pilot. Cancel any time.</p>
          </div>
          <div className="plans">
            {PLANS.map((p) => (
              <article key={p.name} className={`plan${p.featured ? " plan-featured" : ""}`}>
                {p.featured && <span className="plan-badge">Best for hospitals</span>}
                <h3>{p.name}</h3>
                <p className="plan-for">{p.for}</p>
                <p className="plan-price">
                  <b>{p.price}</b> {p.per && <span>{p.per}</span>}
                </p>
                <a href="#demo" className={`btn btn-lg ${p.featured ? "btn-primary" : "btn-quiet"}`}>
                  {p.cta}
                </a>
                <ul>
                  {p.items.map((i) => (
                    <li key={i}>
                      <Check /> {i}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="block block-tint" id="faq">
        <div className="wrap faq-grid">
          <div className="block-head">
            <h2>Questions clinics ask us.</h2>
            <p>
              Something else? <a href="#demo">Book a demo</a> and ask a real person.
            </p>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Demo CTA ---------- */}
      <section className="cta-dark" id="demo">
        <div className="hero-glow" aria-hidden />
        <div className="wrap cta-grid">
          <div>
            <h2>See it with your own clinic&apos;s schedule.</h2>
            <p>
              A 20-minute call. We load your doctors&apos; timings, send a few test messages in Urdu and show you the
              desk your staff would use tomorrow.
            </p>
            <ul className="hero-ticks">
              <li>
                <Check /> Free 30-day pilot
              </li>
              <li>
                <Check /> Works with your current WhatsApp number
              </li>
              <li>
                <Check /> Your data stays in your database
              </li>
            </ul>
          </div>
          <DemoForm />
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <LogoMark size={26} /> Sehat Saathi
            </div>
            <p>The WhatsApp front desk for clinics in Pakistan.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <a href="#product">Clinic desk</a>
            <a href="#safety">Safety</a>
            <a href="#pricing">Pricing</a>
            <Link href="/desk">Open the desk</Link>
          </nav>
          <nav aria-label="Company">
            <h4>Company</h4>
            <a href="#demo">Book a demo</a>
            <a href="#faq">FAQ</a>
            <a href="mailto:hello@sehatsaathi.pk">hello@sehatsaathi.pk</a>
          </nav>
        </div>
        <div className="wrap footer-legal">
          <p>
            Sehat Saathi does not give medical diagnoses. In an emergency, call 1122 or go to the nearest hospital.
          </p>
          <p>© 2026 Sehat Saathi</p>
        </div>
      </footer>
    </div>
  );
}
