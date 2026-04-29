// A shared visual primitive: a reproduction of diagnosed student math work.
// This is the product's hero image — it demonstrates itself.
// Built from HTML + CSS, not an image, so it can be restyled per direction
// and stays crisp. Uses Caveat for handwritten student work + red-pen marks.

function AssessmentMock({ variant = 'full', width, height }) {
  const G = window.GL;

  const page = {
    width: width || 380,
    height: height || 480,
    background: '#fffdf7',
    border: `1px solid ${G.rule}`,
    borderRadius: 3,
    boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 14px 30px -18px rgba(60,40,20,.18)',
    padding: '22px 26px',
    position: 'relative',
    fontFamily: G.hand,
    color: '#2a2420',
    fontSize: 22,
    lineHeight: 1.35,
    overflow: 'hidden',
  };

  const problemNum = { fontFamily: G.sans, fontSize: 11, fontWeight: 600, color: G.inkMute, letterSpacing: '0.08em' };
  const line = { margin: '2px 0' };
  const mark = { color: G.mark, fontFamily: G.hand, fontSize: 20 };

  return (
    <div style={page}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: G.sans, fontSize: 10, color: G.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: `1px solid ${G.ruleSoft}`, paddingBottom: 8, marginBottom: 14 }}>
        <span>Algebra II · Unit 4 Quiz</span>
        <span>10 / 15</span>
      </div>

      {/* Problem 1 — correct */}
      <div style={{ marginBottom: 14 }}>
        <div style={problemNum}>1. Solve for x</div>
        <div style={line}>3(x − 4) = 18</div>
        <div style={line}>3x − 12 = 18</div>
        <div style={line}>3x = 30</div>
        <div style={line}>x = 10 <span style={{ ...mark, marginLeft: 6 }}>✓</span></div>
      </div>

      {/* Problem 2 — sign error — THE diagnostic moment */}
      <div style={{ marginBottom: 14, position: 'relative' }}>
        <div style={problemNum}>2. Solve for x</div>
        <div style={line}>−2(x + 5) = 8</div>
        <div style={line}>
          −2x <span style={{ color: G.mark, textDecoration: 'line-through', textDecorationColor: G.mark }}>+ 10</span>
          <span style={{ color: G.mark, marginLeft: 4 }}>− 10</span> = 8
        </div>
        <div style={{ ...line, opacity: 0.55 }}>−2x + 10 = 8</div>
        <div style={{ ...line, opacity: 0.55 }}>−2x = −2</div>
        <div style={{ ...line, opacity: 0.55 }}>x = 1 <span style={{ ...mark, marginLeft: 6 }}>✗</span></div>

        {/* Diagnostic callout — this is the product speaking */}
        {variant !== 'minimal' && (
          <div style={{
            position: 'absolute',
            right: -8,
            top: 18,
            width: 180,
            fontFamily: G.sans,
            fontSize: 10.5,
            lineHeight: 1.5,
            color: G.ink,
            background: G.paper,
            border: `1px solid ${G.rule}`,
            borderLeft: `2px solid ${G.insight}`,
            borderRadius: 2,
            padding: '8px 10px',
            transform: 'rotate(0.3deg)',
            boxShadow: '0 4px 12px -6px rgba(60,40,20,.25)',
          }}>
            <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: G.inkMute, marginBottom: 3 }}>Sign error</div>
            <div style={{ fontFamily: G.serif, fontSize: 12, lineHeight: 1.35 }}>Distributed −2 as +10 instead of −10. Third time this month.</div>
          </div>
        )}
      </div>

      {/* Problem 3 — partial */}
      <div>
        <div style={problemNum}>3. Factor completely</div>
        <div style={line}>x² − 9x + 20</div>
        <div style={line}>(x − 4)(x − 5) <span style={{ ...mark, marginLeft: 6 }}>✓</span></div>
      </div>
    </div>
  );
}

window.AssessmentMock = AssessmentMock;
