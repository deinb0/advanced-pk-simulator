import React, { useMemo, useState, useRef } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import html2canvas from 'html2canvas';

// Improved Advanced Pharmacokinetic Simulator (single-file React component)
// New: added downloadable PNG export (captures the chart area using html2canvas)
// NOTE: install dependency: `npm install html2canvas`

const epsilon = 1e-9;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white p-3 border border-gray-300 rounded shadow-lg text-sm">
      <div className="font-semibold">Time: {Number(d.time).toFixed(2)} h</div>
      <div className="text-indigo-600">Concentration: {Number(d.concentration).toFixed(4)} mg/L</div>
      <div
        className={`font-semibold mt-1 ${
          d.status === 'therapeutic' ? 'text-green-600' : d.status === 'toxic' ? 'text-red-600' : 'text-orange-600'
        }`}
      >
        Status: {d.status}
      </div>
    </div>
  );
};

const AdvancedPKSimulator = () => {
  // State management
  const [administrationType, setAdministrationType] = useState('iv');
  const [dose, setDose] = useState(500);
  const [volume, setVolume] = useState(50);
  const [ke, setKe] = useState(0.1);
  const [ka, setKa] = useState(0.5); // Absorption rate for oral
  const [bioavailability, setBioavailability] = useState(0.8); // F for oral
  const [dosingInterval, setDosingInterval] = useState(8);
  const [numberOfDoses, setNumberOfDoses] = useState(1);
  const [therapeuticMin, setTherapeuticMin] = useState(5);
  const [therapeuticMax, setTherapeuticMax] = useState(15);
  const [data, setData] = useState([]);
  const [showTherapeuticWindow, setShowTherapeuticWindow] = useState(true);
  const [exporting, setExporting] = useState(false);

  const chartRef = useRef(null);

  // Helpers with defensive parsing
  const nDose = Math.max(1, parseInt(numberOfDoses, 10) || 1);
  const intv = Math.max(0.1, parseFloat(dosingInterval) || 0.1);
  const numericDose = Math.max(0, parseFloat(dose) || 0);
  const numericV = Math.max(0.0001, parseFloat(volume) || 0.0001);
  const numericKe = Math.max(epsilon, parseFloat(ke) || epsilon);
  const numericKa = Math.max(epsilon, parseFloat(ka) || epsilon);
  const numericF = Math.min(1, Math.max(0, parseFloat(bioavailability) || 0));

  // IV Bolus: C(t) = C0 * e^(-ke*t)
  const calculateIVBolus = (t, C0, keVal) => C0 * Math.exp(-keVal * t);

  // Oral: C(t) = (F*D*ka)/(V*(ka-ke)) * (e^(-ke*t) - e^(-ka*t))
  const calculateOralDose = (t, D, V, kaVal, keVal, F) => {
    // If ka and ke are numerically very close, use L'Hopital limit
    if (Math.abs(kaVal - keVal) < 1e-6) {
      // limit -> (F * D * kaVal / V) * t * e^(-kaVal * t)
      return (F * D * kaVal / V) * t * Math.exp(-kaVal * t);
    }
    const coeff = (F * D * kaVal) / (V * (kaVal - keVal));
    return coeff * (Math.exp(-keVal * t) - Math.exp(-kaVal * t));
  };

  // Sum multiple doses by superposition
  const calculateMultipleDoses = (t, singleDoseFunc, dosingIntervalVal, numberOfDosesVal) => {
    let total = 0;
    for (let i = 0; i < numberOfDosesVal; i++) {
      const doseTime = i * dosingIntervalVal;
      if (t >= doseTime) total += singleDoseFunc(t - doseTime);
    }
    return total;
  };

  const simulatePK = () => {
    const timePoints = [];
    const dt = 0.25; // hours
    const maxTime = Math.max(24, nDose * intv + 24); // give a horizon

    for (let t = 0; t <= maxTime + 1e-9; t += dt) {
      let concentration = 0;
      if (administrationType === 'iv') {
        const C0 = numericDose / numericV;
        const single = (tau) => calculateIVBolus(tau, C0, numericKe);
        concentration = calculateMultipleDoses(t, single, intv, nDose);
      } else {
        const single = (tau) => calculateOralDose(tau, numericDose, numericV, numericKa, numericKe, numericF);
        concentration = calculateMultipleDoses(t, single, intv, nDose);
      }

      const inRange = concentration >= therapeuticMin && concentration <= therapeuticMax;
      const status = concentration < therapeuticMin ? 'subtherapeutic' : concentration > therapeuticMax ? 'toxic' : 'therapeutic';

      timePoints.push({
        time: Number(t.toFixed(2)),
        concentration: Number(concentration),
        therapeuticMin: Number(therapeuticMin),
        therapeuticMax: Number(therapeuticMax),
        inRange,
        status,
      });
    }

    setData(timePoints);
  };

  const calculateMetrics = useMemo(() => {
    if (!data || data.length === 0) return null;

    const halfLife = Math.log(2) / numericKe;

    // Tmax only valid for oral when ka > ke
    let Tmax = null;
    let Cmax = null;
    if (administrationType === 'oral' && numericKa > numericKe + 1e-12) {
      Tmax = Math.log(numericKa / numericKe) / (numericKa - numericKe);
      Cmax = calculateOralDose(Tmax, numericDose, numericV, numericKa, numericKe, numericF);
    }

    // AUC by trapezoid
    let AUC = 0;
    for (let i = 1; i < data.length; i++) {
      const dt = data[i].time - data[i - 1].time;
      AUC += (data[i].concentration + data[i - 1].concentration) / 2 * dt;
    }

    const therapeuticPoints = data.filter((d) => d.inRange).length;
    const percentInRange = (therapeuticPoints / data.length) * 100;

    // Steady-state: require at least ~5 half-lives covered or enough dosing cycles
    let Css_avg = null;
    let Css_max = null;
    let Css_min = null;

    const sufficientTimeForSteadyState = data.length && (data[data.length - 1].time >= 5 * halfLife);
    if (nDose > 1 && sufficientTimeForSteadyState) {
      // take last dosingInterval*4 hours to approximate steady-state window (bounded)
      const windowHours = Math.min(5 * halfLife, intv * 4);
      const startTime = data[data.length - 1].time - windowHours;
      const steadyData = data.filter((d) => d.time >= startTime);
      if (steadyData.length > 0) {
        Css_avg = (steadyData.reduce((s, x) => s + x.concentration, 0) / steadyData.length).toFixed(3);
        Css_max = Math.max(...steadyData.map((d) => d.concentration)).toFixed(3);
        Css_min = Math.min(...steadyData.map((d) => d.concentration)).toFixed(3);
      }
    }

    return {
      halfLife: halfLife.toFixed(3),
      Tmax: Tmax != null ? Number(Tmax).toFixed(3) : '—',
      Cmax: Cmax != null ? Number(Cmax).toFixed(3) : '—',
      AUC: AUC.toFixed(3),
      percentInRange: percentInRange.toFixed(1),
      Css_avg,
      Css_max,
      Css_min,
    };
  }, [data, administrationType, numericDose, numericV, numericKa, numericKe, numericF, nDose, intv, therapeuticMin, therapeuticMax]);

  // Export the chart area as PNG using html2canvas
  const exportChartAsPNG = async () => {
    if (!chartRef.current) {
      alert('Chart not found — run a simulation first.');
      return;
    }

    setExporting(true);
    try {
      // scale:2 to improve resolution of exported PNG
      const canvas = await html2canvas(chartRef.current, { backgroundColor: null, scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `pk_simulation_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export error', err);
      alert('Export failed — check console for details.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
        <h1 className="text-3xl font-bold text-indigo-900 mb-2">Advanced Pharmacokinetic Simulator — Improved</h1>
        <p className="text-gray-600 mb-4">Multi-dose modeling with safer numeric handling and improved visuals.</p>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setAdministrationType('iv')}
            className={`px-5 py-2 rounded ${administrationType === 'iv' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}
          >
            IV Bolus
          </button>
          <button
            onClick={() => setAdministrationType('oral')}
            className={`px-5 py-2 rounded ${administrationType === 'oral' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}
          >
            Oral
          </button>
        </div>

        {/* Parameters (kept compact) */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Dose (mg)</label>
            <input type="number" value={dose} onChange={(e) => setDose(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Volume (L)</label>
            <input type="number" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">ke (1/hr)</label>
            <input type="number" step="0.001" value={ke} onChange={(e) => setKe(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          {administrationType === 'oral' && (
            <>
              <div className="p-3 bg-white rounded shadow">
                <label className="block text-sm font-semibold">ka (1/hr)</label>
                <input type="number" step="0.001" value={ka} onChange={(e) => setKa(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
              </div>

              <div className="p-3 bg-white rounded shadow">
                <label className="block text-sm font-semibold">Bioavailability (0–1)</label>
                <input type="number" step="0.01" min="0" max="1" value={bioavailability} onChange={(e) => setBioavailability(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
              </div>
            </>
          )}

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Dosing Interval (hr)</label>
            <input type="number" value={dosingInterval} onChange={(e) => setDosingInterval(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Number of Doses</label>
            <input type="number" min="1" value={numberOfDoses} onChange={(e) => setNumberOfDoses(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Therapeutic Min (mg/L)</label>
            <input type="number" value={therapeuticMin} onChange={(e) => setTherapeuticMin(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="p-3 bg-white rounded shadow">
            <label className="block text-sm font-semibold">Therapeutic Max (mg/L)</label>
            <input type="number" value={therapeuticMax} onChange={(e) => setTherapeuticMax(Number(e.target.value))} className="w-full px-2 py-1 border rounded" />
          </div>
        </div>

        <div className="mb-6 flex gap-3">
          <button onClick={simulatePK} className="flex-1 bg-indigo-600 text-white py-2 rounded font-semibold">Run Advanced Simulation</button>
          <button onClick={exportChartAsPNG} disabled={exporting || data.length === 0} className={`px-4 py-2 rounded font-semibold ${exporting ? 'bg-gray-400 text-gray-700' : 'bg-green-600 text-white'}`}>
            {exporting ? 'Exporting...' : 'Download PNG'}
          </button>
        </div>

        {/* Metrics */}
        {calculateMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded">Half-life: <strong>{calculateMetrics.halfLife} h</strong></div>
            {administrationType === 'oral' && (
              <>
                <div className="p-3 bg-green-500 text-white rounded">Tmax: <strong>{calculateMetrics.Tmax}</strong></div>
                <div className="p-3 bg-green-600 text-white rounded">Cmax: <strong>{calculateMetrics.Cmax} mg/L</strong></div>
              </>
            )}
            <div className="p-3 bg-purple-500 text-white rounded">AUC: <strong>{calculateMetrics.AUC} mg·h/L</strong></div>
            <div className="p-3 bg-amber-500 text-white rounded">In Range: <strong>{calculateMetrics.percentInRange}%</strong></div>
            {calculateMetrics.Css_avg && (
              <>
                <div className="p-3 bg-teal-500 text-white rounded">Css,avg: <strong>{calculateMetrics.Css_avg} mg/L</strong></div>
                <div className="p-3 bg-teal-600 text-white rounded">Css Range: <strong>{calculateMetrics.Css_min} — {calculateMetrics.Css_max}</strong></div>
              </>
            )}
          </div>
        )}

        {/* Chart */}
        {data && data.length > 0 && (
          <div className="bg-white p-4 rounded shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Concentration–Time Profile</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showTherapeuticWindow} onChange={(e) => setShowTherapeuticWindow(e.target.checked)} /> Show therapeutic window
              </label>
            </div>

            {/* chartRef wraps the chart area so html2canvas captures it */}
            <div ref={chartRef} id="pk-chart" style={{ padding: 8, background: 'white', borderRadius: 8 }}>
              <ResponsiveContainer width="100%" height={450}>
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" label={{ value: 'Time (h)', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Conc (mg/L)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {showTherapeuticWindow && (
                    <>
                      <ReferenceArea y1={therapeuticMin} y2={therapeuticMax} strokeOpacity={0.0} fillOpacity={0.08} />
                      <ReferenceLine y={therapeuticMax} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Toxic Level', position: 'right' }} />
                      <ReferenceLine y={therapeuticMin} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Minimum Effective', position: 'right' }} />
                    </>
                  )}

                  <Line type="monotone" dataKey="concentration" stroke="#4f46e5" strokeWidth={2} dot={false} name="Drug concentration" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Model equations */}
        <div className="mt-6 bg-indigo-50 p-4 rounded">
          <h4 className="font-semibold">Model equations</h4>
          <ul className="text-sm list-disc list-inside">
            <li>IV: C(t) = C<sub>0</sub> · e<sup>-ke·t</sup></li>
            <li>
              Oral: C(t) = (F·D·ka)/(V·(ka-ke)) · (e<sup>-ke·t</sup> - e<sup>-ka·t</sup>) (L'Hôpital used when ka ≈ ke)
            </li>
            <li>t<sub>1/2</sub> = ln(2)/ke</li>
            <li>t<sub>max</sub> = ln(ka/ke)/(ka - ke) (only if ka &gt; ke)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdvancedPKSimulator;
