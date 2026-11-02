// The same skeleton index.html paints before any script runs (its styles live in index.html's
// <head>). React shows it while the first route loads, so the hand-over from the static page to the
// app never passes through a blank screen.
const rows = Array.from({ length: 6 }, (_, i) => i);

export function BootShell() {
  return (
    <div className="boot" aria-hidden="true">
      <div className="boot-rail"><i className="boot-logo" /><i className="boot-acct" /><i className="boot-nav" /><i className="boot-nav" /></div>
      <div className="boot-main">
        <div className="boot-band" />
        <div className="boot-page">
          <i className="boot-h1" /><i className="boot-sub" />
          <div className="boot-table">
            {rows.map((r) => <div key={r} className="boot-row"><i /><i /><i /><i /><i /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
