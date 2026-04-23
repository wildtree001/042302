import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ComposedChart
} from 'recharts';
import { fetchBenchmarkHistory, fetchFundHistory } from '../services/fundService';

const PERIOD_OPTIONS = [
  { value: '1m', label: '近1月', days: 30 },
  { value: '3m', label: '近3月', days: 90 },
  { value: '6m', label: '近6月', days: 180 },
  { value: '1y', label: '近1年', days: 365 },
  { value: '3y', label: '近3年', days: 1095 }
];

const AGGREGATION_OPTIONS = [
  { value: 'day', label: '按日' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
  { value: 'quarter', label: '按季' },
  { value: 'year', label: '按年' }
];

const BENCHMARK_OPTIONS = [
  { code: '000300', label: '沪深300' },
  { code: '000016', label: '上证50' },
  { code: '000905', label: '中证500' },
  { code: '000852', label: '中证1000' },
  { code: '399006', label: '创业板指' }
];

const CHART_TYPE_OPTIONS = [
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'bar', label: '柱状图' }
];

const fundHistoryCache = new Map();
const benchmarkHistoryCache = new Map();

const toSafeNumber = (value) => {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
};

const formatPercent = (value) => {
  const num = toSafeNumber(value);
  if (!Number.isFinite(num)) return '--';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

const normalizeDate = (value) => String(value || '').slice(0, 10);

const parseDate = (dateStr) => {
  const parts = String(dateStr).split('-');
  if (parts.length < 3) return null;
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10) - 1;
  const day = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month, day);
};

const getWeekKey = (dateStr) => {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  const dayOfWeek = date.getDay();
  const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMonthKey = (dateStr) => {
  const parts = String(dateStr).split('-');
  if (parts.length < 2) return dateStr;
  return `${parts[0]}-${parts[1]}`;
};

const getQuarterKey = (dateStr) => {
  const parts = String(dateStr).split('-');
  if (parts.length < 2) return dateStr;
  const year = parts[0];
  const month = Number.parseInt(parts[1], 10);
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
};

const getYearKey = (dateStr) => {
  const parts = String(dateStr).split('-');
  if (parts.length < 1) return dateStr;
  return parts[0];
};

const sanitizeFunds = (funds) => {
  const normalized = (funds || [])
    .map((fund) => {
      const amount = toSafeNumber(fund.amount);
      const costPrice = toSafeNumber(fund.costPrice);
      const code = String(fund.code || '').trim();
      if (!/^\d{6}$/.test(code)) return null;
      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (!Number.isFinite(costPrice) || costPrice <= 0) return null;
      return {
        code,
        amount,
        costPrice,
        name: fund.name || `基金(${code})`
      };
    })
    .filter(Boolean);

  const deduped = new Map();
  normalized.forEach((item) => {
    deduped.set(item.code, item);
  });

  return Array.from(deduped.values()).sort((a, b) => a.code.localeCompare(b.code));
};

const getFundHistoryCached = (fundCode, period) => {
  const key = `${fundCode}_${period}`;
  if (!fundHistoryCache.has(key)) {
    const pending = fetchFundHistory(fundCode, period).catch((error) => {
      fundHistoryCache.delete(key);
      throw error;
    });
    fundHistoryCache.set(key, pending);
  }
  return fundHistoryCache.get(key);
};

const getBenchmarkHistoryCached = (benchmarkCode, period) => {
  const key = `${benchmarkCode}_${period}`;
  if (!benchmarkHistoryCache.has(key)) {
    const pending = fetchBenchmarkHistory(benchmarkCode, period).catch((error) => {
      benchmarkHistoryCache.delete(key);
      throw error;
    });
    benchmarkHistoryCache.set(key, pending);
  }
  return benchmarkHistoryCache.get(key);
};

const aggregateByPeriod = (data, aggregation, valueKey = 'value') => {
  if (!data || !data.length) return [];
  
  const grouped = new Map();
  
  data.forEach((item) => {
    let key;
    switch (aggregation) {
      case 'week':
        key = getWeekKey(item.date);
        break;
      case 'month':
        key = getMonthKey(item.date);
        break;
      case 'quarter':
        key = getQuarterKey(item.date);
        break;
      case 'year':
        key = getYearKey(item.date);
        break;
      default:
        key = item.date;
    }
    
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        firstDate: item.date,
        values: [],
        returns: []
      });
    }
    const group = grouped.get(key);
    group.values.push(item[valueKey] || 0);
    if (Number.isFinite(item.return)) {
      group.returns.push(item.return);
    }
  });
  
  const result = [];
  grouped.forEach((group) => {
    const values = group.values;
    const returns = group.returns;
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const periodReturn = values.length > 0 
      ? ((lastValue / firstValue) - 1) * 100 
      : 0;
    const avgReturn = returns.length > 0 
      ? returns.reduce((a, b) => a + b, 0) / returns.length 
      : periodReturn;
    
    result.push({
      date: group.date,
      value: lastValue,
      return: avgReturn,
      periodReturn: periodReturn,
      min: Math.min(...values),
      max: Math.max(...values)
    });
  });
  
  return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

const buildPortfolioSeries = (funds, fundHistories, aggregation) => {
  const totalInvested = funds.reduce((sum, fund) => sum + fund.amount, 0);
  if (!Number.isFinite(totalInvested) || totalInvested <= 0) return [];

  const seriesByCode = new Map();
  const allDates = new Set();

  funds.forEach((fund) => {
    const rawHistory = fundHistories.get(fund.code) || [];
    const history = rawHistory
      .map((item) => {
        const date = normalizeDate(item.date);
        const netValue = toSafeNumber(item.netValue);
        if (!date || !Number.isFinite(netValue) || netValue <= 0) return null;
        return {
          date,
          ratio: netValue / fund.costPrice,
          netValue
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!history.length) return;

    seriesByCode.set(fund.code, history);
    history.forEach((point) => allDates.add(point.date));
  });

  const sortedDates = Array.from(allDates).sort();
  if (!sortedDates.length) return [];

  const cursorByCode = new Map();
  const lastRatioByCode = new Map();
  funds.forEach((fund) => cursorByCode.set(fund.code, 0));

  const dailyData = sortedDates
    .map((date) => {
      let portfolioValue = 0;

      funds.forEach((fund) => {
        const history = seriesByCode.get(fund.code);
        if (!history || history.length === 0) {
          portfolioValue += fund.amount;
          return;
        }

        let cursor = cursorByCode.get(fund.code) || 0;
        while (cursor < history.length && history[cursor].date <= date) {
          lastRatioByCode.set(fund.code, history[cursor].ratio);
          cursor += 1;
        }
        cursorByCode.set(fund.code, cursor);

        const ratio = lastRatioByCode.get(fund.code) ?? 1;
        portfolioValue += fund.amount * ratio;
      });

      const portfolioReturn = ((portfolioValue / totalInvested) - 1) * 100;
      return {
        date,
        value: portfolioValue,
        return: portfolioReturn
      };
    })
    .filter((item) => Number.isFinite(item.value));

  if (aggregation && aggregation !== 'day') {
    return aggregateByPeriod(dailyData, aggregation, 'value');
  }

  return dailyData;
};

const buildBenchmarkSeries = (history, aggregation) => {
  const points = (history || [])
    .map((item) => {
      const date = normalizeDate(item.date);
      const close = toSafeNumber(item.close);
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return { date, close };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) return [];
  
  const base = points[0].close;
  if (!Number.isFinite(base) || base <= 0) return [];

  const dailyData = points.map((point) => ({
    date: point.date,
    value: point.close,
    return: ((point.close / base) - 1) * 100
  }));

  if (aggregation && aggregation !== 'day') {
    return aggregateByPeriod(dailyData, aggregation, 'value');
  }

  return dailyData;
};

const mergeSeries = (portfolioSeries, benchmarkSeries, showBenchmark) => {
  const portfolioMap = new Map((portfolioSeries || []).map((item) => [item.date, item]));
  const benchmarkMap = new Map((benchmarkSeries || []).map((item) => [item.date, item]));
  const allDates = new Set([...portfolioMap.keys(), ...benchmarkMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  let lastPortfolio = null;
  let lastBenchmark = null;

  return sortedDates
    .map((date) => {
      const pData = portfolioMap.get(date);
      const bData = benchmarkMap.get(date);
      
      if (pData) lastPortfolio = pData;
      if (bData) lastBenchmark = bData;

      const hasPortfolio = lastPortfolio !== null;
      const hasBenchmark = lastBenchmark !== null && showBenchmark;
      
      if (!hasPortfolio && !hasBenchmark) return null;

      return {
        date,
        portfolioReturn: hasPortfolio ? lastPortfolio.return : null,
        portfolioValue: hasPortfolio ? lastPortfolio.value : null,
        portfolioPeriodReturn: hasPortfolio ? lastPortfolio.periodReturn : null,
        benchmarkReturn: hasBenchmark ? lastBenchmark.return : null,
        benchmarkValue: hasBenchmark ? lastBenchmark.value : null,
        excessReturn: hasPortfolio && hasBenchmark ? lastPortfolio.return - lastBenchmark.return : null
      };
    })
    .filter(Boolean);
};

function ReturnAnalyticsChart({ 
  funds, 
  onExportRef,
  chartRef 
}) {
  const [period, setPeriod] = useState('1y');
  const [aggregation, setAggregation] = useState('month');
  const [benchmarkCode, setBenchmarkCode] = useState('000300');
  const [chartType, setChartType] = useState('line');
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [showExcess, setShowExcess] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const containerRef = useRef(null);

  const trackedFunds = useMemo(() => sanitizeFunds(funds), [funds]);
  const trackedSignature = useMemo(
    () => trackedFunds.map((fund) => `${fund.code}:${fund.amount}:${fund.costPrice}`).join('|'),
    [trackedFunds]
  );

  const selectedBenchmarkLabel = useMemo(
    () => BENCHMARK_OPTIONS.find((item) => item.code === benchmarkCode)?.label || benchmarkCode,
    [benchmarkCode]
  );

  useEffect(() => {
    if (onExportRef && containerRef.current) {
      onExportRef.current = {
        chartContainer: containerRef.current,
        chartData: {
          period,
          aggregation,
          benchmark: selectedBenchmarkLabel,
          chartType
        }
      };
    }
  }, [onExportRef, period, aggregation, selectedBenchmarkLabel, chartType]);

  useEffect(() => {
    let canceled = false;

    const loadData = async () => {
      if (!trackedFunds.length) {
        setLoading(false);
        setChartData([]);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const promises = [
          Promise.allSettled(
            trackedFunds.map(async (fund) => ({
              code: fund.code,
              history: await getFundHistoryCached(fund.code, period)
            }))
          )
        ];

        if (showBenchmark) {
          promises.push(getBenchmarkHistoryCached(benchmarkCode, period));
        }

        const [fundResults, benchmarkResult] = await Promise.all(promises);

        if (canceled) return;

        const fundHistories = new Map();
        fundResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            fundHistories.set(result.value.code, result.value.history);
          }
        });

        const portfolioSeries = buildPortfolioSeries(trackedFunds, fundHistories, aggregation);
        const benchmarkSeries = showBenchmark && benchmarkResult 
          ? buildBenchmarkSeries(benchmarkResult, aggregation) 
          : [];
        
        const merged = mergeSeries(portfolioSeries, benchmarkSeries, showBenchmark);

        setChartData(merged);
        if (!merged.length) {
          setError('暂无可用于分析的历史数据');
        }
      } catch (loadError) {
        console.error('Failed to load analytics data:', loadError);
        if (!canceled) {
          setChartData([]);
          setError('收益分析数据加载失败');
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      canceled = true;
    };
  }, [benchmarkCode, period, aggregation, showBenchmark, trackedSignature]);

  const latest = useMemo(() => {
    if (!chartData.length) return null;
    return chartData[chartData.length - 1];
  }, [chartData]);

  const summary = useMemo(() => {
    if (!chartData.length) return null;
    
    const returns = chartData
      .map((d) => d.portfolioReturn)
      .filter((r) => Number.isFinite(r));
    
    if (!returns.length) return null;
    
    const current = returns[returns.length - 1];
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    return { current, min, max, avg };
  }, [chartData]);

  const formatXAxisLabel = (value) => {
    if (aggregation === 'year') {
      return value;
    }
    if (aggregation === 'quarter') {
      return value;
    }
    if (aggregation === 'month') {
      const parts = String(value).split('-');
      if (parts.length >= 2) {
        return `${parts[0].slice(2)}/${parts[1]}`;
      }
      return value;
    }
    if (aggregation === 'week') {
      const parts = String(value).split('-');
      if (parts.length >= 3) {
        return `${parts[0].slice(2)}/${parts[1]}/${parts[2]}`;
      }
      return value;
    }
    const parts = String(value).split('-');
    if (parts.length >= 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return value;
  };

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c3412f" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#c3412f" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f8f9a" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#0f8f9a" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="excessGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(15, 44, 67, 0.12)" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
            tickFormatter={formatXAxisLabel}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(15, 44, 67, 0.15)',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
            }}
            formatter={(value, key) => {
              if (key === 'portfolioReturn') return [formatPercent(value), '我的组合'];
              if (key === 'benchmarkReturn') return [formatPercent(value), selectedBenchmarkLabel];
              if (key === 'excessReturn') return [formatPercent(value), '超额收益'];
              return [value, key];
            }}
            labelFormatter={(label) => `周期 ${label}`}
          />
          <Legend />
          <Bar
            dataKey="portfolioReturn"
            name="我的组合"
            fill="url(#portfolioGradient)"
            radius={[4, 4, 0, 0]}
          />
          {showBenchmark && (
            <Bar
              dataKey="benchmarkReturn"
              name={selectedBenchmarkLabel}
              fill="url(#benchmarkGradient)"
              radius={[4, 4, 0, 0]}
            />
          )}
          {showExcess && (
            <Bar
              dataKey="excessReturn"
              name="超额收益"
              fill="url(#excessGradient)"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      );
    }

    if (chartType === 'area') {
      return (
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c3412f" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#c3412f" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="benchmarkAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f8f9a" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#0f8f9a" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(15, 44, 67, 0.12)" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
            tickFormatter={formatXAxisLabel}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(15, 44, 67, 0.15)',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
            }}
            formatter={(value, key) => {
              if (key === 'portfolioReturn') return [formatPercent(value), '我的组合'];
              if (key === 'benchmarkReturn') return [formatPercent(value), selectedBenchmarkLabel];
              if (key === 'excessReturn') return [formatPercent(value), '超额收益'];
              return [value, key];
            }}
            labelFormatter={(label) => `日期 ${label}`}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="portfolioReturn"
            name="我的组合"
            stroke="#c3412f"
            strokeWidth={2}
            fill="url(#portfolioAreaGradient)"
            dot={false}
            connectNulls
            activeDot={{ r: 3 }}
          />
          {showBenchmark && (
            <Area
              type="monotone"
              dataKey="benchmarkReturn"
              name={selectedBenchmarkLabel}
              stroke="#0f8f9a"
              strokeWidth={2}
              fill="url(#benchmarkAreaGradient)"
              dot={false}
              connectNulls
              activeDot={{ r: 3 }}
            />
          )}
          {showExcess && (
            <Line
              type="monotone"
              dataKey="excessReturn"
              name="超额收益"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
              activeDot={{ r: 3 }}
            />
          )}
        </AreaChart>
      );
    }

    return (
      <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(15, 44, 67, 0.12)" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
          tickFormatter={formatXAxisLabel}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'rgba(18, 43, 63, 0.68)', fontSize: 11 }}
          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid rgba(15, 44, 67, 0.15)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
          }}
          formatter={(value, key) => {
            if (key === 'portfolioReturn') return [formatPercent(value), '我的组合'];
            if (key === 'benchmarkReturn') return [formatPercent(value), selectedBenchmarkLabel];
            if (key === 'excessReturn') return [formatPercent(value), '超额收益'];
            return [value, key];
          }}
          labelFormatter={(label) => `日期 ${label}`}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="portfolioReturn"
          name="我的组合"
          stroke="#c3412f"
          strokeWidth={2}
          dot={false}
          connectNulls
          activeDot={{ r: 3 }}
        />
        {showBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmarkReturn"
            name={selectedBenchmarkLabel}
            stroke="#0f8f9a"
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 3 }}
          />
        )}
        {showExcess && (
          <Line
            type="monotone"
            dataKey="excessReturn"
            name="超额收益"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            activeDot={{ r: 3 }}
          />
        )}
      </ComposedChart>
    );
  };

  return (
    <div className="analytics-card" ref={containerRef}>
      <div className="analytics-header">
        <div>
          <p className="analytics-kicker">收益分析</p>
          <h2 className="analytics-title">历史收益统计</h2>
          {summary && (
            <div className="analytics-summary">
              <span className="summary-item">
                <span className="summary-label">当前:</span>
                <span className={`summary-value ${summary.current >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(summary.current)}
                </span>
              </span>
              <span className="summary-item">
                <span className="summary-label">区间最高:</span>
                <span className="summary-value positive">{formatPercent(summary.max)}</span>
              </span>
              <span className="summary-item">
                <span className="summary-label">区间最低:</span>
                <span className="summary-value negative">{formatPercent(summary.min)}</span>
              </span>
              <span className="summary-item">
                <span className="summary-label">平均:</span>
                <span className={`summary-value ${summary.avg >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(summary.avg)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="analytics-controls">
          <div className="control-row">
            <div className="control-group">
              <label className="control-label">时间范围</label>
              <div className="period-selector">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`period-button ${period === option.value ? 'active' : ''}`}
                    onClick={() => setPeriod(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <label className="control-label">聚合方式</label>
              <div className="period-selector">
                {AGGREGATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`period-button ${aggregation === option.value ? 'active' : ''}`}
                    onClick={() => setAggregation(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="control-row">
            <div className="control-group">
              <label className="control-label">图表类型</label>
              <select
                className="analytics-select"
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
              >
                {CHART_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">对比基准</label>
              <select
                className="analytics-select"
                value={benchmarkCode}
                onChange={(e) => setBenchmarkCode(e.target.value)}
                disabled={!showBenchmark}
              >
                {BENCHMARK_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">显示选项</label>
              <div className="toggle-group">
                <label className="toggle-option">
                  <input
                    type="checkbox"
                    checked={showBenchmark}
                    onChange={(e) => setShowBenchmark(e.target.checked)}
                  />
                  <span>显示基准</span>
                </label>
                <label className="toggle-option">
                  <input
                    type="checkbox"
                    checked={showExcess}
                    onChange={(e) => setShowExcess(e.target.checked)}
                  />
                  <span>显示超额</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-legend">
        <span className="legend-item">
          <i className="legend-dot portfolio" />
          我的组合
        </span>
        {showBenchmark && (
          <span className="legend-item">
            <i className="legend-dot benchmark" />
            {selectedBenchmarkLabel}
          </span>
        )}
        {showExcess && (
          <span className="legend-item">
            <i className="legend-dot excess" />
            超额收益
          </span>
        )}
      </div>

      <div className="analytics-chart">
        {!trackedFunds.length ? (
          <div className="analytics-empty">先设置持有金额和成本价，再查看收益分析</div>
        ) : loading ? (
          <div className="analytics-loading">加载收益分析数据中...</div>
        ) : error ? (
          <div className="analytics-empty">{error}</div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default ReturnAnalyticsChart;
