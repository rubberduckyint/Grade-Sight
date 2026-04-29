// Grade Sight — shared design tokens for the home page exploration.
// Committed palette + type. Everything in the canvas pulls from here.

const GL = {
  // Paper & ink — warm, not gray
  paper: 'oklch(0.985 0.006 82)',       // near-white with warmth
  paperSoft: 'oklch(0.965 0.008 82)',   // sidebars / cards
  paperDeep: 'oklch(0.94 0.012 82)',    // quiet blocks
  rule: 'oklch(0.88 0.012 82)',         // hairline dividers
  ruleSoft: 'oklch(0.92 0.01 82)',

  ink: 'oklch(0.22 0.015 75)',          // body / headlines
  inkSoft: 'oklch(0.42 0.015 75)',      // secondary
  inkMute: 'oklch(0.58 0.012 75)',      // tertiary / captions

  // The one considered accent — pen-ink blue. Not tech blue.
  accent: 'oklch(0.42 0.09 252)',
  accentSoft: 'oklch(0.92 0.03 252)',

  // Diagnostic amber — used ONLY at insight moments. Never chrome.
  insight: 'oklch(0.72 0.12 72)',
  insightSoft: 'oklch(0.95 0.035 82)',

  // Correction red — for error marks in mock student work. Never UI.
  mark: 'oklch(0.56 0.15 28)',

  // Type stacks
  serif: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  hand: '"Caveat", "Shadows Into Light", cursive',  // for red-pen annotations on mock work
};

// Inject shared fonts + base once.
if (typeof document !== 'undefined' && !document.getElementById('gl-fonts')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,300..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@500;600&display=swap';
  document.head.appendChild(link);

  const s = document.createElement('style');
  s.id = 'gl-fonts';
  s.textContent = `
    .gl-serif { font-family: ${GL.serif}; font-variation-settings: "opsz" 32; letter-spacing: -0.015em; }
    .gl-serif-italic { font-family: ${GL.serif}; font-style: italic; letter-spacing: -0.01em; }
    .gl-sans { font-family: ${GL.sans}; }
    .gl-mono { font-family: ${GL.mono}; font-feature-settings: "ss01"; }
    .gl-hand { font-family: ${GL.hand}; }
    .gl-wm { font-variant-numeric: tabular-nums; }
  `;
  document.head.appendChild(s);
}

window.GL = GL;
