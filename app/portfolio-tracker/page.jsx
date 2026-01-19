"use client";

import React, { useState, useMemo, useEffect } from "react";
import styled, { css } from "styled-components";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Plus, Trash2, Calendar, Clock, PlayCircle } from "lucide-react";
import { format, addDays, parseISO, isAfter, isBefore } from "date-fns";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// A small list of example tickers for the dropdown.
const exampleTickers = {
  us_stock: ["TSLA", "GOOGL", "VT", "IBKR"],
  tw_stock: ["2330", "006208"],
  crypto: ["BTC", "ETH", "BNB"],
  cash_usd: ["USD"],
  cash_twd: ["TWD"],
};

const assetTypeLabels = {
  us_stock: "美股",
  tw_stock: "台股",
  crypto: "加密貨幣",
  cash_usd: "現金 (USD)",
  cash_twd: "現金 (TWD)",
};

const isCashType = (type) => type === "cash_usd" || type === "cash_twd";
const cashTickerForType = (type) => (type === "cash_twd" ? "CASH_TWD" : "CASH_USD");
const isUsdType = (type) => type === "us_stock" || type === "crypto" || type === "cash_usd";

export default function PortfolioTracker() {
  // --- State: 使用者輸入 ---
  const [assets, setAssets] = useState([]);

  // --- State: API Data, Loading, Errors ---
  const [priceHistories, setPriceHistories] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fxRates, setFxRates] = useState({});
  const [fetchVersion, setFetchVersion] = useState(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [chartCache, setChartCache] = useState(null);

  // --- State: 新增資產表單 ---
  const [newTicker, setNewTicker] = useState("TSLA");
  const [newAmount, setNewAmount] = useState("");
  const [chartDate, setChartDate] = useState(new Date().toISOString().split("T")[0]);
  const [newType, setNewType] = useState("us_stock");

  // --- State: 時光機 (Time Travel) ---
  const [timeIndex, setTimeIndex] = useState(0);
  const [allDates, setAllDates] = useState([]);

  // --- Data Fetching ---
  useEffect(() => {
    const savedAssets = window.localStorage.getItem("portfolio_assets");
    if (savedAssets) {
      try {
        setAssets(JSON.parse(savedAssets));
      } catch {
        // Ignore invalid localStorage data.
      }
    }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    window.localStorage.setItem("portfolio_assets", JSON.stringify(assets));
  }, [assets, hasHydrated]);

  useEffect(() => {
    const savedChart = window.localStorage.getItem("portfolio_chart_cache");
    if (savedChart) {
      try {
        setChartCache(JSON.parse(savedChart));
      } catch {
        // Ignore invalid localStorage data.
      }
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated || !chartCache) return;
    const assetKey = JSON.stringify(assets);
    if (chartCache.assetKey !== assetKey) return;
    setPriceHistories(chartCache.priceHistories || {});
    setFxRates(chartCache.fxRates || {});
    setAllDates(chartCache.allDates || []);
    setTimeIndex(chartCache.timeIndex || 0);
    if (chartCache.chartDate) {
      setChartDate(chartCache.chartDate);
    }
    setIsLoading(false);
  }, [hasHydrated, chartCache, assets]);

  useEffect(() => {
    const fetchAllHistories = async () => {
      if (fetchVersion === 0) {
        setIsLoading(false);
        return;
      }
      if (assets.length === 0) {
        setIsLoading(false);
        setPriceHistories({});
        setAllDates([]);
        setTimeIndex(0);
        setFxRates({});
        return;
      }

      setIsLoading(true);
      setError(null);

      const uniqueTickers = [
        ...new Set(assets.filter((a) => !isCashType(a.type)).map((a) => `${a.type}:${a.ticker}`)),
      ];
      const histories = {};
      const needsTwFx = assets.some((a) => isUsdType(a.type));

      try {
        if (uniqueTickers.length > 0) {
          for (const tickerKey of uniqueTickers) {
            const [type, ticker] = tickerKey.split(":");
            const response = await fetch(`/api/historical-data?ticker=${ticker}&type=${type}`);
            if (!response.ok) {
              const errorInfo = await response.json();
              throw new Error(`Failed for ${ticker}: ${errorInfo.details || "Unknown error"}`);
            }
            const data = await response.json();
            histories[ticker] = data;
            await sleep(1100);
          }
        }

        setPriceHistories(histories);

        const allDatesSet = new Set();
        Object.values(histories).forEach((history) => {
          Object.keys(history).forEach((date) => allDatesSet.add(date));
        });
        if (chartDate) {
          allDatesSet.add(chartDate);
        }
        let sortedDates = Array.from(allDatesSet).sort();
        if (sortedDates.length === 0) {
          const assetDates = assets
            .map((a) => a.date)
            .filter(Boolean)
            .sort();
          if (assetDates.length > 0) {
            const startDate = assetDates[0];
            const endDate = new Date().toISOString().split("T")[0];
            const dates = [];
            const cursor = new Date(startDate);
            const end = new Date(endDate);
            while (cursor <= end) {
              dates.push(cursor.toISOString().split("T")[0]);
              cursor.setDate(cursor.getDate() + 1);
            }
            sortedDates = dates;
          }
        }
        const earliestAssetDate = assets
          .map((a) => a.date)
          .filter(Boolean)
          .sort()[0];
        if (earliestAssetDate) {
          sortedDates = sortedDates.filter((date) => date >= earliestAssetDate);
          if (sortedDates.length === 0) {
            const endDate = new Date().toISOString().split("T")[0];
            const dates = [];
            const cursor = new Date(earliestAssetDate);
            const end = new Date(endDate);
            while (cursor <= end) {
              dates.push(cursor.toISOString().split("T")[0]);
              cursor.setDate(cursor.getDate() + 1);
            }
            sortedDates = dates;
          }
        }
        setAllDates(sortedDates);
        if (sortedDates.length > 0) {
          setTimeIndex(sortedDates.length - 1);
        }
        let ratesMap = {};
        if (needsTwFx && sortedDates.length > 0) {
          const todayStr = new Date().toISOString().split("T")[0];
          let start = sortedDates[0] > todayStr ? todayStr : sortedDates[0];
          let end =
            sortedDates[sortedDates.length - 1] > todayStr
              ? todayStr
              : sortedDates[sortedDates.length - 1];
          if (start > end) {
            start = end;
          }
          const fxResponse = await fetch(`/api/fx-rates?start=${start}&end=${end}&from=USD&to=TWD`);
          const fxData = await fxResponse.json();
          if (!fxResponse.ok) {
            throw new Error(fxData?.details || fxData?.error || "Failed to fetch FX rates.");
          }
          Object.entries(fxData?.rates || {}).forEach(([date, rateObj]) => {
            if (rateObj?.TWD != null) {
              ratesMap[date] = rateObj.TWD;
            }
          });
          setFxRates(ratesMap);
        } else {
          setFxRates({});
        }

        const cachePayload = {
          assetKey: JSON.stringify(assets),
          priceHistories: histories,
          fxRates: ratesMap,
          allDates: sortedDates,
          timeIndex: sortedDates.length > 0 ? sortedDates.length - 1 : 0,
          chartDate,
        };
        window.localStorage.setItem("portfolio_chart_cache", JSON.stringify(cachePayload));
      } catch (e) {
        console.error("Data fetching error:", e);
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllHistories();
  }, [fetchVersion]);

  useEffect(() => {
    if (assets.length > 0) {
      setNeedsRefresh(true);
    }
  }, [chartDate]);

  const getValueAtOrBefore = (history, date) => {
    if (!history) return { value: 0, usedDate: date };
    const dates = Object.keys(history).sort();
    if (dates.length === 0) return { value: 0, usedDate: date };
    let usedDate = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= date) {
        usedDate = dates[i];
        break;
      }
    }
    if (!usedDate) return { value: 0, usedDate: date };
    return { value: history[usedDate] || 0, usedDate };
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getAssetDisplayName = (asset) =>
    isCashType(asset.type) ? assetTypeLabels[asset.type] : asset.ticker;
  const formatTwd = (value) => `NT$${Math.round(value).toLocaleString()}`;
  const getCostInTwd = (asset) => {
    if (isCashType(asset.type)) {
      if (asset.type === "cash_usd") {
        const fxRate = getValueAtOrBefore(fxRates, asset.date).value;
        return fxRate ? asset.amount * fxRate : 0;
      }
      return asset.amount;
    }
    const historyForAsset = priceHistories[asset.ticker];
    const { value: priceAtEntry, usedDate: priceDate } = getValueAtOrBefore(
      historyForAsset,
      asset.date,
    );
    let val = asset.amount * priceAtEntry;
    if (isUsdType(asset.type)) {
      const fxRate = fxRates[priceDate] ?? getValueAtOrBefore(fxRates, priceDate).value;
      val = fxRate ? val * fxRate : 0;
    }
    return val;
  };

  // --- 核心運算 Logic ---
  const { processedHistory, assetShares, currentPortfolioValue } = useMemo(() => {
    if (allDates.length === 0) {
      return { processedHistory: [], assetShares: [], currentPortfolioValue: 0 };
    }

    const calculatedShares = assets.map((asset) => {
      const historyForAsset = priceHistories[asset.ticker];
      const priceAtEntry = isCashType(asset.type)
        ? 1
        : getValueAtOrBefore(historyForAsset, asset.date).value;
      return {
        ...asset,
        shares: asset.amount,
        entryPrice: priceAtEntry,
      };
    });

    const history = allDates.map((date) => {
      let totalValue = 0;
      const snapshot = { date: date };
      calculatedShares.forEach((asset) => {
        if (isCashType(asset.type)) {
          if (date < asset.date) {
            snapshot[asset.ticker] = 0;
          } else {
            let val = asset.amount;
            if (asset.type === "cash_usd") {
              const fxRate = getValueAtOrBefore(fxRates, date).value;
              val = fxRate ? val * fxRate : 0;
            }
            snapshot[asset.ticker] = (snapshot[asset.ticker] || 0) + val;
            totalValue += val;
          }
          return;
        }

        const assetHistory = priceHistories[asset.ticker];
        if (!assetHistory || date < asset.date) {
          snapshot[asset.ticker] = 0;
        } else {
          const { value: currentPrice, usedDate: priceDate } = getValueAtOrBefore(
            assetHistory,
            date,
          );
          let val = asset.shares * currentPrice;
          if (isUsdType(asset.type)) {
            const fxRate = fxRates[priceDate] ?? getValueAtOrBefore(fxRates, priceDate).value;
            val = fxRate ? val * fxRate : 0;
          }
          snapshot[asset.ticker] = (snapshot[asset.ticker] || 0) + val;
          totalValue += val;
        }
      });
      snapshot.totalValue = totalValue;
      return snapshot;
    });

    const finalHistory = history.map((day) => {
      const totalValue = day.totalValue;
      const finalDay = { ...day };
      assets.forEach((asset) => {
        const val = finalDay[asset.ticker] || 0;
        finalDay[`${asset.ticker}_pct`] = totalValue > 0 ? (val / totalValue) * 100 : 0;
      });
      return finalDay;
    });

    const currentTotalValue = finalHistory[timeIndex]?.totalValue || 0;

    return {
      processedHistory: finalHistory,
      assetShares: calculatedShares,
      currentPortfolioValue: currentTotalValue,
    };
  }, [assets, priceHistories, allDates, timeIndex, fxRates]);

  // --- Handlers ---
  const addAsset = () => {
    if (newAmount === "" || !newTicker || !newType) return;
    const amountValue = Number(newAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return;
    const resolvedTicker = isCashType(newType) ? cashTickerForType(newType) : newTicker;
    setAssets([
      ...assets,
      {
        id: Math.random().toString(36).substr(2, 9),
        ticker: resolvedTicker,
        type: newType,
        date: null,
        amount: amountValue,
      },
    ]);
    setNeedsRefresh(true);
  };

  const removeAsset = (id) => {
    setAssets(assets.filter((a) => a.id !== id));
    setNeedsRefresh(true);
  };

  const generateCharts = () => {
    if (!chartDate) return;
    setAssets((prev) => prev.map((asset) => ({ ...asset, date: chartDate })));
    setFetchVersion((v) => v + 1);
    setNeedsRefresh(false);
  };

  const importAssetsFromText = () => {
    setImportError("");
    if (!importText.trim()) {
      setImportError("請貼上要匯入的資料。");
      return;
    }
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) {
        throw new Error("資料格式錯誤，請貼上 assets 陣列。");
      }
      const normalized = parsed
        .map((item) => ({
          id: item.id || Math.random().toString(36).substr(2, 9),
          ticker: String(item.ticker || "").toUpperCase(),
          type: item.type || "us_stock",
          date: item.date || null,
          amount: Number(item.amount || 0),
        }))
        .filter((item) => item.ticker && Number.isFinite(item.amount) && item.amount > 0);
      if (normalized.length === 0) {
        throw new Error("沒有可匯入的資產資料。");
      }
      setAssets(normalized);
      setNeedsRefresh(true);
    } catch (err) {
      setImportError(err.message || "匯入失敗，請確認格式。");
    }
  };

  // --- Pie Chart Data ---
  const pieDataCost = assets.map((a, idx) => ({
    name: getAssetDisplayName(a),
    value: getCostInTwd(a),
    fill: COLORS[idx % COLORS.length],
  }));

  const pieDataMarket = useMemo(() => {
    if (!processedHistory || processedHistory.length === 0) return [];

    const currentSnapshot = processedHistory[timeIndex];
    if (!currentSnapshot) return [];

    const marketValues = new Map();
    assets.forEach((asset) => {
      const key = asset.ticker;
      const displayName = getAssetDisplayName(asset);
      const currentValue = currentSnapshot[key] || 0;
      const existingValue = marketValues.get(displayName) || 0;
      marketValues.set(displayName, existingValue + currentValue);
    });

    return Array.from(marketValues.entries())
      .map(([name, value], idx) => ({
        name,
        value,
        fill: COLORS[idx % COLORS.length],
      }))
      .filter((d) => d.value > 0);
  }, [processedHistory, timeIndex, assets]);

  const totalCost = pieDataCost.reduce((sum, a) => sum + a.value, 0);
  const totalMarket = pieDataMarket.reduce((sum, a) => sum + a.value, 0);

  const currentDate = allDates[timeIndex];

  return (
    <Root>
      <Container>
        <Header>
          <div>
            <Title>投資組合時光機</Title>
            <Subtitle>使用 Alpha Vantage、Yahoo Finance 與 CoinGecko API 的真實數據</Subtitle>
          </div>
          <HeaderRight>
            <TotalLabel>當前選定日期總資產</TotalLabel>
            <TotalValue>{formatTwd(currentPortfolioValue)}</TotalValue>
            <DateText>{currentDate}</DateText>
          </HeaderRight>
        </Header>

        {error && (
          <Card style={{ backgroundColor: "#fee2e2", color: "#b91c1c" }}>
            <FormTitle>錯誤</FormTitle>
            <p>無法載入歷史數據，請檢查您的 API 金鑰或網路連線。</p>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", marginTop: "1rem" }}>
              {error}
            </pre>
          </Card>
        )}

        {isLoading && (
          <Card>
            <p>正在載入歷史數據，請稍候...</p>
          </Card>
        )}

        {!isLoading && !error && (
          <MainGrid>
            <LeftColumn>
              {/* Add Asset Form */}
              <Card>
                <FormTitle>
                  <Plus size={18} /> 新增資產紀錄
                </FormTitle>
                <FormContent>
                  <div>
                    <Label>資產類型</Label>
                    <Select
                      value={newType}
                      onChange={(e) => {
                        setNewType(e.target.value);
                        setNewTicker(exampleTickers[e.target.value][0]);
                      }}
                    >
                      <option value="us_stock">美股 (US Stock)</option>
                      <option value="tw_stock">台股 (TW Stock)</option>
                      <option value="crypto">加密貨幣 (Crypto)</option>
                      <option value="cash_usd">現金 (USD)</option>
                      <option value="cash_twd">現金 (TWD)</option>
                    </Select>
                  </div>
                  <div>
                    <Label>{isCashType(newType) ? "幣別" : "資產代號 (Ticker)"}</Label>
                    <Select value={newTicker} onChange={(e) => setNewTicker(e.target.value)}>
                      {exampleTickers[newType].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    {!isCashType(newType) && (
                      <Input
                        type="text"
                        placeholder="Or enter custom ticker"
                        style={{ marginTop: "0.5rem" }}
                        onBlur={(e) => e.target.value && setNewTicker(e.target.value.toUpperCase())}
                      />
                    )}
                  </div>
                  <div>
                    <Label>{isCashType(newType) ? "金額" : "股數 / 單位數"}</Label>
                    <Input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <PrimaryButton onClick={addAsset}>
                    <Plus size={16} /> 加入組合
                  </PrimaryButton>
                </FormContent>
              </Card>
              {/* Asset List */}
              <AssetListCard>
                <AssetListTitle>資產列表</AssetListTitle>
                <AssetList>
                  {assets.map((asset) => (
                    <AssetItem key={asset.id}>
                      <div>
                        <AssetTicker>
                          {isCashType(asset.type)
                            ? assetTypeLabels[asset.type]
                            : `${getAssetDisplayName(asset)} (${assetTypeLabels[asset.type] || asset.type})`}
                        </AssetTicker>
                        <AssetDate>{asset.date || "尚未設定"}</AssetDate>
                      </div>
                      <AssetAmount>
                        <AssetValue>
                          {isCashType(asset.type)
                            ? formatTwd(getCostInTwd(asset))
                            : `${asset.amount.toLocaleString()} 單位`}
                        </AssetValue>
                        <RemoveButton onClick={() => removeAsset(asset.id)}>
                          <Trash2 size={12} /> 移除
                        </RemoveButton>
                      </AssetAmount>
                    </AssetItem>
                  ))}
                </AssetList>
                <div style={{ marginTop: "1rem" }}>
                  <Label>投入日期</Label>
                  <Input
                    type="date"
                    value={chartDate}
                    onChange={(e) => setChartDate(e.target.value)}
                  />
                </div>
                <PrimaryButton onClick={generateCharts} style={{ marginTop: "0.75rem" }}>
                  生成圖表
                </PrimaryButton>
                {needsRefresh && (
                  <div style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
                    資產已更新，請點「生成圖表」重新計算。
                  </div>
                )}

                <div style={{ marginTop: "1.25rem" }}>
                  <Label>匯入資產 (localStorage JSON)</Label>
                  <ImportArea
                    rows={4}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='貼上 JSON，例如: [{"id":"abc","ticker":"TSLA","type":"us_stock","date":null,"amount":1}]'
                  />
                  <PrimaryButton onClick={importAssetsFromText} style={{ marginTop: "0.75rem" }}>
                    匯入資產
                  </PrimaryButton>
                  {importError && (
                    <div style={{ marginTop: "0.5rem", color: "#b91c1c", fontSize: "0.9rem" }}>
                      {importError}
                    </div>
                  )}
                </div>
              </AssetListCard>
            </LeftColumn>
            <RightColumn>
              {/* Line Chart */}
              <Card>
                <ChartTitle>
                  <ChartIcon size={18} /> 資產比例歷史變化 (%)
                </ChartTitle>
                <ChartWrapper>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(str) => format(parseISO(str), "yy/MM")}
                        stroke="#9ca3af"
                        fontSize={12}
                      />
                      <YAxis unit="%" stroke="#9ca3af" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                        formatter={(val) => val.toFixed(1) + "%"}
                      />
                      <Legend />
                      {Array.from(
                        new Map(assets.map((a) => [a.ticker, getAssetDisplayName(a)])).entries(),
                      ).map(([ticker, name], index) => (
                        <Line
                          key={ticker}
                          type="monotone"
                          dataKey={`${ticker}_pct`}
                          name={name}
                          stroke={COLORS[index % COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartWrapper>
              </Card>
              {/* Time Machine */}
              {allDates.length > 0 && (
                <TimeMachineCard>
                  <TimeMachineHeader>
                    <TimeMachineTitle>
                      <TimeMachineIcon />
                      <span>時光機控制器</span>
                    </TimeMachineTitle>
                    <TimeMachineDate>{currentDate}</TimeMachineDate>
                  </TimeMachineHeader>
                  <Slider
                    type="range"
                    min="0"
                    max={allDates.length - 1}
                    value={timeIndex}
                    onChange={(e) => setTimeIndex(Number(e.target.value))}
                  />
                  <SliderLabels>
                    <span>{allDates[0]}</span>
                    <span>{allDates[allDates.length - 1]}</span>
                  </SliderLabels>
                </TimeMachineCard>
              )}
              {/* Pie Charts */}
              <PieChartsGrid>
                <PieChartCard>
                  <PieChartTitle>初始投入分佈 (Cost)</PieChartTitle>
                  <PieChartWrapper>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieDataCost}
                          innerRadius="70%"
                          outerRadius="90%"
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieDataCost.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => {
                            const percent = totalCost > 0 ? (val / totalCost) * 100 : 0;
                            return `${formatTwd(val)} (${percent.toFixed(1)}%)`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </PieChartWrapper>
                  <PieChartSummary>
                    <PieChartLabel>總投入成本</PieChartLabel>
                    <PieChartValue>{formatTwd(totalCost)}</PieChartValue>
                  </PieChartSummary>
                </PieChartCard>
                <PieChartCard>
                  <DateBadge>{currentDate}</DateBadge>
                  <PieChartTitle>時間點市值分佈 (Market)</PieChartTitle>
                  <PieChartWrapper>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieDataMarket}
                          innerRadius="70%"
                          outerRadius="90%"
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieDataMarket.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => {
                            const percent = totalMarket > 0 ? (val / totalMarket) * 100 : 0;
                            return `${formatTwd(val)} (${percent.toFixed(1)}%)`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </PieChartWrapper>
                  <PieChartSummary>
                    <PieChartLabel>當下總市值</PieChartLabel>
                    <PieChartValueEmerald>{formatTwd(currentPortfolioValue)}</PieChartValueEmerald>
                  </PieChartSummary>
                </PieChartCard>
              </PieChartsGrid>
            </RightColumn>
          </MainGrid>
        )}
      </Container>
    </Root>
  );
}

// JJ
const Root = styled.div`
  min-height: 100vh;
  background-color: #f9fafb;
  padding: 1.5rem;
  font-family: sans-serif;
  color: #1e293b;

  /* width: 100%; */
  /* border: 2px solid yellow; */
`;

const Container = styled.div`
  max-width: 80rem;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #ffffff;
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  border: 1px solid #f3f4f6;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 700;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  background-image: linear-gradient(to right, #2563eb, #4f46e5);
`;

const Subtitle = styled.p`
  color: #6b7281;
  font-size: 0.875rem;
  line-height: 1.25rem;
  margin-top: 0.25rem;
`;

const HeaderRight = styled.div`
  text-align: right;
`;

const TotalLabel = styled.div`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: #9ca3af;
`;

const TotalValue = styled.div`
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 700;
  color: #059669;
`;

const DateText = styled.div`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: #6b7281;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
`;

const MainGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1.5rem;

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  @media (min-width: 1024px) {
    grid-column: span 1 / span 1;
  }
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  @media (min-width: 1024px) {
    grid-column: span 2 / span 2;
  }
`;

const Card = styled.div`
  background-color: #fff;
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  border: 1px solid #f3f4f6;
`;

const FormTitle = styled.h2`
  font-weight: 600;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FormContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Label = styled.label`
  font-size: 0.75rem;
  line-height: 1rem;
  color: #6b7281;
  margin-bottom: 0.25rem;
  display: block;
`;

const inputBase = css`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background-color: #f9fafb;
  outline: none;

  &:focus {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px #dbeafe;
  }
`;

const Input = styled.input`
  ${inputBase}
`;

const Select = styled.select`
  ${inputBase}
`;

const ImportArea = styled.textarea`
  ${inputBase}
  min-height: 120px;
  resize: vertical;
`;

const PrimaryButton = styled.button`
  width: 100%;
  background-color: #2563eb;
  color: #ffffff;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover {
    background-color: #1d4ed8;
  }
`;

const AssetListCard = styled(Card)`
  max-height: 400px;
  overflow-y: auto;
`;

const AssetListTitle = styled.h2`
  font-weight: 600;
  margin-bottom: 1rem;
  color: #374151;
`;

const AssetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const AssetItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;

  &:hover button {
    opacity: 1;
  }
`;

const AssetTicker = styled.div`
  font-weight: 700;
  color: #1f2937;
`;

const AssetDate = styled.div`
  font-size: 0.75rem;
  color: #6b7281;
`;

const AssetAmount = styled.div`
  text-align: right;
`;

const AssetValue = styled.div`
  font-weight: 500;
`;

const RemoveButton = styled.button`
  color: #f87171;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  opacity: 0;
  transition: opacity 150ms;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: #dc2626;
  }
`;

const ChartTitle = styled.h3`
  font-weight: 600;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ChartIcon = styled(Clock)`
  color: #3b82f6;
`;

const ChartWrapper = styled.div`
  height: 300px;
  width: 100%;
`;

const TimeMachineCard = styled.div`
  background-color: #312e81;
  padding: 1.5rem;
  border-radius: 1rem;
  color: #ffffff;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.1),
    0 4px 6px -4px rgb(0 0 0 / 0.1);
`;

const TimeMachineHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;

const TimeMachineTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
`;

const TimeMachineIcon = styled(PlayCircle)`
  color: #a5b4fc;
`;

const TimeMachineDate = styled.span`
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  color: #c7d2fe;
`;

const Slider = styled.input`
  width: 100%;
  height: 0.5rem;
  background-color: #4338ca;
  border-radius: 0.5rem;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  accent-color: #a5b4fc;
  transition: all 150ms;

  &:hover {
    accent-color: #ffffff;
  }
`;

const SliderLabels = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #818cf8;
  margin-top: 0.5rem;
`;

const PieChartsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 1.5rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const PieChartCard = styled(Card)`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
`;

const PieChartTitle = styled.h4`
  color: #6b7281;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const PieChartWrapper = styled.div`
  height: 200px;
  width: 100%;
`;

const PieChartSummary = styled.div`
  text-align: center;
  margin-top: -10px;
`;

const PieChartLabel = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
`;

const PieChartValue = styled.div`
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 700;
  color: #374151;
`;

const PieChartValueEmerald = styled(PieChartValue)`
  color: #059669;
`;

const DateBadge = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  font-size: 0.75rem;
  background-color: #e0e7ff;
  color: #4338ca;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
`;
