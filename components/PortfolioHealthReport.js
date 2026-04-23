import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { SEVERITY_LEVELS, SEVERITY_COLORS, SEVERITY_LABELS } from '../utils/portfolioDiagnostics';
import { resolveFundSectorTag } from '../utils/fundLabels';

const CHART_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const HealthScoreGauge = ({ score, label, color }) => {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const angle = (normalizedScore / 100) * 180;
  
  const getScoreColor = () => {
    if (normalizedScore >= 80) return '#12B76A';
    if (normalizedScore >= 60) return '#F59E0B';
    if (normalizedScore >= 40) return '#F97066';
    return '#DC2626';
  };

  const gaugeColor = color || getScoreColor();

  return (
    <div className="health-score-container">
      <div className="health-score-gauge">
        <svg viewBox="0 0 200 120" className="gauge-svg">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#DC2626" />
              <stop offset="30%" stopColor="#F97066" />
              <stop offset="60%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#12B76A" />
            </linearGradient>
          </defs>
          
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(0,0,0,0.1)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 251.2} 251.2`}
          />
          
          <circle
            cx={100 + 80 * Math.cos((Math.PI * (180 - angle)) / 180)}
            cy={100 - 80 * Math.sin((Math.PI * (180 - angle)) / 180)}
            r="8"
            fill={gaugeColor}
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
          />
        </svg>
        
        <div className="health-score-value" style={{ color: gaugeColor }}>
          {normalizedScore.toFixed(0)}
          <span className="health-score-unit">分</span>
        </div>
        
        <div className="health-score-label">{label}</div>
      </div>
    </div>
  );
};

const WarningItem = ({ warning, index }) => {
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case SEVERITY_LEVELS.CRITICAL:
        return '🚨';
      case SEVERITY_LEVELS.HIGH:
        return '⚠️';
      case SEVERITY_LEVELS.MEDIUM:
        return '⚡';
      default:
        return 'ℹ️';
    }
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case SEVERITY_LEVELS.CRITICAL:
        return 'warning-critical';
      case SEVERITY_LEVELS.HIGH:
        return 'warning-high';
      case SEVERITY_LEVELS.MEDIUM:
        return 'warning-medium';
      default:
        return 'warning-low';
    }
  };

  return (
    <div className={`warning-item ${getSeverityClass(warning.severity)}`}>
      <span className="warning-icon">{getSeverityIcon(warning.severity)}</span>
      <div className="warning-content">
        <p className="warning-message">{warning.message}</p>
        <span className="warning-severity">{SEVERITY_LABELS[warning.severity]}</span>
      </div>
    </div>
  );
};

const SuggestionItem = ({ suggestion, index }) => (
  <div className="suggestion-item">
    <span className="suggestion-bullet">💡</span>
    <p className="suggestion-text">{suggestion}</p>
  </div>
);

const DiagnosticCard = ({ diagnostic }) => {
  const getSeverityColor = (severity) => SEVERITY_COLORS[severity] || SEVERITY_COLORS[SEVERITY_LEVELS.LOW];

  const hasDistribution = diagnostic.details?.distribution && diagnostic.details.distribution.length > 0;

  return (
    <div className="diagnostic-card">
      <div className="diagnostic-header">
        <div className="diagnostic-title-row">
          <h3 className="diagnostic-title">{diagnostic.title}</h3>
          <span 
            className="diagnostic-score"
            style={{ backgroundColor: getSeverityColor(diagnostic.severity), color: '#fff' }}
          >
            {diagnostic.score > 0 ? `${diagnostic.score.toFixed(0)}分` : '正常'}
          </span>
        </div>
        <p className="diagnostic-description">{diagnostic.description}</p>
      </div>

      {diagnostic.warnings.length > 0 && (
        <div className="diagnostic-warnings">
          <h4 className="diagnostic-section-title">风险提示</h4>
          {diagnostic.warnings.map((warning, idx) => (
            <WarningItem key={idx} warning={warning} index={idx} />
          ))}
        </div>
      )}

      {hasDistribution && (
        <div className="diagnostic-chart">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={diagnostic.details.distribution.slice(0, 8)}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={2}
                dataKey="amount"
                nameKey={(entry) => entry.type || entry.sector}
              >
                {diagnostic.details.distribution.slice(0, 8).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value, name, props) => [
                  `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`,
                  props.payload.type || props.payload.sector
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="distribution-legend">
            {diagnostic.details.distribution.slice(0, 6).map((item, idx) => (
              <div key={idx} className="legend-item">
                <span 
                  className="legend-color" 
                  style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                <span className="legend-name">{item.type || item.sector}</span>
                <span className="legend-percent">{item.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnostic.suggestions.length > 0 && (
        <div className="diagnostic-suggestions">
          <h4 className="diagnostic-section-title">优化建议</h4>
          {diagnostic.suggestions.map((suggestion, idx) => (
            <SuggestionItem key={idx} suggestion={suggestion} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
};

const SummaryStats = ({ summary, overallSeverity }) => {
  const stats = [
    { label: '持仓基金', value: summary.totalTracked, unit: '只' },
    { 
      label: '总市值', 
      value: summary.totalAssets >= 10000 
        ? (summary.totalAssets / 10000).toFixed(2)
        : summary.totalAssets.toFixed(0),
      unit: summary.totalAssets >= 10000 ? '万' : '元'
    },
    { label: '极高风险', value: summary.criticalWarnings, unit: '项', type: 'critical' },
    { label: '高风险', value: summary.highWarnings, unit: '项', type: 'high' },
    { label: '中风险', value: summary.mediumWarnings, unit: '项', type: 'medium' }
  ];

  return (
    <div className="summary-stats">
      {stats.map((stat, idx) => (
        <div key={idx} className={`stat-item ${stat.type ? `stat-${stat.type}` : ''}`}>
          <span className="stat-value">
            {stat.value}
            <span className="stat-unit">{stat.unit}</span>
          </span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
};

function PortfolioHealthReport({ diagnosis, onClose }) {
  if (!diagnosis) {
    return (
      <div className="health-report-empty">
        <p>暂无诊断数据</p>
      </div>
    );
  }

  const hasWarnings = diagnosis.allWarnings && diagnosis.allWarnings.length > 0;
  const hasSuggestions = diagnosis.allSuggestions && diagnosis.allSuggestions.length > 0;

  return (
    <div className="health-report-container">
      <div className="health-report-header">
        <div className="header-left">
          <h2 className="report-title">投资组合健康度诊断报告</h2>
          <p className="report-subtitle">基于持仓数据的综合风险评估</p>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="health-overview-section">
        <HealthScoreGauge 
          score={diagnosis.overallScore} 
          label={diagnosis.overallLabel}
          color={diagnosis.overallColor}
        />
        
        {diagnosis.summary && (
          <SummaryStats 
            summary={diagnosis.summary} 
            overallSeverity={diagnosis.overallSeverity}
          />
        )}
      </div>

      {hasWarnings && (
        <div className="warnings-section">
          <h3 className="section-title">
            <span className="section-icon">⚠️</span>
            全部风险提示
          </h3>
          <div className="warnings-grid">
            {diagnosis.allWarnings.map((warning, idx) => (
              <WarningItem key={idx} warning={warning} index={idx} />
            ))}
          </div>
        </div>
      )}

      {diagnosis.diagnostics && diagnosis.diagnostics.length > 0 && (
        <div className="diagnostics-section">
          <h3 className="section-title">
            <span className="section-icon">📊</span>
            详细诊断
          </h3>
          <div className="diagnostics-grid">
            {diagnosis.diagnostics.map((diagnostic, idx) => (
              <DiagnosticCard key={idx} diagnostic={diagnostic} />
            ))}
          </div>
        </div>
      )}

      {hasSuggestions && (
        <div className="suggestions-section">
          <h3 className="section-title">
            <span className="section-icon">💡</span>
            综合优化建议
          </h3>
          <div className="suggestions-list">
            {diagnosis.allSuggestions.map((suggestion, idx) => (
              <SuggestionItem key={idx} suggestion={suggestion} index={idx} />
            ))}
          </div>
        </div>
      )}

      <div className="report-footer">
        <p className="disclaimer">
          📌 免责声明：本报告仅供参考，不构成投资建议。基金投资有风险，入市需谨慎。
        </p>
      </div>
    </div>
  );
}

export default PortfolioHealthReport;
