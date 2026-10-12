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
const US_BOUNDS = [[24.5, -125], [49.5, -66.5]];
const SMALL_QUERY = '(max-width: 700px), (max-height: 500px)';
const canHover = () => window.matchMedia('(hover: hover)').matches;
const HIGHLIGHT = { weight: 2.5, color: '#17221f', fillOpacity: 0.9 };
function getInsets(map, dock) {
  const small = window.matchMedia(SMALL_QUERY).matches;
  const mapTop = map.getContainer().getBoundingClientRect().top;
  const rect = dock.getBoundingClientRect();
  const mapLeft = map.getContainer().getBoundingClientRect().left;
  const left = rect.right - mapLeft + 12;
  if (small && window.innerHeight <= 500 && left < window.innerWidth * 0.6) return { tl: [left, 10], br: [10, 10] };
  const top = Math.max(0, rect.bottom - mapTop) + (small ? 30 : 8);
  return { tl: [10, top], br: [10, small ? 60 : 10] };
}

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

const ORDINALS = { FIRST: '1st', SECOND: '2nd', THIRD: '3rd', FOURTH: '4th', FIFTH: '5th', SIXTH: '6th', SEVENTH: '7th', EIGHTH: '8th', NINTH: '9th', TENTH: '10th', ELEVENTH: '11th' };

function formatCircuitName(name) {
  const [first, ...rest] = String(name ?? '').split(' ');
  if (ORDINALS[first.toUpperCase()]) return `${ORDINALS[first.toUpperCase()]} ${rest.join(' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}`;
  return String(name ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function getPopupContent(properties, isCircuit, accent) {
  const retirements = getNumber(properties.DEMRETIRING) + getNumber(properties.GOPRETIRING);
  const rows = [
    ['Chief judge', properties.CHIEF_JUDGE],
    ...(isCircuit ? [['Supervising justice', properties.SUPERVISING_JUSTICE]] : []),
    ['Active judges', properties.ACTIVE_JUDGES],
    ['Senior eligible', properties.SENIOR_ELIGIBLE_JUDGES],
    ['Vacancies', properties.VACANCIES],
    ['Retirements', retirements],
  ];
  return `<div class="court-popup" style="border-top-color: ${accent}"><p class="popup-kicker">Court profile</p><h3>${escapeHtml(isCircuit ? formatCircuitName(properties.NAME) : properties.NAME)}</h3><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></div>`;
}

function App() {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const layerInstance = useRef(null);
  const stageRef = useRef(null);
  const dockRef = useRef(null);
  const courtGroupRef = useRef(null);
  const modeGroupRef = useRef(null);
  const legendRef = useRef(null);
  const popupPad = useRef({ tl: L.point(10, 10), br: L.point(10, 10) });
  const [courtType, setCourtType] = useState('district');
  const [mode, setMode] = useState('partisanship');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const aboutCloseRef = useRef(null);
  const [isCourtMenuOpen, setIsCourtMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const hoverMenu = (setOpen) => ({ onPointerEnter: (e) => e.pointerType === 'mouse' && setOpen(true), onPointerLeave: (e) => e.pointerType === 'mouse' && setOpen(false), onKeyDown: (e) => e.key === 'Escape' && setOpen(false) });
  const [featureCount, setFeatureCount] = useState(null);
  const [dataDate, setDataDate] = useState(null);
  const dataCache = useRef({});
  const selectedCourt = COURT_TYPES[courtType];
  const selectedMode = MODES[mode];
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!isCourtMenuOpen && !isModeMenuOpen && !isLegendOpen) return undefined;
    const closeAll = () => { setIsCourtMenuOpen(false); setIsModeMenuOpen(false); setIsLegendOpen(false); };
    const onPointerDown = (e) => {
      if (isCourtMenuOpen && !courtGroupRef.current?.contains(e.target)) setIsCourtMenuOpen(false);
      if (isModeMenuOpen && !modeGroupRef.current?.contains(e.target)) setIsModeMenuOpen(false);
      if (isLegendOpen && !legendRef.current?.contains(e.target)) setIsLegendOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('keydown', onKeyDown); };
  }, [isCourtMenuOpen, isModeMenuOpen, isLegendOpen]);

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
    if (!isAboutOpen) return undefined;
    aboutCloseRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') setIsAboutOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAboutOpen]);

  useEffect(() => {
    const map = L.map(mapElement.current, { zoomControl: false, minZoom: 2, zoomSnap: 0.25 });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
    mapInstance.current = map;
    let userMoved = false; let fitting = false; let lastKey = '';
    map.on('dragstart', () => { userMoved = true; });
    map.on('zoomstart', () => { if (!fitting) userMoved = true; });
    map.on('popupopen', () => { setIsCourtMenuOpen(false); setIsModeMenuOpen(false); setIsLegendOpen(false); });
    const sync = () => { const dock = dockRef.current; stageRef.current?.style.setProperty('--dock-bottom', `${dock.offsetTop + dock.offsetHeight}px`); stageRef.current?.style.setProperty('--pop-max', `${window.innerWidth - getInsets(map, dock).tl[0] - 56}px`); };
    const fit = () => {
      const { tl, br } = getInsets(map, dockRef.current);
      popupPad.current.tl.x = tl[0]; popupPad.current.tl.y = tl[1]; popupPad.current.br.x = br[0]; popupPad.current.br.y = br[1];
      fitting = true;
      map.fitBounds(US_BOUNDS, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 4, animate: false });
      map.setMinZoom(Math.min(3, map.getZoom()));
      fitting = false;
    };
    const onResize = () => {
      map.invalidateSize({ pan: false });
      sync();
      const key = `${window.innerWidth}|${window.matchMedia(SMALL_QUERY).matches}|${Math.round(dockRef.current.getBoundingClientRect().bottom)}|${Math.round(dockRef.current.getBoundingClientRect().right)}|${window.innerHeight <= 500}`;
      if (key !== lastKey) { lastKey = key; if (!userMoved) fit(); else { const { tl, br } = getInsets(map, dockRef.current); popupPad.current.tl.x = tl[0]; popupPad.current.tl.y = tl[1]; popupPad.current.br.y = br[1]; } }
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(mapElement.current); ro.observe(dockRef.current);
    let orientTimer;
    const onOrient = () => { clearTimeout(orientTimer); orientTimer = setTimeout(onResize, 250); };
    window.addEventListener('orientationchange', onOrient);
    return () => { clearTimeout(orientTimer); window.removeEventListener('orientationchange', onOrient); ro.disconnect(); map.remove(); };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return undefined;

    const applyData = (data) => {
      layerInstance.current?.remove();
      const layer = L.geoJSON(data, {
        style: styleFeature,
        onEachFeature: (feature, featureLayer) => {
          featureLayer.bindPopup(() => getPopupContent(feature.properties ?? {}, courtType === 'circuit', getFillColor(feature, modeRef.current)), { autoPanPaddingTopLeft: popupPad.current.tl, autoPanPaddingBottomRight: popupPad.current.br });
          featureLayer.on({
            mouseover: (event) => { if (canHover()) event.target.setStyle(HIGHLIGHT); },
            mouseout: (event) => { if (canHover()) layer.resetStyle(event.target); },
            popupopen: (event) => { if (!canHover()) event.target.setStyle(HIGHLIGHT); },
            popupclose: (event) => { if (!canHover()) layer.resetStyle(event.target); },
          });
        },
      }).addTo(mapInstance.current);
      layerInstance.current = layer;
      setFeatureCount(data.features?.length ?? 0);
      setDataDate(formatDataDate(data.generated_at));
    };

    const cached = dataCache.current[courtType];
    if (cached) {
      applyData(cached);
      return undefined;
    }

    const controller = new AbortController();
    setFeatureCount(null);
    setDataDate(null);
    fetch(selectedCourt.path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${selectedCourt.label}`);
        return response.json();
      })
      .then((data) => {
        dataCache.current[courtType] = data;
        applyData(data);
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

      <section ref={stageRef} className="map-stage" aria-label="Interactive map of U.S. federal courts">
        <div ref={mapElement} className="map" />
        <div ref={dockRef} className="control-dock">
          <div ref={courtGroupRef} className="control-group" {...hoverMenu(setIsCourtMenuOpen)}>
            <span className="control-label"><Layers size={14} /> Court layer</span>
            <div className="select-wrap">
              <button type="button" className="select-button" onClick={() => setIsCourtMenuOpen((open) => !open)} aria-expanded={isCourtMenuOpen} aria-label={`Court layer: ${selectedCourt.label}`}>{selectedCourt.label}<ChevronDown size={16} /></button>
              {isCourtMenuOpen && <div className="menu" role="menu">{Object.entries(COURT_TYPES).map(([key, court]) => <button key={key} className={key === courtType ? 'active' : ''} onClick={() => { setCourtType(key); setIsCourtMenuOpen(false); }}>{court.label}</button>)}</div>}
            </div>
          </div>
          <div className="control-divider" />
          <div ref={modeGroupRef} className="control-group mode-control" {...hoverMenu(setIsModeMenuOpen)}>
            <span className="control-label">View mode</span>
            <div className="select-wrap">
              <button type="button" className="select-button" onClick={() => setIsModeMenuOpen((open) => !open)} aria-expanded={isModeMenuOpen} aria-label={`View mode: ${selectedMode.label}`}>{selectedMode.label}<ChevronDown size={16} /></button>
              {isModeMenuOpen && <div className="menu" role="menu">{Object.entries(MODES).map(([key, displayMode]) => <button key={key} className={key === mode ? 'active' : ''} onClick={() => { setMode(key); setIsModeMenuOpen(false); }}>{displayMode.label}</button>)}</div>}
            </div>
          </div>
        </div>
        <aside ref={legendRef} className={`legend${isLegendOpen ? ' is-open' : ''}`} aria-label={`${selectedMode.label} legend`}>
          <button type="button" className="legend-toggle" aria-expanded={isLegendOpen} aria-controls="legend-body" onClick={() => setIsLegendOpen((open) => !open)}>
            <span className="legend-chips" aria-hidden="true">{selectedMode.legend.map(([label, color]) => <i key={label} style={{ backgroundColor: color }} />)}</span>Legend<ChevronDown size={16} />
          </button>
          <div className="legend-body" id="legend-body">
            <div className="legend-heading"><span>{selectedMode.label}</span><small>{selectedMode.description}</small></div>
            {selectedMode.legend.map(([label, color]) => <div className="legend-item" key={label}><span className="swatch" style={{ backgroundColor: color }} />{label}</div>)}
          </div>
        </aside>
        <div className="map-status"><span className="status-dot" />{mapStatus}</div>
      </section>

      {isAboutOpen && <div className="modal-backdrop" onClick={() => setIsAboutOpen(false)}><section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}><button ref={aboutCloseRef} className="close-button" onClick={() => setIsAboutOpen(false)} aria-label="Close about dialog"><X size={20} /></button><div className="about-body"><p className="eyebrow">About the project</p><h2 id="about-title">A clearer view of the federal bench.</h2><p>PartiCourts brings court composition, vacancies, and announced retirements into one explorable map. Select a court layer and a view mode to compare the landscape across the United States.</p><div className="modal-note"><strong>How to explore</strong><span>Tap or click any court boundary to inspect its current profile. On a computer, hover to highlight a court.</span></div><a href="https://github.com/MikaelNineza/PartiCourts" target="_blank" rel="noreferrer" className="modal-link">View the source on GitHub <span>↗</span></a></div></section></div>}
    </main>
  );
}

export default App;
