import { useEffect, useState, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "./firebase"; // 기존 firebase 설정 파일 경로에 맞춰 수정하세요
import * as XLSX from "xlsx";
import Chart from "chart.js/auto";

const CATEGORY_COLORS = {
  에너지: { from: "#9B93EB", to: "#6D63CC", solid: "#7F77DD" },
  소득: { from: "#79D9B8", to: "#3FAF8B", solid: "#5DCAA5" },
  보험: { from: "#F4B194", to: "#DD7C5A", solid: "#F0997B" },
  재해: { from: "#F2A8C2", to: "#DE6B92", solid: "#ED93B1" },
  탄소: { from: "#C9C7BD", to: "#9B998F", solid: "#B4B2A9" },
};
const DEFAULT_COLOR = { from: "#C9C7BD", to: "#9B998F", solid: "#B4B2A9" };

function lastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatDateLabel(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

export default function StatsPage() {
  const [history, setHistory] = useState([]);
  const dailyChartRef = useRef(null);
  const catChartRef = useRef(null);
  const deptChartRef = useRef(null);
  const dailyChartInstance = useRef(null);
  const catChartInstance = useRef(null);
  const deptChartInstance = useRef(null);

  useEffect(() => {
    const historyRef = ref(db, "directorQueue/v1/history");
    const unsubscribe = onValue(historyRef, (snapshot) => {
      const data = snapshot.val() || {};
      setHistory(Object.values(data));
    });
    return () => unsubscribe();
  }, []);

  // ---------- 통계 계산 ----------
  const registered = history.filter((h) => h.type === "등록");
  const completed = history.filter((h) => h.type === "완료" && h.processingTimeMs);

  const todayStr = new Date().toISOString().split("T")[0];
  const monthPrefix = todayStr.slice(0, 7);

  const monthlyTotal = registered.filter((h) => h.date && h.date.startsWith(monthPrefix)).length;
  const todayTotal = registered.filter((h) => h.date === todayStr).length;

  const avgProcessingMin =
    completed.length > 0
      ? Math.round(
          completed.reduce((sum, h) => sum + h.processingTimeMs, 0) / completed.length / 1000 / 60
        )
      : 0;

  const categoryCounts = registered.reduce((acc, h) => {
    const cat = h.category || "기타";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const totalCategoryCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
  const topCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  const categoryAvgMin = Object.keys(categoryCounts).reduce((acc, cat) => {
    const items = completed.filter((h) => (h.category || "기타") === cat);
    acc[cat] =
      items.length > 0
        ? Math.round(items.reduce((sum, h) => sum + h.processingTimeMs, 0) / items.length / 1000 / 60)
        : 0;
    return acc;
  }, {});

  const last14 = lastNDates(14);
  const dailyCounts = last14.map(
    (date) => registered.filter((h) => h.date === date).length
  );

  // 전주 대비 증감률
  const last7 = lastNDates(7);
  const prev7 = lastNDates(14).slice(0, 7);
  const last7Total = registered.filter((h) => last7.includes(h.date)).length;
  const prev7Total = registered.filter((h) => prev7.includes(h.date)).length;
  const weekOverWeek =
    prev7Total > 0 ? Math.round(((last7Total - prev7Total) / prev7Total) * 100) : 0;

  const bottleneckCategory =
    Object.entries(categoryAvgMin).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  // ---------- 차트 렌더링 ----------
  useEffect(() => {
    if (!dailyChartRef.current) return;
    if (dailyChartInstance.current) dailyChartInstance.current.destroy();

    dailyChartInstance.current = new Chart(dailyChartRef.current, {
      type: "bar",
      data: {
        labels: last14.map(formatDateLabel),
        datasets: [
          {
            data: dailyCounts,
            backgroundColor: "#7F77DD",
            borderRadius: 4,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: "rgba(137,135,129,0.15)" }, beginAtZero: true },
        },
      },
    });

    return () => dailyChartInstance.current?.destroy();
  }, [JSON.stringify(dailyCounts)]);

  useEffect(() => {
    if (!catChartRef.current) return;
    if (catChartInstance.current) catChartInstance.current.destroy();

    const ctx = catChartRef.current.getContext("2d");
    const labels = Object.keys(categoryCounts);
    const data = labels.map((l) => categoryCounts[l]);
    const colors = labels.map((l) => {
      const c = CATEGORY_COLORS[l] || DEFAULT_COLOR;
      const g = ctx.createLinearGradient(0, 0, 160, 160);
      g.addColorStop(0, c.from);
      g.addColorStop(1, c.to);
      return g;
    });

    catChartInstance.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 4,
            spacing: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(20,20,20,0.9)",
            padding: 10,
            cornerRadius: 8,
          },
        },
        cutout: "78%",
        rotation: -90,
        elements: { arc: { borderRadius: 0 } },
      },
      plugins: [
        {
          id: "shadowArc",
          beforeDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;
          },
          afterDraw(chart) {
            chart.ctx.restore();
          },
        },
      ],
    });

    return () => catChartInstance.current?.destroy();
  }, [JSON.stringify(categoryCounts)]);

  useEffect(() => {
    if (!deptChartRef.current) return;
    if (deptChartInstance.current) deptChartInstance.current.destroy();

    const sorted = Object.entries(categoryAvgMin).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([cat]) => cat);
    const data = sorted.map(([, min]) => min);

    deptChartInstance.current = new Chart(deptChartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data, backgroundColor: "#7F77DD", borderRadius: 4, maxBarThickness: 20 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ctx.parsed.x + "분" } },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 10, callback: (v) => v + "분" },
            grid: { color: "rgba(137,135,129,0.15)" },
          },
          y: { grid: { display: false } },
        },
      },
    });

    return () => deptChartInstance.current?.destroy();
  }, [JSON.stringify(categoryAvgMin)]);

  // ---------- 엑셀 다운로드 ----------
  const handleExportExcel = () => {
    const rawRows = history.map((h) => ({
      구분: h.type,
      분야: h.category || "",
      보고자: h.reporter || "",
      제목: h.title || "",
      날짜: h.date || "",
      처리시간_분: h.processingTimeMs ? Math.round(h.processingTimeMs / 1000 / 60) : "",
    }));

    const dailyCountsMap = registered.reduce((acc, h) => {
      acc[h.date] = (acc[h.date] || 0) + 1;
      return acc;
    }, {});
    const dailyRows = Object.entries(dailyCountsMap).sort(([a], [b]) => a.localeCompare(b));

    const categoryRows = Object.keys(categoryCounts).map((cat) => [
      cat,
      categoryCounts[cat],
      categoryAvgMin[cat] || 0,
    ]);

    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["보고 등록 통계 요약", `생성일: ${todayStr}`],
      [],
      ["일별 등록 건수"],
      ["날짜", "등록건수"],
      ...dailyRows,
      [],
      ["분야별 통계"],
      ["분야", "등록건수", "평균처리시간(분)"],
      ...categoryRows,
      [],
      ["전체 요약"],
      ["이번 달 누적 등록", monthlyTotal],
      ["오늘 등록", todayTotal],
      ["평균 처리시간(분)", avgProcessingMin],
      ["최다 분야", topCategory],
      ["전주 대비 증감률(%)", weekOverWeek],
      ["병목 분야", bottleneckCategory],
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "요약");

    const rawSheet = XLSX.utils.json_to_sheet(rawRows);
    XLSX.utils.book_append_sheet(wb, rawSheet, "원본데이터");

    XLSX.writeFile(wb, `보고통계_${todayStr}.xlsx`);
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 18, fontWeight: 500 }}>보고 등록 통계</div>
        <button onClick={handleExportExcel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          엑셀로 내보내기
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: "1.75rem" }}>
        <StatCard label="이번 달 누적 등록" value={`${monthlyTotal}건`} />
        <StatCard label="오늘 등록" value={`${todayTotal}건`} />
        <StatCard label="평균 처리시간" value={`${avgProcessingMin}분`} />
        <StatCard label="최다 분야" value={topCategory} />
      </div>

      <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>일별 등록 추이 (최근 14일)</div>
      <div style={{ position: "relative", width: "100%", height: 200, marginBottom: "2rem" }}>
        <canvas ref={dailyChartRef} role="img" aria-label="최근 14일 일별 보고 등록 건수 추이" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "1.75rem" }}>
        <div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>분야별 비중</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 10, fontSize: 12, color: "#888" }}>
            {Object.entries(categoryCounts).map(([cat, count]) => (
              <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: (CATEGORY_COLORS[cat] || DEFAULT_COLOR).solid,
                  }}
                />
                {cat} {Math.round((count / totalCategoryCount) * 100)}%
              </span>
            ))}
          </div>
          <div style={{ position: "relative", width: 160, height: 160, margin: "0 auto" }}>
            <canvas ref={catChartRef} role="img" aria-label="업무 분야별 보고 등록 비중" />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 500 }}>{totalCategoryCount}</div>
              <div style={{ fontSize: 11, color: "#888" }}>건</div>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>분야별 처리 소요시간</div>
          <div style={{ position: "relative", width: "100%", height: 220 }}>
            <canvas ref={deptChartRef} role="img" aria-label="분야별 평균 처리 소요시간" />
          </div>
        </div>
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, #3C3489 0%, #534AB7 100%)",
          borderRadius: 12,
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 500, color: "#EEEDFE", fontSize: 13 }}>이번 주 인사이트</span>
        </div>
        <div style={{ fontSize: 15, color: "#fff", lineHeight: 1.7, marginBottom: 12 }}>
          등록 건수 전주 대비{" "}
          <span style={{ fontWeight: 500, color: "#AFA9EC" }}>
            {weekOverWeek >= 0 ? `${weekOverWeek}% 증가` : `${Math.abs(weekOverWeek)}% 감소`}
          </span>
          . <span style={{ fontWeight: 500, color: "#AFA9EC" }}>{topCategory} 분야</span>에 보고 집중.{" "}
          <span style={{ fontWeight: 500, color: "#AFA9EC" }}>{bottleneckCategory} 분야</span>는 평균
          처리시간이 가장 길어 병목 구간으로 확인됨.
        </div>
        <div style={{ display: "flex", gap: 20, paddingTop: 12, borderTop: "0.5px solid rgba(255,255,255,0.15)" }}>
          <InsightStat label="전주 대비" value={`${weekOverWeek >= 0 ? "+" : ""}${weekOverWeek}%`} />
          <InsightStat label="병목 분야" value={bottleneckCategory} />
          <InsightStat label="집중 분야" value={topCategory} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "#F5F5F3", borderRadius: 8, padding: "1rem" }}>
      <div style={{ fontSize: 13, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function InsightStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#CECBF6" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color: "#fff" }}>{value}</div>
    </div>
  );
}
