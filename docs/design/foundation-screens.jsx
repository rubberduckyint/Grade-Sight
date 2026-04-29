// Foundation — Landing, Dashboard, Auth wrappers, System pages
// All type on the 18px base scale: xs 13 · sm 15 · base 18 · lg 20 · xl 22 · 2xl 28 · 3xl 36 · 5xl 54 · 7xl 80.

function FoundationLanding() {
  const G = window.GL;
  const eyebrow = { fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', textTransform: 'uppercase' };

  return (
    <div style={{ width: 1200, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 18, lineHeight: 1.55 }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 56px', borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 20, fontWeight: 500 }}>Grade Sight</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 15 }}>
          <span style={{ color: G.inkSoft }}>Sign in</span>
        </div>
      </nav>

      <div style={{ padding: '120px 56px 80px', display: 'grid', gridTemplateColumns: '1fr', maxWidth: 980, margin: '0 auto' }}>
        <div style={{ ...eyebrow, marginBottom: 18, color: G.inkMute }}>A diagnostic grading tool for secondary math</div>
        <h1 className="gl-serif" style={{ fontSize: 80, lineHeight: 1.02, fontWeight: 400, margin: '0 0 28px', letterSpacing: '-0.025em' }}>
          Not just <span className="gl-serif-italic" style={{ color: G.inkSoft }}>what</span> your student got wrong.<br /><span style={{ color: G.accent }}>Why.</span>
        </h1>
        <p className="gl-serif" style={{ fontSize: 24, lineHeight: 1.5, color: G.inkSoft, fontWeight: 300, margin: '0 0 44px', maxWidth: 680 }}>
          Upload a math assessment. Grade Sight names the pattern behind the errors and suggests one small thing to try.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 620 }}>
          <a style={{ display: 'block', background: G.ink, color: G.paper, padding: '18px 24px', borderRadius: 3, fontSize: 17, fontWeight: 500, textAlign: 'center' }}>I'm a parent →</a>
          <a style={{ display: 'block', background: G.paper, color: G.ink, border: `1px solid ${G.rule}`, padding: '18px 24px', borderRadius: 3, fontSize: 17, fontWeight: 500, textAlign: 'center' }}>I'm a teacher →</a>
        </div>
        <div style={{ marginTop: 16, fontSize: 16, color: G.inkMute }}>30 days free, no card required. <span style={{ color: G.accent, textDecoration: 'underline', textUnderlineOffset: 3 }}>Sign in</span></div>
      </div>

      {/* Trust band */}
      <div style={{ padding: '56px 56px', borderTop: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36 }}>
          {[
            ['Student data never sold', 'Not to advertisers. Not to anyone.'],
            ['You can delete everything', 'One click. 30-day window. No exceptions.'],
            ['US-only data, US-only servers', 'Railway, us-west. Never leaves.'],
            ['Signed privacy commitments', 'Student Privacy Pledge · SDPC NDPA · Common Sense evaluation.'],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="gl-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 6 }}>{t}</div>
              <div style={{ color: G.inkSoft, fontSize: 16, lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '28px 56px', borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: G.inkMute }}>
        <span>© 2026 Grade Sight</span>
        <div style={{ display: 'flex', gap: 24 }}><span>Privacy</span><span>Security</span><span>Contact</span></div>
      </div>
    </div>
  );
}

function DashboardShell() {
  const G = window.GL;
  return (
    <div style={{ width: 1200, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 18, minHeight: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 20, height: 20, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: G.ink }} />
            </div>
            <span className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>Grade Sight</span>
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.1em' }}>RIVERA FAMILY</div>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 15, color: G.inkSoft, alignItems: 'center' }}>
          <span>Assessments</span><span>Interventions</span><span>Settings</span>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: G.accentSoft, color: G.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>DR</div>
        </div>
      </div>

      {/* Trial banner */}
      <div style={{ padding: '14px 32px', background: G.insightSoft, borderBottom: `1px solid ${G.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16 }}>
        <div><span className="gl-serif-italic">Your trial ends in 5 days.</span> Add a card to keep going — $15/month, cancel anytime.</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: G.inkSoft, fontSize: 15 }}>Dismiss</span>
          <a style={{ background: G.ink, color: G.paper, padding: '8px 16px', borderRadius: 3, fontSize: 15, fontWeight: 500 }}>Add card</a>
        </div>
      </div>

      <div style={{ padding: '56px 32px', maxWidth: 1000 }}>
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 12 }}>WELCOME</div>
        <h1 className="gl-serif" style={{ fontSize: 54, fontWeight: 400, margin: '0 0 16px', letterSpacing: '-0.02em' }}>Good evening, David.</h1>
        <p style={{ color: G.inkSoft, fontSize: 20, margin: '0 0 44px', maxWidth: 620, lineHeight: 1.55 }}>
          No assessments yet. When you're ready, upload a photo of your student's quiz or test and we'll tell you what we saw.
        </p>

        <div style={{ border: `1.5px dashed ${G.rule}`, borderRadius: 3, padding: '56px 40px', textAlign: 'center', background: G.paperSoft }}>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 14 }}>START HERE</div>
          <div className="gl-serif" style={{ fontSize: 28, fontWeight: 500, marginBottom: 12, letterSpacing: '-0.01em' }}>Upload your first assessment.</div>
          <div style={{ color: G.inkSoft, fontSize: 18, marginBottom: 28, maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.5 }}>A photo from your phone is fine. Quiz, test, or homework — we read what's there.</div>
          <a style={{ display: 'inline-block', background: G.ink, color: G.paper, padding: '14px 26px', borderRadius: 3, fontSize: 17, fontWeight: 500 }}>Upload a photo →</a>
        </div>
      </div>
    </div>
  );
}

function AuthShell({ mode = 'signin' }) {
  const G = window.GL;
  const isParent = mode === 'parent';
  const isTeacher = mode === 'teacher';
  const title = isParent ? "Understand what's happening with your kid's math." : isTeacher ? 'Grade faster, with better insight.' : 'Welcome back.';
  const sub = isParent ? 'Free for 30 days. No card required.' : isTeacher ? '$25/month after a 30-day free trial. Cancel anytime.' : 'Sign in to your diagnoses and interventions.';
  return (
    <div style={{ width: 1200, minHeight: 760, background: G.paperSoft, color: G.ink, fontFamily: G.sans, fontSize: 18, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <div style={{ padding: '72px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: G.paper, borderRight: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 20, fontWeight: 500 }}>Grade Sight</span>
        </div>
        <div>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
            {isParent ? 'For parents' : isTeacher ? 'For teachers' : 'Sign in'}
          </div>
          <h2 className="gl-serif" style={{ fontSize: 48, fontWeight: 400, lineHeight: 1.12, letterSpacing: '-0.02em', margin: '0 0 20px' }}>{title}</h2>
          <p className="gl-serif" style={{ fontSize: 22, fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, margin: 0, maxWidth: 440 }}>{sub}</p>
        </div>
        <div style={{ fontSize: 15, color: G.inkMute }}>Your student's work stays yours. Always.</div>
      </div>

      <div style={{ padding: '72px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <div style={{ padding: '28px 30px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3 }}>
            <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.1em', marginBottom: 14 }}>CLERK MOUNT · &lt;SignIn /&gt; / &lt;SignUp /&gt;</div>
            <div style={{ fontSize: 15, color: G.inkSoft, padding: '14px 16px', background: G.paperDeep, border: `1px dashed ${G.rule}`, borderRadius: 3, fontFamily: G.mono, lineHeight: 1.6 }}>
              appearance.elements.card: shadow-none, border: 1px var(--color-rule)<br/>
              .formButtonPrimary → bg-ink text-paper radius-sm<br/>
              .input → border rule, focus ring accent<br/>
              .footerActionLink → color accent
            </div>
          </div>
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 15, color: G.inkMute }}>
            {isParent || isTeacher ? <>Already using Grade Sight? <span style={{ color: G.accent }}>Sign in</span></> : <>New here? <span style={{ color: G.accent }}>Start free</span></>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemPages() {
  const G = window.GL;
  const Pane = ({ title, children }) => (
    <div style={{ width: 380, minHeight: 440, background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, padding: '32px 36px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
  return (
    <div style={{ width: 1200, padding: '40px', background: G.paperSoft, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, fontFamily: G.sans, fontSize: 18 }}>
      <Pane title="LOADING.TSX">
        <div style={{ marginBottom: 22 }}>
          <div style={{ height: 16, width: '40%', background: G.paperDeep, borderRadius: 2, marginBottom: 12 }} />
          <div style={{ height: 40, width: '80%', background: G.paperDeep, borderRadius: 2, marginBottom: 20 }} />
          <div style={{ height: 12, width: '100%', background: G.paperDeep, borderRadius: 2, marginBottom: 6 }} />
          <div style={{ height: 12, width: '90%', background: G.paperDeep, borderRadius: 2, marginBottom: 6 }} />
          <div style={{ height: 12, width: '60%', background: G.paperDeep, borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 15, color: G.inkMute, marginTop: 'auto', lineHeight: 1.55 }}>Skeleton blocks at paper-deep. No spinners. Shimmer: none. Delay before show: 200ms.</div>
      </Pane>
      <Pane title="ERROR.TSX">
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.mark, letterSpacing: '0.12em', marginBottom: 10 }}>SOMETHING'S OFF</div>
        <h3 className="gl-serif" style={{ fontSize: 28, fontWeight: 500, margin: '0 0 10px', letterSpacing: '-0.01em' }}>We couldn't load this page.</h3>
        <p style={{ color: G.inkSoft, fontSize: 18, margin: '0 0 22px', lineHeight: 1.55 }}>It's on us — not your connection. Try again, and if it keeps happening, tell us.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a style={{ background: G.ink, color: G.paper, padding: '12px 18px', borderRadius: 3, fontSize: 16 }}>Try again</a>
          <a style={{ background: G.paper, color: G.ink, border: `1px solid ${G.rule}`, padding: '12px 18px', borderRadius: 3, fontSize: 16 }}>Tell us</a>
        </div>
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, marginTop: 'auto', paddingTop: 20, letterSpacing: '0.08em' }}>ERR-24A9 · copied to clipboard</div>
      </Pane>
      <Pane title="NOT-FOUND.TSX">
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>404 · NOT HERE</div>
        <h3 className="gl-serif" style={{ fontSize: 32, fontWeight: 500, margin: '0 0 10px', letterSpacing: '-0.015em' }}>That page doesn't exist.</h3>
        <p style={{ color: G.inkSoft, fontSize: 18, margin: '0 0 22px', lineHeight: 1.55 }}>Maybe the link is old, maybe we moved it. Your data is safe either way.</p>
        <a style={{ background: G.ink, color: G.paper, padding: '12px 18px', borderRadius: 3, fontSize: 16, display: 'inline-block' }}>Go home</a>
      </Pane>
    </div>
  );
}

window.FoundationLanding = FoundationLanding;
window.DashboardShell = DashboardShell;
window.AuthShell = AuthShell;
window.SystemPages = SystemPages;
