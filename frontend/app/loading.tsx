/** Shown while a screen loads, instead of a blank page. */
export default function Loading() {
  return (
    <main className="page-loading" role="status" aria-live="polite">
      <span className="page-loading-pulse" aria-hidden="true" />
      <span>Loading Sehat Saathi…</span>
    </main>
  );
}
