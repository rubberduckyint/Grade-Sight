// Grade Sight — Session 5: Supporting surfaces
// Assessments archive · Answer-key library · Intervention (print) · Privacy · Mobile upload

if (!window.GS) {
  window.GS = {
    paper: 'oklch(0.985 0.006 82)', paperSoft: 'oklch(0.965 0.008 82)', paperDeep: 'oklch(0.94 0.012 82)',
    rule: 'oklch(0.88 0.012 82)', ruleSoft: 'oklch(0.92 0.01 82)',
    ink: 'oklch(0.22 0.015 75)', inkSoft: 'oklch(0.42 0.015 75)', inkMute: 'oklch(0.58 0.012 75)',
    accent: 'oklch(0.42 0.09 252)', insight: 'oklch(0.72 0.12 72)',
    green: 'oklch(0.62 0.18 145)', mark: 'oklch(0.56 0.15 28)',
    serif: "'Source Serif 4', Georgia, serif", sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace", hand: "'Caveat', cursive",
  };
}
if (!window.GSLogo) {
  window.GSLogo = function GSLogo({ size = 22 }) {
    const id = 'lm5-' + size;
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <mask id={id}>
            <rect width="32" height="32" fill="white"/>
            <path d="M 7 17 Q 11 20 14 23 Q 18 17 26 5" stroke="black" strokeWidth="6.5" strokeLinecap="round" fill="none"/>
          </mask>
        </defs>
        <g mask={`url(#${id})`}><circle cx="16" cy="16" r="12" fill="none" stroke={window.GS.green} strokeWidth="2.6"/></g>
        <path d="M 7 17 Q 11 20 14 23 Q 18 17 26 5" fill="none" stroke={window.GS.green} strokeWidth="3.2" strokeLinecap="round"/>
      </svg>
    );
  };
}

function NavHeader5({ role = 'teacher', activeTab }) {
  const G = window.GS;
  const tabs = role === 'parent'
    ? [['Dashboard', 'dashboard'], ['Students', 'students'], ['History', 'history']]
    : [['Dashboard', 'dashboard'], ['Students', 'students'], ['Assessments', 'assessments'], ['Answer keys', 'keys']];
  const initials = role === 'parent' ? 'JR' : 'SR';
  return (
    <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: G.paper }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <window.GSLogo size={22}/><span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span>
        </div>
        <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
          {tabs.map(([t, k]) => (
            <div key={k} style={{ fontSize: '0.944rem', color: k === activeTab ? G.ink : G.inkSoft, fontWeight: k === activeTab ? 500 : 400, paddingBottom: 14, borderBottom: k === activeTab ? `2px solid ${G.ink}` : 'none' }}>{t}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3 }}>Upload</button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>{initials}</div>
      </div>
    </div>
  );
}

function Crumb5({ trail }) {
  const G = window.GS;
  return (
    <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>
      {trail.map((t, i) => (
        <span key={i}>{i > 0 && <span> · </span>}<span style={{ color: i === trail.length - 1 ? G.ink : G.inkMute }}>{t}</span></span>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// 1. ASSESSMENTS ARCHIVE — teacher · all uploaded quizzes, filterable
// ═════════════════════════════════════════════════════════════════════
function AssessmentsArchive() {
  const G = window.GS;

  const rows = [
    { d: 'Apr 28', cls: '4th period', t: 'Quiz 9.1 — equations review', n: 27, k: true, p: '6 / 27 lost on coefficients' },
    { d: 'Apr 26', cls: '2nd period', t: 'Unit 8 test — distributing', n: 24, k: true, p: 'Class strong; 3 sign-tracking outliers' },
    { d: 'Apr 24', cls: '4th period', t: 'Warm-up · Apr 24', n: 25, k: false, p: 'Auto-graded · mostly right' },
    { d: 'Apr 22', cls: '6th period', t: 'Quiz 8.3 — distributing & combining', n: 22, k: true, p: 'Recurring negative-distribution pattern' },
    { d: 'Apr 19', cls: '2nd period', t: 'Mid-unit check', n: 24, k: false, p: 'No key uploaded · auto-graded' },
    { d: 'Apr 16', cls: '4th period', t: 'Practice set 8.2', n: 27, k: false, p: '4 / 27 skipped problem 7' },
    { d: 'Apr 14', cls: '6th period', t: 'Quiz 8.2 — combining like terms', n: 22, k: true, p: 'Class average up 12% vs 8.1' },
    { d: 'Apr 11', cls: '2nd period', t: 'Quiz 8.1 — intro algebra', n: 24, k: true, p: 'Baseline · 8 students need follow-up' },
  ];

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1100 }}>
      <NavHeader5 role="teacher" activeTab="assessments"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <Crumb5 trail={['Assessments']}/>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <h1 style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Assessments</h1>
            <p style={{ fontSize: '1rem', color: G.inkSoft, margin: '8px 0 0' }}>Everything you've uploaded, newest first. 47 across 3 classes this term.</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Export CSV</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Upload assessment</button>
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ padding: '36px 80px 0', maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { l: 'Class', v: 'All classes ▾' },
          { l: 'Date', v: 'This term ▾' },
          { l: 'Has key', v: 'Any ▾' },
          { l: 'Pattern', v: 'Any pattern ▾' },
        ].map((f, i) => (
          <div key={i} style={{ padding: '8px 14px', border: `1px solid ${G.rule}`, borderRadius: 3, fontSize: '0.889rem', display: 'flex', gap: 10, alignItems: 'center', background: G.paper }}>
            <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>{f.l}</span>
            <span style={{ color: G.ink }}>{f.v}</span>
          </div>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ fontSize: '0.889rem', color: G.inkMute }}>{rows.length} of 47 shown</div>
      </div>

      {/* Table */}
      <div style={{ padding: '24px 80px 64px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ border: `1px solid ${G.rule}`, borderRadius: 4, overflow: 'hidden', background: G.paper }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 130px 1fr 90px 110px 1fr 100px', padding: '12px 24px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft, fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase', gap: 16 }}>
            <span>Date</span><span>Class</span><span>Title</span><span>Students</span><span>Key</span><span>Headline</span><span></span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 130px 1fr 90px 110px 1fr 100px', padding: '18px 24px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', gap: 16, alignItems: 'center', background: G.paper, fontSize: '0.944rem' }}>
              <span style={{ color: G.inkSoft }}>{r.d}</span>
              <span style={{ color: G.inkSoft }}>{r.cls}</span>
              <span style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink }}>{r.t}</span>
              <span style={{ color: G.inkSoft, fontFamily: G.mono, fontSize: '0.833rem' }}>{r.n}</span>
              <span style={{ fontSize: '0.833rem', color: r.k ? G.green : G.inkMute, fontFamily: G.mono, letterSpacing: '0.05em' }}>{r.k ? '● linked' : '○ none'}</span>
              <span style={{ color: G.inkSoft, fontStyle: 'italic', fontFamily: G.serif }}>{r.p}</span>
              <span style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase', textAlign: 'right' }}>Open ›</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 24px', borderRadius: 3 }}>Load earlier ↓</button>
        </div>
      </div>
    </div>
  );
}
window.AssessmentsArchive = AssessmentsArchive;

// ═════════════════════════════════════════════════════════════════════
// 2. ANSWER-KEY LIBRARY — teacher · reusable keys
// ═════════════════════════════════════════════════════════════════════
function AnswerKeyLibrary() {
  const G = window.GS;

  const keys = [
    { id: 'k1', t: 'Quiz 9.1 — equations review', items: 12, used: 3, last: 'Apr 28', state: 'verified' },
    { id: 'k2', t: 'Unit 8 test — distributing', items: 20, used: 1, last: 'Apr 26', state: 'verified' },
    { id: 'k3', t: 'Quiz 8.3 — distributing & combining', items: 18, used: 2, last: 'Apr 22', state: 'verified' },
    { id: 'k4', t: 'Quiz 8.2 — combining like terms', items: 14, used: 1, last: 'Apr 14', state: 'verified' },
    { id: 'k5', t: 'Practice 8.2 (no answers yet)', items: 10, used: 0, last: '—', state: 'draft' },
  ];

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1100 }}>
      <NavHeader5 role="teacher" activeTab="keys"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <Crumb5 trail={['Answer keys']}/>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <h1 style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.02em', margin: 0 }}>Answer keys</h1>
            <p style={{ fontSize: '1rem', color: G.inkSoft, margin: '8px 0 0', maxWidth: 640 }}>Upload a key once, reuse it across periods. Verifying the key once means we trust it everywhere — no re-grading by hand.</p>
          </div>
          <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Add answer key</button>
        </div>
      </div>

      {/* Grid of keys */}
      <div style={{ padding: '36px 80px 0', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
        {keys.map((k, i) => (
          <div key={k.id} style={{ border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, overflow: 'hidden' }}>
            {/* "page" preview */}
            <div style={{ height: 140, background: G.paperSoft, borderBottom: `1px solid ${G.ruleSoft}`, padding: '14px 18px', position: 'relative' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.611rem', color: G.inkMute, letterSpacing: '0.14em' }}>KEY · PAGE 1</div>
              {Array.from({ length: 6 }, (_, j) => (
                <div key={j} style={{ display: 'flex', gap: 6, marginTop: j === 0 ? 12 : 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: G.mono, fontSize: '0.611rem', color: G.inkMute }}>{j + 1}.</span>
                  <div style={{ height: 1.5, background: G.rule, width: `${30 + (j * 13) % 50}%` }}/>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: k.state === 'verified' ? G.green : G.insight, textTransform: 'uppercase' }}>{k.state === 'verified' ? '● verified' : '○ draft'}</span>
                <span style={{ fontSize: '0.833rem', color: G.inkMute }}>{k.items} items</span>
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 8, lineHeight: 1.3 }}>{k.t}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: '0.833rem', color: G.inkSoft, alignItems: 'baseline' }}>
                <span>Used {k.used}× · last {k.last}</span>
                <span style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>Open ›</span>
              </div>
            </div>
          </div>
        ))}

        {/* Add card */}
        <div style={{ border: `1.5px dashed ${G.rule}`, borderRadius: 4, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: G.inkSoft, minHeight: 280 }}>
          <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink }}>+ Add answer key</div>
          <p style={{ fontSize: '0.889rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.5, margin: 0 }}>Photo, PDF, or type answers in. Verify once, reuse forever.</p>
        </div>
      </div>

      {/* "Why this exists" footer note — quietly positioning the value */}
      <div style={{ padding: '56px 80px 80px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ borderTop: `1px solid ${G.ruleSoft}`, paddingTop: 32, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Why a key library</div>
          <div style={{ fontFamily: G.serif, fontSize: '1.222rem', color: G.inkSoft, lineHeight: 1.5, fontWeight: 300 }}>
            Without a key, Grade Sight reads what the teacher wrote. With a key, it can grade fresh, find subtler errors, and give parents a real "why" — not just "what was marked."
            <span style={{ color: G.ink }}> Most teachers upload one key per quiz; we use it across every section.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
window.AnswerKeyLibrary = AnswerKeyLibrary;

// ═════════════════════════════════════════════════════════════════════
// 3. INTERVENTION CARD — print-ready single page (8.5×11)
// ═════════════════════════════════════════════════════════════════════
function InterventionCard() {
  const G = window.GS;
  // 8.5 x 11 at 96dpi = 816 x 1056. Keep proportions; show as printable page.

  return (
    <div style={{ background: G.paperDeep, padding: 40, fontFamily: G.sans, minHeight: 1180 }}>
      {/* Print controls (would not appear on actual print) */}
      <div style={{ maxWidth: 816, margin: '0 auto 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Crumb5 trail={['Quiz 8.3', 'Marcus', 'Intervention sheet']}/>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.inkSoft, background: G.paper, border: `1px solid ${G.rule}`, padding: '8px 14px', borderRadius: 3 }}>Email to teacher</button>
          <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 16px', borderRadius: 3 }}>Print</button>
        </div>
      </div>

      {/* The page itself */}
      <div style={{ width: 816, margin: '0 auto', background: G.paper, boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.08)', padding: '64px 72px', minHeight: 1056, position: 'relative' }}>
        {/* Letterhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${G.ink}`, paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <window.GSLogo size={20}/>
            <span style={{ fontFamily: G.serif, fontSize: '1.111rem', fontWeight: 500 }}>Grade Sight</span>
          </div>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Intervention sheet · April 28, 2026</div>
        </div>

        {/* Title */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>For: Marcus Reilly · Algebra I, 6th period · Mr. Reyes</div>
          <h1 style={{ fontFamily: G.serif, fontSize: '2.111rem', fontWeight: 400, letterSpacing: '-0.014em', lineHeight: 1.18, marginTop: 14, marginBottom: 0 }}>
            Distributing a negative across parentheses.
          </h1>
          <p style={{ fontFamily: G.serif, fontSize: '1.111rem', fontStyle: 'italic', color: G.inkSoft, margin: '12px 0 0' }}>
            Five-minute review. One worked example, three to try, an answer strip at the bottom.
          </p>
        </div>

        {/* The pattern explained */}
        <div style={{ marginTop: 28, padding: '20px 24px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderLeft: `3px solid ${G.accent}`, borderRadius: 3 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>The thing to remember</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, lineHeight: 1.55, margin: '8px 0 0' }}>
            When a minus sign sits in front of parentheses, it multiplies <em>every</em> term inside — not just the first one. <strong style={{ fontWeight: 500 }}>−2(x − 3)</strong> means <strong style={{ fontWeight: 500 }}>−2·x + (−2)·(−3)</strong>, which is <strong style={{ fontWeight: 500 }}>−2x + 6</strong>.
          </p>
        </div>

        {/* Worked example */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Worked example</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 12 }}>
            <div style={{ padding: '18px 20px', border: `1px solid ${G.ruleSoft}`, borderRadius: 3 }}>
              <div style={{ fontSize: '0.833rem', color: G.inkMute, fontFamily: G.mono, letterSpacing: '0.05em' }}>WHAT MARCUS WROTE</div>
              <div style={{ fontFamily: G.hand, fontSize: '1.444rem', color: G.inkSoft, lineHeight: 1.5, marginTop: 8 }}>
                <div>−2(x − 3) + 5x</div>
                <div>= −2x − 6 + 5x</div>
                <div>= 3x − 6</div>
              </div>
            </div>
            <div style={{ padding: '18px 20px', border: `1px solid ${G.ink}`, borderRadius: 3 }}>
              <div style={{ fontSize: '0.833rem', color: G.ink, fontFamily: G.mono, letterSpacing: '0.05em' }}>WHAT IT SHOULD BE</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', lineHeight: 1.6, marginTop: 8 }}>
                <div>−2(x − 3) + 5x</div>
                <div>= −2x <strong style={{ color: G.accent }}>+ 6</strong> + 5x</div>
                <div>= 3x + 6</div>
              </div>
            </div>
          </div>
        </div>

        {/* Practice problems */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Try these — three minutes</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              '−3(x − 4) + 2x',
              '5 − 2(y − 1)',
              '−(a − 6b) + a',
            ].map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 14, paddingBottom: 18, borderBottom: `1px solid ${G.ruleSoft}` }}>
                <span style={{ fontFamily: G.serif, fontSize: '1.222rem', fontStyle: 'italic', color: G.inkMute, minWidth: 28 }}>{i + 1}.</span>
                <span style={{ fontFamily: G.serif, fontSize: '1.222rem', minWidth: 200 }}>{q}</span>
                <span style={{ flex: 1, borderBottom: `1px dotted ${G.rule}`, height: 24 }}/>
              </div>
            ))}
          </div>
        </div>

        {/* Answer strip */}
        <div style={{ marginTop: 36, padding: '14px 20px', background: G.paperDeep, borderRadius: 3, transform: 'rotate(-0.3deg)' }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Fold to check ↓</div>
          <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 6, color: G.inkSoft }}>
            1. −x + 12 &nbsp;&nbsp; 2. 7 − 2y &nbsp;&nbsp; 3. 6b
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 40, left: 72, right: 72, paddingTop: 14, borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.778rem', color: G.inkMute, fontFamily: G.mono, letterSpacing: '0.06em' }}>
          <span>From Quiz 8.3 · gradesight.com/r/m-reilly-apr28</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
window.InterventionCard = InterventionCard;

// ═════════════════════════════════════════════════════════════════════
// 4. PRIVACY / DATA CONTROLS — quiet, declarative, scannable
// ═════════════════════════════════════════════════════════════════════
function PrivacyControls() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1100 }}>
      <NavHeader5 role="parent" activeTab="dashboard"/>

      {/* Editorial header */}
      <div style={{ padding: '64px 80px 0', maxWidth: 920, margin: '0 auto' }}>
        <Crumb5 trail={['Settings', 'Privacy & data']}/>
        <h1 style={{ fontFamily: G.serif, fontSize: '3rem', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 14, lineHeight: 1.1 }}>
          What we keep, and for how long.
        </h1>
        <p style={{ fontFamily: G.serif, fontSize: '1.333rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 720, margin: 0 }}>
          Plain English. Edit anything below at any time. Deleting a quiz removes it from our servers within 24 hours.
        </p>
      </div>

      {/* Sections */}
      <div style={{ padding: '56px 80px 80px', maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {[
          {
            eb: 'WHAT WE STORE',
            t: 'Quiz photos, the diagnosis, your child\'s name.',
            d: 'Photos are encrypted. The diagnosis (what we found, what the pattern was) is plain JSON. Your child\'s name lives only on your account — we don\'t share it with anyone.',
          },
          {
            eb: 'WHAT WE NEVER STORE',
            t: 'Faces. School names. Anything not on the quiz.',
            d: 'If a photo includes a face or a school logo by accident, our processor blurs it before storing. We don\'t ask for or keep school identifiers.',
          },
          {
            eb: 'HOW LONG',
            t: '30 days by default. You can shorten it.',
            d: 'After 30 days the photos auto-delete. The diagnosis (text only) stays in your history so longitudinal tracking works — unless you delete that too.',
          },
          {
            eb: 'AI TRAINING',
            t: 'Off. We don\'t train on your child\'s work.',
            d: 'Period. This is enforced at the database level, not a setting we can flip.',
          },
        ].map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 32, paddingBottom: 32, borderBottom: i < 3 ? `1px solid ${G.ruleSoft}` : 'none' }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase', paddingTop: 6 }}>{s.eb}</div>
            <div>
              <div style={{ fontFamily: G.serif, fontSize: '1.667rem', fontWeight: 500, letterSpacing: '-0.012em', lineHeight: 1.25 }}>{s.t}</div>
              <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, lineHeight: 1.55, margin: '10px 0 0', maxWidth: 600 }}>{s.d}</p>
            </div>
          </div>
        ))}

        {/* Controls */}
        <div style={{ marginTop: 12, padding: '32px 36px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4 }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>YOUR CONTROLS</div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { l: 'Photo retention', v: '30 days', alt: 'Change' },
              { l: 'Diagnosis history', v: 'Keep until I delete', alt: 'Change' },
              { l: 'Email when a quiz is processed', v: 'On', alt: 'Turn off' },
              { l: 'Share read-only access with second parent', v: 'Off', alt: 'Invite' },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < 3 ? `1px solid ${G.ruleSoft}` : 'none' }}>
                <div>
                  <div style={{ fontSize: '1rem', color: G.ink }}>{c.l}</div>
                  <div style={{ fontSize: '0.889rem', color: G.inkSoft, fontFamily: G.serif, marginTop: 2 }}>{c.v}</div>
                </div>
                <span style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>{c.alt} ›</span>
              </div>
            ))}
          </div>
        </div>

        {/* Destructive actions */}
        <div style={{ display: 'flex', gap: 14, paddingTop: 12 }}>
          <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '12px 20px', borderRadius: 3 }}>Download everything we have on you (.zip)</button>
          <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.mark, background: 'transparent', border: `1px solid ${G.mark}`, padding: '12px 20px', borderRadius: 3 }}>Delete account &amp; all data</button>
        </div>
      </div>
    </div>
  );
}
window.PrivacyControls = PrivacyControls;

// ═════════════════════════════════════════════════════════════════════
// 5. MOBILE — upload flow at 375w. The actual moment a parent uses.
// ═════════════════════════════════════════════════════════════════════
function MobileUpload() {
  const G = window.GS;

  // Three states: empty / capturing / processing — shown in iPhone-ish frames
  function Phone({ children, label }) {
    return (
      <div>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>{label}</div>
        <div style={{ width: 375, height: 760, background: '#000', borderRadius: 44, padding: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
          <div style={{ width: '100%', height: '100%', background: G.paper, borderRadius: 36, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* status bar */}
            <div style={{ height: 44, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, fontWeight: 600, color: G.ink, fontFamily: G.sans }}>
              <span>9:41</span>
              <span style={{ fontFamily: G.mono, letterSpacing: '0.05em' }}>● ● ● ● ●</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: G.paperDeep, padding: '48px 40px', fontFamily: G.sans, minHeight: 900 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Crumb5 trail={['Mobile · 375w', 'Upload flow']}/>
        <h1 style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.014em', marginTop: 12, marginBottom: 8 }}>The moment a parent actually uses this.</h1>
        <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, fontWeight: 300, maxWidth: 640, margin: 0 }}>Standing at the kitchen counter, kid's quiz on the table, phone in one hand. Three taps, no thinking required.</p>

        <div style={{ display: 'flex', gap: 32, marginTop: 40, flexWrap: 'wrap', justifyContent: 'center' }}>

          {/* PHONE 1 — empty / start */}
          <Phone label="01 · Open">
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <window.GSLogo size={20}/>
                <span style={{ fontFamily: G.serif, fontSize: '1.111rem', fontWeight: 500 }}>Grade Sight</span>
              </div>
              <div style={{ marginTop: 36 }}>
                <div style={{ fontFamily: G.mono, fontSize: '0.611rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>FOR MARCUS</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.667rem', fontWeight: 400, lineHeight: 1.2, marginTop: 8, letterSpacing: '-0.012em' }}>What did the teacher hand back today?</div>
              </div>

              <button style={{ marginTop: 32, background: G.ink, color: G.paper, border: 'none', borderRadius: 6, padding: '20px 16px', fontFamily: G.sans, fontSize: '1.056rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>📷</span>
                Take photos of the quiz
              </button>
              <button style={{ marginTop: 12, background: 'transparent', color: G.ink, border: `1px solid ${G.rule}`, borderRadius: 6, padding: '16px 16px', fontFamily: G.sans, fontSize: '1rem' }}>
                Choose from camera roll
              </button>

              <div style={{ marginTop: 'auto', marginBottom: 12, fontSize: '0.778rem', color: G.inkMute, textAlign: 'center', lineHeight: 1.5 }}>
                Auto-deleted after 30 days. <br/>Faces and names blurred before saving.
              </div>
            </div>
          </Phone>

          {/* PHONE 2 — capture */}
          <Phone label="02 · Capture">
            <div style={{ position: 'relative', height: '100%', background: '#1a1815' }}>
              {/* fake camera viewfinder */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, oklch(0.32 0.012 75) 0%, oklch(0.18 0.01 75) 100%)' }}/>
              {/* paper edges */}
              <div style={{ position: 'absolute', top: 80, left: 28, right: 28, bottom: 200, border: '2px dashed oklch(0.95 0.01 82 / 0.6)', borderRadius: 6, background: 'oklch(0.96 0.01 82 / 0.08)' }}>
                {/* fake quiz lines inside */}
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} style={{ height: 2, background: 'oklch(0.95 0.01 82 / 0.35)', marginTop: i === 0 ? 24 : 18, marginLeft: 16, marginRight: 16 + (i * 17) % 80 }}/>
                ))}
              </div>

              {/* hint */}
              <div style={{ position: 'absolute', top: 32, left: 0, right: 0, textAlign: 'center', fontFamily: G.serif, fontSize: '1.111rem', color: 'oklch(0.96 0.01 82)', fontWeight: 400 }}>
                Hold steady — we'll snap it
              </div>

              {/* page count chip */}
              <div style={{ position: 'absolute', top: 90, right: 40, padding: '6px 12px', background: 'oklch(0 0 0 / 0.6)', borderRadius: 999, color: G.paper, fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em' }}>PAGE 2 OF 4</div>

              {/* shutter */}
              <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 36 }}>
                <div style={{ width: 56, height: 56, borderRadius: 6, background: G.paper, border: `2px solid ${G.paper}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <div style={{ fontFamily: G.mono, fontSize: '0.722rem', color: G.ink, fontWeight: 600 }}>1</div>
                </div>
                <div style={{ width: 76, height: 76, borderRadius: '50%', background: G.paper, border: '4px solid #888' }}/>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'transparent', border: `1.5px solid oklch(0.96 0.01 82)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: G.paper, fontFamily: G.serif, fontSize: '0.944rem' }}>Done</div>
              </div>
            </div>
          </Phone>

          {/* PHONE 3 — processing → result preview */}
          <Phone label="03 · Reading">
            <div style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.611rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>READING THE QUIZ</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.444rem', fontWeight: 400, lineHeight: 1.25, marginTop: 10, letterSpacing: '-0.012em' }}>
                We're working through Marcus's paper.
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '1rem', color: G.inkSoft, marginTop: 8, fontWeight: 300 }}>
                Usually about 30 seconds. You can close this app — we'll save the result.
              </div>

              {/* page thumbnails being processed */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 24 }}>
                {[1, 2, 3, 4].map((n, i) => (
                  <div key={n} style={{ aspectRatio: '8.5 / 11', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 3, padding: '8px 10px', position: 'relative', overflow: 'hidden' }}>
                    {Array.from({ length: 6 }, (_, k) => (
                      <div key={k} style={{ height: 1, background: G.ruleSoft, marginTop: k === 0 ? 8 : 6, width: `${50 + (k * 11) % 40}%` }}/>
                    ))}
                    {i <= 1 && <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 9, color: G.green }}>✓</div>}
                    {i === 2 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: G.accent }}/>}
                  </div>
                ))}
              </div>

              {/* steps */}
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { state: 'done', label: 'Reading the marks' },
                  { state: 'doing', label: 'Looking at where Marcus went off' },
                  { state: 'todo', label: 'Naming the pattern' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.889rem', color: s.state === 'doing' ? G.ink : s.state === 'todo' ? G.inkMute : G.inkSoft, fontFamily: G.serif, fontStyle: s.state === 'doing' ? 'italic' : 'normal' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${s.state === 'done' ? G.accent : G.rule}`, background: s.state === 'done' ? G.accent : 'transparent' }}/>
                    {s.label}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 'auto', marginBottom: 6, fontSize: '0.722rem', color: G.inkMute, textAlign: 'center' }}>
                Encrypted · auto-deleted in 30 days
              </div>
            </div>
          </Phone>

        </div>
      </div>
    </div>
  );
}
window.MobileUpload = MobileUpload;

// ═════════════════════════════════════════════════════════════════════
// CONTEXT CARD — what's in this session
// ═════════════════════════════════════════════════════════════════════
function ContextCard5() {
  const G = window.GS;
  return (
    <div style={{ background: G.paperSoft, padding: '40px 48px', minHeight: 600, fontFamily: G.sans }}>
      <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Session 05 · supporting surfaces</div>
      <h2 style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 22, maxWidth: 760, lineHeight: 1.2 }}>
        The surfaces that don't sell the product but make it real.
      </h2>
      <p style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 720, margin: 0 }}>
        Hero screens convince people. These are what they live in: a list of every quiz, a library of keys, a sheet to print, a place to delete it all, and the actual phone in their hand.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 28 }}>
        {[
          { eb: 'ARCHIVE', t: 'Assessments list.', d: 'Newest-first. Filterable by class, date, key state, pattern. Each row\'s "headline" pre-summarizes the diagnosis so teachers can scan a stack.' },
          { eb: 'LIBRARY', t: 'Answer keys.', d: 'Reusable across periods. Verified state shown explicitly. Footer note quietly explains why a key matters at all.' },
          { eb: 'PRINT', t: 'Intervention sheet.', d: '8.5×11, single page. Pattern explanation → worked example → three to try → fold-to-check answer strip. Designed to be the artifact a parent hands to a kid.' },
          { eb: 'PRIVACY', t: 'Plain-English controls.', d: 'Four "what we keep" sections, then a controls block. AI training off, immutable. Download-everything and delete-account as first-class actions.' },
          { eb: 'MOBILE', t: 'Three phones.', d: 'Open · capture · reading. Editorial copy survives at 375w. Camera viewfinder is the centerpiece — this is where the product actually lives.' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '20px 22px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 4 }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>{c.eb}</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 8 }}>{c.t}</div>
            <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5, margin: '8px 0 0' }}>{c.d}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, padding: '22px 26px', background: G.paper, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, maxWidth: 920 }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>What's left after this</div>
        <ul style={{ marginTop: 10, fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.6 }}>
          <li><strong style={{ color: G.ink }}>Session 06 — Handoff:</strong> single shareable canvas linking every screen, plus a Claude-Code-ready handoff doc (component map, design tokens, copy deck).</li>
        </ul>
      </div>
    </div>
  );
}
window.ContextCard5 = ContextCard5;
