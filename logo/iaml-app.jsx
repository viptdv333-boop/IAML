
const { DesignCanvas, DCSection, DCArtboard } = window;
const { Duo, M1, M2, M3, M4, M5, M6, M7, M8, M9, M10 } = window;

function App() {
  return (
    <DesignCanvas title="IAML — 10 More Concepts" subtitle="Mongolian palette (blue · red · gold), abstract and iconic">
      <DCSection id="celestial" title="Celestial & Landscape">
        <DCArtboard id="m1" label="1 — Crescent Embrace" width={580} height={440}>
          <Duo label="Crescent Embrace — moon wrapping the sun">{M1}</Duo>
        </DCArtboard>
        <DCArtboard id="m2" label="2 — Three Peaks" width={580} height={440}>
          <Duo label="Three Peaks — Mongolia's mountain landscape">{M2}</Duo>
        </DCArtboard>
        <DCArtboard id="m6" label="6 — Chevron & Sun" width={580} height={440}>
          <Duo label="Chevron & Sun — aspiration, growth">{M6}</Duo>
        </DCArtboard>
        <DCArtboard id="m10" label="10 — Flame Drop" width={580} height={440}>
          <Duo label="Flame Drop — torch of knowledge">{M10}</Duo>
        </DCArtboard>
      </DCSection>

      <DCSection id="language" title="Language & Dialogue">
        <DCArtboard id="m4" label="4 — Brackets" width={580} height={440}>
          <Duo label="Brackets — linguistic notation, gold center">{M4}</Duo>
        </DCArtboard>
        <DCArtboard id="m9" label="9 — Dialogue" width={580} height={440}>
          <Duo label="Dialogue — two speech bubbles meeting">{M9}</Duo>
        </DCArtboard>
        <DCArtboard id="m7" label="7 — Knot Loops" width={580} height={440}>
          <Duo label="Knot Loops — interlocking, infinity">{M7}</Duo>
        </DCArtboard>
      </DCSection>

      <DCSection id="geometric" title="Geometric & Abstract">
        <DCArtboard id="m3" label="3 — Ring & Line" width={580} height={440}>
          <Duo label="Ring & Line — precision, focus">{M3}</Duo>
        </DCArtboard>
        <DCArtboard id="m5" label="5 — Stacked Bars" width={580} height={440}>
          <Duo label="Stacked Bars — text hierarchy">{M5}</Duo>
        </DCArtboard>
        <DCArtboard id="m8" label="8 — Pillar" width={580} height={440}>
          <Duo label="Pillar — Mongolian script column">{M8}</Duo>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
