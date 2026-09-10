type LineageLiteProps = {
  counts?: {
    alive: number;
    missing: number;
    needsCheck: number;
  };
};

export function LineageLite({ counts }: LineageLiteProps) {
  const nodes = [
    { x: 110, y: 104, tone: "green" },
    { x: 210, y: 140, tone: "green" },
    { x: 330, y: 140, tone: "orange" },
    { x: 500, y: 140, tone: "red" },
    { x: 575, y: 90, tone: "green" },
    { x: 675, y: 112, tone: "dim" },
  ];
  return (
    <section className="lineage-panel">
      <div className="lineage-header">
        <h2>Lineage (lite)</h2>
        <button type="button">View Full Lineage</button>
      </div>
      <div className="lineage-content">
        <svg viewBox="0 0 760 170" className="lineage-graph" role="img" aria-label="Pritha lineage graph">
          <line x1="380" y1="74" x2="110" y2="104" />
          <line x1="380" y1="74" x2="210" y2="140" />
          <line x1="380" y1="74" x2="330" y2="140" />
          <line x1="380" y1="74" x2="500" y2="140" />
          <line x1="380" y1="74" x2="575" y2="90" />
          <line className="dashed" x1="575" y1="90" x2="675" y2="112" />
          <circle className="pritha-node" cx="380" cy="74" r="18" />
          <text x="410" y="80">Pritha</text>
          {nodes.map((node) => (
            <g key={`${node.x}-${node.y}`}>
              <circle className={`child-node ${node.tone}`} cx={node.x} cy={node.y} r="17" />
              <circle className={`child-core ${node.tone}`} cx={node.x} cy={node.y} r="6" />
            </g>
          ))}
        </svg>
        <div className="lineage-legend">
          <Legend tone="green" label="Alive" value={String(counts?.alive ?? 0)} />
          <Legend tone="orange" label="Needs Check" value={String(counts?.needsCheck ?? 0)} />
          <Legend tone="red" label="Missing" value={String(counts?.missing ?? 0)} />
          <Legend tone="dim" label="Unknown" value="0" />
        </div>
      </div>
    </section>
  );
}

function Legend({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className="legend-row">
      <span className={`legend-dot ${tone}`} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
