// Grade Sight — Session 2 components: nav, first-run, dashboard v2
const { useState } = React;

// ─── Shared tokens (mid-fi: warm paper, ink ramp, single accent in semantic moments only) ───
window.GS = {
  paper: 'oklch(0.985 0.006 82)',
  paperSoft: 'oklch(0.965 0.008 82)',
  paperDeep: 'oklch(0.94 0.012 82)',
  rule: 'oklch(0.88 0.012 82)',
  ruleSoft: 'oklch(0.92 0.01 82)',
  ink: 'oklch(0.22 0.015 75)',
  inkSoft: 'oklch(0.42 0.015 75)',
  inkMute: 'oklch(0.58 0.012 75)',
  accent: 'oklch(0.42 0.09 252)',
  insight: 'oklch(0.72 0.12 72)',
  green: 'oklch(0.62 0.18 145)',
  greenDeep: 'oklch(0.52 0.17 145)',
  mark: 'oklch(0.56 0.15 28)',
  serif: "'Source Serif 4', Georgia, serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  hand: "'Caveat', cursive",
};

// ─── Logo (compact mark we settled on) ───
function GSLogo({ size = 22 }) {
  const id = 'lm-' + size;
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
}
window.GSLogo = GSLogo;

// ═════════════════════════════════════════════════════════════════════
// NAV ARTBOARD — three options stacked in one frame
// ═════════════════════════════════════════════════════════════════════
function NavOptions() {
  const G = window.GS;

  const Tab = ({ label, active, sub }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 14, position: 'relative' }}>
      <span style={{ fontFamily: G.sans, fontSize: '0.944rem', color: active ? G.ink : G.inkSoft, fontWeight: active ? 500 : 400 }}>{label}</span>
      {sub && <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.1em', color: G.inkMute, textTransform: 'uppercase' }}>{sub}</span>}
      {active && <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: G.ink }}/>}
    </div>
  );

  const sectionLabel = (txt) => (
    <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase', padding: '20px 24px 8px' }}>{txt}</div>
  );

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink }}>
      {/* header bar — primary recommendation */}
      <div>
        <div style={{ padding: '14px 28px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GSLogo size={22}/>
              <span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem', letterSpacing: '-0.012em' }}>Grade Sight</span>
            </div>
            <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
              <Tab label="Dashboard" active/>
              <Tab label="Students"/>
              <Tab label="Assessments"/>
              <Tab label="Answer keys"/>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3, cursor: 'pointer' }}>Upload assessment</button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>SR</div>
          </div>
        </div>
        {sectionLabel('Recommended · top-bar tabs · teacher view')}
      </div>

      {/* Parent variant: simpler, no Answer keys */}
      <div style={{ marginTop: 28 }}>
        <div style={{ padding: '14px 28px', borderTop: `1px solid ${G.ruleSoft}`, borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GSLogo size={22}/>
              <span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem', letterSpacing: '-0.012em' }}>Grade Sight</span>
            </div>
            <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
              <Tab label="Dashboard" active/>
              <Tab label="Students"/>
              <Tab label="History"/>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3, cursor: 'pointer' }}>Upload</button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>JR</div>
          </div>
        </div>
        {sectionLabel('Same primitive · parent view · fewer tabs')}
      </div>

      {/* Mobile: bottom tab bar */}
      <div style={{ marginTop: 28, padding: '24px 28px 28px', display: 'flex', gap: 32, alignItems: 'center', borderTop: `1px solid ${G.ruleSoft}` }}>
        <div style={{ width: 280, height: 520, border: `1px solid ${G.rule}`, borderRadius: 18, overflow: 'hidden', background: G.paper, display: 'flex', flexDirection: 'column' }}>
          {/* top app bar */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GSLogo size={20}/>
              <span style={{ fontFamily: G.serif, fontSize: '1rem', fontWeight: 500 }}>Grade Sight</span>
            </div>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}` }}/>
          </div>
          {/* body fill */}
          <div style={{ flex: 1, padding: '18px', background: G.paperSoft }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>TUESDAY</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.444rem', fontWeight: 400, marginTop: 6 }}>Welcome back, Jenna.</div>
          </div>
          {/* bottom tab bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${G.ruleSoft}`, background: G.paper }}>
            {[['Home', true], ['Students', false], ['History', false]].map(([l, a], i) => (
              <div key={i} style={{ padding: '10px 0 14px', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: G.sans, fontSize: '0.778rem', color: a ? G.ink : G.inkMute, fontWeight: a ? 500 : 400 }}>{l}</div>
                {a && <div style={{ position: 'absolute', top: 0, left: '30%', right: '30%', height: 2, background: G.ink }}/>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {sectionLabel('Mobile · 375w · bottom tabs')}
          <div style={{ padding: '0 24px', color: G.inkSoft, fontSize: '0.944rem', maxWidth: 380, lineHeight: 1.55 }}>
            Three tabs only on phone — Home, Students, History. The big primary action ("Upload") lives inside Home as a center-screen card, not in the bar. Reachable with the thumb. No hamburger.
          </div>
        </div>
      </div>
    </div>
  );
}
window.NavOptions = NavOptions;

// ═════════════════════════════════════════════════════════════════════
// FIRST-RUN — parent
// ═════════════════════════════════════════════════════════════════════
function FirstRunParent() {
  const G = window.GS;
  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 700 }}>
      {/* Top header */}
      <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GSLogo size={22}/>
          <span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>JR</div>
      </div>

      <div style={{ padding: '64px 80px 80px', maxWidth: 920, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Tuesday · welcome</div>
        <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.05, marginTop: 14, maxWidth: 640 }}>
          Hi, Jenna. Let's start with one quiz.
        </div>
        <p style={{ fontFamily: G.serif, fontSize: '1.333rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 580, marginTop: 18 }}>
          Photograph a graded paper your kid brought home. We'll read what's on it and tell you the pattern behind the marks — in a sentence, not a report.
        </p>

        {/* Two-step preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 36 }}>
          {[
            { n: '01', t: 'Add your kid', d: 'First name and grade. Nothing else. You can add siblings later.' },
            { n: '02', t: 'Upload one quiz', d: 'A photo from your phone is fine. Already graded? Tell us — we\'ll read the marks.' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '22px 24px', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.222rem', color: G.inkMute }}>{s.n}</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 4 }}>{s.t}</div>
              <p style={{ fontSize: '0.944rem', color: G.inkSoft, margin: '8px 0 0', lineHeight: 1.5 }}>{s.d}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button style={{ fontFamily: G.sans, fontSize: '1rem', color: G.paper, background: G.ink, border: 'none', padding: '12px 22px', borderRadius: 3, cursor: 'pointer' }}>Add my first kid →</button>
          <span style={{ fontSize: '0.889rem', color: G.inkMute }}>Takes 30 seconds. You won't be charged.</span>
        </div>

        {/* Trust strip */}
        <div style={{ marginTop: 56, padding: '20px 24px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, display: 'flex', gap: 28, fontSize: '0.889rem', color: G.inkSoft }}>
          <span><strong style={{ color: G.ink, fontFamily: G.serif }}>Never sold.</strong> Student data is yours.</span>
          <span><strong style={{ color: G.ink, fontFamily: G.serif }}>30-day deletion.</strong> On request.</span>
          <span><strong style={{ color: G.ink, fontFamily: G.serif }}>US-only.</strong> Stored in the United States.</span>
        </div>
      </div>
    </div>
  );
}
window.FirstRunParent = FirstRunParent;

// ═════════════════════════════════════════════════════════════════════
// FIRST-RUN — teacher
// ═════════════════════════════════════════════════════════════════════
function FirstRunTeacher() {
  const G = window.GS;
  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 700 }}>
      <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GSLogo size={22}/>
          <span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>SR</div>
      </div>

      <div style={{ padding: '64px 80px 80px', maxWidth: 980, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Sunday · welcome</div>
        <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.05, marginTop: 14, maxWidth: 720 }}>
          Welcome, Mr. Reyes. Three quick steps before you grade anything.
        </div>
        <p style={{ fontFamily: G.serif, fontSize: '1.333rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 640, marginTop: 18 }}>
          You'll need an answer key for the engine to grade against. Add one now and the rest of the flow is just photos.
        </p>

        {/* Three-step checklist */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 36 }}>
          {[
            { n: '01', t: 'Upload an answer key', d: 'PDF or photos. We\'ll save it to grade against this period\'s quizzes.', cta: 'Upload key', state: 'active' },
            { n: '02', t: 'Add your students', d: 'Roster paste, single add, or skip — you can do this from the upload form.', cta: 'Add students', state: 'pending' },
            { n: '03', t: 'Upload your first batch', d: 'Photograph a stack. We\'ll grade and surface the patterns by problem.', cta: 'Upload assessment', state: 'pending' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '22px 24px', border: `1px solid ${s.state === 'active' ? G.ink : G.rule}`, borderRadius: 4, background: G.paper, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.222rem', color: s.state === 'active' ? G.ink : G.inkMute }}>{s.n}</div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: s.state === 'active' ? G.ink : G.inkMute, textTransform: 'uppercase' }}>{s.state === 'active' ? 'NEXT' : 'PENDING'}</div>
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 6 }}>{s.t}</div>
              <p style={{ fontSize: '0.944rem', color: G.inkSoft, margin: '8px 0 18px', lineHeight: 1.5, flex: 1 }}>{s.d}</p>
              <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: s.state === 'active' ? G.paper : G.inkSoft, background: s.state === 'active' ? G.ink : 'transparent', border: s.state === 'active' ? 'none' : `1px solid ${G.rule}`, padding: '8px 14px', borderRadius: 3, alignSelf: 'flex-start', cursor: 'pointer' }}>{s.cta}</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, fontSize: '0.889rem', color: G.inkMute }}>You can skip steps and come back. Nothing's gated except the diagnostic itself.</div>
      </div>
    </div>
  );
}
window.FirstRunTeacher = FirstRunTeacher;

// ═════════════════════════════════════════════════════════════════════
// DASHBOARD V2 — parent
// ═════════════════════════════════════════════════════════════════════
function DashboardParent() {
  const G = window.GS;

  const StudentRow = ({ name, grade, last, pattern, count, sample }) => (
    <div style={{ padding: '20px 24px', borderTop: `1px solid ${G.ruleSoft}`, display: 'grid', gridTemplateColumns: '1.4fr 2fr 1fr 28px', gap: 18, alignItems: 'center' }}>
      <div>
        <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: '0.833rem', color: G.inkMute }}>{grade} · last assessment {last}</div>
      </div>
      <div>
        <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>RECURRING PATTERN · {count}× </div>
        <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, marginTop: 4 }}>{pattern}</div>
        <div style={{ fontFamily: G.hand, fontSize: '1.111rem', color: G.insight, marginTop: 4 }}>{sample}</div>
      </div>
      <div style={{ fontSize: '0.889rem', color: G.accent, fontFamily: G.sans }}>Open student →</div>
      <div style={{ color: G.inkMute }}>›</div>
    </div>
  );

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 800 }}>
      {/* nav */}
      <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GSLogo size={22}/><span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span>
          </div>
          <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
            {['Dashboard', 'Students', 'History'].map((t, i) => (
              <div key={i} style={{ fontSize: '0.944rem', color: i === 0 ? G.ink : G.inkSoft, fontWeight: i === 0 ? 500 : 400, paddingBottom: 14, borderBottom: i === 0 ? `2px solid ${G.ink}` : 'none' }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3 }}>Upload</button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>JR</div>
        </div>
      </div>

      <div style={{ padding: '56px 80px 96px', maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Tuesday, April 28</div>
        <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.05, marginTop: 12 }}>
          Welcome back, Jenna.
        </div>

        {/* The single sentence — the dashboard's job */}
        <div style={{ marginTop: 32, padding: '28px 32px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>What we're seeing this week</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.555rem', fontWeight: 400, color: G.ink, lineHeight: 1.4, margin: '14px 0 0', maxWidth: 760 }}>
            Marcus's last three quizzes share the same pattern — sign errors when distributing. <span style={{ color: G.accent }}>Five-minute conversation, not a tutor.</span>
          </p>
        </div>

        {/* Two-up: students with patterns + recent activity */}
        <div style={{ marginTop: 44, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Your kids · 2</div>
            <div style={{ marginTop: 14, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
              <StudentRow name="Marcus Reilly" grade="9th · Algebra I" last="2 days ago" count={3} pattern="Drops the negative when distributing" sample="−2(x − 3)"/>
              <StudentRow name="Lila Reilly" grade="7th · Pre-Algebra" last="last week" count={2} pattern="Fraction-to-decimal conversion" sample="3/8 → 0.385?"/>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Recent</div>
            <div style={{ marginTop: 14, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
              {[
                { who: 'Marcus', what: 'Quiz 8.3 · already graded', when: '2 days ago', score: '14 / 18' },
                { who: 'Marcus', what: 'Quiz 8.2 · already graded', when: '6 days ago', score: '12 / 16' },
                { who: 'Lila', what: 'Worksheet 4', when: 'last Wed', score: '6 / 10' },
              ].map((r, i) => (
                <div key={i} style={{ padding: '16px 20px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: G.serif, fontSize: '1rem', fontWeight: 500 }}>{r.who} · {r.what}</div>
                    <div style={{ fontSize: '0.833rem', color: G.inkMute }}>{r.when}</div>
                  </div>
                  <div style={{ fontFamily: G.mono, fontSize: '0.833rem', color: G.inkSoft }}>{r.score}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.889rem', color: G.accent, fontFamily: G.sans, marginTop: 12 }}>Full history →</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.DashboardParent = DashboardParent;

// ═════════════════════════════════════════════════════════════════════
// DASHBOARD V2 — teacher
// ═════════════════════════════════════════════════════════════════════
function DashboardTeacher() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 900 }}>
      <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><GSLogo size={22}/><span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span></div>
          <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
            {['Dashboard', 'Students', 'Assessments', 'Answer keys'].map((t, i) => (
              <div key={i} style={{ fontSize: '0.944rem', color: i === 0 ? G.ink : G.inkSoft, fontWeight: i === 0 ? 500 : 400, paddingBottom: 14, borderBottom: i === 0 ? `2px solid ${G.ink}` : 'none' }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3 }}>Upload assessment</button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>SR</div>
        </div>
      </div>

      <div style={{ padding: '56px 80px 96px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Sunday, April 26</div>
        <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.05, marginTop: 12 }}>
          What you should look at, Mr. Reyes.
        </div>

        {/* Three insight cards — the dashboard's job is to surface these */}
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
          {[
            { eb: 'CLASS PATTERN · 4TH PERIOD', s: '23 of 27 missed #6 the same way.', sub: 'Sign-distribution. Reteach Tuesday or pull aside.', tone: 'insight' },
            { eb: 'STUDENT TO WATCH', s: 'David Park — three quizzes, same error.', sub: 'Conceptual gap on combining like terms.', tone: 'insight' },
            { eb: 'GRADED THIS WEEK', s: '92 quizzes across 4 sections.', sub: 'Average 8.4 / 12. Ten flagged for review.', tone: 'plain' },
          ].map((c, i) => (
            <div key={i} style={{ padding: '24px 26px', background: c.tone === 'insight' ? G.paperSoft : G.paper, border: `1px solid ${c.tone === 'insight' ? G.ruleSoft : G.rule}`, borderRadius: 4, borderLeft: c.tone === 'insight' ? `3px solid ${G.accent}` : `1px solid ${G.rule}` }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: c.tone === 'insight' ? G.accent : G.inkMute, textTransform: 'uppercase' }}>{c.eb}</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', color: G.ink, lineHeight: 1.35, marginTop: 10 }}>{c.s}</div>
              <div style={{ fontSize: '0.944rem', color: G.inkSoft, marginTop: 8, lineHeight: 1.5 }}>{c.sub}</div>
              <div style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.accent, marginTop: 14 }}>Open →</div>
            </div>
          ))}
        </div>

        {/* Recent assessments table */}
        <div style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Recent assessments</div>
            <div style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.accent }}>See all →</div>
          </div>
          <div style={{ marginTop: 14, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 0.9fr 1fr 0.6fr', padding: '12px 22px', fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase', borderBottom: `1px solid ${G.ruleSoft}` }}>
              <div>STUDENT</div><div>ASSESSMENT</div><div>SCORE</div><div>WHEN</div><div>STATUS</div>
            </div>
            {[
              ['Maya Chen', 'Quiz 9.1 · with key', '11/12', '2h ago', 'Ready'],
              ['David Park', 'Quiz 9.1 · with key', '6/12', '2h ago', 'Ready'],
              ['Theo Sims', 'Quiz 9.1 · with key', '9/12', '2h ago', 'Ready'],
              ['Class · 4th period', 'Quiz 9.1 · 27 papers', 'pending', '20m ago', 'Processing'],
              ['Asha Reddy', 'Worksheet 8', '8/10', 'yesterday', 'Ready'],
            ].map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 0.9fr 1fr 0.6fr', padding: '14px 22px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', alignItems: 'baseline', fontSize: '0.944rem' }}>
                <div style={{ fontFamily: G.serif, fontWeight: 500 }}>{r[0]}</div>
                <div style={{ color: G.inkSoft }}>{r[1]}</div>
                <div style={{ fontFamily: G.mono, color: G.inkSoft }}>{r[2]}</div>
                <div style={{ color: G.inkMute }}>{r[3]}</div>
                <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: r[4] === 'Processing' ? G.accent : G.inkMute, textTransform: 'uppercase' }}>{r[4]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust strip — visible post-signup */}
        <div style={{ marginTop: 48, padding: '20px 24px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: G.serif, fontSize: '1rem', color: G.inkSoft }}>
            <strong style={{ color: G.ink }}>Your students are yours.</strong> Never sold. US-only storage. 30-day deletion on request. SDPC NDPA signable.
          </div>
          <div style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.accent }}>Privacy posture →</div>
        </div>
      </div>
    </div>
  );
}
window.DashboardTeacher = DashboardTeacher;

// ═════════════════════════════════════════════════════════════════════
// CONTEXT + RATIONALE CARDS
// ═════════════════════════════════════════════════════════════════════
function ContextCard() {
  const G = window.GS;
  return (
    <div style={{ background: G.paperSoft, padding: '40px 48px', minHeight: 400, fontFamily: G.sans }}>
      <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Session 02 · context</div>
      <h2 style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', margin: '12px 0 0', maxWidth: 720, lineHeight: 1.15 }}>
        Three skeleton surfaces. The shape of the rest of the product hangs off these.
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 28 }}>
        {[
          { eb: 'NAVIGATION', t: 'Top-bar tabs.', d: 'Three on phone, four on desktop. Role-aware tab set: parents see Dashboard / Students / History; teachers add Assessments + Answer keys. Discarded: left-rail (too much chrome for the page count) and hamburger (hides primary).' },
          { eb: 'FIRST-RUN', t: 'A welcome, then a path.', d: 'Parents see a single warm sentence and one CTA. Teachers see a 3-step checklist because the engine actually needs an answer key first. Both roles get the trust strip on this very first screen.' },
          { eb: 'DASHBOARD', t: 'Lead with the sentence.', d: 'Principle (i) applied directly: the dashboard\'s job is to put one insight at eye height. For parents, what we\'re seeing in their kid this week. For teachers, what to look at across the class.' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '20px 22px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 4 }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>{c.eb}</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 8 }}>{c.t}</div>
            <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5, margin: '8px 0 0' }}>{c.d}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 36, padding: '22px 26px', background: G.paper, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, maxWidth: 900 }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>Decisions for this session</div>
        <ul style={{ marginTop: 10, fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.6 }}>
          <li>Approve <strong style={{ color: G.ink }}>top-bar tabs</strong> as the nav primitive (or call left-rail / something else).</li>
          <li>Confirm parent gets <strong style={{ color: G.ink }}>3 tabs</strong>, teacher gets <strong style={{ color: G.ink }}>4</strong>. Or push back on the parent simplification.</li>
          <li>Sign off on the dashboard <strong style={{ color: G.ink }}>insight pattern</strong> (single sentence at top + supporting cards). This pattern repeats on /students/[id] and the diagnosis page.</li>
          <li>Greenlight <strong style={{ color: G.ink }}>Session 03 — /students/[id]</strong>.</li>
        </ul>
      </div>
    </div>
  );
}
window.ContextCard = ContextCard;
