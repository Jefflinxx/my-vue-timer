import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const base = searchParams.get("from") || "USD";
  const to = searchParams.get("to") || "TWD";

  if (!start || !end) {
    return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
  }

  if (base !== "USD" || to !== "TWD") {
    return NextResponse.json({ error: "Only USD to TWD is supported." }, { status: 400 });
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const clampedEnd = end > todayStr ? todayStr : end;
  const clampedStart = start > clampedEnd ? clampedEnd : start;
  const startTs = Math.floor(new Date(clampedStart).getTime() / 1000);
  const endTs = Math.floor(new Date(clampedEnd).getTime() / 1000);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs > endTs) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const windowStart = new Date(clampedStart);
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartTs = Math.floor(windowStart.getTime() / 1000);
  const period2 = endTs + 24 * 60 * 60;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&period1=${windowStartTs}&period2=${period2}`;
  const response = await fetch(url);
  if (!response.ok) {
    let details = response.statusText;
    try {
      const text = await response.text();
      if (text) details = text;
    } catch {
      // Ignore parsing failures.
    }
    return NextResponse.json(
      { error: "Failed to fetch FX rates.", details, status: response.status },
      { status: 502 },
    );
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    return NextResponse.json(
      { error: "Failed to fetch FX rates.", details: "No data." },
      { status: 502 },
    );
  }

  const closes = result.indicators.quote[0].close;
  const rates = {};
  result.timestamp.forEach((ts, idx) => {
    const rate = closes[idx];
    if (rate == null) return;
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    if (date < windowStart.toISOString().split("T")[0] || date > clampedEnd) return;
    rates[date] = { TWD: rate };
  });

  if (Object.keys(rates).length === 0) {
    const fallbackStart = new Date(clampedStart);
    fallbackStart.setDate(fallbackStart.getDate() - 7);
    const fallbackStartTs = Math.floor(fallbackStart.getTime() / 1000);
    const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/TWD=X?interval=1d&period1=${fallbackStartTs}&period2=${period2}`;
    const fallbackResponse = await fetch(fallbackUrl);
    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      const fallbackResult = fallbackData?.chart?.result?.[0];
      const fallbackCloses = fallbackResult?.indicators?.quote?.[0]?.close || [];
      const fallbackTimestamps = fallbackResult?.timestamp || [];
      let closestRate = null;
      let closestDiff = Number.POSITIVE_INFINITY;
      fallbackTimestamps.forEach((ts, idx) => {
        const rate = fallbackCloses[idx];
        if (rate == null) return;
        const date = new Date(ts * 1000).toISOString().split("T")[0];
        if (date > clampedStart) return;
        const diff = Math.abs(new Date(clampedStart) - new Date(date));
        if (diff < closestDiff) {
          closestDiff = diff;
          closestRate = rate;
        }
      });
      if (closestRate != null) {
        return NextResponse.json({ base: "USD", rates: { [clampedStart]: { TWD: closestRate } } });
      }
    }
  }

  return NextResponse.json({ base: "USD", rates });
}
