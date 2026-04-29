// Tokens card — the exact @theme block Claude Code will paste into globals.css,
// plus semantic aliases and usage rules.

function TokensCard() {
  const G = window.GL;

  const cssBlock = `/* apps/web/app/globals.css */
@import "tailwindcss";

/* Fonts loaded via next/font/google in app/layout.tsx:
   Source Serif 4 → --font-serif
   Inter          → --font-sans
   JetBrains Mono → --font-mono
   Caveat         → --font-hand  (diagnostic-mock handwriting ONLY) */

/* Base = 18px for readability + WCAG AA headroom.
   html { font-size: 18px } — all rem values cascade from here. */

@theme {
  /* Type scale · 18px base */
  --text-xs:   0.722rem; /* 13 · eyebrows, captions, mono labels */
  --text-sm:   0.833rem; /* 15 · dense data rows only */
  --text-base: 1rem;     /* 18 · default body */
  --text-lg:   1.111rem; /* 20 · parent lead, empty-state body */
  --text-xl:   1.222rem; /* 22 · card titles */
  --text-2xl:  1.556rem; /* 28 · section heads */
  --text-3xl:  2rem;     /* 36 · page heads */
  --text-5xl:  3rem;     /* 54 · dashboard greeting */
  --text-7xl:  4.444rem; /* 80 · landing display only */

  /* Line-height defaults per role */
  --leading-tight:   1.1;   /* display + h1/h2 */
  --leading-snug:    1.25;  /* h3/h4 */
  --leading-normal:  1.55;  /* body */
  --leading-loose:   1.65;  /* parent lead */

  /* Paper & ink — warm, not gray */
  --color-paper:       oklch(0.985 0.006 82);
  --color-paper-soft:  oklch(0.965 0.008 82);
  --color-paper-deep:  oklch(0.94  0.012 82);
  --color-rule:        oklch(0.88  0.012 82);
  --color-rule-soft:   oklch(0.92  0.010 82);

  --color-ink:         oklch(0.22  0.015 75);
  --color-ink-soft:    oklch(0.42  0.015 75);
  --color-ink-mute:    oklch(0.58  0.012 75);

  /* Single chrome accent — pen-ink blue. Not tech blue. */
  --color-accent:      oklch(0.42  0.09  252);
  --color-accent-soft: oklch(0.92  0.03  252);

  /* Diagnostic amber — insight moments only. Never chrome. */
  --color-insight:     oklch(0.72  0.12  72);
  --color-insight-soft:oklch(0.95  0.035 82);

  /* Red — reserved for error marks on student work. Never UI. */
  --color-mark:        oklch(0.56  0.15  28);

  /* Semantic aliases — use these in components */
  --color-background:  var(--color-paper);
  --color-surface:     var(--color-paper);
  --color-surface-muted: var(--color-paper-soft);
  --color-border:      var(--color-rule);
  --color-border-soft: var(--color-rule-soft);
  --color-foreground:  var(--color-ink);
  --color-muted:       var(--color-ink-soft);
  --color-subtle:      var(--color-ink-mute);

  /* Type */
  --font-serif: "Source Serif 4", Georgia, serif;
  --font-sans:  "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono:  "JetBrains Mono", ui-monospace, Menlo, monospace;
  --font-hand:  "Caveat", cursive;

  /* Radii — restrained, editorial */
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 8px;

  /* Focus ring — always visible, pen-ink blue */
  --ring-color: var(--color-accent);
  --ring-offset: 2px;
}

@layer base {
  html { font-size: 18px; font-family: var(--font-sans); color: var(--color-ink); background: var(--color-paper); }
  body { font-family: var(--font-sans); font-size: var(--text-base); line-height: var(--leading-normal); }
  :focus-visible { outline: 2px solid var(--ring-color); outline-offset: var(--ring-offset); border-radius: var(--radius-sm); }
  ::selection { background: var(--color-accent-soft); color: var(--color-ink); }
}`;

  const row = (name, val, note) => (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 160px 1fr', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${G.ruleSoft}`, fontFamily: G.mono, fontSize: 11 }}>
      <div style={{ width: 28, height: 20, background: val, border: `1px solid ${G.rule}`, borderRadius: 2 }} />
      <div style={{ color: G.ink }}>{name}</div>
      <div style={{ color: G.inkMute }}>{note}</div>
    </div>
  );

  return (
    <div style={{ width: 820, padding: '36px 40px', background: G.paper, border: `1px solid ${G.rule}`, borderRadius: 3, fontFamily: G.sans }}>
      <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.14em', marginBottom: 10 }}>FOUNDATION · DROP-IN TOKENS</div>
      <h2 className="gl-serif" style={{ fontSize: 28, fontWeight: 400, margin: '0 0 8px', letterSpacing: '-0.015em' }}>
        Paste this into <span className="gl-serif-italic">apps/web/app/globals.css</span>.
      </h2>
      <p style={{ color: G.inkSoft, fontSize: 13.5, margin: '0 0 22px', lineHeight: 1.55 }}>
        Tailwind 4 CSS-based config. Every component pulls from these tokens. If no token fits, stop and ask.
      </p>

      {/* Color swatches */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 6 }}>COLORS</div>
        {row('--color-paper', G.paper, 'background · warm white')}
        {row('--color-paper-soft', G.paperSoft, 'muted surface · sidebars')}
        {row('--color-paper-deep', G.paperDeep, 'quiet blocks · table headers')}
        {row('--color-rule', G.rule, 'hairline borders')}
        {row('--color-ink', G.ink, 'body · foreground')}
        {row('--color-ink-soft', G.inkSoft, 'secondary text')}
        {row('--color-ink-mute', G.inkMute, 'tertiary · captions')}
        {row('--color-accent', G.accent, 'pen-ink blue · the only chrome accent')}
        {row('--color-insight', G.insight, 'diagnostic amber · insight moments only')}
        {row('--color-mark', G.mark, 'red · error marks on student work only')}
      </div>

      {/* Type */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>TYPE · ALL GOOGLE FONTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[
            ['Source Serif 4', 'serif', 'Display · headlines · pull quotes'],
            ['Inter', 'sans', 'Body · UI · buttons · labels'],
            ['JetBrains Mono', 'mono', 'Metadata · eyebrows · data'],
            ['Caveat', 'hand', 'Handwriting in diagnostic mocks ONLY'],
          ].map(([name, slot, note]) => (
            <div key={name} style={{ padding: '14px 16px', border: `1px solid ${G.ruleSoft}`, borderRadius: 3 }}>
              <div style={{ fontFamily: slot === 'serif' ? G.serif : slot === 'sans' ? G.sans : slot === 'mono' ? G.mono : G.hand, fontSize: slot === 'hand' ? 26 : 20, fontWeight: 500, marginBottom: 4 }}>{name}</div>
              <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.04em' }}>--font-{slot} · {note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Type scale */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: G.mono, fontSize: 13, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>TYPE SCALE · 18px BASE</div>
        <div style={{ border: `1px solid ${G.ruleSoft}`, borderRadius: 3 }}>
          {[
            ['--text-xs', '13px · 0.722rem', 'Eyebrow · caption', 13, G.mono, 400],
            ['--text-sm', '15px · 0.833rem', 'Dense row · meta', 15, G.sans, 400],
            ['--text-base', '18px · 1rem (BASE)', 'Default body', 18, G.sans, 400],
            ['--text-lg', '20px · 1.111rem', 'Parent lead', 20, G.sans, 400],
            ['--text-xl', '22px · 1.222rem', 'Card title', 22, G.serif, 500],
            ['--text-2xl', '28px · 1.556rem', 'Section head', 28, G.serif, 500],
            ['--text-3xl', '36px · 2rem', 'Page head', 36, G.serif, 400],
            ['--text-5xl', '54px · 3rem', 'Greeting / big', 54, G.serif, 400],
            ['--text-7xl', '80px · 4.444rem', 'Landing display', 80, G.serif, 400],
          ].map(([token, val, role, size, family, wt]) => (
            <div key={token} style={{ display: 'grid', gridTemplateColumns: '130px 140px 140px 1fr', alignItems: 'baseline', gap: 12, padding: '10px 14px', borderTop: `1px solid ${G.ruleSoft}` }}>
              <div style={{ fontFamily: G.mono, fontSize: 12, color: G.ink }}>{token}</div>
              <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute }}>{val}</div>
              <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.04em' }}>{role}</div>
              <div style={{ fontFamily: family, fontSize: size, fontWeight: wt, color: G.ink, lineHeight: 1.1, letterSpacing: size > 30 ? '-0.02em' : '-0.005em' }}>Ag</div>
            </div>
          ))}
        </div>
      </div>

      {/* CSS block */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 10 }}>DROP-IN CSS</div>
        <pre style={{ margin: 0, padding: '18px 20px', background: G.paperDeep, border: `1px solid ${G.rule}`, borderRadius: 3, fontFamily: G.mono, fontSize: 11, lineHeight: 1.6, color: G.ink, whiteSpace: 'pre-wrap', maxHeight: 520, overflow: 'auto' }}>{cssBlock}</pre>
      </div>

      {/* Usage rules */}
      <div>
        <div style={{ fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.12em', marginBottom: 6 }}>USAGE RULES</div>
        {[
          ['18px is the floor.', 'Body text is 18px (1rem). Never shrink to fit — shorten copy or widen the container. Density is a layout decision, not a font-size one.'],
          ['Two sizes below base, five above.', '15px is for dense data rows only (settings tables, invoice lists). 13px is mono-only, for eyebrows and captions. Everything else body or bigger.'],
          ['Amber is precious.', 'Only at diagnostic-insight moments. Never as chrome, decoration, or a generic warning color.'],
          ['Red is evidence only.', 'Only on mock student-work marks. Never as a UI error state — that uses ink + mono microcopy.'],
          ['Serif for meaning, sans for doing.', 'Headlines, voice, and quotes are serif. Buttons, inputs, tables are sans.'],
          ['Mono is the label voice.', 'All eyebrows, metadata, timestamps, IDs. Uppercase, 0.12em tracking, --text-xs.'],
          ['Focus rings never hide.', ':focus-visible is enforced globally. Do not remove the outline on any interactive element.'],
        ].map(([t, d]) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, padding: '10px 0', borderTop: `1px solid ${G.ruleSoft}`, fontSize: 13 }}>
            <div className="gl-serif" style={{ fontSize: 14, fontWeight: 500 }}>{t}</div>
            <div style={{ color: G.inkSoft, lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.TokensCard = TokensCard;
