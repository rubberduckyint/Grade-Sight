// Grade Sight — Session 4: Diagnosis narrative redesign
// Aggregate → per-pattern → per-problem · 3 modes · inline correction · with-key viewer

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
    const id = 'lm4-' + size;
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

function NavHeader4({ role = 'parent', activeTab = 'students' }) {
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

// ─── Reusable shapes ─────────────────────────────────────────────────────────

function ModeBadge({ mode }) {
  const G = window.GS;
  const labels = {
    auto_grade: 'AUTO-GRADED',
    with_key: 'GRADED WITH KEY',
    already_graded: 'READING THE TEACHER\'S MARKS',
  };
  return (
    <span style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>{labels[mode]}</span>
  );
}

function Crumb({ trail }) {
  const G = window.GS;
  return (
    <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>
      {trail.map((t, i) => (
        <span key={i}>
          {i > 0 && <span> · </span>}
          <span style={{ color: i === trail.length - 1 ? G.ink : G.inkMute }}>{t}</span>
        </span>
      ))}
    </div>
  );
}

// Hand-drawn answer mock (placeholder for student work) — uses Caveat
function HandwrittenWork({ lines, color }) {
  const G = window.GS;
  return (
    <div style={{ fontFamily: G.hand, fontSize: '1.667rem', color: color || G.inkSoft, lineHeight: 1.4, letterSpacing: '0.01em' }}>
      {lines.map((l, i) => <div key={i} style={{ whiteSpace: 'pre' }}>{l}</div>)}
    </div>
  );
}

function PrintedSolution({ lines }) {
  const G = window.GS;
  return (
    <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.ink, lineHeight: 1.55 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '4px 0' }}>
          <span style={{ fontFamily: G.mono, fontSize: '0.722rem', color: G.inkMute, paddingTop: 6, minWidth: 18 }}>{i + 1}.</span>
          <span style={{ whiteSpace: 'pre' }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PARENT · ALREADY-GRADED MODE
// ═════════════════════════════════════════════════════════════════════
function DiagnosisParent() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1400 }}>
      <NavHeader4 role="parent" activeTab="students"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <Crumb trail={['Students', 'Marcus Reilly', 'Quiz 8.3 · Apr 28']}/>
      </div>

      {/* Page header — assessment metadata */}
      <div style={{ padding: '16px 80px 36px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
          <div>
            <ModeBadge mode="already_graded"/>
            <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 10 }}>
              Quiz 8.3 — distributing &amp; combining
            </div>
            <div style={{ fontSize: '1rem', color: G.inkSoft, marginTop: 8 }}>Marcus Reilly · 9th · uploaded April 28 · 4 pages</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Re-run</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Print</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Save to Marcus</button>
          </div>
        </div>
      </div>

      {/* ────────────  TOP — THE SENTENCE  ──────────── */}
      <div style={{ padding: '0 80px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ padding: '36px 40px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>WHAT THIS QUIZ TELLS US</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.889rem', fontWeight: 400, color: G.ink, lineHeight: 1.3, margin: '14px 0 0', maxWidth: 920, letterSpacing: '-0.014em' }}>
            Marcus got <strong style={{ fontWeight: 500 }}>14 of 18</strong>. Three of the four he missed share the same pattern: <span style={{ color: G.accent }}>he's losing the negative when he distributes.</span>
          </p>
          <p style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, margin: '18px 0 0', maxWidth: 760 }}>
            That's a five-minute conversation, not a tutor. The fourth wrong answer is unrelated — a fraction-conversion slip.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 14, alignItems: 'center' }}>
            <a style={{ fontSize: '0.944rem', color: G.accent }}>See the pattern below ↓</a>
            <span style={{ color: G.inkMute, fontSize: '0.889rem' }}>· or print a one-page intervention</span>
          </div>
        </div>
      </div>

      {/* ────────────  MIDDLE — PER-PATTERN GROUPING  ──────────── */}
      <div style={{ padding: '64px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <Crumb trail={['Patterns in this quiz', '2 found']}/>

        {/* Pattern 1 — primary, recurring */}
        <div style={{ marginTop: 18, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, overflow: 'hidden' }}>
          <div style={{ padding: '24px 32px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>EXECUTION · RECURRING IN MARCUS'S WORK</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.667rem', fontWeight: 500, marginTop: 8, letterSpacing: '-0.012em' }}>Drops the negative when distributing.</div>
                <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, lineHeight: 1.5, margin: '10px 0 0', maxWidth: 720 }}>
                  When a negative is multiplied across a parenthetical, the sign attaches to the first term but disappears on the rest.
                  <span style={{ color: G.ink }}> Three of his four wrong answers fit this.</span>
                </p>
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, color: G.ink }}>3</div>
            </div>
          </div>

          {/* Per-problem detail under this pattern */}
          {[
            { num: 4, prompt: 'Simplify: −2(x − 3) + 5x', work: ['−2(x − 3) + 5x', '= −2x − 6 + 5x  ✗', '= 3x − 6'], mistake: 'Sign on −3 lost', correct: '−2x + 6 + 5x = 3x + 6' },
            { num: 7, prompt: 'Simplify: 4 − 3(2y − 1)', work: ['4 − 3(2y − 1)', '= 4 − 6y − 3  ✗', '= 1 − 6y'], mistake: 'Sign on −1 lost', correct: '4 − 6y + 3 = 7 − 6y' },
            { num: 12, prompt: '−(a − 4b)', work: ['−(a − 4b)', '= −a − 4b  ✗'], mistake: 'Sign on −4b lost', correct: '−a + 4b' },
          ].map((p, i) => (
            <div key={i} style={{ padding: '24px 32px', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', display: 'grid', gridTemplateColumns: '60px 1.2fr 1fr 1fr 80px', gap: 22, alignItems: 'flex-start' }}>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.667rem', color: G.inkMute }}>#{p.num}</div>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>PROBLEM</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 4 }}>{p.prompt}</div>
              </div>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>MARCUS'S WORK</div>
                <div style={{ marginTop: 4 }}>
                  <HandwrittenWork lines={p.work}/>
                </div>
                <div style={{ fontFamily: G.sans, fontSize: '0.833rem', color: G.insight, marginTop: 6, fontStyle: 'italic' }}>↑ {p.mistake}</div>
              </div>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>WHAT IT SHOULD BE</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6, color: G.ink }}>{p.correct}</div>
              </div>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase', cursor: 'pointer' }}>Steps ›</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pattern 2 — secondary, one-off */}
        <div style={{ marginTop: 28, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, overflow: 'hidden' }}>
          <div style={{ padding: '24px 32px', borderBottom: `1px solid ${G.ruleSoft}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>CONCEPTUAL · ONE-OFF</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.444rem', fontWeight: 500, marginTop: 8 }}>Fraction-to-decimal conversion.</div>
                <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.55, margin: '10px 0 0', maxWidth: 660 }}>
                  Single occurrence in this quiz. Probably not a pattern, but worth a glance.
                </p>
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, color: G.inkMute }}>1</div>
            </div>
          </div>
          <div style={{ padding: '20px 32px', display: 'grid', gridTemplateColumns: '60px 1.2fr 1fr 1fr 80px', gap: 22, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.667rem', color: G.inkMute }}>#9</div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>PROBLEM</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 4 }}>Convert 3/8 to decimal</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>MARCUS'S WORK</div>
              <div style={{ marginTop: 4 }}><HandwrittenWork lines={['0.385']}/></div>
              <div style={{ fontFamily: G.sans, fontSize: '0.833rem', color: G.insight, marginTop: 6, fontStyle: 'italic' }}>↑ remainder mishandled</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>WHAT IT SHOULD BE</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6 }}>0.375</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>Steps ›</div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────  BOTTOM — ALL PROBLEMS + PAGES  ──────────── */}
      <div style={{ padding: '64px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <Crumb trail={['Everything else']}/>
        <p style={{ fontSize: '0.944rem', color: G.inkSoft, marginTop: 10, maxWidth: 600 }}>The 14 problems Marcus got right. Tap any to see his work.</p>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8 }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map(n => {
            const wrong = [4, 7, 9, 12].includes(n);
            return (
              <div key={n} style={{ aspectRatio: '1 / 1', border: `1px solid ${wrong ? G.insight : G.rule}`, background: wrong ? 'oklch(0.97 0.04 72)' : G.paper, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', color: G.inkMute }}>#{n}</div>
                <div style={{ fontFamily: G.serif, fontSize: '0.944rem', color: wrong ? G.insight : G.ink, marginTop: 2 }}>{wrong ? '✗' : '✓'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pages reel */}
      <div style={{ padding: '56px 80px 96px', maxWidth: 1180, margin: '0 auto' }}>
        <Crumb trail={['Pages', '4 photographed']}/>
        <div style={{ marginTop: 18, display: 'flex', gap: 16 }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{ flex: 1, aspectRatio: '8.5 / 11', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, padding: '14px 16px', position: 'relative' }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.611rem', color: G.inkMute, letterSpacing: '0.1em' }}>PAGE {n} OF 4</div>
              {/* fake quiz lines */}
              {Array.from({ length: 14 }, (_, i) => (
                <div key={i} style={{ height: i % 4 === 0 ? 2 : 1, background: G.ruleSoft, marginTop: i === 0 ? 16 : 14, width: `${60 + (i * 13) % 35}%` }}/>
              ))}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
window.DiagnosisParent = DiagnosisParent;

// ═════════════════════════════════════════════════════════════════════
// TEACHER · WITH-KEY MODE · single student · INLINE CORRECTION OPEN
// ═════════════════════════════════════════════════════════════════════
function DiagnosisTeacher() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 1400 }}>
      <NavHeader4 role="teacher" activeTab="assessments"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <Crumb trail={['Assessments', '4th period · Quiz 9.1', 'David Park']}/>
      </div>

      <div style={{ padding: '16px 80px 36px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
          <div>
            <ModeBadge mode="with_key"/>
            <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 10 }}>
              Quiz 9.1 — equations review
            </div>
            <div style={{ fontSize: '1rem', color: G.inkSoft, marginTop: 8 }}>David Park · 4th period · uploaded April 26 · graded against <a style={{ color: G.accent }}>Quiz 9.1 key</a></div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>‹ Prev student</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '10px 16px', borderRadius: 3 }}>Next student ›</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.944rem', color: G.paper, background: G.ink, border: 'none', padding: '10px 18px', borderRadius: 3 }}>Done</button>
          </div>
        </div>
      </div>

      {/* THE SENTENCE — teacher tone, with class context */}
      <div style={{ padding: '0 80px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ padding: '36px 40px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, borderLeft: `3px solid ${G.accent}` }}>
          <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>WHAT YOU'RE LOOKING AT</div>
          <p style={{ fontFamily: G.serif, fontSize: '1.889rem', fontWeight: 400, color: G.ink, lineHeight: 1.3, margin: '14px 0 0', maxWidth: 1000, letterSpacing: '-0.014em' }}>
            <strong style={{ fontWeight: 500 }}>6 of 12.</strong> Three of David's six wrong answers share a conceptual gap: <span style={{ color: G.accent }}>combining like terms when one has a coefficient.</span>
          </p>
          <div style={{ display: 'flex', gap: 28, marginTop: 22, fontSize: '0.944rem', color: G.inkSoft, alignItems: 'center', flexWrap: 'wrap' }}>
            <span><strong style={{ color: G.ink, fontFamily: G.serif }}>Class</strong>: only 4 of 27 share this. <a style={{ color: G.accent }}>Open class view →</a></span>
            <span style={{ color: G.rule }}>·</span>
            <span><strong style={{ color: G.ink, fontFamily: G.serif }}>Recurring for David</strong>: third quiz. <a style={{ color: G.accent }}>See history →</a></span>
            <span style={{ color: G.rule }}>·</span>
            <span><a style={{ color: G.accent }}>Print intervention handout</a></span>
          </div>
        </div>
      </div>

      {/* PATTERN GROUP with inline correction OPEN on first card */}
      <div style={{ padding: '64px 80px 0', maxWidth: 1280, margin: '0 auto' }}>
        <Crumb trail={['Patterns in this quiz', '3 found']}/>

        <div style={{ marginTop: 18, border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, overflow: 'hidden' }}>
          <div style={{ padding: '24px 32px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>CONCEPTUAL · 3 OF 6 WRONG · CLASS RATE 4 / 27</div>
                <div style={{ fontFamily: G.serif, fontSize: '1.667rem', fontWeight: 500, marginTop: 8, letterSpacing: '-0.012em' }}>Combining like terms with coefficients.</div>
                <p style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, lineHeight: 1.5, margin: '10px 0 0', maxWidth: 800 }}>
                  When a coefficient is present, David treats the variable and coefficient as separate terms. He's combined <em>x</em> with <em>3x</em> as if they were unrelated.
                </p>
              </div>
              <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, color: G.ink }}>3</div>
            </div>
          </div>

          {/* Card #1 — INLINE CORRECTION OPEN */}
          <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '60px 1.1fr 1fr 1fr 130px', gap: 22, alignItems: 'flex-start', background: 'oklch(0.97 0.012 252)' }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.667rem', color: G.inkMute }}>#3</div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>PROBLEM</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 4 }}>Combine: x + 3x − 2</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>DAVID'S WORK</div>
              <div style={{ marginTop: 4 }}><HandwrittenWork lines={['x + 3x − 2', '= 3x² − 2  ✗']}/></div>
            </div>
            <div style={{ paddingLeft: 18, borderLeft: `2px solid ${G.accent}` }}>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>EDITING THIS DIAGNOSIS</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '0.833rem', color: G.inkMute, marginBottom: 4 }}>Pattern:</div>
                <div style={{ fontFamily: G.sans, fontSize: '0.944rem', padding: '8px 12px', border: `1px solid ${G.accent}`, borderRadius: 3, background: G.paper, color: G.ink, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Combining like terms with coefficients <span style={{ color: G.inkMute, fontSize: '0.833rem' }}>change ▾</span>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: '0.889rem', color: G.inkSoft, cursor: 'pointer' }}>
                  <span style={{ width: 14, height: 14, border: `1.5px solid ${G.rule}`, borderRadius: 2, display: 'inline-block' }}/>
                  Mark as actually correct
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button style={{ fontFamily: G.sans, fontSize: '0.833rem', color: G.paper, background: G.ink, border: 'none', padding: '6px 12px', borderRadius: 3 }}>Save</button>
                  <button style={{ fontFamily: G.sans, fontSize: '0.833rem', color: G.inkSoft, background: 'transparent', border: 'none', padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>EDITING…</div>
            </div>
          </div>

          {/* Card #2 — closed */}
          <div style={{ padding: '24px 32px', borderTop: `1px solid ${G.ruleSoft}`, display: 'grid', gridTemplateColumns: '60px 1.1fr 1fr 1fr 130px', gap: 22, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.667rem', color: G.inkMute }}>#5</div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>PROBLEM</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 4 }}>Simplify: 2y + 5y − y</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>DAVID'S WORK</div>
              <div style={{ marginTop: 4 }}><HandwrittenWork lines={['2y + 5y − y', '= 10y³  ✗']}/></div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>WHAT IT SHOULD BE</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6 }}>6y</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <a style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>Steps ›</a>
              <a style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.inkMute, textTransform: 'uppercase' }}>Edit ›</a>
            </div>
          </div>

          <div style={{ padding: '24px 32px', borderTop: `1px solid ${G.ruleSoft}`, display: 'grid', gridTemplateColumns: '60px 1.1fr 1fr 1fr 130px', gap: 22, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: '1.667rem', color: G.inkMute }}>#9</div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>PROBLEM</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.111rem', marginTop: 4 }}>Simplify: 3a + a + 4</div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>DAVID'S WORK</div>
              <div style={{ marginTop: 4 }}><HandwrittenWork lines={['3a + a + 4', '= 3a² + 4  ✗']}/></div>
            </div>
            <div>
              <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>WHAT IT SHOULD BE</div>
              <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6 }}>4a + 4</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <a style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.accent, textTransform: 'uppercase' }}>Steps ›</a>
              <a style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.1em', color: G.inkMute, textTransform: 'uppercase' }}>Edit ›</a>
            </div>
          </div>
        </div>

        {/* Pattern group 2 — collapsed summary */}
        <div style={{ marginTop: 22, padding: '20px 32px', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>EXECUTION · 2 OF 6 WRONG</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6 }}>Sign tracking through equations.</div>
          </div>
          <a style={{ fontSize: '0.889rem', color: G.accent }}>Open ›</a>
        </div>

        <div style={{ marginTop: 12, padding: '20px 32px', border: `1px solid ${G.rule}`, borderRadius: 4, background: G.paper, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>VERIFICATION · 1 OF 6 WRONG</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', marginTop: 6 }}>Verification step skipped.</div>
          </div>
          <a style={{ fontSize: '0.889rem', color: G.accent }}>Open ›</a>
        </div>
      </div>

      {/* Page roll-up */}
      <div style={{ padding: '64px 80px 96px', maxWidth: 1280, margin: '0 auto' }}>
        <Crumb trail={['12 problems · 6 wrong · 1 edited']}/>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
            const wrong = [3, 5, 7, 9, 10, 11].includes(n);
            const edited = n === 3;
            return (
              <div key={n} style={{ aspectRatio: '1 / 1', border: `1px solid ${edited ? G.accent : wrong ? G.insight : G.rule}`, background: edited ? 'oklch(0.97 0.012 252)' : wrong ? 'oklch(0.97 0.04 72)' : G.paper, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontFamily: G.mono, fontSize: '0.667rem', color: G.inkMute }}>#{n}</div>
                <div style={{ fontFamily: G.serif, fontSize: '0.944rem', color: edited ? G.accent : wrong ? G.insight : G.ink, marginTop: 2 }}>{edited ? '✎' : wrong ? '✗' : '✓'}</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
window.DiagnosisTeacher = DiagnosisTeacher;

// ═════════════════════════════════════════════════════════════════════
// WITH-KEY VIEWER · side-by-side · answers question 7 from §8 of brief
// ═════════════════════════════════════════════════════════════════════
function WithKeyViewer() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 760 }}>
      <NavHeader4 role="teacher" activeTab="assessments"/>

      <div style={{ padding: '32px 40px 16px', maxWidth: 1380, margin: '0 auto' }}>
        <Crumb trail={['Assessments', 'Quiz 9.1', 'David Park', 'Side-by-side viewer']}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
          <div style={{ fontFamily: G.serif, fontSize: '1.778rem', fontWeight: 400, letterSpacing: '-0.014em' }}>Problem #3 — David's work, side by side with the key.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '8px 14px', borderRadius: 3 }}>‹ #2</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.inkSoft, background: 'transparent', border: `1px solid ${G.rule}`, padding: '8px 14px', borderRadius: 3 }}>#4 ›</button>
            <button style={{ fontFamily: G.sans, fontSize: '0.889rem', color: G.inkSoft, background: G.paper, border: `1px solid ${G.rule}`, padding: '8px 14px', borderRadius: 3 }}>Close viewer</button>
          </div>
        </div>
      </div>

      {/* Tabs row */}
      <div style={{ padding: '0 40px', maxWidth: 1380, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${G.ruleSoft}` }}>
          {[['Side-by-side', true], ['Student only', false], ['Key only', false], ['Steps & explanation', false]].map(([l, a], i) => (
            <div key={i} style={{ padding: '10px 0', fontSize: '0.889rem', color: a ? G.ink : G.inkSoft, fontWeight: a ? 500 : 400, borderBottom: a ? `2px solid ${G.ink}` : '2px solid transparent', marginBottom: -1 }}>{l}</div>
          ))}
        </div>
      </div>

      {/* Two pages side by side */}
      <div style={{ padding: '24px 40px 56px', maxWidth: 1380, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Student panel */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 6px' }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>DAVID'S PAPER · PAGE 1</div>
            <div style={{ fontSize: '0.833rem', color: G.inkMute }}>1 of 4</div>
          </div>
          <div style={{ aspectRatio: '8.5 / 11', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, padding: '40px 44px', position: 'relative' }}>
            <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft }}>3.  Combine: x + 3x − 2</div>
            <div style={{ marginTop: 18, marginLeft: 28 }}>
              <HandwrittenWork lines={['x + 3x − 2', '= 3x² − 2']}/>
            </div>
            {/* Highlighted error */}
            <div style={{ position: 'absolute', top: 96, left: 60, right: 100, height: 36, border: `2px solid ${G.insight}`, borderRadius: 4, background: 'oklch(0.97 0.04 72 / 0.4)' }}/>
            <div style={{ position: 'absolute', top: 140, left: 110, fontFamily: G.hand, fontSize: '1.222rem', color: G.insight, transform: 'rotate(-2deg)' }}>↑ x + 3x = 4x, not 3x²</div>

            <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, marginTop: 80 }}>4.  Simplify: 5(2 − x) + 3x</div>
            <div style={{ marginTop: 12, marginLeft: 28 }}><HandwrittenWork lines={['10 − 5x + 3x', '= 10 − 2x ✓']}/></div>
          </div>
        </div>

        {/* Key panel */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 6px' }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>QUIZ 9.1 KEY · PAGE 1</div>
            <div style={{ fontSize: '0.833rem', color: G.accent }}>Open key</div>
          </div>
          <div style={{ aspectRatio: '8.5 / 11', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, padding: '40px 44px' }}>
            <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft }}>3.  Combine: x + 3x − 2</div>
            <div style={{ marginTop: 18, marginLeft: 28 }}>
              <PrintedSolution lines={['x + 3x = 4x  (combine x-terms)', '4x − 2  (final)']}/>
            </div>
            <div style={{ marginTop: 14, marginLeft: 28, fontFamily: G.serif, fontSize: '1.333rem', color: G.ink, fontWeight: 500 }}>Answer: 4x − 2</div>

            <div style={{ fontFamily: G.serif, fontSize: '1.111rem', color: G.inkSoft, marginTop: 32 }}>4.  Simplify: 5(2 − x) + 3x</div>
            <div style={{ marginTop: 14, marginLeft: 28 }}>
              <PrintedSolution lines={['5(2 − x) + 3x = 10 − 5x + 3x', '= 10 − 2x']}/>
            </div>
            <div style={{ marginTop: 10, marginLeft: 28, fontFamily: G.serif, fontSize: '1.333rem', color: G.ink, fontWeight: 500 }}>Answer: 10 − 2x</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.WithKeyViewer = WithKeyViewer;

// ═════════════════════════════════════════════════════════════════════
// PROCESSING STATE — empathetic, role-aware
// ═════════════════════════════════════════════════════════════════════
function ProcessingState() {
  const G = window.GS;

  return (
    <div style={{ background: G.paper, fontFamily: G.sans, color: G.ink, minHeight: 760 }}>
      <NavHeader4 role="parent" activeTab="students"/>

      <div style={{ padding: '40px 80px 0', maxWidth: 1180, margin: '0 auto' }}>
        <Crumb trail={['Students', 'Marcus Reilly', 'Quiz 8.3 · Apr 28']}/>
      </div>

      <div style={{ padding: '16px 80px 56px', maxWidth: 1180, margin: '0 auto' }}>
        <ModeBadge mode="already_graded"/>
        <div style={{ fontFamily: G.serif, fontSize: '2.667rem', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 10 }}>
          Quiz 8.3 — distributing &amp; combining
        </div>
        <div style={{ fontSize: '1rem', color: G.inkSoft, marginTop: 8 }}>Marcus Reilly · 4 pages uploaded</div>
      </div>

      {/* The "we're reading it" moment */}
      <div style={{ padding: '0 80px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ padding: '56px 56px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, textAlign: 'left', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>READING THE QUIZ</div>
            <div style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, marginTop: 14, lineHeight: 1.2, letterSpacing: '-0.014em', maxWidth: 540 }}>
              We're working through Marcus's paper. Usually about thirty seconds.
            </div>
            <p style={{ fontFamily: G.serif, fontSize: '1.111rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.55, marginTop: 16, maxWidth: 480 }}>
              You can close this page. We'll save the result to Marcus when it's ready, and you can come back any time.
            </p>

            {/* Steps */}
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { state: 'done', label: 'Pages received' },
                { state: 'done', label: 'Reading the marks the teacher made' },
                { state: 'doing', label: 'Looking at where Marcus went off' },
                { state: 'todo', label: 'Naming the pattern' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${s.state === 'done' ? G.accent : G.rule}`, background: s.state === 'done' ? G.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.state === 'done' && <span style={{ color: G.paper, fontSize: 9, fontWeight: 700 }}>✓</span>}
                  </span>
                  <span style={{ fontSize: '0.944rem', color: s.state === 'doing' ? G.ink : s.state === 'todo' ? G.inkMute : G.inkSoft, fontFamily: G.serif, fontStyle: s.state === 'doing' ? 'italic' : 'normal' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Page thumbnails being "read" */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[1, 2, 3, 4].map((n, i) => (
              <div key={n} style={{ aspectRatio: '8.5 / 11', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
                {Array.from({ length: 8 }, (_, k) => (
                  <div key={k} style={{ height: 1, background: G.ruleSoft, marginTop: k === 0 ? 12 : 8, width: `${50 + (k * 11) % 40}%` }}/>
                ))}
                {i === 1 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: G.accent, opacity: 0.7 }}/>}
              </div>
            ))}
          </div>
        </div>

        {/* Trust strip during wait */}
        <div style={{ marginTop: 24, fontSize: '0.889rem', color: G.inkMute, textAlign: 'center' }}>
          Marcus's pages are stored encrypted. Auto-deleted after 30 days.
        </div>
      </div>
    </div>
  );
}
window.ProcessingState = ProcessingState;

// ═════════════════════════════════════════════════════════════════════
// CONTEXT
// ═════════════════════════════════════════════════════════════════════
function ContextCard4() {
  const G = window.GS;
  return (
    <div style={{ background: G.paperSoft, padding: '40px 48px', minHeight: 600, fontFamily: G.sans }}>
      <div style={{ fontFamily: G.mono, fontSize: '0.722rem', letterSpacing: '0.14em', color: G.inkMute, textTransform: 'uppercase' }}>Session 04 · context</div>
      <h2 style={{ fontFamily: G.serif, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 22, maxWidth: 760, lineHeight: 1.2 }}>
        From a flat list of problems to a story about a student.
      </h2>
      <p style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, maxWidth: 720, margin: 0 }}>
        Today's <code style={{ background: G.paper, padding: '1px 8px', borderRadius: 3, fontFamily: G.mono, fontSize: '0.833em', color: G.ink }}>&lt;DiagnosisDisplay&gt;</code> renders cards in a row. The redesign turns that into three layers — the sentence at the top, patterns in the middle, problems at the bottom — and answers the open questions on inline correction and the with-key viewer.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 28 }}>
        {[
          { eb: 'TOP', t: 'The sentence.', d: 'One headline. The aggregate insight. A parent who reads only this gets the right thing to do.' },
          { eb: 'MIDDLE', t: 'Per-pattern groups.', d: 'Cards grouped by error pattern, named once. The recurring one comes first; one-offs after; clean problems at the bottom.' },
          { eb: 'BOTTOM', t: 'Per-problem detail.', d: 'Three-column layout: prompt · student\'s handwritten work · what it should be. Steps available on demand.' },
          { eb: 'EDIT', t: 'Inline correction.', d: 'Teachers click "Edit" on any card and an inline panel slides in — change the pattern, mark as actually correct, undo path included. Logs to diagnostic_reviews.' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '20px 22px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 4 }}>
            <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>{c.eb}</div>
            <div style={{ fontFamily: G.serif, fontSize: '1.222rem', fontWeight: 500, marginTop: 8 }}>{c.t}</div>
            <p style={{ fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.5, margin: '8px 0 0' }}>{c.d}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, padding: '22px 26px', background: G.paper, border: `1px solid ${G.ruleSoft}`, borderRadius: 4, maxWidth: 920 }}>
        <div style={{ fontFamily: G.mono, fontSize: '0.667rem', letterSpacing: '0.14em', color: G.accent, textTransform: 'uppercase' }}>Decisions for this session</div>
        <ul style={{ marginTop: 10, fontSize: '0.944rem', color: G.inkSoft, lineHeight: 1.6 }}>
          <li>Approve the <strong style={{ color: G.ink }}>three-layer narrative</strong> (sentence → patterns → problems).</li>
          <li>Confirm <strong style={{ color: G.ink }}>inline-edit panel</strong> as the correction UI (vs. a modal).</li>
          <li>Approve the <strong style={{ color: G.ink }}>side-by-side viewer</strong> as the answer to with-key mode (with tabs for student-only / key-only / steps).</li>
          <li>Sign off on the <strong style={{ color: G.ink }}>processing state copy</strong> ("We're reading the quiz"). Calmer than a spinner.</li>
          <li>Greenlight <strong style={{ color: G.ink }}>Session 05 — Supporting surfaces</strong>.</li>
        </ul>
      </div>
    </div>
  );
}
window.ContextCard4 = ContextCard4;
