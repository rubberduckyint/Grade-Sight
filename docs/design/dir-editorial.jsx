// Direction 1 — "The Editorial"
// Text-forward. Serif-led. Reads like a considered essay.
// Closest to NYT Opinion / The Atlantic in structure.
// Pushes hardest on "thoughtful."

function DirEditorial() {
  const G = window.GL;
  const W = 1200;

  const page = {
    width: W,
    background: G.paper,
    color: G.ink,
    fontFamily: G.sans,
    fontSize: 15,
    lineHeight: 1.55,
  };

  const nav = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '22px 64px',
    borderBottom: `1px solid ${G.ruleSoft}`,
    fontSize: 13, letterSpacing: '0.02em',
  };

  const rule = { height: 1, background: G.ruleSoft };

  // ── Hero ──
  const hero = {
    display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 72,
    padding: '96px 64px 88px', alignItems: 'start',
  };

  // ── Section shell ──
  const section = { padding: '80px 64px', borderTop: `1px solid ${G.ruleSoft}` };
  const eyebrow = { fontFamily: G.sans, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: G.accent, marginBottom: 14 };

  return (
    <div style={page}>
      {/* NAV */}
      <nav style={nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${G.ink}`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>Grade Sight</span>
        </div>
        <div style={{ display: 'flex', gap: 32, color: G.inkSoft }}>
          <span>For parents</span>
          <span>For teachers</span>
          <span>How it works</span>
          <span>Privacy</span>
          <span>Pricing</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ color: G.inkSoft }}>Sign in</span>
          <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '8px 16px', borderRadius: 2, fontSize: 13, fontWeight: 500, fontFamily: G.sans, cursor: 'pointer' }}>Start a diagnosis</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={hero}>
        <div>
          <div style={{ ...eyebrow, color: G.inkMute }}>A diagnostic tool for secondary math</div>
          <h1 className="gl-serif" style={{ fontSize: 68, lineHeight: 1.02, fontWeight: 400, margin: '0 0 28px', letterSpacing: '-0.025em' }}>
            Not just <span className="gl-serif-italic" style={{ color: G.inkSoft }}>what</span> your student got wrong.<br />
            <span style={{ color: G.accent }}>Why.</span>
          </h1>
          <p className="gl-serif" style={{ fontSize: 20, lineHeight: 1.5, color: G.inkSoft, margin: '0 0 36px', maxWidth: 500, fontWeight: 300 }}>
            Upload a math assessment. Grade Sight reads the work, names the pattern behind the errors, and suggests a small, specific thing to try next.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '14px 22px', borderRadius: 2, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Try with a photo →</button>
            <span style={{ color: G.inkMute, fontSize: 13 }}>Free for your first three assessments. No account needed.</span>
          </div>

          {/* Two-audience rail */}
          <div style={{ marginTop: 72, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: `1px solid ${G.ruleSoft}` }}>
            <div style={{ padding: '20px 24px 20px 0', borderRight: `1px solid ${G.ruleSoft}` }}>
              <div style={eyebrow}>For parents</div>
              <div className="gl-serif" style={{ fontSize: 17, lineHeight: 1.4 }}>Understand what's happening — in plain language, without a math degree.</div>
            </div>
            <div style={{ padding: '20px 0 20px 24px' }}>
              <div style={{ ...eyebrow, color: G.insight }}>For teachers</div>
              <div className="gl-serif" style={{ fontSize: 17, lineHeight: 1.4 }}>Grade a stack in half the time. Surface patterns across the class.</div>
            </div>
          </div>
        </div>

        {/* Hero visual — the assessment itself */}
        <div style={{ position: 'relative', paddingTop: 20 }}>
          <window.AssessmentMock />
          <div style={{ position: 'absolute', bottom: -20, left: -32, fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.06em' }}>
            Fig. 1 — A diagnosed quiz. Not a score; a conversation.
          </div>
        </div>
      </div>

      {/* THE DIAGNOSIS — editorial pull quote section */}
      <div style={{ ...section, padding: '96px 64px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={eyebrow}>What the product does</div>
          <p className="gl-serif" style={{ fontSize: 40, lineHeight: 1.25, fontWeight: 400, margin: 0, letterSpacing: '-0.015em' }}>
            Most grading tools stop at <span className="gl-serif-italic" style={{ color: G.inkSoft }}>right</span> or <span className="gl-serif-italic" style={{ color: G.inkSoft }}>wrong</span>. Grade Sight names the pattern behind the wrong answers — a sign error when distributing negatives, a skipped verification step, a concept that hasn't landed — and suggests one small thing to try.
          </p>
        </div>
      </div>

      {/* THREE-COLUMN — the diagnostic categories */}
      <div style={{ ...section, paddingTop: 64 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 56 }}>
          {[
            { n: '01', k: 'Execution', t: 'Arithmetic slips, sign errors, transcription mistakes. The student knows the method — something fell out along the way.' },
            { n: '02', k: 'Concept', t: 'A rule or relationship that hasn\'t settled. Recurs across problems that share the same underlying idea.' },
            { n: '03', k: 'Strategy', t: 'The work is correct but the path is fragile — skipped verification, no sanity check, no second route when the first one stalls.' },
          ].map(c => (
            <div key={c.n}>
              <div className="gl-mono" style={{ fontSize: 11, color: G.inkMute, marginBottom: 18, letterSpacing: '0.1em' }}>{c.n} —</div>
              <h3 className="gl-serif" style={{ fontSize: 26, margin: '0 0 12px', fontWeight: 500, letterSpacing: '-0.01em' }}>{c.k}</h3>
              <p style={{ margin: 0, color: G.inkSoft, fontSize: 15, lineHeight: 1.6 }}>{c.t}</p>
            </div>
          ))}
        </div>
      </div>

      {/* LONGITUDINAL TRACKING — restrained data moment */}
      <div style={section}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>Patterns over time</div>
            <h2 className="gl-serif" style={{ fontSize: 38, lineHeight: 1.15, margin: '0 0 20px', fontWeight: 400, letterSpacing: '-0.02em' }}>
              One test is a snapshot.<br />Six tests is a story.
            </h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 16, lineHeight: 1.6, maxWidth: 420 }}>
              Grade Sight tracks the diagnostic pattern across every assessment you upload. When an old weakness resolves, you'll see it. When one keeps coming back, you'll see that too — honestly.
            </p>
          </div>
          <LongitudinalMini />
        </div>
      </div>

      {/* INTERVENTION CARD preview */}
      <div style={section}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 64, alignItems: 'center' }}>
          <InterventionCardMini />
          <div>
            <div style={eyebrow}>What the student gets</div>
            <h2 className="gl-serif" style={{ fontSize: 38, lineHeight: 1.15, margin: '0 0 20px', fontWeight: 400, letterSpacing: '-0.02em' }}>
              A small card they can keep at their desk.
            </h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 16, lineHeight: 1.6, maxWidth: 420 }}>
              When a pattern is identified, the system suggests a short, memorable framework — something a student can carry in their head. Print it. Tape it up. Forget it once the habit sticks.
            </p>
          </div>
        </div>
      </div>

      {/* PRIVACY — functional and warm, not legal */}
      <div style={{ ...section, background: G.paperSoft }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'start' }}>
          <div>
            <div style={eyebrow}>On privacy</div>
            <h2 className="gl-serif" style={{ fontSize: 36, lineHeight: 1.2, margin: '0 0 20px', fontWeight: 400, letterSpacing: '-0.02em' }}>
              Your student's work belongs to your student.
            </h2>
            <p style={{ margin: 0, color: G.inkSoft, fontSize: 16, lineHeight: 1.65, maxWidth: 440 }}>
              We store what's needed to track patterns over time, and nothing else. You can see everything we have. You can export it. You can delete it — all of it — in one click. No dark patterns. No retention loopholes. This page exists because we think it should.
            </p>
            <div style={{ marginTop: 28, fontSize: 13, color: G.accent, textDecoration: 'underline', textUnderlineOffset: 4 }}>See your data controls →</div>
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 12.5, color: G.inkSoft, lineHeight: 2 }}>
            <div style={{ color: G.inkMute, fontSize: 10.5, letterSpacing: '0.1em', marginBottom: 10 }}>WHAT WE STORE</div>
            <div>— Student first name (optional)</div>
            <div>— Uploaded assessment images</div>
            <div>— Diagnostic categories per problem</div>
            <div>— Timestamp and subject area</div>
            <div style={{ color: G.inkMute, fontSize: 10.5, letterSpacing: '0.1em', margin: '24px 0 10px' }}>WHAT WE DON'T</div>
            <div>— School or district affiliation</div>
            <div>— Identifying images of the student</div>
            <div>— Any data used for ad targeting</div>
            <div>— Anything shared with third parties</div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '120px 64px', textAlign: 'center', borderTop: `1px solid ${G.ruleSoft}` }}>
        <h2 className="gl-serif" style={{ fontSize: 56, lineHeight: 1.05, fontWeight: 400, margin: '0 0 24px', letterSpacing: '-0.025em', maxWidth: 780, marginLeft: 'auto', marginRight: 'auto' }}>
          One photo. One honest reading of where your student actually is.
        </h2>
        <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '16px 28px', borderRadius: 2, fontSize: 15, fontWeight: 500, marginTop: 12, cursor: 'pointer' }}>Start a diagnosis →</button>
        <div style={{ marginTop: 16, fontSize: 13, color: G.inkMute }}>No account needed for your first three.</div>
      </div>

      {/* Footer */}
      <div style={{ padding: '36px 64px', borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: G.inkMute }}>
        <span>© 2026 Grade Sight</span>
        <span>Built by teachers, parents, and one very patient math tutor.</span>
      </div>
    </div>
  );
}

// Mini: longitudinal tracking chart — restrained, no chart-junk
function LongitudinalMini() {
  const G = window.GL;
  const rows = [
    { label: 'Sign errors when distributing', points: [3, 2, 2, 1, 1, 0], note: 'Resolving', good: true },
    { label: 'Skipped verification step', points: [1, 2, 2, 2, 1, 2], note: 'Recurring' },
    { label: 'Factoring quadratics', points: [2, 1, 0, 0, 0, 0], note: 'Resolved', good: true },
    { label: 'Combining like terms', points: [0, 0, 1, 1, 0, 1], note: 'New' },
  ];
  return (
    <div style={{ border: `1px solid ${G.rule}`, borderRadius: 3, padding: '22px 26px', background: G.paper }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, marginBottom: 16, letterSpacing: '0.08em' }}>
        <span>PATTERNS · LAST 6 ASSESSMENTS</span>
        <span>ALGEBRA II</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px', gap: 16, alignItems: 'center', padding: '14px 0', borderTop: `1px solid ${G.ruleSoft}` }}>
          <div className="gl-serif" style={{ fontSize: 15, color: G.ink }}>{r.label}</div>
          <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 28 }}>
            {r.points.map((p, i) => (
              <div key={i} style={{
                flex: 1, height: Math.max(2, p * 8),
                background: r.good ? G.ink : G.mark,
                opacity: r.good ? (0.25 + (i / r.points.length) * 0.5) : (0.35 + (p / 3) * 0.5),
              }} />
            ))}
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 10.5, color: r.good ? G.accent : (r.note === 'Recurring' ? G.mark : G.inkMute), textAlign: 'right', letterSpacing: '0.06em' }}>{r.note.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

// Mini: intervention card — student-facing artifact
function InterventionCardMini() {
  const G = window.GL;
  return (
    <div style={{
      width: 380,
      background: G.paper,
      border: `1px solid ${G.rule}`,
      borderRadius: 3,
      padding: '26px 30px',
      boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 18px 40px -22px rgba(60,40,20,.22)',
      position: 'relative',
    }}>
      <div style={{ fontFamily: G.mono, fontSize: 10, letterSpacing: '0.14em', color: G.inkMute, marginBottom: 14 }}>INTERVENTION · SIGN ERRORS</div>
      <h3 className="gl-serif" style={{ fontSize: 28, margin: '0 0 6px', fontWeight: 500, letterSpacing: '-0.015em' }}>The Negative Check</h3>
      <div style={{ fontFamily: G.sans, fontSize: 13, color: G.inkSoft, marginBottom: 22 }}>Before you move on, ask one thing.</div>
      <div style={{ borderLeft: `2px solid ${G.insight}`, paddingLeft: 16, margin: '4px 0 22px' }}>
        <div className="gl-serif-italic" style={{ fontSize: 22, lineHeight: 1.4, color: G.ink }}>
          "If the number in front was negative, did the sign of everything after it flip?"
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, fontFamily: G.sans, fontSize: 12.5, color: G.inkSoft, paddingTop: 16, borderTop: `1px solid ${G.ruleSoft}` }}>
        <div><span style={{ color: G.ink, fontWeight: 600 }}>Print.</span> Tape it to the desk.</div>
        <div><span style={{ color: G.ink, fontWeight: 600 }}>Use it for two weeks.</span></div>
      </div>
    </div>
  );
}

window.DirEditorial = DirEditorial;
