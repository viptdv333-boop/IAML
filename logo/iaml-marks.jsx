
const C = {
  blue: '#015197', red: '#C4272F', gold: '#F9CF02',
  sky: '#2E7ABF', skyL: '#6BADE0', ink: '#0A1628',
  white: '#FFFFFF', cream: '#F6F4EF', gray: '#E8E5DE',
};

/* Dual preview — light + dark side by side */
function Duo({ children, label }) {
  return (
    <div style={{display:'flex',flexDirection:'column',width:580,height:440}}>
      <div style={{display:'flex',flex:1}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:C.white,gap:10}}>
          <svg viewBox="0 0 200 200" width="150" height="150">{children('light')}</svg>
          <span style={{fontFamily:'Cormorant Garamond,serif',fontSize:14,fontWeight:700,color:C.ink,letterSpacing:3}}>IAML</span>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:C.ink,gap:10}}>
          <svg viewBox="0 0 200 200" width="150" height="150">{children('dark')}</svg>
          <span style={{fontFamily:'Cormorant Garamond,serif',fontSize:14,fontWeight:700,color:C.white,letterSpacing:3}}>IAML</span>
        </div>
      </div>
      <div style={{height:36,display:'flex',alignItems:'center',justifyContent:'center',background:C.gray}}>
        <span style={{fontFamily:'DM Sans,sans-serif',fontSize:10,color:'#777',letterSpacing:1.5,textTransform:'uppercase'}}>{label}</span>
      </div>
    </div>
  );
}

/* ═══════ 1. CRESCENT EMBRACE ═══════
   A thick blue crescent wrapping a gold circle.
   Red dot accent above. Moon + sun, abstracted. */
function M1(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <defs>
        <mask id={`m1-${bg}`}><rect x="-100" y="-100" width="200" height="200" fill="white"/>
        <circle cx="12" cy="-10" r="48" fill="black"/></mask>
      </defs>
      <circle cx="0" cy="0" r="58" fill={bl} mask={`url(#m1-${bg})`}/>
      <circle cx="30" cy="0" r="20" fill={C.gold}/>
      <circle cx="0" cy="-66" r="6" fill={C.red}/>
    </g>
  );
}

/* ═══════ 2. THREE PEAKS ═══════
   Three mountain peaks — Mongolia's landscape.
   Blue, gold, red. Tall center peak. */
function M2(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <polygon points="-60,50 -20,-30 20,50" fill={bl}/>
      <polygon points="-10,50 30,-55 70,50" fill={C.gold}/>
      <polygon points="20,50 55,-15 90,50" fill={C.red} opacity="0.85"/>
      <line x1="-70" y1="50" x2="95" y2="50" stroke={bg==='dark'?C.white:C.ink} strokeWidth="2" opacity="0.15"/>
    </g>
  );
}

/* ═══════ 3. RING & LINE ═══════
   Blue ring. Gold vertical line through center.
   Red horizontal dash crossing at the midpoint.
   A crosshair — precision, focus, linguistics. */
function M3(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <circle cx="0" cy="0" r="64" fill="none" stroke={bl} strokeWidth="7"/>
      <line x1="0" y1="-78" x2="0" y2="78" stroke={C.gold} strokeWidth="6" strokeLinecap="round"/>
      <line x1="-30" y1="0" x2="30" y2="0" stroke={C.red} strokeWidth="6" strokeLinecap="round"/>
    </g>
  );
}

/* ═══════ 4. BRACKETS ═══════
   Two curly brackets — ( ) — from linguistic notation.
   Blue left, red right. Gold dot at center = language. */
function M4(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <path d="M -15,-70 Q -55,-35 -55,0 Q -55,35 -15,70" fill="none" stroke={bl} strokeWidth="8" strokeLinecap="round"/>
      <path d="M 15,-70 Q 55,-35 55,0 Q 55,35 15,70" fill="none" stroke={C.red} strokeWidth="8" strokeLinecap="round"/>
      <circle cx="0" cy="0" r="10" fill={C.gold}/>
    </g>
  );
}

/* ═══════ 5. STACKED BLOCKS ═══════
   Three horizontal rounded bars stacked:
   blue (wide), gold (medium), red (narrow).
   Like a text hierarchy — heading, subhead, body. */
function M5(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <rect x="-60" y="-50" width="120" height="24" rx="6" fill={bl}/>
      <rect x="-44" y="-12" width="88" height="24" rx="6" fill={C.gold}/>
      <rect x="-28" y="26" width="56" height="24" rx="6" fill={C.red}/>
    </g>
  );
}

/* ═══════ 6. ARROW / CHEVRON ═══════
   Upward-pointing chevron in blue — aspiration, growth.
   Gold sun circle sitting at the apex. Red base line. */
function M6(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <path d="M -60,40 L 0,-50 L 60,40" fill="none" stroke={bl} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="0" cy="-58" r="14" fill={C.gold}/>
      <line x1="-60" y1="55" x2="60" y2="55" stroke={C.red} strokeWidth="6" strokeLinecap="round"/>
    </g>
  );
}

/* ═══════ 7. KNOT LOOPS ═══════
   Two interlocking loops — blue and red — forming 
   an infinity-like shape. Gold link at center. */
function M7(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <ellipse cx="-28" cy="0" rx="42" ry="36" fill="none" stroke={bl} strokeWidth="7"/>
      <ellipse cx="28" cy="0" rx="42" ry="36" fill="none" stroke={C.red} strokeWidth="7"/>
      <rect x="-7" y="-7" width="14" height="14" rx="7" fill={C.gold}/>
    </g>
  );
}

/* ═══════ 8. PILLAR ═══════
   A tall narrow blue rounded rectangle — the column
   of Mongolian script. Gold circle at top (head).
   Red thin horizontal bar at bottom (earth). */
function M8(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      <rect x="-18" y="-50" width="36" height="120" rx="8" fill={bl}/>
      <circle cx="0" cy="-62" r="12" fill={C.gold}/>
      <line x1="-40" y1="78" x2="40" y2="78" stroke={C.red} strokeWidth="5" strokeLinecap="round"/>
    </g>
  );
}

/* ═══════ 9. DIALOGUE ═══════
   Two speech bubbles overlapping — blue (round) and 
   red (round). Where they meet: gold. Communication,
   international dialogue about language. */
function M9(bg) {
  const bl = bg==='dark' ? C.skyL : C.blue;
  return (
    <g transform="translate(100,100)">
      {/* Left bubble */}
      <circle cx="-20" cy="-8" r="44" fill={bl}/>
      <polygon points="-44,28 -52,56 -24,32" fill={bl}/>
      {/* Right bubble */}
      <circle cx="20" cy="-8" r="44" fill={C.red} opacity="0.85"/>
      <polygon points="44,28 52,56 24,32" fill={C.red} opacity="0.85"/>
      {/* Gold intersection accent */}
      <circle cx="0" cy="-8" r="8" fill={C.gold}/>
    </g>
  );
}

/* ═══════ 10. FLAME DROP ═══════
   An abstract drop/flame shape — energy rising upward.
   Blue body, gold interior, red tip. Like a torch of 
   knowledge, but abstract — not literally a flame. */
function M10(bg) {
  const bl = bg==='dark' ? C.sky : C.blue;
  return (
    <g transform="translate(100,100)">
      {/* Outer flame/drop — blue */}
      <path d="M 0,-80 C -50,-30 -52,10 -52,30 C -52,60 -28,80 0,80 C 28,80 52,60 52,30 C 52,10 50,-30 0,-80 Z" fill={bl}/>
      {/* Inner — gold */}
      <path d="M 0,-40 C -24,-10 -26,10 -26,22 C -26,40 -14,52 0,52 C 14,52 26,40 26,22 C 26,10 24,-10 0,-40 Z" fill={C.gold}/>
      {/* Red tip */}
      <circle cx="0" cy="-80" r="0" fill={C.red}/>
      <path d="M 0,-80 C -6,-72 -8,-65 0,-55 C 8,-65 6,-72 0,-80 Z" fill={C.red}/>
    </g>
  );
}

Object.assign(window, { C, Duo, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10 });
