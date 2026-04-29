// Session B — Billing surfaces, on the 18px base scale.

function TrialBannerStates() {
  const G = window.GL;
  const Row = ({ tone, label, days, copy, cta, secondary }) => {
    const bg = tone === 'calm' ? G.paperSoft : tone === 'insight' ? G.insightSoft : G.paperDeep;
    const border = tone === 'urgent' ? G.insight : G.rule;
    return (
      <div style={{ background: bg, borderTop: `1px solid ${G.ruleSoft}`, borderBottom: `1px solid ${border}`, padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 17 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: tone === 'urgent' ? G.mark : G.inkMute, letterSpacing: '0.12em' }}>{label}</div>
          <div style={{ color: G.ink }}><span className="gl-serif-italic">{days}</span>&nbsp;&nbsp;{copy}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {secondary && <span style={{ color: G.inkSoft, fontSize: 15 }}>{secondary}</span>}
          <a style={{ background: G.ink, color: G.paper, padding: '8px 16px', borderRadius: 3, fontSize: 15, fontWeight: 500 }}>{cta}</a>
        </div>
      </div>
    );
  };
  return (
    <div style={{ width: 1100, background: G.paper, fontFamily: G.sans, color: G.ink, fontSize: 18 }}>
      <div style={{ padding: '28px 28px 16px' }}>
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 10 }}>TRIALBANNER · STATES BY URGENCY</div>
        <h3 className="gl-serif" style={{ fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: '-0.015em' }}>
          One component. <span className="gl-serif-italic">Four</span> states. Zero alarm.
        </h3>
        <p style={{ color: G.inkSoft, fontSize: 18, margin: '10px 0 0', maxWidth: 720, lineHeight: 1.55 }}>
          Hidden above 7 days. Calm at ≤7. Insight-amber at ≤3. Last-day gets firmer copy — still not red. After expiry the banner is gone and the Paywall page takes over.
        </p>
      </div>
      <Row tone="calm" label="≤ 7 DAYS" days="Your trial ends in 7 days." copy="Add a card whenever you're ready — $15/month, cancel anytime." cta="Add card" secondary="Dismiss" />
      <Row tone="insight" label="≤ 3 DAYS" days="Your trial ends in 3 days." copy="Keep your diagnoses and interventions going for $15/month." cta="Add card" secondary="Dismiss" />
      <Row tone="urgent" label="LAST DAY" days="Your trial ends today." copy="Add a card now and nothing changes. Otherwise you'll lose access tomorrow." cta="Add card" />
      <Row tone="calm" label="TEACHER · ≤ 7 DAYS" days="Trial ends in 5 days." copy="$25/month keeps your seat and your class pulse. Cancel anytime." cta="Add card" secondary="Manage" />

      <div style={{ padding: '28px', borderTop: `1px solid ${G.ruleSoft}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {[
          ['Calm, not clinical.', 'Never red. Never modal. Never blocks the dashboard. The banner is a sentence, not an alarm.'],
          ['Honest about what happens.', 'We say "you\'ll lose access," not "features may be unavailable." No softening the truth.'],
          ['Parent + teacher copy split.', 'Same component, different voice per role. Teachers see pricing + seat language; parents see cost + "cancel anytime."'],
        ].map(([t, d]) => (
          <div key={t}>
            <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{t}</div>
            <div style={{ color: G.inkSoft, fontSize: 16, lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaywallPage({ variant = 'trial-ended' }) {
  const G = window.GL;
  const copy = {
    'trial-ended': {
      eyebrow: 'TRIAL ENDED',
      headline: <>Your trial ended <span className="gl-serif-italic">yesterday</span>.</>,
      body: 'Add a card and pick up exactly where you left off. Your diagnoses, interventions, and history are still here — we just need a card to keep running them.',
      primary: 'Start subscription — $15/mo',
      secondary: 'Or sign out',
      reassure: 'Your data is retained for 30 days whether you subscribe or not.',
    },
    'canceled': {
      eyebrow: 'SUBSCRIPTION CANCELED',
      headline: <>You canceled. We kept <span className="gl-serif-italic">everything</span>.</>,
      body: "No hard feelings. Your diagnoses and interventions are still here. Resubscribe whenever it's useful — same price, same data.",
      primary: 'Resubscribe — $15/mo',
      secondary: 'Export my data',
      reassure: '30-day retention window. After that, all student work is permanently deleted.',
    },
    'past-due': {
      eyebrow: "PAYMENT DIDN'T GO THROUGH",
      headline: <>Your last payment <span className="gl-serif-italic">bounced</span>.</>,
      body: "Update your card and we'll try again. Your access stays on until we've retried a few times — no sudden cut-off.",
      primary: 'Update card',
      secondary: 'Contact us',
      reassure: "Stripe retries in 3, 5, and 7 days. You'll get an email each time.",
    },
  }[variant];

  return (
    <div style={{ width: 1100, minHeight: 780, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '18px 40px', borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 20, height: 20, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>Grade Sight</span>
        </div>
        <div style={{ fontSize: 15, color: G.inkMute }}>Signed in as david@rubberduckyinteractive.com</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', flex: 1 }}>
        <div style={{ padding: '90px 72px 60px', borderRight: `1px solid ${G.ruleSoft}` }}>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: variant === 'past-due' ? G.mark : G.inkMute, letterSpacing: '0.14em', marginBottom: 22 }}>{copy.eyebrow}</div>
          <h1 className="gl-serif" style={{ fontSize: 64, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.022em', margin: '0 0 26px' }}>{copy.headline}</h1>
          <p className="gl-serif" style={{ fontSize: 22, fontWeight: 300, color: G.inkSoft, lineHeight: 1.5, margin: '0 0 40px', maxWidth: 520 }}>{copy.body}</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <a style={{ background: G.ink, color: G.paper, padding: '14px 24px', borderRadius: 3, fontSize: 16, fontWeight: 500 }}>{copy.primary}</a>
            <a style={{ background: G.paper, color: G.ink, border: `1px solid ${G.rule}`, padding: '14px 24px', borderRadius: 3, fontSize: 16, fontWeight: 500 }}>{copy.secondary}</a>
          </div>
          <div style={{ fontSize: 15, color: G.inkMute, maxWidth: 520, lineHeight: 1.55 }}>{copy.reassure}</div>
        </div>
        <div style={{ background: G.paperSoft, padding: '90px 60px' }}>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 14 }}>WHAT'S STILL HERE</div>
          <div>
            {[
              ['4 assessments', 'All student work, all diagnoses.'],
              ['2 interventions in progress', 'The Sign Sweep, Check Your Work.'],
              ['12 weeks of pattern history', "Everything we've learned about Maya."],
            ].map(([t, d]) => (
              <div key={t} style={{ padding: '18px 0', borderTop: `1px solid ${G.ruleSoft}` }}>
                <div className="gl-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{t}</div>
                <div style={{ color: G.inkSoft, fontSize: 16 }}>{d}</div>
              </div>
            ))}
            <div style={{ padding: '18px 0 0', borderTop: `1px solid ${G.ruleSoft}` }} />
          </div>
          <div style={{ marginTop: 36, padding: '18px 20px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, fontSize: 15, color: G.inkSoft, lineHeight: 1.55 }}>
            <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.1em', marginBottom: 6 }}>NOT SUBSCRIBING?</div>
            Export everything, or delete everything. One click, either way — from the <span style={{ color: G.accent, textDecoration: 'underline', textUnderlineOffset: 3 }}>data controls</span> page.
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingSettings() {
  const G = window.GL;
  return (
    <div style={{ width: 1100, minHeight: 740, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 28px', borderBottom: `1px solid ${G.ruleSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 20, height: 20, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: G.ink }} />
          </div>
          <span className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>Grade Sight</span>
        </div>
        <div style={{ fontSize: 16, color: G.inkSoft }}>Settings</div>
      </div>

      <div style={{ padding: '32px 40px 0' }}>
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 10 }}>SETTINGS · BILLING</div>
        <h1 className="gl-serif" style={{ fontSize: 44, fontWeight: 400, margin: '0 0 22px', letterSpacing: '-0.02em' }}>Billing &amp; plan</h1>
        <div style={{ display: 'flex', gap: 28, borderBottom: `1px solid ${G.rule}` }}>
          {['Account', 'Billing', 'Students', 'Privacy', 'Notifications'].map((t, i) => (
            <div key={t} style={{ padding: '12px 0', marginBottom: -1, borderBottom: `2px solid ${i === 1 ? G.ink : 'transparent'}`, fontSize: 16, fontWeight: i === 1 ? 500 : 400, color: i === 1 ? G.ink : G.inkSoft }}>{t}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: '36px 40px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 40 }}>
        <div>
          <div style={{ border: `1px solid ${G.rule}`, borderRadius: 3, padding: '26px 30px', marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 6 }}>CURRENT PLAN</div>
                <div className="gl-serif" style={{ fontSize: 32, fontWeight: 500, margin: '0 0 4px', letterSpacing: '-0.015em' }}>Parent · monthly</div>
                <div style={{ color: G.inkSoft, fontSize: 17 }}>$15 / month, billed monthly</div>
              </div>
              <div style={{ padding: '5px 12px', background: G.accentSoft, color: G.accent, borderRadius: 2, fontFamily: G.mono, fontSize: 13, letterSpacing: '0.1em' }}>ACTIVE</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, paddingTop: 22, borderTop: `1px solid ${G.ruleSoft}` }}>
              {[
                ['Renews', 'May 24, 2026'],
                ['Card on file', 'Visa ••4242'],
                ['Started', 'Apr 24, 2026'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.1em', marginBottom: 4 }}>{l.toUpperCase()}</div>
                  <div style={{ fontSize: 17 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 26, display: 'flex', gap: 10, alignItems: 'center' }}>
              <a style={{ background: G.ink, color: G.paper, padding: '12px 20px', borderRadius: 3, fontSize: 16, fontWeight: 500 }}>Manage billing ↗</a>
              <a style={{ color: G.inkSoft, padding: '12px 0', fontSize: 16 }}>Cancel subscription</a>
            </div>
            <div style={{ marginTop: 14, fontSize: 15, color: G.inkMute }}>Opens Stripe's secure portal. Update card, switch plan, view invoices.</div>
          </div>

          <div style={{ border: `1px solid ${G.rule}`, borderRadius: 3 }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="gl-serif" style={{ fontSize: 20, fontWeight: 500 }}>Recent invoices</div>
              <div style={{ fontSize: 15, color: G.accent }}>See all ↗</div>
            </div>
            {[
              ['Apr 24, 2026', '$15.00', 'Paid', 'INV-0001'],
              ['Mar 24, 2026', '$15.00', 'Paid', 'INV-0000'],
            ].map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 70px', padding: '14px 22px', borderTop: `1px solid ${G.ruleSoft}`, fontSize: 15, alignItems: 'center' }}>
                <div style={{ fontFamily: G.mono, fontSize: 14, color: G.inkSoft }}>{r[0]}</div>
                <div style={{ fontFamily: G.mono, fontSize: 14, color: G.inkMute, letterSpacing: '0.05em' }}>{r[3]}</div>
                <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.1em' }}>{r[2].toUpperCase()}</div>
                <div style={{ fontSize: 15, textAlign: 'right' }}>{r[1]}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ padding: '22px 24px', background: G.paperSoft, border: `1px solid ${G.ruleSoft}`, borderRadius: 3, marginBottom: 16 }}>
            <div className="gl-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Change plan</div>
            <div style={{ color: G.inkSoft, fontSize: 16, lineHeight: 1.55, marginBottom: 14 }}>
              Switch between monthly and annual, or upgrade to teacher. Changes take effect at the next billing cycle.
            </div>
            <a style={{ color: G.accent, fontSize: 16, textDecoration: 'underline', textUnderlineOffset: 3 }}>Compare plans →</a>
          </div>
          <div style={{ padding: '22px 24px', border: `1px solid ${G.ruleSoft}`, borderRadius: 3 }}>
            <div className="gl-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Questions?</div>
            <div style={{ color: G.inkSoft, fontSize: 16, lineHeight: 1.55, marginBottom: 14 }}>
              Billing is handled by Stripe. We never see your card number.
            </div>
            <a style={{ color: G.accent, fontSize: 16, textDecoration: 'underline', textUnderlineOffset: 3 }}>Email support →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaywallInlineBlock() {
  const G = window.GL;
  return (
    <div style={{ width: 820, background: G.paper, fontFamily: G.sans, color: G.ink, fontSize: 18, padding: '28px' }}>
      <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 10 }}>INLINE PAYWALL · EMBEDDED IN GATED FEATURE FLOWS</div>
      <h3 className="gl-serif" style={{ fontSize: 28, fontWeight: 400, margin: '0 0 22px', letterSpacing: '-0.015em' }}>
        Used when a free-trial user hits a paid feature. <span className="gl-serif-italic">Not a modal.</span>
      </h3>

      <div style={{ border: `1px solid ${G.ruleSoft}`, borderRadius: 3, background: G.paperSoft }}>
        <div style={{ padding: '14px 22px', borderBottom: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
          <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em' }}>LONGITUDINAL VIEW · 12-WEEK PATTERN</div>
          <div style={{ color: G.inkMute, fontSize: 15 }}>Last active · 2 days ago</div>
        </div>
        <div style={{ padding: '28px 24px', position: 'relative', minHeight: 200 }}>
          <div style={{ position: 'absolute', inset: 0, padding: '28px 24px', opacity: 0.25, pointerEvents: 'none' }}>
            <div className="gl-serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 12 }}>Sign errors across 12 weeks</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90 }}>
              {[40, 55, 38, 62, 48, 58, 42, 35, 28, 22, 18, 15].map((h, i) => (
                <div key={i} style={{ width: 20, height: h, background: G.accent, borderRadius: 2 }} />
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', padding: '28px 32px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, maxWidth: 560, margin: '10px auto' }}>
            <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 8 }}>TRIAL FEATURE</div>
            <div className="gl-serif" style={{ fontSize: 24, fontWeight: 500, margin: '0 0 10px', letterSpacing: '-0.012em' }}>The 12-week view needs a subscription.</div>
            <div style={{ color: G.inkSoft, fontSize: 17, margin: '0 0 20px', lineHeight: 1.5 }}>
              Pattern tracking is how Grade Sight tells you whether an intervention is working. Add a card to keep it — $15/month.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <a style={{ background: G.ink, color: G.paper, padding: '12px 20px', borderRadius: 3, fontSize: 16, fontWeight: 500 }}>Add card</a>
              <a style={{ color: G.inkSoft, padding: '12px 0', fontSize: 16 }}>Not now</a>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 15, color: G.inkMute, lineHeight: 1.55 }}>
        <strong style={{ color: G.ink, fontWeight: 500 }}>Rule:</strong> never a modal, never red, never blocks the surrounding page's nav. The user can always back out.
      </div>
    </div>
  );
}

window.TrialBannerStates = TrialBannerStates;
window.PaywallPage = PaywallPage;
window.BillingSettings = BillingSettings;
window.PaywallInlineBlock = PaywallInlineBlock;
