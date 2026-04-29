// Grade Sight — Session 3: /students/[id] longitudinal page
const { useState: useState3 } = React;

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
    const id = 'lm3-' + size;
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

// Shared header
function NavHeader({ role = 'parent' }) {
  const G = window.GS;
  const tabs = role === 'parent'
    ? [['Dashboard', false], ['Students', true], ['History', false]]
    : [['Dashboard', false], ['Students', true], ['Assessments', false], ['Answer keys', false]];
  const initials = role === 'parent' ? 'JR' : 'SR';
  return (
    <div style={{ padding: '14px 36px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: G.paper }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <window.GSLogo size={22}/><span style={{ fontFamily: G.serif, fontWeight: 500, fontSize: '1.222rem' }}>Grade Sight</span>
        </div>
        <div style={{ display: 'flex', gap: 28, paddingTop: 14 }}>
          {tabs.map(([t, a], i) => (
            <div key={i} style={{ fontFamily: G.sans, fontSize: '0.944rem', color: a ? G.ink : G.inkSoft, fontWeight: a ? 500 : 400, paddingBottom: 14, borderBottom: a ? `2px solid ${G.ink}` : 'none' }}>{t}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '8px 18px', borderRadius: 3 }}>{role === 'parent' ? 'Upload' : 'Upload assessment'}</button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.833rem', color: G.inkSoft }}>{initials}</div>
      </div>
    </div>
  );
}
window.NavHeader = NavHeader;

// ═════════════════════════════════════════════════════════════════════
// /students/[id] — PARENT view (Marcus)
// ═════════════════════════════════════════════════════════════════════
function StudentPageParent() {
  const G = window.GS;

  // Pattern timeline data — each row is one error pattern over the last 6 weeks
  // value 0 = not seen that week; value 1-3 = severity (count of occurrences)
  const weeks = ['Mar 17', 'Mar 24', 'Mar 31', 'Apr 7', 'Apr 14', 'Apr 21', 'Apr 28'];
  const patterns = [
    { name: 'Drops the negative when distributing', cat: 'EXECUTION', total: 7, trend: 'recurring', dots: [0, 1, 2, 1, 2, 0, 2] },
    { name: 'Fraction-to-decimal conversion', cat: 'CONCEPTUAL', total: 4, trend: 'fading', dots: [2, 2, 1, 0, 0, 0, 1] },
    { name: 'Sign-tracking through equations', cat: 'EXECUTION', total: 3, trend: 'new', dots: [0, 0, 0, 0, 1, 1, 1] },
    { name: 'Order of operations · parentheses last', cat: 'CONCEPTUAL', total: 2, trend: 'one-off', dots: [0, 0, 1, 0, 0, 1, 0] },
  ];

  const trendChip = (t) => {
    const map = {
      recurring: { c: G.accent, label: 'RECURRING' },
      fading: { c: G.inkMute, label: 'FADING' },
      new: { c: G.insight, label: 'NEW THIS WEEK' },
      'one-off': { c: G.inkMute, label: 'ONE-OFF' },
    };
    const m = map[t];
    return <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: m.c, textTransform: 'uppercase' }}>{m.label}</span>;
  };

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1200 }}>
      <NavHeader role="parent"/>

      {/* Breadcrumb + page header */}
      <div style={{ padding: '40px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>
          Students · <span style={{ color: G.ink }}>Marcus Reilly</span>
        </div>
      </div>

      {/* Header block: name, meta, big primary action */}
      <div style={{ padding: '20px 80px 56px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
          <div>
            <div style={{ fontFamily: G.serif, fontSize: '3.111rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.0 }}>Marcus Reilly</div>
            <div style={{ fontSize: '1rem', color: G.inkSoft, marginTop: 12 }}>9th grade · Algebra I · added Jan 14, 2026</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Edit</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Upload new quiz</button>
          </div>
        </div>
      </div>

      {/* THE SENTENCE — principle (i) applied to a student page */}
      <div style={{ padding: '0 80px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ padding: '32px 36px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>What we're seeing in marcus this month</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, color: G.ink, lineHeight: 1.35, margin: '14px 0 0', maxWidth: 880, letterSpacing: '-0.012em' }}>
            One pattern keeps coming back: when he distributes a negative, the sign disappears. <span style={{ color: G.inkSoft }}>Seven occurrences in his last four assessments. </span><span style={{ color: G.accent }}>That's a five-minute conversation, not a tutor.</span>
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 22, alignItems: 'center' }}>
            <a style={{ fontSize: '0.944rem', color: G.accent, fontFamily: G.sans }}>See the pattern across quizzes →</a>
            <span style={{ fontSize: '0.889rem', color: G.inkMute }}>Or print a one-page intervention</span>
          </div>
        </div>
      </div>

      {/* Stats strip — supporting numbers, never the headline */}
      <div style={{ padding: '36px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          {[
            { eb: 'ASSESSMENTS', v: '4', sub: 'in the last 6 weeks' },
            { eb: 'AVG. SCORE', v: '78%', sub: '+4 vs Feb' },
            { eb: 'PROBLEMS REVIEWED', v: '64', sub: '14 missed' },
            { eb: 'PATTERNS DETECTED', v: '4', sub: '1 recurring' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '20px 24px', borderLeft: i ? `1px solid ${G.ruleSoft}` : 'none' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>{s.eb}</div>
              <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, marginTop: 6 }}>{s.v}</div>
              <div style={{ fontSize: '0.833rem', color: G.inkMute, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PATTERN TIMELINE — the big innovation of this page */}
      <div style={{ padding: '56px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Patterns over time · last 6 weeks</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, marginTop: 8, letterSpacing: '-0.014em' }}>Where Marcus has been losing points.</div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: '0.833rem', color: G.inkMute }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: G.insight }}/>Severity by dot size</span>
          </div>
        </div>

        <div style={{ marginTop: 22, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, overflow: 'hidden' }}>
          {/* Week header */}
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 90px 130px 28px', padding: '14px 24px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft, alignItems: 'baseline' }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>PATTERN</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, fontFamily: G.mono, fontSize: '0.667rem', color: G.inkMute, textAlign: 'center', letterSpacing: '0.06em' }}>
              {weeks.map((w, i) => <div key={i}>{w}</div>)}
            </div>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase', textAlign: 'right' }}>TOTAL</div>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>TREND</div>
            <div/>
          </div>

          {/* Rows */}
          {patterns.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '320px 1fr 90px 130px 28px', padding: '20px 24px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>{p.cat}</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, marginTop: 4, lineHeight: 1.3 }}>{p.name}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, alignItems: 'center', justifyItems: 'center' }}>
                {p.dots.map((d, j) => {
                  if (d === 0) return <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: G.ruleSoft }}/>;
                  const size = d === 1 ? 10 : d === 2 ? 16 : 22;
                  const color = p.trend === 'fading' ? G.inkMute : p.trend === 'recurring' ? G.accent : p.trend === 'new' ? G.insight : G.inkMute;
                  return <div key={j} style={{ width: size, height: size, borderRadius: '50%', background: color, opacity: 0.85 }}/>;
                })}
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', textAlign: 'right' }}>{p.total}<span style={{ fontSize: '0.778rem', color: G.inkMute }}>×</span></div>
              <div>{trendChip(p.trend)}</div>
              <div style={{ color: G.inkMute, textAlign: 'right' }}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent assessments */}
      <div style={{ padding: '56px 80px 96px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Recent assessments</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, marginTop: 8, letterSpacing: '-0.014em' }}>Every quiz Marcus has uploaded.</div>
          </div>
          <div style={{ fontSize: '0.889rem', color: G.accent }}>See full history →</div>
        </div>

        <div style={{ marginTop: 22, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          {[
            { date: 'Apr 28', name: 'Quiz 8.3 · Distributing & combining', mode: 'Already graded', score: '14 / 18', missed: 4, focus: 'Sign-distribution · 3 of 4' },
            { date: 'Apr 14', name: 'Quiz 8.2 · Linear equations', mode: 'Already graded', score: '12 / 16', missed: 4, focus: 'Sign-distribution · 2 of 4' },
            { date: 'Apr 7', name: 'Worksheet 7B', mode: 'Already graded', score: '8 / 10', missed: 2, focus: 'Order of operations' },
            { date: 'Mar 24', name: 'Quiz 8.1 · Variables', mode: 'Already graded', score: '13 / 16', missed: 3, focus: 'Fraction conversion · 2 of 3' },
          ].map((a, i) => (
            <div key={i} style={{ padding: '20px 24px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', display: 'grid', gridTemplateColumns: '90px 1.6fr 1fr 90px 1.6fr 28px', gap: 18, alignItems: 'center' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.833rem', color: G.inkMute }}>{a.date}</div>
              <div>
                <div style={{ fontFamily: G.serif, fontSize: '1.111rem', fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.1em', color: G.inkMute, textTransform: 'uppercase', marginTop: 2 }}>{a.mode}</div>
              </div>
              <div/>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem' }}>{a.score}</div>
              <div style={{ fontSize: '0.944rem', color: G.inkSoft }}>{a.focus}</div>
              <div style={{ color: G.inkMute, textAlign: 'right' }}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.StudentPageParent = StudentPageParent;

// ═════════════════════════════════════════════════════════════════════
// /students/[id] — TEACHER view (David Park)
// ═════════════════════════════════════════════════════════════════════
function StudentPageTeacher() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1200 }}>
      <NavHeader role="teacher"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>
          Students · 4th period · <span style={{ color: G.ink }}>David Park</span>
        </div>
      </div>

      <div style={{ padding: '20px 80px 32px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
          <div>
            <div style={{ fontFamily: G.serif, fontSize: '3.111rem', fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.0 }}>David Park</div>
            <div style={{ fontSize: '1rem', color: G.inkSoft, marginTop: 12 }}>4th period · Algebra I · 12 of 27 students flagged this month</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Edit</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Print intervention</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Upload new</button>
          </div>
        </div>
      </div>

      {/* The sentence — teacher tone */}
      <div style={{ padding: '0 80px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ padding: '32px 36px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>WHY DAVID IS ON YOUR LIST</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, color: G.ink, lineHeight: 1.35, margin: '14px 0 0', maxWidth: 940, letterSpacing: '-0.012em' }}>
            Three quizzes, same conceptual gap: he can't combine like terms when one of them has a coefficient. <span style={{ color: G.inkSoft }}>It is not a careless-error problem.</span>
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 22 }}>
            <a style={{ fontSize: '0.944rem', color: G.accent, fontFamily: G.sans }}>Open the recurring pattern →</a>
            <a style={{ fontSize: '0.944rem', color: G.accent, fontFamily: G.sans }}>Send a parent note</a>
            <a style={{ fontSize: '0.944rem', color: G.inkSoft, fontFamily: G.sans }}>Mark resolved</a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '36px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          {[
            { eb: 'IN CLASS', v: 'Per. 4', sub: 'Algebra I' },
            { eb: 'ASSESSMENTS', v: '6', sub: 'this semester' },
            { eb: 'AVG. SCORE', v: '64%', sub: 'class avg 78%' },
            { eb: 'RECURRING', v: '1', sub: 'patterns flagged' },
            { eb: 'LAST UPLOADED', v: 'Apr 26', sub: 'Quiz 9.1' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '20px 24px', borderLeft: i ? `1px solid ${G.ruleSoft}` : 'none' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>{s.eb}</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, marginTop: 6 }}>{s.v}</div>
              <div style={{ fontSize: '0.833rem', color: G.inkMute, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-up: pattern timeline + class context */}
      <div style={{ padding: '56px 80px 0', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        {/* Patterns */}
        <div>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Patterns over time</div>
          <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, marginTop: 8, letterSpacing: '-0.014em' }}>What's been recurring.</div>

          <div style={{ marginTop: 18, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
            {[
              { name: 'Combining like terms with coefficients', cat: 'CONCEPTUAL', total: 8, classRate: '4 of 27', trend: 'recurring' },
              { name: 'Sign tracking through equations', cat: 'EXECUTION', total: 5, classRate: '12 of 27', trend: 'class-wide' },
              { name: 'Order of operations · parentheses', cat: 'CONCEPTUAL', total: 2, classRate: '6 of 27', trend: 'fading' },
              { name: 'Verification step skipped', cat: 'VERIFICATION', total: 4, classRate: '18 of 27', trend: 'class-wide' },
            ].map((p, i) => (
              <div key={i} style={{ padding: '20px 24px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>{p.cat}</div>
                    <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, marginTop: 4 }}>{p.name}</div>
                    <div style={{ fontSize: '0.833rem', color: G.inkMute, marginTop: 6 }}>
                      David: <span style={{ color: G.ink, fontFamily: G.serif }}>{p.total}×</span> · Class: <span style={{ color: G.ink, fontFamily: G.serif }}>{p.classRate}</span>
                    </div>
                  </div>
                  <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: p.trend === 'recurring' ? G.accent : p.trend === 'class-wide' ? G.inkSoft : G.inkMute, textTransform: 'uppercase' }}>{p.trend.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Class context */}
        <div>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Class context</div>
          <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, marginTop: 8, letterSpacing: '-0.014em' }}>4th period.</div>

          <div style={{ marginTop: 18, padding: '22px 24px', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
            <div style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5 }}>
              David's "combining like terms" gap is <strong style={{ color: G.ink }}>specific to him</strong> — only 4 of 27 students share it. His class also has a wider sign-tracking issue you can address as a group.
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${G.ruleSoft}`, fontSize: '0.889rem', color: G.accent }}>Open 4th period →</div>
          </div>

          <div style={{ marginTop: 16, padding: '22px 24px', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase' }}>Suggested intervention</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6, lineHeight: 1.35 }}>Coefficient-as-multiplier reset.</div>
            <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5, margin: '8px 0 0' }}>
              A 10-minute side-bar before next quiz. We have a print-ready handout for this pattern.
            </p>
            <div style={{ marginTop: 14, fontSize: '0.889rem', color: G.accent }}>Print handout · Send to David</div>
          </div>
        </div>
      </div>

      {/* Recent assessments */}
      <div style={{ padding: '56px 80px 96px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>David's assessments · 6</div>
        <div style={{ marginTop: 14, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1.5fr 1fr 90px 1.6fr 100px', padding: '12px 24px', fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.12em', color: G.inkMute, textTransform: 'uppercase', borderBottom: `1px solid ${G.ruleSoft}` }}>
            <div>DATE</div><div>ASSESSMENT</div><div>KEY</div><div>SCORE</div><div>PRIMARY ERROR</div><div>STATUS</div>
          </div>
          {[
            ['Apr 26', 'Quiz 9.1 · Equations review', 'Quiz 9.1 key', '6/12', 'Combining like terms · 3 of 6', 'Reviewed'],
            ['Apr 19', 'Quiz 8.4 · Distributing', 'Quiz 8.4 key', '8/14', 'Combining like terms · 2 of 6', 'Reviewed'],
            ['Apr 12', 'Worksheet 8B', 'WS 8B key', '12/18', 'Sign tracking · 4 of 6', 'Reviewed'],
            ['Apr 5', 'Quiz 8.3', 'Quiz 8.3 key', '11/16', '—', 'Reviewed'],
            ['Mar 29', 'Quiz 8.2', 'Quiz 8.2 key', '10/14', 'Combining like terms · 3 of 4', 'Reviewed'],
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1.5fr 1fr 90px 1.6fr 100px', padding: '14px 24px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', alignItems: 'baseline', fontSize: '0.944rem' }}>
              <div style={{ fontFamily: G.mono, color: G.inkMute }}>{r[0]}</div>
              <div style={{ fontFamily: G.serif, fontWeight: 500 }}>{r[1]}</div>
              <div style={{ color: G.inkSoft, fontSize: '0.889rem' }}>{r[2]}</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem' }}>{r[3]}</div>
              <div style={{ color: G.inkSoft }}>{r[4]}</div>
              <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.inkMute, textTransform: 'uppercase' }}>{r[5]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.StudentPageTeacher = StudentPageTeacher;

// ═════════════════════════════════════════════════════════════════════
// /students/[id] — MOBILE (parent · 375w)
// ═════════════════════════════════════════════════════════════════════
function StudentPageMobile() {
  const G = window.GS;

  return (
    <div style={{ width: 375, height: 812, border: `1px solid ${G.rule}`, borderRadius: 28, overflow: 'hidden', background: G.paper, display: 'flex', flexDirection: 'column', fontFamily: G.sans, color: G.ink, position: 'relative' }}>

      {/* Status bar */}
      <div style={{ padding: '12px 20px 6px', display: 'flex', justifyContent: 'space-between', fontFamily: G.sans, fontSize: '0.778rem', fontWeight: 500 }}>
        <span>9:41</span>
        <span style={{ display: 'flex', gap: 4 }}>● ● ●</span>
      </div>

      {/* Top bar */}
      <div style={{ padding: '6px 18px 14px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.accent }}>‹ Students</div>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: G.paperDeep, border: `1px solid ${G.rule}` }}/>
      </div>

      <div style={{ flex: 1, overflowY: 'hidden', padding: '20px 20px 0' }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.611rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>9th · Algebra I</div>
        <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.018em', lineHeight: 1.05, marginTop: 6 }}>Marcus Reilly</div>

        {/* The sentence — mobile compact */}
        <div style={{ marginTop: 22, padding: '18px 20px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.611rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>This month</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, lineHeight: 1.4, margin: '10px 0 0' }}>
            One pattern keeps coming back: when he distributes a negative, the sign disappears. <span style={{ color: G.accent }}>Five-minute conversation.</span>
          </p>
        </div>

        {/* Stats */}
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          {[
            ['ASSESSMENTS', '4', '6 wks'],
            ['AVG', '78%', '+4'],
            ['MISSED', '14', 'of 64'],
            ['PATTERNS', '4', '1 recurring'],
          ].map((s, i) => (
            <div key={i} style={{ padding: '12px 14px', borderLeft: i % 2 ? `1px solid ${G.ruleSoft}` : 'none', borderTop: i >= 2 ? `1px solid ${G.ruleSoft}` : 'none' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.6rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>{s[0]}</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.444rem', fontWeight: 400, marginTop: 2 }}>{s[1]}</div>
              <div style={{ fontSize: '0.722rem', color: G.inkMute }}>{s[2]}</div>
            </div>
          ))}
        </div>

        {/* Pattern list — phone version of the timeline */}
        <div style={{ marginTop: 22, fontFamily: G.mono, fontSize: '0.611rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Patterns · 6 wks</div>
        <div style={{ marginTop: 8, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper }}>
          {[
            { name: 'Drops the negative when distributing', total: '7×', trend: 'RECURRING', c: G.accent },
            { name: 'Fraction-to-decimal conversion', total: '4×', trend: 'FADING', c: G.inkMute },
            { name: 'Sign-tracking', total: '3×', trend: 'NEW', c: G.insight },
          ].map((p, i) => (
            <div key={i} style={{ padding: '14px 16px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: G.serif, fontSize: '0.944rem', flex: 1, paddingRight: 12, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ fontFamily: G.serif, fontSize: '1rem' }}>{p.total}</div>
              </div>
              <div style={{ fontFamily: G.mono, fontSize: '0.6rem', letterSpacing: '0.14em', color: p.c, textTransform: 'uppercase', marginTop: 4 }}>{p.trend}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating CTA */}
      <div style={{ padding: '12px 20px 18px', borderTop: `1px solid ${G.ruleSoft}`, background: G.paper }}>
        <button style={{ width: '100%', fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '12px', borderRadius: 3 }}>Upload new quiz</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${G.ruleSoft}`, background: G.paper, paddingBottom: 14 }}>
        {[['Home', false], ['Students', true], ['History', false]].map(([l, a], i) => (
          <div key={i} style={{ padding: '10px 0 6px', textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: G.sans, fontSize: '0.722rem', color: a ? G.ink : G.inkMute, fontWeight: a ? 500 : 400 }}>{l}</div>
            {a && <div style={{ position: 'absolute', top: 0, left: '30%', right: '30%', height: 2, background: G.ink }}/>}
          </div>
        ))}
      </div>
    </div>
  );
}
window.StudentPageMobile = StudentPageMobile;

// ═════════════════════════════════════════════════════════════════════
// CONTEXT CARD
// ═════════════════════════════════════════════════════════════════════
function ContextCard3() {
  const G = window.GS;
  return (
    <div style={{ background: G.paperSoft, padding: '40px 48px', minHeight: 480, fontFamily: G.sans }}>
      <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Session 03 · context</div>
      <h2 style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 24, maxWidth: 760, lineHeight: 1.2, paddingBottom: 4 }}>
        The page someone comes back to weekly — once it exists.
      </h2>
      <p style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 720, margin: 0 }}>
        <code style={{ background: G.paper, padding: '1px 8px', borderRadius: 3, fontFamily: G.mono, fontSize: '0.833em', color: G.ink }}>/students/[id]</code> is the highest-value unbuilt surface in the roadmap. Three artboards: parent (Marcus), teacher (David, with class context), and the 375w mobile rendering. All three apply principle (i): one sentence, then the supporting structure.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 28 }}>
        {[
          { eb: 'THE INNOVATION', t: 'Pattern timeline.', d: 'Each error pattern is a row, weeks are columns, dot size encodes severity. Replaces a chart that would have been a percentage line — these are categorical, not continuous, and the dots make recurrence impossible to miss.' },
          { eb: 'PARENT vs TEACHER', t: 'Same skeleton, different cargo.', d: 'Parent gets one pattern timeline + recent assessments. Teacher gets the timeline plus a "class context" rail — is this kid-specific or class-wide? — and a suggested intervention card. The data model already supports the second.' },
          { eb: 'MOBILE FIRST FOR THIS PAGE?', t: 'Yes — for parents.', d: 'Marcus\'s mom opens this on the phone Saturday morning. Mobile rendering keeps the sentence + stats + pattern list above the fold; "Upload new quiz" is a sticky bottom button. Teacher mobile is a degrade pass we can do in Session 6.' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '20px 22px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 4 }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>{c.eb}</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 8 }}>{c.t}</div>
            <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5, margin: '8px 0 0' }}>{c.d}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 36, padding: '22px 26px', background: G.paper, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, maxWidth: 920 }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>Decisions for this session</div>
        <ul style={{ marginTop: 10, fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.6 }}>
          <li>Approve the <strong style={{ color: G.ink }}>pattern timeline</strong> as the visual primitive (or argue for a different one).</li>
          <li>Confirm the <strong style={{ color: G.ink }}>class-context rail</strong> on the teacher view (or simplify it for v1).</li>
          <li>Sign off on the <strong style={{ color: G.ink }}>mobile pattern list</strong> as the phone equivalent of the timeline.</li>
          <li>Greenlight <strong style={{ color: G.ink }}>Session 04 — Diagnosis narrative</strong>.</li>
        </ul>
      </div>
    </div>
  );
}
window.ContextCard3 = ContextCard3;
