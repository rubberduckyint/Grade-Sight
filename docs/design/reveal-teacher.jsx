// Diagnostic Reveal — Teacher mode
// Dense, citable, override-anywhere. Same diagnosis, different voice.
// This is where the product respects the teacher's craft.

function DiagnosticRevealTeacher() {
  const G = window.GL;
  const W = 1200;

  const eyebrow = { fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.14em', textTransform: 'uppercase' };
  const cell = { padding: '10px 14px', borderTop: `1px solid ${G.ruleSoft}`, fontFamily: G.mono, fontSize: 12.5, color: G.ink };

  return (
    <div style={{ width: W, background: G.paper, color: G.ink, fontFamily: G.sans, fontSize: 14, lineHeight: 1.5 }}>
      {/* Slim chrome */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 28px', borderBottom: `1px solid ${G.ruleSoft}`, background: G.paperSoft }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 16, height: 16, border: `1.5px solid ${G.ink}`, borderRadius: '50%', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 3.5, borderRadius: '50%', background: G.ink }} />
            </div>
            <span className="gl-serif" style={{ fontSize: 15, fontWeight: 500 }}>Grade Sight</span>
          </div>
          <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.08em' }}>
            ALG II · PD 3 · UNIT 4 QUIZ · GRADED 12 MIN AGO · 24 STUDENTS
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: G.inkSoft, alignItems: 'center' }}>
          <span style={{ fontFamily: G.mono, fontSize: 11, letterSpacing: '0.08em', color: G.inkMute }}>DENSITY</span>
          <div style={{ display: 'flex', border: `1px solid ${G.rule}`, borderRadius: 2 }}>
            <span style={{ padding: '4px 10px', background: G.paper, color: G.inkMute, fontSize: 11 }}>Airy</span>
            <span style={{ padding: '4px 10px', background: G.ink, color: G.paper, fontSize: 11 }}>Dense</span>
          </div>
          <span style={{ marginLeft: 8 }}>Export</span>
          <span>Override log</span>
        </div>
      </div>

      {/* Two-column working surface: student selector + diagnostic panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr' }}>
        {/* Student list */}
        <div style={{ borderRight: `1px solid ${G.ruleSoft}`, padding: '16px 0', background: G.paperSoft, minHeight: 900 }}>
          <div style={{ padding: '0 18px 12px', ...eyebrow, color: G.inkMute }}>CLASS · 24</div>
          {[
            ['Alvarez, J.', '100%', 'clean', 0],
            ['Brand, S.', '93%', 'clean', 0],
            ['Chen, R.', '80%', 'execution', 1],
            ['Davis, M.', '73%', 'concept', 2],
            ['Elling, P.', '100%', 'clean', 0],
            ['Fong, K.', '87%', 'execution', 1],
            ['Rivera, Maya', '87%', 'recurring', 3],
            ['Parker, J.', '80%', 'execution', 1],
            ['Kim, A.', '93%', 'verification', 1],
            ['Thomas, S.', '67%', 'concept', 2],
          ].map(([name, pct, tag, lvl], i) => {
            const active = name === 'Rivera, Maya';
            const tagColor = tag === 'clean' ? G.inkMute : tag === 'execution' ? G.mark : tag === 'concept' ? G.accent : tag === 'verification' ? G.insight : G.mark;
            return (
              <div key={name} style={{ padding: '8px 18px', background: active ? G.paper : 'transparent', borderLeft: active ? `2px solid ${G.ink}` : '2px solid transparent', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{name}</div>
                  <div style={{ fontFamily: G.mono, fontSize: 10, color: tagColor, letterSpacing: '0.08em', marginTop: 2 }}>{tag.toUpperCase()}{lvl === 3 ? ' · 3×' : ''}</div>
                </div>
                <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute }}>{pct}</div>
              </div>
            );
          })}
        </div>

        {/* Diagnostic surface */}
        <div style={{ padding: '28px 36px' }}>
          {/* Student header — compact, citable */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${G.ruleSoft}` }}>
            <div>
              <div style={{ ...eyebrow, marginBottom: 6 }}>DIAGNOSIS · MAYA RIVERA · 10TH</div>
              <h1 className="gl-serif" style={{ fontSize: 32, fontWeight: 500, margin: 0, letterSpacing: '-0.015em' }}>
                Recurring execution slip — sign flip on distributed negatives.
              </h1>
              <div className="gl-serif" style={{ fontSize: 15, color: G.inkSoft, marginTop: 6, fontStyle: 'italic', fontWeight: 300 }}>
                Third occurrence. Not a concept gap — a habit. Recommend T-14 for two weeks.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute, letterSpacing: '0.08em', marginBottom: 4 }}>SCORE</div>
              <div className="gl-serif" style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em' }}>13 / 15</div>
            </div>
          </div>

          {/* Problem-by-problem diagnosis table */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...eyebrow, marginBottom: 10 }}>PROBLEM-BY-PROBLEM</div>
            <div style={{ border: `1px solid ${G.rule}`, borderRadius: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 140px 180px 100px 80px', background: G.paperDeep, padding: '8px 14px', fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.08em' }}>
                <div>#</div><div>PROBLEM</div><div>DIAGNOSIS</div><div>NOTE</div><div>CONFIDENCE</div><div style={{ textAlign: 'right' }}>OVERRIDE</div>
              </div>
              {[
                { n: 1, p: '3(x − 4) = 18 → x = 10', d: null, dc: null, note: '—', conf: null },
                { n: 2, p: '−2(x + 5) = 8 → x = 1', d: 'Execution · sign-flip', dc: G.mark, note: '3rd occurrence · recurring', conf: 4 },
                { n: 3, p: 'Factor x² − 9x + 20', d: null, dc: null, note: '—', conf: null },
                { n: 4, p: '(2x + 3)(x − 5) expand', d: null, dc: null, note: '—', conf: null },
                { n: 5, p: 'Solve −3(2x − 4) = 12', d: 'Execution · sign-flip', dc: G.mark, note: 'same slip — same line', conf: 4 },
                { n: 6, p: 'x² − 4x − 12 factor', d: 'Verification · skipped check', dc: G.insight, note: 'did not FOIL-verify', conf: 2 },
                { n: 7, p: 'System of equations', d: 'Strategy · route fragility', dc: G.inkSoft, note: 'possible — watch for it', conf: 1 },
              ].map(r => (
                <div key={r.n} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 140px 180px 100px 80px', padding: '10px 14px', borderTop: `1px solid ${G.ruleSoft}`, fontSize: 13, alignItems: 'center' }}>
                  <div style={{ fontFamily: G.mono, color: G.inkMute }}>{String(r.n).padStart(2, '0')}</div>
                  <div style={{ fontFamily: G.mono, fontSize: 12 }}>{r.p}</div>
                  <div>{r.d ? (
                    <span style={{ fontFamily: G.mono, fontSize: 10.5, color: r.dc, letterSpacing: '0.06em' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: r.dc, marginRight: 6, verticalAlign: 'middle' }} />
                      {r.d.toUpperCase()}
                    </span>
                  ) : <span style={{ color: G.inkMute, fontFamily: G.mono, fontSize: 11 }}>— CLEAN —</span>}</div>
                  <div style={{ fontSize: 12.5, color: G.inkSoft, fontStyle: r.conf === 1 ? 'italic' : 'normal' }}>{r.note}</div>
                  <div>{r.conf ? <MiniConf level={r.conf} /> : null}</div>
                  <div style={{ textAlign: 'right', fontSize: 11.5, color: r.d ? G.accent : G.inkMute, textDecoration: r.d ? 'underline' : 'none' }}>{r.d ? 'Change' : '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-panel: evidence on left, longitudinal context on right */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 28 }}>
            <div>
              <div style={{ ...eyebrow, marginBottom: 10 }}>EVIDENCE · PROBLEM 2</div>
              <div style={{ border: `1px solid ${G.rule}`, borderRadius: 2, padding: 18, background: G.paperSoft }}>
                <window.AssessmentMock variant="minimal" width={320} height={340} />
                <div style={{ marginTop: 14, padding: '10px 12px', background: G.paper, borderLeft: `2px solid ${G.mark}`, fontSize: 12.5, fontFamily: G.mono, lineHeight: 1.55 }}>
                  <div style={{ color: G.mark, fontSize: 10, letterSpacing: '0.1em', marginBottom: 3 }}>READ</div>
                  Student wrote: <span style={{ color: G.ink }}>−2x + 10 = 8</span> after distributing −2(x + 5).<br />
                  Expected: <span style={{ color: G.ink }}>−2x − 10 = 8</span>. Sign on second term did not flip.
                </div>
              </div>
            </div>

            <div>
              <div style={{ ...eyebrow, marginBottom: 10 }}>LONGITUDINAL — THIS SLIP</div>
              <div style={{ border: `1px solid ${G.rule}`, borderRadius: 2, padding: 18 }}>
                {[
                  { d: 'Sep 12', a: 'Diagnostic pre-test', hit: false, note: 'not present' },
                  { d: 'Oct 14', a: 'Chapter 3 test', hit: true, note: 'Problem 4 · first seen' },
                  { d: 'Nov 02', a: 'Mid-Ch. quiz', hit: true, note: 'Problem 2 · repeat' },
                  { d: 'Nov 15', a: 'Homework 4.2', hit: false, note: 'did not appear' },
                  { d: 'Dec 03', a: 'Unit 4 quiz', hit: true, note: 'Problems 2 & 5 · recurring', now: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '72px 14px 1fr', gap: 12, padding: '9px 0', borderTop: i ? `1px solid ${G.ruleSoft}` : 'none', fontSize: 12.5, alignItems: 'center' }}>
                    <div style={{ fontFamily: G.mono, fontSize: 11, color: G.inkMute }}>{r.d}</div>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: r.hit ? G.mark : G.rule, border: r.now ? `2px solid ${G.ink}` : 'none', boxSizing: 'content-box', marginLeft: r.now ? -2 : 0 }} />
                    <div>
                      <div style={{ color: G.ink, fontWeight: r.now ? 600 : 400 }}>{r.a}</div>
                      <div style={{ color: G.inkSoft, fontSize: 11.5, fontStyle: r.hit ? 'normal' : 'italic' }}>{r.note}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `2px solid ${G.ink}`, fontSize: 12, color: G.ink }}>
                  <span className="gl-serif-italic">Pattern: </span>3 of 4 problem sets with distributed negatives. Habit, not concept.
                </div>
              </div>
            </div>
          </div>

          {/* Intervention + class rollup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            <div style={{ border: `1px solid ${G.rule}`, borderRadius: 2, padding: '18px 20px' }}>
              <div style={{ ...eyebrow, color: G.insight, marginBottom: 10 }}>SUGGESTED INTERVENTION</div>
              <div className="gl-serif" style={{ fontSize: 22, fontWeight: 500, marginBottom: 4, letterSpacing: '-0.01em' }}>T-14 · The Negative Check</div>
              <div style={{ fontSize: 12.5, color: G.inkSoft, marginBottom: 14 }}>Two-week habit card. Prints to 4×6. Re-evaluate on next upload.</div>
              <div style={{ borderLeft: `2px solid ${G.insight}`, paddingLeft: 12, fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink, lineHeight: 1.4 }}>
                "If the number in front was negative, did every sign after the parentheses flip?"
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button style={{ flex: 1, background: G.ink, color: G.paper, border: 'none', padding: '8px 10px', borderRadius: 2, fontSize: 12 }}>Assign to Maya</button>
                <button style={{ flex: 1, background: G.paper, color: G.ink, border: `1px solid ${G.rule}`, padding: '8px 10px', borderRadius: 2, fontSize: 12 }}>Assign class-wide</button>
                <button style={{ background: G.paper, color: G.inkSoft, border: `1px solid ${G.rule}`, padding: '8px 10px', borderRadius: 2, fontSize: 12 }}>Dismiss</button>
              </div>
            </div>

            <div style={{ border: `1px solid ${G.rule}`, borderRadius: 2, padding: '18px 20px' }}>
              <div style={{ ...eyebrow, marginBottom: 10 }}>CLASS CONTEXT · SAME SLIP</div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', marginBottom: 14 }}>
                <div className="gl-serif" style={{ fontSize: 42, fontWeight: 400, letterSpacing: '-0.02em' }}>7 / 24</div>
                <div style={{ fontSize: 13, color: G.inkSoft }}>students showed the same sign-flip on Problem 2 or 5.</div>
              </div>
              <div style={{ fontSize: 12.5, color: G.ink, fontFamily: G.serif, fontStyle: 'italic', marginBottom: 10 }}>Reteach flag suggested.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} style={{ height: 14, background: i < 7 ? G.mark : G.paperDeep, borderRadius: 1, opacity: i < 7 ? 1 : 0.6 }} />
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: G.accent, textDecoration: 'underline', marginTop: 14, textUnderlineOffset: 3 }}>See the 7 students →</div>
            </div>
          </div>

          {/* Footer — trust strip */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${G.ruleSoft}`, display: 'flex', justifyContent: 'space-between', fontFamily: G.mono, fontSize: 10.5, color: G.inkMute, letterSpacing: '0.08em' }}>
            <span>MODEL v3.2 · CONF HIGH · 3 OVERRIDES AVAILABLE · AUDIT LOG</span>
            <span>GL-24A9-0F · YOUR DATA CONTROLS →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniConf({ level }) {
  const G = window.GL;
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ width: 10, height: 3, background: i <= level ? G.ink : G.rule }} />
      ))}
    </div>
  );
}

window.DiagnosticRevealTeacher = DiagnosticRevealTeacher;
