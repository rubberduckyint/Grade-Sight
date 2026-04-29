// Design system card — presents the tokens as a reference panel
// on the canvas next to the three directions.

function DesignSystemCard() {
  const G = window.GL;

  const swatch = (name, val, note) => (
    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 14, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${G.ruleSoft}` }}>
      <div style={{ width: 48, height: 32, background: val, border: `1px solid ${G.rule}`, borderRadius: 2 }} />
      <div>
        <div style={{ fontFamily: G.sans, fontSize: 13, fontWeight: 500, color: G.ink }}>{name}</div>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.02em' }}>{note}</div>
      </div>
    </div>
  );

  return (
    <div style={{ width: 560, padding: '36px 40px', background: G.paper, color: G.ink, fontFamily: G.sans, border: `1px solid ${G.rule}`, borderRadius: 3 }}>
      <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 10 }}>GRADELENS · FOUNDATION</div>
      <h2 className="gl-serif" style={{ fontSize: 32, fontWeight: 400, margin: '0 0 8px', letterSpacing: '-0.015em' }}>
        The system shared by all three directions.
      </h2>
      <p style={{ color: G.inkSoft, fontSize: 14, margin: '0 0 26px', lineHeight: 1.6 }}>
        Same type + palette across the three mockups. What varies is layout, voice, and how much the product shows itself on the page.
      </p>

      {/* Type */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>TYPE</div>
        <div style={{ borderTop: `1px solid ${G.rule}`, paddingTop: 16 }}>
          <div className="gl-serif" style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em' }}>
            Source Serif 4 <span className="gl-serif-italic" style={{ color: G.inkSoft }}>italic</span>
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, marginTop: 6, letterSpacing: '0.04em' }}>DISPLAY · 400/500 · opsz 32 · tracking −0.02em</div>
        </div>
        <div style={{ borderTop: `1px solid ${G.ruleSoft}`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontFamily: G.sans, fontSize: 22, fontWeight: 400 }}>Inter — body &amp; UI</div>
          <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, marginTop: 6, letterSpacing: '0.04em' }}>UI · 400/500/600 · 13–16px · tracking 0</div>
        </div>
        <div style={{ borderTop: `1px solid ${G.ruleSoft}`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontFamily: G.mono, fontSize: 14 }}>JetBrains Mono — labels, tags, metadata</div>
          <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, marginTop: 6, letterSpacing: '0.04em' }}>ACCENT · 10–12px · tracking 0.12em uppercase</div>
        </div>
      </div>

      {/* Color */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 6 }}>COLOR</div>
        {swatch('Paper', G.paper, 'oklch(0.985 0.006 82) — warm white')}
        {swatch('Paper deep', G.paperDeep, 'oklch(0.94 0.012 82) — quiet blocks')}
        {swatch('Ink', G.ink, 'oklch(0.22 0.015 75) — near-black, warm')}
        {swatch('Ink soft', G.inkSoft, 'oklch(0.42 0.015 75) — secondary')}
        {swatch('Accent · pen-ink blue', G.accent, 'oklch(0.42 0.09 252) — single chrome accent')}
        {swatch('Insight · amber', G.insight, 'oklch(0.72 0.12 72) — diagnostic moment only')}
        {swatch('Mark · red', G.mark, 'oklch(0.56 0.15 28) — error marks on student work only')}
      </div>

      {/* Principles */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>PRINCIPLES</div>
        {[
          ['Insight before data.', 'A named pattern leads; the numbers follow.'],
          ['Amber is precious.', 'It marks only the diagnostic moment. Never chrome, never decoration.'],
          ['No edtech tropes.', 'No stock students. No gradients. No cheerful vector people.'],
          ['Two voices, one product.', 'Parent mode: serif, airy, first-person. Teacher mode: mono, dense, citable.'],
          ['Motion is absent until it earns its place.', 'The diagnostic reveal is the only place pacing does emotional work.'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20, padding: '12px 0', borderTop: `1px solid ${G.ruleSoft}` }}>
            <div className="gl-serif" style={{ fontSize: 15, fontWeight: 500, color: G.ink, letterSpacing: '-0.005em' }}>{t}</div>
            <div style={{ fontSize: 13.5, color: G.inkSoft, lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.DesignSystemCard = DesignSystemCard;
