// Direction 3 — "The Letter"
// First-person, intimate voice. The product speaks directly to the reader.
// Riskier, potentially most memorable. Pushes hardest on "human."

function DirLetter() {
  const G = window.GL;
  const W = 1200;

  const page = {
    width: W,
    background: G.paperSoft,
    color: G.ink,
    fontFamily: G.sans,
    fontSize: 15,
    lineHeight: 1.6,
  };

  const eyebrow = { fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 };

  return (
    <div style={page}>
      {/* Minimal nav — stays out of the way */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 56px', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 17, fontWeight: 500 }}>Grade Sight</span>
        </div>
        <div style={{ display: 'flex', gap: 28, color: G.inkSoft }}>
          <span>How it works</span><span>For teachers</span><span>Privacy</span><span>Sign in</span>
        </div>
      </nav>

      {/* THE LETTER — hero is a first-person note, with the assessment as the "evidence" */}
      <div style={{ padding: '80px 56px 60px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 80, alignItems: 'start' }}>
        <div>
          <div style={eyebrow}>A note from Grade Sight · 12 minutes ago</div>
          <h1 className="gl-serif" style={{ fontSize: 44, lineHeight: 1.18, fontWeight: 400, margin: '0 0 30px', letterSpacing: '-0.02em' }}>
            <span className="gl-serif-italic" style={{ color: G.accent }}>Here's what I saw</span> in Maya's quiz last night.
          </h1>

          <div className="gl-serif" style={{ fontSize: 20, lineHeight: 1.55, color: G.ink, fontWeight: 300, margin: '0 0 18px' }}>
            She knew the method on every problem. On question two, she dropped a sign when she distributed the negative — the same thing that happened on her chapter test two weeks ago.
          </div>
          <div className="gl-serif" style={{ fontSize: 20, lineHeight: 1.55, color: G.ink, fontWeight: 300, margin: '0 0 18px' }}>
            It's not that she doesn't understand. It's that her check happens after she's already written the next line. Fixing the habit is smaller than fixing the concept.
          </div>
          <div className="gl-serif" style={{ fontSize: 20, lineHeight: 1.55, color: G.inkSoft, fontWeight: 300, margin: '0 0 36px' }}>
            Here's one thing to try. It takes about ten seconds per problem.
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '14px 22px', borderRadius: 2, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Upload your student's work</button>
            <span style={{ color: G.inkMute, fontSize: 13 }}>or <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>see a sample diagnosis</span></span>
          </div>

          <div style={{ marginTop: 56, fontSize: 13, color: G.inkMute, maxWidth: 480 }}>
            <span className="gl-serif-italic">What you just read is what Grade Sight writes after reading an assessment.</span> It's a diagnostic tool for secondary math — Algebra through Pre-Calc — that tells you why a student lost points, not just how many. For parents, teachers, and the students in between.
          </div>
        </div>

        <div style={{ position: 'relative', paddingTop: 20 }}>
          <window.AssessmentMock width={400} height={500} />
          <div style={{ position: 'absolute', top: -8, right: -8, background: G.insightSoft, border: `1px solid ${G.rule}`, padding: '6px 10px', borderRadius: 2, fontFamily: G.mono, fontSize: 10, color: G.ink, letterSpacing: '0.08em' }}>THE EVIDENCE</div>
        </div>
      </div>

      {/* HOW IT WORKS — three quiet cards */}
      <div style={{ padding: '80px 56px', background: G.paper, borderTop: `1px solid ${G.ruleSoft}`, borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={eyebrow}>How it works</div>
          <h2 className="gl-serif" style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 400, margin: 0, letterSpacing: '-0.02em' }}>
            Three steps. No dashboards.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {[
            { n: 'Step one', t: 'Photograph the paper.', d: 'A quiz, a homework sheet, a test. From your phone, with shaky handwriting and bad lighting. We handle the rest.' },
            { n: 'Step two', t: 'Read the note we write you.', d: 'Not a score. A short paragraph in plain English: what we saw, what pattern it fits, what it probably means.' },
            { n: 'Step three', t: 'Try the one small thing.', d: 'A printable card with a single habit to try for two weeks. If the pattern resolves, we\'ll say so. If it doesn\'t, we\'ll be honest about that too.' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '24px 0', borderTop: `2px solid ${G.ink}` }}>
              <div style={{ ...eyebrow, marginBottom: 10, color: G.accent }}>{s.n}</div>
              <h3 className="gl-serif" style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px', letterSpacing: '-0.01em' }}>{s.t}</h3>
              <p style={{ margin: 0, color: G.inkSoft, fontSize: 14.5, lineHeight: 1.65 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* THE TWO VOICES — parent vs teacher */}
      <div style={{ padding: '88px 56px' }}>
        <div style={{ maxWidth: 680, marginBottom: 40 }}>
          <div style={eyebrow}>Two voices</div>
          <h2 className="gl-serif" style={{ fontSize: 36, lineHeight: 1.15, fontWeight: 400, margin: 0, letterSpacing: '-0.02em' }}>
            The same diagnosis. Told once like a letter, once like a chart.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ background: G.paper, border: `1px solid ${G.rule}`, padding: '32px 36px', borderRadius: 3 }}>
            <div style={{ ...eyebrow, color: G.accent }}>To a parent</div>
            <div className="gl-serif" style={{ fontSize: 19, lineHeight: 1.55, color: G.ink, fontWeight: 300 }}>
              Maya's doing the math right. She keeps dropping a negative sign in one specific spot — it's the same slip, showing up in a third assessment. Good news: this is a habit, not a hole. Here's a ten-second check she can practice for two weeks.
            </div>
          </div>
          <div style={{ background: G.ink, color: G.paper, padding: '32px 36px', borderRadius: 3, fontFamily: G.mono, fontSize: 13, lineHeight: 1.75 }}>
            <div style={{ color: G.insight, fontSize: 10.5, letterSpacing: '0.12em', marginBottom: 14 }}>TO A TEACHER</div>
            <div>Maya R · Unit 4 Q2, Q5, Q7</div>
            <div style={{ color: 'oklch(0.75 0.01 75)' }}>→ Execution · sign-flip · distributed negatives</div>
            <div style={{ color: 'oklch(0.75 0.01 75)' }}>→ Recurring: 3rd occurrence (Oct, Nov, Dec)</div>
            <div style={{ color: 'oklch(0.75 0.01 75)' }}>→ Class incidence Q5: 62% (reteach flag)</div>
            <div style={{ marginTop: 14, color: G.paper }}>Intervention: T-14 · Negative Check · 2 wk</div>
            <div style={{ color: G.insight }}>Confidence: high · Override available</div>
          </div>
        </div>
      </div>

      {/* PRIVACY — warm, as a promise */}
      <div style={{ padding: '96px 56px', background: G.paper, borderTop: `1px solid ${G.ruleSoft}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={eyebrow}>On privacy</div>
          <h2 className="gl-serif" style={{ fontSize: 38, lineHeight: 1.2, fontWeight: 400, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            Your student's work is your student's work.
          </h2>
          <p className="gl-serif" style={{ fontSize: 19, lineHeight: 1.6, color: G.inkSoft, fontWeight: 300, margin: '0 0 28px' }}>
            We store what's needed to track a pattern over time — assessments, diagnostic categories, timestamps. Nothing identifying. Nothing sold. Nothing used to train anything outside of your own account's diagnoses. You can see it all, export it, and delete every trace in one click.
          </p>
          <div style={{ fontSize: 14, color: G.accent, textDecoration: 'underline', textUnderlineOffset: 4 }}>Read the short, specific privacy page →</div>
        </div>
      </div>

      {/* CLOSING — signature */}
      <div style={{ padding: '120px 56px 80px', textAlign: 'center' }}>
        <div className="gl-serif-italic" style={{ fontSize: 34, lineHeight: 1.3, color: G.ink, maxWidth: 680, margin: '0 auto 32px', fontWeight: 300 }}>
          "Replace the confusion with clarity. Not the anxiety with data."
        </div>
        <div className="gl-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: G.inkMute, marginBottom: 48 }}>— THE OPERATING PRINCIPLE</div>
        <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '16px 28px', borderRadius: 2, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Start with one photo →</button>
      </div>

      <div style={{ padding: '36px 56px', borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: G.inkMute }}>
        <span>© 2026 Grade Sight</span>
        <span className="gl-serif-italic">Made for the Tuesday-night homework table.</span>
      </div>
    </div>
  );
}

window.DirLetter = DirLetter;
