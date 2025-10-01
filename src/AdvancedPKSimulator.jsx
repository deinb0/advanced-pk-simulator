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
    <div className="font-sans p-6 bg-gray-50 min-h-screen">
      <h2 className="text-2xl font-bold mb-6 text-indigo-600">
        Advanced PK Simulator
      </h2>

      {/* Input controls */}
      <div className="mb-8 flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2">
          Dose (mg):
          <input
            type="number"
            value={dose}
            onChange={(e) => setDose(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </label>

        <label className="flex items-center gap-2">
          Dosing Interval (h):
          <input
            type="number"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24"
          />
        </label>

        <label className="flex items-center gap-2">
          Half-life (h):
          <input
            type="number"
            value={halfLife}
            onChange={(e) => setHalfLife(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </label>

        <label className="flex items-center gap-2">
          Duration (h):
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </label>

        <button
          onClick={downloadPNG}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700"
        >
          Download Chart as PNG
        </button>
      </div>

      {/* Chart */}
      <div
        id="chart-container"
        className="w-full h-96 bg-white rounded-lg shadow p-4"
      >
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              label={{
                value: "Time (h)",
                position: "insideBottomRight",
                offset: -5,
              }}
            />
            <YAxis
              label={{
                value: "Concentration",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="concentration"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

