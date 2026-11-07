/** Static, illustrative picture of the clinic desk for the marketing page. */
const QUEUE = [
  { name: "Rashid Ahmed", sum: "Chest pain, sweating (age 62, for 20 min)", u: "urgent", t: "1 min", call: true },
  { name: "Nadia Khan", sum: "High fever, vomiting (age 4, since last night)", u: "today", t: "4 min" },
  { name: "Bilal Hussain", sum: "Skin rash, itching (for 1 week)", u: "routine", t: "12 min" },
  { name: "Farah Siddiqui", sum: "Blood pressure follow-up visit", u: "routine", t: "26 min" },
] as const;

const LABEL = { urgent: "Urgent", today: "See today", routine: "Routine" } as const;

export default function DeskPreview() {
  return (
    <div className="browser" role="img" aria-label="Preview of the Sehat Saathi clinic desk">
      <div className="browser-bar">
        <span />
        <span />
        <span />
        <div className="browser-url">desk.sehatsaathi.pk</div>
      </div>
      <div className="dp">
        <div className="dp-stats">
          <div>
            <b>4</b>
            <small>Waiting</small>
          </div>
          <div className="alarm">
            <b>1</b>
            <small>Urgent</small>
          </div>
          <div>
            <b>18</b>
            <small>Booked today</small>
          </div>
          <div>
            <b>2.4 min</b>
            <small>Avg. review</small>
          </div>
        </div>
        <div className="dp-body">
          <ul className="dp-queue">
            {QUEUE.map((q, i) => (
              <li key={q.name} className={`u-${q.u}${i === 0 ? " active" : ""}`}>
                <div className="dp-row">
                  <strong>{q.name}</strong>
                  <small>{q.t}</small>
                </div>
                <p>{q.sum}</p>
                <div className="dp-row">
                  <span className={`tag tag-${q.u}`}>{LABEL[q.u]}</span>
                  {"call" in q && <span className="callback-flag">Call back</span>}
                </div>
              </li>
            ))}
          </ul>
          <div className="dp-detail">
            <div className="dp-head">
              <strong>Rashid Ahmed</strong>
              <span className="tag tag-urgent">Urgent</span>
            </div>
            <div className="dp-alert">Danger signs. Duty doctor alerted, call back now.</div>
            <div className="dp-card">
              <small>Patient&apos;s message</small>
              <p>Mere abbu ko 20 minute se seene mein dard hai aur paseena aa raha hai, umar 62 saal</p>
            </div>
            <div className="dp-card dashed">
              <small>AI suggestion, not a diagnosis</small>
              <p>Chest pain, sweating (age 62, for 20 min).</p>
              <div className="flags">
                <span className="flag">Chest pain</span>
                <span className="flag">Sweating</span>
              </div>
            </div>
            <div className="dp-actions">
              <span className="dp-select">Today, 9:45 am, Dr. Ayesha Malik (held by AI)</span>
              <span className="btn btn-primary dp-btn">Approve booking</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
