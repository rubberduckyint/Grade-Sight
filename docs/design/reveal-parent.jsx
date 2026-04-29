// Diagnostic Reveal — Parent mode
// Airy, serif-led, first-person. The product speaks to the parent.
// Stages its entrance so pacing does the emotional work.

function DiagnosticRevealParent() {
  const G = window.GL;
  const W = 1200;
  const [stage, setStage] = React.useState(0);

  React.useEffect(() => {
    // Staged reveal: headline → evidence → pattern → intervention
    const timers = [
      setTimeout(() => setStage(1), 400),
      setTimeout(() => setStage(2), 1100),
      setTimeout(() => setStage(3), 1800),
      setTimeout(() => setStage(4), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const fade = (n) => ({
    opacity: stage >= n ? 1 : 0,
    transform: stage >= n ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1)',
  });

  const eyebrow = { fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.14em', textTransform: 'uppercase' };

  return (
    <div style={{ width: W, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 15, lineHeight: 1.55 }}>
      {/* Slim app chrome */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 18, height: 18, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 16, fontWeight: 500 }}>Grade Sight</span>
          <span style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.1em', marginLeft: 16 }}>PARENT VIEW · MAYA, 10TH GRADE</span>
        </div>
        <div style={{ display: 'flex', gap: 22, fontSize: 13, color: G.inkSoft }}>
          <span>History</span><span>Interventions</span><span>Data &amp; privacy</span>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ padding: '20px 40px 0', fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.08em' }}>
        MAYA · ALGEBRA II · UNIT 4 QUIZ · UPLOADED 12 MIN AGO
      </div>

      {/* THE OPENING — single headline, nothing else above it */}
      <div style={{ padding: '40px 80px 48px', maxWidth: 980 }}>
        <div style={{ ...fade(1), ...eyebrow, color: G.accent, marginBottom: 16 }}>
          What I saw
        </div>
        <h1 className="gl-serif" style={{ ...fade(1), fontSize: 46, lineHeight: 1.18, fontWeight: 400, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
          Maya knew the math on every problem. She dropped a <span className="gl-serif-italic" style={{ color: G.accent }}>negative sign</span> in one specific spot — the same slip she made on her October test.
        </h1>
        <div style={{ ...fade(2) }}>
          <p className="gl-serif" style={{ fontSize: 20, lineHeight: 1.55, color: G.inkSoft, fontWeight: 300, margin: 0, maxWidth: 760 }}>
            This is the third time I've seen it. It's a <span className="gl-serif-italic">habit</span>, not a misunderstanding — which is the good news. A ten-second check, practiced for two weeks, usually closes it.
          </p>
        </div>
      </div>

      {/* EVIDENCE — the assessment beside the pattern */}
      <div style={{ ...fade(3), padding: '0 80px 56px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 56, alignItems: 'start' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ ...eyebrow, marginBottom: 12 }}>The evidence</div>
          <window.AssessmentMock width={420} height={520} />
          <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, marginTop: 12, letterSpacing: '0.06em' }}>
            Tap any problem to see what I read there →
          </div>
        </div>

        <div>
          <div style={{ ...eyebrow, marginBottom: 12 }}>The pattern, in plain language</div>
          <PatternBlock
            headline="Distributing a negative over parentheses."
            tag="Execution slip"
            tagColor={G.mark}
            body="When Maya multiplies a negative number into something in parentheses, the sign of the second term doesn't flip. Her method is right. Her check is late."
            examples={[
              { when: 'October 14 — Chapter 3 test', what: 'Problem 4 — same slip' },
              { when: 'November 2 — Mid-ch. quiz', what: 'Problem 2 — same slip' },
              { when: 'Today — Unit 4 quiz', what: 'Problem 2 — same slip' },
            ]}
          />

          {/* Confidence */}
          <div style={{ marginTop: 20, padding: '14px 18px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <div style={{ color: G.inkSoft }}>
              <span className="gl-serif-italic">How sure am I?</span> <span style={{ color: G.ink }}>Fairly sure.</span> Three occurrences in eight weeks is a pattern.
            </div>
            <ConfidencePip level={3} />
          </div>
        </div>
      </div>

      {/* THE ONE THING TO TRY */}
      <div style={{ ...fade(4), padding: '56px 80px', background: G.paperSoft, borderTop: `1px solid ${G.ruleSoft}`, borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ ...eyebrow, color: G.insight }}>One thing to try</div>
            <h2 className="gl-serif" style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 400, margin: '14px 0 18px', letterSpacing: '-0.02em' }}>
              The Negative Check — ten seconds, once per problem.
            </h2>
            <p className="gl-serif" style={{ fontSize: 17, lineHeight: 1.55, color: G.inkSoft, fontWeight: 300, margin: 0, maxWidth: 460 }}>
              A one-sentence habit Maya can practice for two weeks. We'll watch for it on her next upload and tell you honestly whether it's working.
            </p>
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button style={{ background: G.ink, color: G.paper, border: 'none', padding: '12px 18px', borderRadius: 2, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Print the card</button>
              <button style={{ background: 'transparent', color: G.ink, border: `1px solid ${G.rule}`, padding: '12px 18px', borderRadius: 2, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Text it to Maya</button>
            </div>
          </div>
          <InterventionInline />
        </div>
      </div>

      {/* Footer — offer the next action quietly */}
      <div style={{ padding: '44px 80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: G.inkMute }}>
          Want a second set of eyes? <span style={{ color: G.accent, textDecoration: 'underline', textUnderlineOffset: 3 }}>Share this diagnosis</span> with Maya's teacher.
        </div>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.08em' }}>
          DIAGNOSIS ID · GL-24A9-0F · Your data controls →
        </div>
      </div>
    </div>
  );
}

// A named pattern block — the product's diagnostic voice made visible.
function PatternBlock({ headline, tag, tagColor, body, examples }) {
  const G = window.GL;
  return (
    <div style={{ borderLeft: `2px solid ${tagColor}`, paddingLeft: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: G.mono, fontSize: 10, color: tagColor, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tag}</span>
        <span style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.08em' }}>· RECURRING · 3 TIMES</span>
      </div>
      <h3 className="gl-serif" style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px', letterSpacing: '-0.01em' }}>{headline}</h3>
      <p className="gl-serif" style={{ fontSize: 17, lineHeight: 1.5, color: G.ink, fontWeight: 300, margin: '0 0 20px' }}>{body}</p>
      <div>
        {examples.map((e, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, padding: '9px 0', borderTop: `1px solid ${G.ruleSoft}`, fontSize: 13 }}>
            <div style={{ color: G.inkMute, fontFamily: G.mono, fontSize: 11, letterSpacing: '0.04em' }}>{e.when}</div>
            <div style={{ color: G.ink }}>{e.what}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// A visible confidence scale — honesty about uncertainty
function ConfidencePip({ level }) {
  const G = window.GL;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: G.mono, fontSize: 10, color: G.inkMute, letterSpacing: '0.1em', marginRight: 4 }}>CONF</span>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ width: 16, height: 4, borderRadius: 1, background: i <= level ? G.ink : G.rule }} />
      ))}
    </div>
  );
}

function InterventionInline() {
  const G = window.GL;
  return (
    <div style={{
      background: G.paper,
      border: `1px solid ${G.rule}`,
      borderRadius: 3,
      padding: '26px 30px',
      boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 14px 30px -16px rgba(60,40,20,.20)',
    }}>
      <div style={{ fontFamily: G.mono, fontSize: 10, letterSpacing: '0.14em', color: G.inkMute, marginBottom: 12 }}>INTERVENTION CARD · T-14</div>
      <div className="gl-serif" style={{ fontSize: 28, fontWeight: 500, marginBottom: 4, letterSpacing: '-0.015em' }}>The Negative Check</div>
      <div style={{ fontSize: 13, color: G.inkSoft, marginBottom: 20 }}>A one-line habit. Before you move on, ask one thing.</div>
      <div style={{ borderLeft: `2px solid ${G.insight}`, paddingLeft: 16 }}>
        <div className="gl-serif-italic" style={{ fontSize: 20, lineHeight: 1.4, color: G.ink }}>
          "If the number in front was negative, did every sign after the parentheses flip?"
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, paddingTop: 16, borderTop: `1px solid ${G.ruleSoft}`, fontSize: 12, color: G.inkSoft }}>
        <span>Two-week habit</span>
        <span>Re-check next upload</span>
      </div>
    </div>
  );
}

window.DiagnosticRevealParent = DiagnosticRevealParent;
