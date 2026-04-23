import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useToast } from '../components/Toast';
import { exportChartAsImage, exportChartAsPdf, captureElement, triggerPrint } from '../utils/exportUtils';
import { STORAGE_KEYS, UI_CONFIG, DATA_VERSION } from '../constants/config';

const ReturnAnalyticsChart = dynamic(() => import('../components/ReturnAnalyticsChart'), {
  ssr: false,
  loading: () => <div className="analytics-loading">加载收益分析组件中...</div>
});

const normalizeFund = (fund) => ({
  code: String(fund?.code || '').trim(),
  name: fund?.name || `基金(${fund?.code || ''})`,
  isFavorite: Boolean(fund?.isFavorite),
  amount: fund?.amount === '' || fund?.amount === undefined ? null : fund.amount,
  existingProfit:
    fund?.existingProfit === '' || fund?.existingProfit === undefined ? null : fund.existingProfit,
  costPrice: fund?.costPrice === '' || fund?.costPrice === undefined ? null : fund.costPrice,
  dailyProfit: Number.parseFloat(fund?.dailyProfit) || 0,
  totalProfit: Number.parseFloat(fund?.totalProfit) || 0
});

const SunIcon = () => (
  <svg className="icon-theme" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg className="icon-theme" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const PrinterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export default function Analytics() {
  const { success, error: showError } = useToast();
  
  const [funds, setFunds] = useState([]);
  const [theme, setTheme] = useState('light');
  const [exporting, setExporting] = useState(false);
  
  const exportRef = useRef(null);
  const pageRef = useRef(null);

  const applyTheme = useCallback((nextTheme, persist = true) => {
    const resolved = nextTheme === 'dark' ? 'dark' : 'light';
    setTheme(resolved);

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolved);
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEYS.THEME, resolved);
      } catch (err) {
        console.error('保存主题设置失败:', err);
      }
    }
  }, []);

  const loadUserData = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_DATA);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      const savedVersion = parsed?.version || '1.0.0';
      if (savedVersion !== DATA_VERSION) {
        console.log(`检测到数据版本变更: ${savedVersion} -> ${DATA_VERSION}`);
      }

      const watchList = Array.isArray(parsed?.watchList) ? parsed.watchList.map((fund) => {
        const normalized = { ...fund };
        if (normalized.dwjz === undefined && normalized.netValue !== undefined) {
          normalized.dwjz = normalized.netValue || null;
        }
        return normalizeFund(normalized);
      }) : [];

      setFunds(watchList);
    } catch (err) {
      console.error('加载用户数据失败:', err);
      showError('加载本地数据失败');
    }
  }, [showError]);

  useEffect(() => {
    let resolvedTheme = 'light';

    try {
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        resolvedTheme = savedTheme;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        resolvedTheme = 'dark';
      }
    } catch (err) {
      console.error('读取主题设置失败:', err);
    }

    applyTheme(resolvedTheme, false);
  }, [applyTheme]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleToggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }, [applyTheme, theme]);

  const handleExportImage = async (format = 'png') => {
    if (!exportRef.current?.chartContainer) {
      showError('图表尚未加载完成');
      return;
    }

    setExporting(true);
    try {
      const chartData = exportRef.current.chartData || {};
      const filename = `收益分析_${new Date().toISOString().slice(0, 10)}`;
      
      await exportChartAsImage(exportRef.current.chartContainer, {
        filename,
        format,
        quality: 0.95
      });
      
      success(`已导出为 ${format.toUpperCase()} 图片`);
    } catch (err) {
      console.error('导出图片失败:', err);
      showError('导出图片失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!exportRef.current?.chartContainer) {
      showError('图表尚未加载完成');
      return;
    }

    setExporting(true);
    try {
      const chartData = exportRef.current.chartData || {};
      const filename = `收益分析报告_${new Date().toISOString().slice(0, 10)}`;
      const subtitle = `${chartData.period || ''} ${chartData.aggregation || ''} 与${chartData.benchmark || '基准'}对比`;
      
      await exportChartAsPdf(exportRef.current.chartContainer, {
        filename,
        title: '历史收益统计分析报告',
        subtitle
      });
      
      success('已导出为报告图片（可直接打印）');
    } catch (err) {
      console.error('导出报告失败:', err);
      showError('导出报告失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    triggerPrint('历史收益统计分析报告');
  };

  const summary = useMemo(() => {
    const favorites = funds.filter((fund) => fund.isFavorite);
    const tracked = favorites.filter((fund) => {
      const amount = Number.parseFloat(fund.amount);
      const costPrice = Number.parseFloat(fund.costPrice);
      return Number.isFinite(amount) && amount > 0 && Number.isFinite(costPrice) && costPrice > 0;
    });

    return {
      totalFunds: funds.length,
      favoriteFunds: favorites.length,
      trackedFunds: tracked.length
    };
  }, [funds]);

  return (
    <>
      <Head>
        <title>收益统计分析 - 基金实时估值工作台</title>
        <meta name="description" content="历史收益统计与分析报表，支持按周/月/年维度查看收益曲线，与沪深300等基准指数对比" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <main className="page-shell analytics-page" ref={pageRef}>
        <section className="analytics-hero-panel">
          <button
            type="button"
            onClick={handleToggleTheme}
            className="theme-toggle-btn"
            title={theme === 'dark' ? '切换亮色' : '切换暗色'}
            aria-label="切换主题"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <div className="analytics-header-row">
            <Link href="/" className="back-link">
              <ArrowLeftIcon />
              <span>返回首页</span>
            </Link>

            <div className="analytics-export-controls">
              <button
                type="button"
                className="button button-secondary export-button"
                onClick={() => handleExportImage('png')}
                disabled={exporting}
              >
                <DownloadIcon />
                <span>导出PNG</span>
              </button>
              <button
                type="button"
                className="button button-secondary export-button"
                onClick={() => handleExportImage('jpeg')}
                disabled={exporting}
              >
                <DownloadIcon />
                <span>导出JPG</span>
              </button>
              <button
                type="button"
                className="button button-secondary export-button"
                onClick={handleExportPdf}
                disabled={exporting}
              >
                <DownloadIcon />
                <span>导出报告</span>
              </button>
              <button
                type="button"
                className="button export-button"
                onClick={handlePrint}
              >
                <PrinterIcon />
                <span>打印</span>
              </button>
            </div>
          </div>

          <div className="analytics-title-section">
            <div>
              <p className="analytics-kicker">Analytics Dashboard</p>
              <h1 className="page-title">收益统计分析</h1>
              <p className="analytics-subtitle">
                按周/月/年维度查看收益曲线汇总，与沪深300等基准指数进行对比分析。
              </p>
            </div>
            <div className="analytics-metrics">
              <div className="metric-chip">
                <span className="metric-label">基金总数</span>
                <span className="metric-value">{summary.totalFunds}</span>
              </div>
              <div className="metric-chip">
                <span className="metric-label">自选数量</span>
                <span className="metric-value">{summary.favoriteFunds}</span>
              </div>
              <div className="metric-chip">
                <span className="metric-label">可分析</span>
                <span className="metric-value">{summary.trackedFunds}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-content">
          <ReturnAnalyticsChart funds={funds} onExportRef={exportRef} />
        </section>

        <section className="analytics-help-section">
          <div className="analytics-help-card">
            <h3 className="analytics-help-title">使用说明</h3>
            <ul className="analytics-help-list">
              <li>
                <strong>时间范围：</strong>选择不同的时间范围查看历史收益表现
              </li>
              <li>
                <strong>聚合方式：</strong>按日/周/月/季/年聚合数据，查看不同周期的收益趋势
              </li>
              <li>
                <strong>对比基准：</strong>可选择沪深300、上证50、中证500等主流指数进行对比
              </li>
              <li>
                <strong>显示选项：</strong>可切换是否显示基准指数和超额收益曲线
              </li>
              <li>
                <strong>导出功能：</strong>支持导出为PNG/JPG图片，或使用打印功能生成PDF报告
              </li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
