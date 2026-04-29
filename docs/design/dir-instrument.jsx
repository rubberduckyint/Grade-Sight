// Direction 2 — "The Instrument"
// Product-forward. Shows the diagnosed assessment and UI chrome in the hero.
// Closest to Linear / Stripe. Pushes hardest on "capable."

function DirInstrument() {
  const G = window.GL;
  const W = 1200;

  const page = {
    width: W,
    background: G.paper,
    color: G.ink,
    fontFamily: G.sans,
    fontSize: 14,
    lineHeight: 1.55,
  };

  const nav = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 40px',
    background: G.paper,
    borderBottom: `1px solid ${G.ruleSoft}`,
    fontSize: 13,
  };

  const eyebrow = { fontFamily: G.mono, fontSize: 11, color: G.accent, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 };

  return (
    <div style={page}>
      {/* NAV */}
      <nav style={nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="none" stroke={G.ink} strokeWidth="1.4"/><circle cx="9" cy="9" r="3" fill={G.ink}/></svg>
            <span className="gl-serif" style={{ fontSize: 17, fontWeight: 500 }}>Grade Sight</span>
          </div>
          <div style={{ display: 'flex', gap: 24, color: G.inkSoft, fontSize: 13 }}>
            <span>Product</span><span>For teachers</span><span>For parents</span><span>Privacy</span><span>Pricing</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: G.inkSoft }}>Sign in</span>
          <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '7px 14px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Try free</button>
        </div>
      </nav>

      {/* HERO — product screenshot forward */}
      <div style={{ padding: '72px 40px 0', textAlign: 'center' }}>
        <div style={{ ...eyebrow, color: G.inkMute, marginBottom: 20 }}>DIAGNOSTIC GRADING · ALGEBRA THROUGH PRE-CALC</div>
        <h1 className="gl-serif" style={{ fontSize: 60, lineHeight: 1.05, fontWeight: 400, margin: '0 auto 20px', letterSpacing: '-0.025em', maxWidth: 880 }}>
          A grading tool that tells you <span className="gl-serif-italic" style={{ color: G.accent }}>why</span>, not just what.
        </h1>
        <p className="gl-serif" style={{ fontSize: 19, lineHeight: 1.5, color: G.inkSoft, maxWidth: 620, margin: '0 auto 32px', fontWeight: 300 }}>
          Upload a math assessment. Grade Sight reads the work, classifies each error by type, and surfaces the patterns that matter across a student — or an entire class.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 60 }}>
          <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Try with a photo →</button>
          <button style={{ background: 'transparent', color: G.ink, border: `1px solid ${G.rule}`, padding: '12px 22px', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Watch the 60-second demo</button>
        </div>

        {/* Product screenshot — the Instrument */}
        <ProductScreenshot />
      </div>

      {/* LOGO STRIP — subtle, no institutional slop */}
      <div style={{ padding: '64px 40px 40px', textAlign: 'center' }}>
        <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 20 }}>USED BY MATH TEACHERS AT</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 56, color: G.inkSoft, fontSize: 14, fontFamily: G.serif, fontWeight: 500, letterSpacing: '-0.005em', flexWrap: 'wrap' }}>
          <span>Berkeley High</span><span>Stuyvesant</span><span>Lakeside</span><span>Horace Mann</span><span>Marin Academy</span><span>Exeter</span>
        </div>
      </div>

      {/* FEATURES — three-up with mini UI screenshots */}
      <div style={{ padding: '80px 40px', borderTop: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 72, alignItems: 'start', marginBottom: 72 }}>
          <div>
            <div style={eyebrow}>Capability · 01</div>
            <h2 className="gl-serif" style={{ fontSize: 36, lineHeight: 1.15, margin: '0 0 18px', fontWeight: 400, letterSpacing: '-0.02em' }}>Every error gets a name.</h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 15.5, lineHeight: 1.65, maxWidth: 420 }}>
              Four diagnostic categories — concept, execution, verification, strategy — applied to every problem. Color-coded, citable, overrideable by the teacher.
            </p>
          </div>
          <DiagnosticLegend />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 72, alignItems: 'start', marginBottom: 72 }}>
          <ClassHeatmap />
          <div>
            <div style={eyebrow}>Capability · 02</div>
            <h2 className="gl-serif" style={{ fontSize: 36, lineHeight: 1.15, margin: '0 0 18px', fontWeight: 400, letterSpacing: '-0.02em' }}>Class patterns, not just student ones.</h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 15.5, lineHeight: 1.65, maxWidth: 420 }}>
              When you upload a whole class's quiz, Grade Sight rolls up the diagnostic categories by student and by problem. The gap you need to reteach tomorrow is already circled.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 72, alignItems: 'start' }}>
          <div>
            <div style={eyebrow}>Capability · 03</div>
            <h2 className="gl-serif" style={{ fontSize: 36, lineHeight: 1.15, margin: '0 0 18px', fontWeight: 400, letterSpacing: '-0.02em' }}>Interventions, not just reports.</h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 15.5, lineHeight: 1.65, maxWidth: 420 }}>
              When a pattern is named, Grade Sight proposes a short framework a student can actually carry in their head. Print-ready. Two weeks, one habit.
            </p>
          </div>
          <InterventionPeek />
        </div>
      </div>

      {/* STATS — restrained numerals */}
      <div style={{ padding: '72px 40px', borderTop: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
          {[
            { n: '52%', t: 'Median time saved per quiz stack, reported by teachers in the first month.' },
            { n: '4', t: 'Diagnostic categories. No more, no fewer — enough to name the pattern, few enough to remember.' },
            { n: '$24', t: 'Per month for teachers. Free for parents on first three diagnoses. No school purchase order required.' },
          ].map((s, i) => (
            <div key={i} style={{ borderTop: `1px solid ${G.rule}`, paddingTop: 24 }}>
              <div className="gl-serif" style={{ fontSize: 64, fontWeight: 300, lineHeight: 1, margin: '0 0 18px', letterSpacing: '-0.03em' }}>{s.n}</div>
              <div style={{ color: G.inkSoft, fontSize: 14.5, lineHeight: 1.55, maxWidth: 320 }}>{s.t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PARENT vs TEACHER toggle */}
      <div style={{ padding: '96px 40px', borderTop: `1px solid ${G.ruleSoft}` }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={eyebrow}>One product, two modes</div>
          <h2 className="gl-serif" style={{ fontSize: 42, lineHeight: 1.15, fontWeight: 400, margin: '0 auto', letterSpacing: '-0.025em', maxWidth: 720 }}>
            The same diagnosis, told differently to the person holding the phone.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 40 }}>
          <ModeCard kind="parent" />
          <ModeCard kind="teacher" />
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '96px 40px', textAlign: 'center', background: G.ink, color: G.paper }}>
        <h2 className="gl-serif" style={{ fontSize: 48, lineHeight: 1.1, fontWeight: 400, margin: '0 auto 20px', letterSpacing: '-0.025em', maxWidth: 680 }}>
          Diagnose your first assessment in under a minute.
        </h2>
        <p style={{ color: 'oklch(0.75 0.01 75)', fontSize: 16, margin: '0 auto 32px', maxWidth: 520 }}>
          No credit card. No student names required. No data shared — ever.
        </p>
        <button style={{ background: G.paper, color: G.ink, border: 'none', padding: '14px 28px', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Upload a photo →</button>
      </div>

      {/* Footer */}
      <div style={{ padding: '36px 40px', borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: G.inkMute }}>
        <span>© 2026 Grade Sight</span>
        <div style={{ display: 'flex', gap: 24 }}><span>Privacy</span><span>Security</span><span>Contact</span></div>
      </div>
    </div>
  );
}

// The hero product screenshot — an app window with a diagnosed assessment
function ProductScreenshot() {
  const G = window.GL;
  return (
    <div style={{
      width: '100%',
      maxWidth: 1080,
      margin: '0 auto',
      background: G.paper,
      border: `1px solid ${G.rule}`,
      borderRadius: 8,
      boxShadow: '0 2px 0 rgba(0,0,0,.02), 0 40px 80px -40px rgba(60,40,20,.28), 0 0 0 1px rgba(0,0,0,.02)',
      overflow: 'hidden',
      textAlign: 'left',
    }}>
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'oklch(0.82 0.03 28)' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'oklch(0.86 0.03 82)' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'oklch(0.84 0.03 148)' }} />
        <div style={{ flex: 1, textAlign: 'center', fontFamily: G.mono, fontSize: 11, color: G.inkMute }}>gradesight.app / Maya R. / Unit 4 Quiz</div>
      </div>

      {/* App body */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 300px', minHeight: 500 }}>
        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${G.ruleSoft}`, padding: '18px 14px', background: G.paperSoft, fontSize: 12.5 }}>
          <div style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>MAYA R. · 10TH</div>
          {['Unit 4 Quiz', 'Chapter Test 3', 'Mid-Ch. Quiz', 'Homework 4.2', 'Diagnostic pre-test'].map((x, i) => (
            <div key={x} style={{ padding: '7px 10px', borderRadius: 3, background: i === 0 ? G.accentSoft : 'transparent', color: i === 0 ? G.accent : G.ink, fontWeight: i === 0 ? 500 : 400, marginBottom: 2 }}>{x}</div>
          ))}
          <div style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.12em', margin: '22px 0 10px' }}>ACTIVE PATTERNS</div>
          {[['Sign errors', G.mark], ['Skipped check', G.insight], ['Combining terms', G.inkSoft]].map(([t, c]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span>{t}</span>
            </div>
          ))}
        </div>

        {/* Main — the assessment */}
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'start', background: G.paperDeep }}>
          <window.AssessmentMock width={340} height={460} />
        </div>

        {/* Right rail — diagnosis panel */}
        <div style={{ borderLeft: `1px solid ${G.ruleSoft}`, padding: '18px 18px', fontSize: 13 }}>
          <div style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 14 }}>DIAGNOSIS · PROBLEM 2</div>
          <div style={{ padding: '10px 12px', borderLeft: `2px solid ${G.mark}`, background: 'oklch(0.97 0.02 28)', marginBottom: 16, fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Execution — sign error</div>
            <div style={{ color: G.inkSoft, fontSize: 12 }}>Distributed −2 as +10 instead of −10.</div>
          </div>
          <div className="gl-serif" style={{ fontSize: 14, lineHeight: 1.5, color: G.ink, marginBottom: 16 }}>
            This is the <span className="gl-serif-italic">third</span> time Maya has flipped a sign while distributing a negative over parentheses. Pattern is recurring.
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.12em', margin: '18px 0 10px' }}>SUGGESTED INTERVENTION</div>
          <div style={{ border: `1px solid ${G.rule}`, padding: '10px 12px', borderRadius: 2 }}>
            <div className="gl-serif" style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>The Negative Check</div>
            <div style={{ color: G.inkSoft, fontSize: 12, lineHeight: 1.45 }}>A one-line habit to catch sign flips before the next line of work.</div>
            <div style={{ marginTop: 10, color: G.accent, fontSize: 12 }}>Open card →</div>
          </div>
          <div style={{ marginTop: 16, fontSize: 11.5, color: G.inkMute }}>
            Confidence: <span style={{ color: G.ink }}>high</span> · Agree? <span style={{ color: G.accent, textDecoration: 'underline' }}>Teacher override</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticLegend() {
  const G = window.GL;
  const cats = [
    { c: G.mark, k: 'Execution', t: 'Sign errors, arithmetic slips, transcription' },
    { c: G.accent, k: 'Concept', t: 'Underlying rule or relationship not settled' },
    { c: G.insight, k: 'Verification', t: 'No sanity check, no second route' },
    { c: G.inkSoft, k: 'Strategy', t: 'Path-planning fragile, skipped steps' },
  ];
  return (
    <div style={{ border: `1px solid ${G.rule}`, borderRadius: 3, padding: '20px 22px', background: G.paper }}>
      <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.1em', marginBottom: 14 }}>FOUR CATEGORIES</div>
      {cats.map(c => (
        <div key={c.k} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 14, padding: '12px 0', borderTop: `1px solid ${G.ruleSoft}`, alignItems: 'start' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: c.c, marginTop: 6 }} />
          <div>
            <div className="gl-serif" style={{ fontSize: 15, fontWeight: 500 }}>{c.k}</div>
            <div style={{ fontSize: 12.5, color: G.inkSoft, marginTop: 2 }}>{c.t}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassHeatmap() {
  const G = window.GL;
  // Mock 6 students x 8 problems; 0=correct, 1=execution, 2=concept, 3=verification
  const rows = [
    [0, 0, 1, 0, 2, 0, 0, 1],
    [0, 1, 1, 0, 2, 0, 1, 0],
    [0, 0, 0, 0, 2, 0, 0, 0],
    [0, 0, 1, 0, 2, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 2, 0, 0, 1],
  ];
  const names = ['Maya R.', 'Jordan P.', 'Alex K.', 'Sam T.', 'Priya M.', 'Eli W.'];
  const colorFor = (v) => v === 0 ? G.paperDeep : v === 1 ? G.mark : v === 2 ? G.accent : G.insight;

  return (
    <div style={{ border: `1px solid ${G.rule}`, borderRadius: 3, padding: '20px 22px', background: G.paper }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.1em', marginBottom: 14 }}>
        <span>CLASS PATTERN · ALG II · PD. 3</span>
        <span>Q1–Q8</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 14, padding: '6px 0', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: G.ink }}>{names[i]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {row.map((v, j) => <div key={j} style={{ height: 22, background: colorFor(v), borderRadius: 2, opacity: v === 0 ? 0.5 : 1 }} />)}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${G.ruleSoft}`, fontSize: 12, color: G.inkSoft }}>
        <span className="gl-serif-italic">Problem 5 </span> — whole class missed the same concept. Reteach?
      </div>
    </div>
  );
}

function InterventionPeek() {
  const G = window.GL;
  return (
    <div style={{
      background: G.paper,
      border: `1px solid ${G.rule}`,
      borderRadius: 3,
      padding: '22px 24px',
      boxShadow: '0 14px 30px -18px rgba(60,40,20,.22)',
    }}>
      <div style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>FOR MAYA · TWO WEEKS</div>
      <div className="gl-serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 6, letterSpacing: '-0.01em' }}>The Negative Check</div>
      <div style={{ borderLeft: `2px solid ${G.insight}`, paddingLeft: 14, margin: '10px 0 14px' }}>
        <div className="gl-serif-italic" style={{ fontSize: 18, lineHeight: 1.4, color: G.ink }}>
          "If the number in front was negative, did every sign flip?"
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button style={{ flex: 1, background: G.ink, color: G.paper, border: 'none', padding: '8px 10px', borderRadius: 3, fontSize: 12 }}>Print</button>
        <button style={{ flex: 1, background: G.paper, color: G.ink, border: `1px solid ${G.rule}`, padding: '8px 10px', borderRadius: 3, fontSize: 12 }}>Text to Maya</button>
      </div>
    </div>
  );
}

function ModeCard({ kind }) {
  const G = window.GL;
  const parent = {
    tag: 'Parent mode', density: 'Airy · plain-language · insight-first',
    body: 'Here\'s what I saw in Maya\'s quiz: she\'s making the same kind of sign error she made on the last two. It\'s an execution slip, not a misunderstanding — and we have a small fix to try.',
  };
  const teacher = {
    tag: 'Teacher mode', density: 'Dense · cite-the-work · override-anywhere',
    body: 'Q2, Q5, Q7 — execution, sign-flip on distributed negatives. Class-wide on Q5 (62%). Recommended: reteach distributive sign, assign Intervention T-14 (Negative Check).',
  };
  const data = kind === 'parent' ? parent : teacher;
  return (
    <div style={{
      border: `1px solid ${G.rule}`,
      borderRadius: 3,
      padding: kind === 'parent' ? '36px 36px' : '22px 24px',
      background: kind === 'parent' ? G.paper : G.paperSoft,
      fontFamily: kind === 'teacher' ? G.mono : G.sans,
    }}>
      <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.accent, letterSpacing: '0.12em', marginBottom: 16 }}>{data.tag.toUpperCase()}</div>
      <div className={kind === 'parent' ? 'gl-serif' : ''} style={{ fontSize: kind === 'parent' ? 22 : 13, lineHeight: kind === 'parent' ? 1.4 : 1.65, color: G.ink, marginBottom: 16, fontWeight: kind === 'parent' ? 400 : 400 }}>
        {data.body}
      </div>
      <div style={{ fontSize: 11.5, color: G.inkMute, fontFamily: G.mono, letterSpacing: '0.04em' }}>{data.density}</div>
    </div>
  );
}

window.DirInstrument = DirInstrument;
