import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { fetchFundHistory, fetchBenchmarkHistory } from '../services/fundService';
import { STORAGE_KEYS, UI_CONFIG } from '../constants/config';

const PERIOD_OPTIONS = [
  { value: '1m', label: '近1月', days: 30 },
  { value: '3m', label: '近3月', days: 90 },
  { value: '6m', label: '近6月', days: 180 },
  { value: '1y', label: '近1年', days: 365 },
  { value: '3y', label: '近3年', days: 1095 }
];

const AGGREGATION_OPTIONS = [
  { value: 'daily', label: '按日' },
  { value: 'weekly', label: '按周' },
  { value: 'monthly', label: '按月' },
  { value: 'yearly', label: '按年' }
];

const BENCHMARK_OPTIONS = [
  { code: '000300', label: '沪深300' },
  { code: '000016', label: '上证50' },
  { code: '000905', label: '中证500' },
  { code: '000852', label: '中证1000' },
  { code: '399006', label: '创业板指' }
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const getPerformanceCache = () => {
  if (!inBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PERFORMANCE_CACHE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('读取收益缓存失败:', error);
    return null;
  }
};

const setPerformanceCache = (key, data) => {
  if (!inBrowser()) return;
  try {
    const cache = getPerformanceCache() || {};
    cache[key] = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEYS.PERFORMANCE_CACHE, JSON.stringify(cache));
  } catch (error) {
    console.error('保存收益缓存失败:', error);
  }
};

const toSafeNumber = (value) => {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
};

const formatPercent = (value) => {
  const num = toSafeNumber(value);
  if (!Number.isFinite(num)) return '--';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

const formatMoney = (value) => {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return '--';
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
};

const getWeekNumber = (dateStr) => {
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

const aggregateDataByPeriod = (data, period) => {
  if (!data || data.length === 0) return [];
  
  const grouped = {};
  
  data.forEach(item => {
    let key;
    switch (period) {
      case 'weekly':
        key = `${new Date(item.date).getFullYear()}-W${getWeekNumber(item.date)}`;
        break;
      case 'monthly':
        key = `${new Date(item.date).getFullYear()}-${String(new Date(item.date).getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'yearly':
        key = `${new Date(item.date).getFullYear()}`;
        break;
      default:
        key = item.date;
    }
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });
  
  const result = [];
  const sortedKeys = Object.keys(grouped).sort();
  
  sortedKeys.forEach(key => {
    const items = grouped[key];
    const first = items[0];
    const last = items[items.length - 1];
    
    const totalReturn = ((last.value / first.value) - 1) * 100;
    
    result.push({
      date: key,
      value: last.value,
      return: totalReturn,
      dailyGrowth: items.reduce((sum, item) => sum + (toSafeNumber(item.dailyGrowth) || 0), 0)
    });
  });
  
  return result;
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

const fetchFundHistoryWithCache = async (fundCode, period) => {
  const cacheKey = `history_${fundCode}_${period}`;
  const cache = getPerformanceCache();
  
  if (cache && cache[cacheKey]) {
    const { data, timestamp } = cache[cacheKey];
    const age = Date.now() - timestamp;
    if (age < 24 * 60 * 60 * 1000) {
      return data;
    }
  }
  
  try {
    const data = await fetchFundHistory(fundCode, period);
    setPerformanceCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`获取基金 ${fundCode} 历史数据失败:`, error);
    return [];
  }
};

const fetchBenchmarkHistoryWithCache = async (benchmarkCode, period) => {
  const cacheKey = `benchmark_${benchmarkCode}_${period}`;
  const cache = getPerformanceCache();
  
  if (cache && cache[cacheKey]) {
    const { data, timestamp } = cache[cacheKey];
    const age = Date.now() - timestamp;
    if (age < 24 * 60 * 60 * 1000) {
      return data;
    }
  }
  
  try {
    const data = await fetchBenchmarkHistory(benchmarkCode, period);
    setPerformanceCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`获取基准指数 ${benchmarkCode} 历史数据失败:`, error);
    return [];
  }
};

const buildPortfolioSeries = (funds, fundHistories) => {
  const totalInvested = funds.reduce((sum, fund) => sum + fund.amount, 0);
  if (!Number.isFinite(totalInvested) || totalInvested <= 0) return [];

  const seriesByCode = new Map();
  const allDates = new Set();

  funds.forEach((fund) => {
    const rawHistory = fundHistories.get(fund.code) || [];
    const history = rawHistory
      .map((item) => {
        const date = String(item.date || '').slice(0, 10);
        const netValue = toSafeNumber(item.netValue);
        if (!date || !Number.isFinite(netValue) || netValue <= 0) return null;
        return {
          date,
          ratio: netValue / fund.costPrice
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

  return sortedDates
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
        portfolioReturn,
        portfolioValue
      };
    })
    .filter((item) => Number.isFinite(item.portfolioReturn));
};

const buildBenchmarkSeries = (history) => {
  const points = (history || [])
    .map((item) => {
      const date = String(item.date || '').slice(0, 10);
      const close = toSafeNumber(item.close);
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      return { date, close };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) return [];
  const base = points[0].close;
  if (!Number.isFinite(base) || base <= 0) return [];

  return points.map((point) => ({
    date: point.date,
    benchmarkReturn: ((point.close / base) - 1) * 100
  }));
};

const mergeSeries = (portfolioSeries, benchmarkSeries) => {
  const portfolioMap = new Map((portfolioSeries || []).map((item) => [item.date, item.portfolioReturn]));
  const benchmarkMap = new Map((benchmarkSeries || []).map((item) => [item.date, item.benchmarkReturn]));
  const allDates = new Set([...portfolioMap.keys(), ...benchmarkMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  let lastPortfolio = null;
  let lastBenchmark = null;

  return sortedDates
    .map((date) => {
      if (portfolioMap.has(date)) {
        lastPortfolio = portfolioMap.get(date);
      }
      if (benchmarkMap.has(date)) {
        lastBenchmark = benchmarkMap.get(date);
      }

      const hasPortfolio = Number.isFinite(lastPortfolio);
      const hasBenchmark = Number.isFinite(lastBenchmark);
      if (!hasPortfolio && !hasBenchmark) return null;

      return {
        date,
        portfolioReturn: hasPortfolio ? lastPortfolio : null,
        benchmarkReturn: hasBenchmark ? lastBenchmark : null,
        excessReturn: hasPortfolio && hasBenchmark ? lastPortfolio - lastBenchmark : null
      };
    })
    .filter(Boolean);
};

function PerformanceAnalytics({ funds }) {
  const [period, setPeriod] = useState('3m');
  const [aggregation, setAggregation] = useState('daily');
  const [benchmarkCode, setBenchmarkCode] = useState('000300');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const chartRef = useRef(null);

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
    let canceled = false;

    const loadAnalytics = async () => {
      if (!trackedFunds.length) {
        setLoading(false);
        setChartData([]);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [fundResults, benchmarkResult] = await Promise.all([
          Promise.allSettled(
            trackedFunds.map(async (fund) => ({
              code: fund.code,
              history: await fetchFundHistoryWithCache(fund.code, period)
            }))
          ),
          fetchBenchmarkHistoryWithCache(benchmarkCode, period)
        ]);

        if (canceled) return;

        const fundHistories = new Map();
        fundResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            fundHistories.set(result.value.code, result.value.history);
          }
        });

        const portfolioSeries = buildPortfolioSeries(trackedFunds, fundHistories);
        const benchmarkSeries = buildBenchmarkSeries(benchmarkResult);
        const merged = mergeSeries(portfolioSeries, benchmarkSeries);

        const aggregatedData = aggregateDataByPeriod(merged, aggregation);
        setChartData(aggregatedData);

        if (!merged.length) {
          setError('暂无可用于分析的历史数据');
        }
      } catch (loadError) {
        console.error('Failed to load performance analytics:', loadError);
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

    loadAnalytics();
    return () => {
      canceled = true;
    };
  }, [benchmarkCode, period, aggregation, trackedSignature]);

  const latest = useMemo(() => {
    if (!chartData.length) return null;
    return chartData[chartData.length - 1];
  }, [chartData]);

  const excessClass = useMemo(() => {
    if (!Number.isFinite(latest?.excessReturn)) return '';
    return latest.excessReturn >= 0 ? 'positive' : 'negative';
  }, [latest]);

  const performanceSummary = useMemo(() => {
    if (!chartData.length) return null;
    
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    
    return {
      totalReturn: last.portfolioReturn || 0,
      benchmarkReturn: last.benchmarkReturn || 0,
      excessReturn: last.excessReturn || 0,
      period: PERIOD_OPTIONS.find(p => p.value === period)?.label || period
    };
  }, [chartData, period]);

  const monthlyReturns = useMemo(() => {
    if (!chartData.length) return [];
    
    const monthlyData = {};
    chartData.forEach(item => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = [];
      }
      monthlyData[monthKey].push(item);
    });
    
    const result = [];
    Object.keys(monthlyData).sort().forEach(key => {
      const items = monthlyData[key];
      const first = items[0];
      const last = items[items.length - 1];
      
      const monthReturn = last.portfolioReturn - (chartData.findIndex(i => i.date === first.date) > 0 
        ? chartData[chartData.findIndex(i => i.date === first.date) - 1]?.portfolioReturn || 0 
        : 0);
      
      result.push({
        month: key,
        portfolioReturn: last.portfolioReturn - first.portfolioReturn + (monthlyData[Object.keys(monthlyData)[0]] === items ? first.portfolioReturn : 0),
        benchmarkReturn: last.benchmarkReturn - first.benchmarkReturn + (monthlyData[Object.keys(monthlyData)[0]] === items ? first.benchmarkReturn : 0)
      });
    });
    
    return result.slice(-12);
  }, [chartData]);

  const fundContribution = useMemo(() => {
    if (!trackedFunds.length || !chartData.length) return [];
    
    const totalInvested = trackedFunds.reduce((sum, fund) => sum + fund.amount, 0);
    
    return trackedFunds.map((fund, index) => ({
      name: fund.name,
      value: (fund.amount / totalInvested) * 100,
      color: COLORS[index % COLORS.length]
    }));
  }, [trackedFunds, chartData]);

  const exportAsImage = useCallback(() => {
    if (!chartRef.current) return;
    
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;
    
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);
    svgString = svgString.replace(/&nbsp;/g, ' ');
    
    const canvas = document.createElement('canvas');
    const rect = svg.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const link = document.createElement('a');
      link.download = `收益分析_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  }, []);

  const exportAsPDF = useCallback(() => {
    alert('PDF导出功能需要额外的依赖库（如jsPDF）。当前版本仅支持图片导出。');
  }, []);

  return (
    <section className="performance-analytics" aria-label="收益分析报表">
      <div className="analytics-header">
        <div>
          <p className="analytics-kicker">Performance Analytics</p>
          <h2 className="analytics-title">收益统计与分析</h2>
          {performanceSummary && (
            <div className="analytics-summary">
              <span className="summary-item">
                <span className="summary-label">总收益</span>
                <span className={`summary-value ${performanceSummary.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(performanceSummary.totalReturn)}
                </span>
              </span>
              <span className="summary-item">
                <span className="summary-label">{selectedBenchmarkLabel}</span>
                <span className={`summary-value ${performanceSummary.benchmarkReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(performanceSummary.benchmarkReturn)}
                </span>
              </span>
              <span className="summary-item">
                <span className="summary-label">超额收益</span>
                <span className={`summary-value ${excessClass}`}>
                  {formatPercent(performanceSummary.excessReturn)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="analytics-controls">
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
            <label className="control-label">聚合维度</label>
            <select
              className="control-select"
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value)}
            >
              {AGGREGATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">对比指数</label>
            <select
              className="control-select"
              value={benchmarkCode}
              onChange={(e) => setBenchmarkCode(e.target.value)}
            >
              {BENCHMARK_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">导出</label>
            <div className="export-buttons">
              <button
                type="button"
                className="button button-secondary export-button"
                onClick={exportAsImage}
                disabled={!chartData.length}
              >
                导出图片
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-content">
        {!trackedFunds.length ? (
          <div className="analytics-empty">
            <p>请先设置基金的持仓金额和成本价，才能查看收益分析</p>
          </div>
        ) : loading ? (
          <div className="analytics-loading">加载收益分析数据中...</div>
        ) : error ? (
          <div className="analytics-error">{error}</div>
        ) : (
          <div className="charts-container">
            <div className="chart-section" ref={chartRef}>
              <h3 className="chart-section-title">收益曲线对比</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 44, 67, 0.1)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                      tickFormatter={formatDate}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(255,255,255,0.96)',
                        border: '1px solid rgba(15, 44, 67, 0.15)',
                        borderRadius: '10px',
                        boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
                      }}
                      formatter={(value, name) => {
                        if (name === 'portfolioReturn') return [formatPercent(value), '我的组合'];
                        if (name === 'benchmarkReturn') return [formatPercent(value), selectedBenchmarkLabel];
                        if (name === 'excessReturn') return [formatPercent(value), '超额收益'];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `日期 ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="portfolioReturn"
                      stroke="#c3412f"
                      strokeWidth={2}
                      dot={false}
                      name="我的组合"
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmarkReturn"
                      stroke="#0f8f9a"
                      strokeWidth={2}
                      dot={false}
                      name={selectedBenchmarkLabel}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {monthlyReturns.length > 0 && (
              <div className="chart-section">
                <h3 className="chart-section-title">月度收益对比</h3>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyReturns} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 44, 67, 0.1)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                        tickFormatter={(value) => `${value.toFixed(1)}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(255,255,255,0.96)',
                          border: '1px solid rgba(15, 44, 67, 0.15)',
                          borderRadius: '10px',
                          boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
                        }}
                        formatter={(value, name) => {
                          if (name === 'portfolioReturn') return [formatPercent(value), '我的组合'];
                          if (name === 'benchmarkReturn') return [formatPercent(value), selectedBenchmarkLabel];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar dataKey="portfolioReturn" fill="#c3412f" name="我的组合" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="benchmarkReturn" fill="#0f8f9a" name={selectedBenchmarkLabel} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {fundContribution.length > 0 && (
              <div className="chart-section">
                <h3 className="chart-section-title">持仓占比</h3>
                <div className="chart-wrapper pie-chart-wrapper">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={fundContribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {fundContribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(255,255,255,0.96)',
                          border: '1px solid rgba(15, 44, 67, 0.15)',
                          borderRadius: '10px',
                          boxShadow: '0 8px 24px rgba(15, 44, 67, 0.12)'
                        }}
                        formatter={(value, name) => [formatPercent(value), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default PerformanceAnalytics;
