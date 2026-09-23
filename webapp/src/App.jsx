import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { ChevronDown, Github, Info, Layers, Scale, X } from 'lucide-react';

const COURT_TYPES = {
  district: {
    label: 'District courts',
    path: '/sources/dc_usable.geojson',
  },
  circuit: {
    label: 'Circuit courts',
    path: '/sources/cc_usable.geojson',
  },
};

const CURRENT_PRESIDENT_PARTY = 'republican';

const MODES = {
  partisanship: {
    label: 'Partisanship',
    description: 'Current ideological balance',
    legend: [
      ['Democratic majority', '#2e78a8'],
      ['Republican majority', '#c9574d'],
      ['Balanced', '#7656a6'],
    ],
  },
  vacancies: {
    label: 'Vacancies',
    description: 'Open seats today',
    legend: [
      ['No vacancies', '#f1ede4'],
      ['One vacancy', '#d3a23e'],
      ['Two vacancies', '#d56b42'],
      ['Three or more', '#a63d3d'],
    ],
  },
  retirements: {
    label: 'Retirements',
    description: 'Judges nearing retirement',
    legend: [
      ['No retirements', '#f1ede4'],
      ['One retirement', '#d3a23e'],
      ['Two retirements', '#d56b42'],
      ['Three or more', '#a63d3d'],
    ],
  },
  filled: {
    label: 'Filled vacancies',
    description: `Balance if the current ${CURRENT_PRESIDENT_PARTY === 'democratic' ? 'Democratic' : 'Republican'} president filled open seats`,
    legend: [
      ['Democratic majority', '#2e78a8'],
      ['Republican majority', '#c9574d'],
      ['Balanced', '#7656a6'],
    ],
  },
};

const DEFAULT_FILL = '#7f5744';

function getNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getFeatureValue(feature, mode) {
  const properties = feature.properties ?? {};
  if (mode === 'filled') {
    const vacancySign = CURRENT_PRESIDENT_PARTY === 'democratic' ? 1 : -1;
    const balance = getNumber(properties.DEMJUDGES) - getNumber(properties.GOPJUDGES) + vacancySign * getNumber(properties.VACANCIES);
    return balance > 0 ? 1 : balance < 0 ? -1 : 0;
  }
  if (mode === 'retirements') {
    return getNumber(properties.DEMRETIRING) + getNumber(properties.GOPRETIRING);
  }
  if (mode === 'partisanship') return properties.PARTISANSHIP;
  return properties.VACANCIES;
}

function getFillColor(feature, mode) {
  const value = getFeatureValue(feature, mode);
  if (mode === 'partisanship' || mode === 'filled') {
    return { 1: '#2e78a8', '-1': '#c9574d', 0: '#7656a6' }[value] ?? DEFAULT_FILL;
  }
  const count = getNumber(value);
  if (count === 0) return '#f1ede4';
  if (count === 1) return '#d3a23e';
  if (count === 2) return '#d56b42';
  return '#a63d3d';
}

function formatDataDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function escapeHtml(value) {
  return String(value ?? 'Not reported')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getPopupContent(properties, isCircuit) {
  const retirements = getNumber(properties.DEMRETIRING) + getNumber(properties.GOPRETIRING);
  const rows = [
    ['Chief judge', properties.CHIEF_JUDGE],
    ...(isCircuit ? [['Supervising justice', properties.SUPERVISING_JUSTICE]] : []),
    ['Active judges', properties.ACTIVE_JUDGES],
    ['Senior eligible', properties.SENIOR_ELIGIBLE_JUDGES],
    ['Vacancies', properties.VACANCIES],
    ['Retirements', retirements],
  ];
  return `<div class="court-popup"><p class="popup-kicker">Court profile</p><h3>${escapeHtml(properties.NAME)}</h3><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></div>`;
}

function App() {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const layerInstance = useRef(null);
  const [courtType, setCourtType] = useState('district');
  const [mode, setMode] = useState('partisanship');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCourtMenuOpen, setIsCourtMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [featureCount, setFeatureCount] = useState(null);
  const [dataDate, setDataDate] = useState(null);
  const selectedCourt = COURT_TYPES[courtType];
  const selectedMode = MODES[mode];
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const styleFeature = useCallback(
    (feature) => ({
      color: '#24342f',
      weight: 1.1,
      opacity: 0.9,
      fillColor: getFillColor(feature, modeRef.current),
      fillOpacity: 0.72,
    }),
    [],
  );

  useEffect(() => {
    const map = L.map(mapElement.current, { zoomControl: false, minZoom: 3 }).setView([39.8283, -98.5795], 4);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    mapInstance.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return undefined;
    const controller = new AbortController();
    setFeatureCount(null);
    setDataDate(null);
    fetch(selectedCourt.path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${selectedCourt.label}`);
        return response.json();
      })
      .then((data) => {
        layerInstance.current?.remove();
        const layer = L.geoJSON(data, {
          style: styleFeature,
          onEachFeature: (feature, featureLayer) => {
            featureLayer.bindPopup(getPopupContent(feature.properties ?? {}, courtType === 'circuit'));
            featureLayer.on({
              mouseover: (event) => event.target.setStyle({ weight: 2.5, color: '#17221f', fillOpacity: 0.9 }),
              mouseout: (event) => layer.resetStyle(event.target),
            });
          },
        }).addTo(mapInstance.current);
        layerInstance.current = layer;
        setFeatureCount(data.features?.length ?? 0);
        setDataDate(formatDataDate(data.generated_at));
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error);
      });
    return () => controller.abort();
  }, [courtType, selectedCourt, styleFeature]);

  useEffect(() => {
    layerInstance.current?.setStyle(styleFeature);
  }, [mode, styleFeature]);

  const mapStatus = useMemo(() => {
    if (featureCount === null) return 'Loading court boundaries';
    const summary = `${featureCount} mapped ${courtType === 'district' ? 'districts' : 'circuits'}`;
    return dataDate ? `${summary} · Data as of ${dataDate}` : summary;
  }, [courtType, dataDate, featureCount]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="PartiCourts home">
          <span className="brand-mark"><Scale size={18} strokeWidth={2.5} /></span>
          <span>Parti<span>Courts</span></span>
        </a>
        <div className="topbar-actions">
          <a className="icon-link" href="https://github.com/MikaelNineza/PartiCourts" target="_blank" rel="noreferrer" aria-label="Open PartiCourts on GitHub" title="GitHub"><Github size={19} /></a>
          <button className="about-button" onClick={() => setIsAboutOpen(true)}><Info size={17} /> About</button>
        </div>
      </header>

      <section className="map-stage" aria-label="Interactive map of U.S. federal courts">
        <div ref={mapElement} className="map" />
        <div className="control-dock">
          <div className="control-group">
            <span className="control-label"><Layers size={14} /> Court layer</span>
            <div className="select-wrap">
              <button className="select-button" onClick={() => setIsCourtMenuOpen((open) => !open)} aria-expanded={isCourtMenuOpen}>{selectedCourt.label}<ChevronDown size={16} /></button>
              {isCourtMenuOpen && <div className="menu" role="menu">{Object.entries(COURT_TYPES).map(([key, court]) => <button key={key} className={key === courtType ? 'active' : ''} onClick={() => { setCourtType(key); setIsCourtMenuOpen(false); }}>{court.label}</button>)}</div>}
            </div>
          </div>
          <div className="control-divider" />
          <div className="control-group mode-control">
            <span className="control-label">View mode</span>
            <div className="select-wrap">
              <button className="select-button" onClick={() => setIsModeMenuOpen((open) => !open)} aria-expanded={isModeMenuOpen}>{selectedMode.label}<ChevronDown size={16} /></button>
              {isModeMenuOpen && <div className="menu" role="menu">{Object.entries(MODES).map(([key, displayMode]) => <button key={key} className={key === mode ? 'active' : ''} onClick={() => { setMode(key); setIsModeMenuOpen(false); }}>{displayMode.label}</button>)}</div>}
            </div>
          </div>
        </div>
        <aside className="legend" aria-label={`${selectedMode.label} legend`}>
          <div className="legend-heading"><span>{selectedMode.label}</span><small>{selectedMode.description}</small></div>
          {selectedMode.legend.map(([label, color]) => <div className="legend-item" key={label}><span className="swatch" style={{ backgroundColor: color }} />{label}</div>)}
        </aside>
        <div className="map-status"><span className="status-dot" />{mapStatus}</div>
        <div className="attribution-note">Data visualization · OpenStreetMap base map</div>
      </section>

      {isAboutOpen && <div className="modal-backdrop" onClick={() => setIsAboutOpen(false)}><section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setIsAboutOpen(false)} aria-label="Close about dialog"><X size={20} /></button><p className="eyebrow">About the project</p><h2 id="about-title">A clearer view of the federal bench.</h2><p>PartiCourts brings court composition, vacancies, and announced retirements into one explorable map. Select a court layer and a view mode to compare the landscape across the United States.</p><div className="modal-note"><strong>How to explore</strong><span>Click any court boundary to inspect its current profile. Hover to highlight a court.</span></div><a href="https://github.com/MikaelNineza/PartiCourts" target="_blank" rel="noreferrer" className="modal-link">View the source on GitHub <span>↗</span></a></section></div>}
    </main>
  );
}

export default App;
