"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, PAY_METHOD_LABEL, rupees, type Case, type Charge, type PayMethod, type Prices } from "../lib/api";

/** Help first, money after: fees appear only once a trip ended at hospital or a visit was booked. */
export default function PaymentPanel({
  c,
  staff,
  onChanged,
}: {
  c: Case;
  staff: string;
  onChanged: (msg: string) => void;
}) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [method, setMethod] = useState<Record<number, PayMethod>>({});
  const [visitAmount, setVisitAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.charges(c.id).then(setCharges).catch(() => {});
  }, [c.id]);

  useEffect(() => {
    load();
    api.prices().then(setPrices).catch(() => {});
    const t = setInterval(load, 6000); // a trip reaching hospital adds its fee
    return () => clearInterval(t);
  }, [load]);

  const hasVisitFee = charges.some((x) => x.kind === "visit");
  if (charges.length === 0 && c.status !== "approved") return null;

  async function act(fn: () => Promise<unknown>, msg: string) {
    if (!staff.trim()) return setError("Add your name in the top bar first.");
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged(msg);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel glass payment">
      <h3>Payment, after the service</h3>
      {charges.length === 0 && <p className="muted">Nothing to pay yet.</p>}
      <ul className="fees">
        {charges.map((f) => (
          <li key={f.id} className={`fee fee-${f.status}`}>
            <div className="fee-main">
              <b>{rupees(f.amount_pkr)}</b>
              <span>{f.description}</span>
              <span className={`fee-tag ${f.status}`}>
                {f.status === "due"
                  ? "Due"
                  : f.status === "paid"
                    ? `Paid, ${PAY_METHOD_LABEL[f.method as PayMethod] ?? f.method}`
                    : "Waived"}
              </span>
            </div>
            {f.status === "due" && (
              <div className="fee-actions">
                <select
                  value={method[f.id] ?? "cash"}
                  onChange={(e) => setMethod((m) => ({ ...m, [f.id]: e.target.value as PayMethod }))}
                  aria-label="How it was paid"
                >
                  {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((k) => (
                    <option key={k} value={k}>
                      {PAY_METHOD_LABEL[k]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.settleCharge(f.id, staff, "paid", method[f.id] ?? "cash"), `${rupees(f.amount_pkr)} marked paid`)
                  }
                >
                  Mark paid
                </button>
                <button
                  className="btn btn-quiet"
                  disabled={busy}
                  onClick={() => act(() => api.settleCharge(f.id, staff, "waived", null), "Fee waived")}
                >
                  Waive
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {c.status === "approved" && !hasVisitFee && (
        <div className="fee-add">
          <label htmlFor={`visit-${c.id}`}>Visit fee (Rs)</label>
          <input
            id={`visit-${c.id}`}
            inputMode="numeric"
            value={visitAmount}
            onChange={(e) => setVisitAmount(e.target.value.replace(/[^\d]/g, ""))}
            placeholder={prices ? String(prices.visit_fee_pkr) : "500"}
          />
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() =>
              act(
                () => api.addVisitFee(c.id, staff, visitAmount ? Number(visitAmount) : null),
                "Visit fee added. The patient sees it on their status page.",
              )
            }
          >
            Add visit fee
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <p className="muted fine">
        Fees appear only after help was given. Asking for help and 1122 advice are always free. Waive any fee for
        patients who can&apos;t pay.
      </p>
    </div>
  );
}
