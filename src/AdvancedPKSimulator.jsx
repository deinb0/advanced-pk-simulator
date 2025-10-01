import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import html2canvas from "html2canvas";

export default function AdvancedPKSimulator() {
  const [dose, setDose] = useState(500);
  const [interval, setInterval] = useState(8);
  const [halfLife, setHalfLife] = useState(6);
  const [duration, setDuration] = useState(48);

  // Convert half-life to elimination rate constant
  const k = Math.log(2) / halfLife;

  // Calculate concentration over time
  const data = [];
  for (let t = 0; t <= duration; t++) {
    let conc = 0;
    for (let n = 0; n <= t / interval; n++) {
      const doseTime = n * interval;
      if (t >= doseTime) {
        conc += dose * Math.exp(-k * (t - doseTime));
      }
    }
    data.push({ time: t, concentration: conc });
  }

  const downloadPNG = async () => {
    const chartElement = document.getElementById("chart-container");
    if (!chartElement) return;
    const canvas = await html2canvas(chartElement);
    const link = document.createElement("a");
    link.download = "pk-simulation.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "20px" }}>
      <h2>Advanced PK Simulator</h2>
      <div style={{ marginBottom: "20px" }}>
        <label>
          Dose (mg):{" "}
          <input
            type="number"
            value={dose}
            onChange={(e) => setDose(Number(e.target.value))}
          />
        </label>{" "}
        <label>
          Dosing Interval (h):{" "}
          <input
            type="number"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
        </label>{" "}
        <label>
          Half-life (h):{" "}
          <input
            type="number"
            value={halfLife}
            onChange={(e) => setHalfLife(Number(e.target.value))}
          />
        </label>{" "}
        <label>
          Duration (h):{" "}
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>{" "}
        <button onClick={downloadPNG}>Download Chart as PNG</button>
      </div>

      <div id="chart-container" style={{ width: "100%", height: 400 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" label={{ value: "Time (h)", position: "insideBottomRight", offset: -5 }} />
            <YAxis label={{ value: "Concentration", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="concentration" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
