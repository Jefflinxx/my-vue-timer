import { NextResponse } from "next/server";
import { format } from "date-fns";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

let coinListCache = null;
let coinListCacheTimestamp = 0;
const COIN_GECKO_ID_OVERRIDES = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
};

async function getCoinGeckoId(ticker) {
  const override = COIN_GECKO_ID_OVERRIDES[ticker.toUpperCase()];
  if (override) return override;

  const now = Date.now();
  const apiKeyParam = COINGECKO_API_KEY ? `&x_cg_demo_api_key=${COINGECKO_API_KEY}` : "";
  if (!coinListCache || now - coinListCacheTimestamp > 3600 * 1000) {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/list?${apiKeyParam}`);
      if (!response.ok) throw new Error("Failed to fetch coin list from CoinGecko");
      coinListCache = await response.json();
      coinListCacheTimestamp = now;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  if (!coinListCache) return null;

  const coin = coinListCache.find((c) => c.symbol.toLowerCase() === ticker.toLowerCase());
  return coin ? coin.id : null;
}

async function getUsStockHistoricalData(ticker) {
  if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === "YOUR_API_KEY_HERE") {
    throw new Error("Alpha Vantage API key is not set.");
  }
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data["Error Message"]) {
    throw new Error(`Alpha Vantage error: ${data["Error Message"]}`);
  }
  if (data["Note"]) {
    throw new Error(`Alpha Vantage limit reached: ${data["Note"]}`);
  }
  if (data["Information"]) {
    throw new Error(`Alpha Vantage info: ${data["Information"]}`);
  }

  const timeSeries = data["Time Series (Daily)"];
  if (!timeSeries) {
    throw new Error(`Could not find historical data for stock ticker: ${ticker}`);
  }

  const formattedData = {};
  for (const date in timeSeries) {
    formattedData[date] = parseFloat(timeSeries[date]["4. close"]);
  }
  return formattedData;
}

async function fetchYahooHistoricalData(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
  const response = await fetch(url);
  if (!response.ok) {
    return {};
  }
  const data = await response.json();
  if (data?.chart?.error?.description) {
    throw new Error(`Yahoo Finance error for ${symbol}: ${data.chart.error.description}`);
  }
  const result = data?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    return {};
  }

  const closes = result.indicators.quote[0].close;
  const formattedData = {};
  result.timestamp.forEach((ts, idx) => {
    const price = closes[idx];
    if (price == null) return;
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    formattedData[date] = price;
  });
  return formattedData;
}

async function getTaiwanStockHistoricalData(ticker) {
  const baseSymbol = ticker.includes(".") ? ticker : `${ticker}.TW`;
  const formattedData = await fetchYahooHistoricalData(baseSymbol);
  if (Object.keys(formattedData).length > 0) {
    return formattedData;
  }
  if (!ticker.includes(".")) {
    const otcData = await fetchYahooHistoricalData(`${ticker}.TWO`);
    if (Object.keys(otcData).length > 0) {
      return otcData;
    }
  }
  throw new Error(`Could not find historical data for Taiwan stock ticker: ${ticker}`);
}

async function getCryptoHistoricalData(ticker) {
  const coinId = await getCoinGeckoId(ticker);
  if (!coinId) {
    throw new Error(`Could not find a CoinGecko ID for cryptocurrency ticker: ${ticker}`);
  }

  const apiKeyParam = COINGECKO_API_KEY ? `&x_cg_demo_api_key=${COINGECKO_API_KEY}` : "";
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=365&interval=daily${apiKeyParam}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.prices) {
    const errorDetails = data.status
      ? ` (status: ${data.status.error_code}, message: ${data.status.error_message})`
      : "";
    throw new Error(`Could not find historical data for crypto ticker: ${ticker}${errorDetails}`);
  }

  const formattedData = {};
  for (const [timestamp, price] of data.prices) {
    const date = format(new Date(timestamp), "yyyy-MM-dd");
    formattedData[date] = price;
  }
  return formattedData;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const type = searchParams.get("type");

  if (!ticker || !type) {
    return NextResponse.json({ error: "Ticker and type are required" }, { status: 400 });
  }

  try {
    let data;
    if (type === "stock") {
      data = await getUsStockHistoricalData(ticker);
    } else if (type === "us_stock") {
      data = await getUsStockHistoricalData(ticker);
    } else if (type === "tw_stock") {
      data = await getTaiwanStockHistoricalData(ticker);
    } else if (type === "crypto") {
      data = await getCryptoHistoricalData(ticker);
    } else {
      return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Failed to fetch historical data for ${ticker}:`, error.message);
    return NextResponse.json(
      { error: "Failed to fetch historical data", details: error.message },
      { status: 500 },
    );
  }
}
