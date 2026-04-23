import { resolveFundSectorTag } from './fundLabels';
import { safeSum, safeDivide, safeMultiply } from './decimalUtils';

const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const SEVERITY_SCORES = {
  [SEVERITY_LEVELS.LOW]: 10,
  [SEVERITY_LEVELS.MEDIUM]: 30,
  [SEVERITY_LEVELS.HIGH]: 60,
  [SEVERITY_LEVELS.CRITICAL]: 90
};

const SEVERITY_COLORS = {
  [SEVERITY_LEVELS.LOW]: '#12B76A',
  [SEVERITY_LEVELS.MEDIUM]: '#F59E0B',
  [SEVERITY_LEVELS.HIGH]: '#F97066',
  [SEVERITY_LEVELS.CRITICAL]: '#DC2626'
};

const SEVERITY_LABELS = {
  [SEVERITY_LEVELS.LOW]: '低风险',
  [SEVERITY_LEVELS.MEDIUM]: '中风险',
  [SEVERITY_LEVELS.HIGH]: '高风险',
  [SEVERITY_LEVELS.CRITICAL]: '极高风险'
};

const getTrackedFunds = (funds) => {
  return funds.filter((fund) => {
    const amount = Number.parseFloat(fund.amount);
    return fund.isFavorite && Number.isFinite(amount) && amount > 0;
  });
};

const calculateTypeConcentration = (funds) => {
  const tracked = getTrackedFunds(funds);
  if (tracked.length === 0) {
    return {
      type: 'type_concentration',
      title: '基金类型集中度',
      description: '分析持仓基金的类型分布',
      score: 0,
      severity: SEVERITY_LEVELS.LOW,
      warnings: [],
      suggestions: [],
      details: {
        totalTracked: 0,
        distribution: {}
      }
    };
  }

  const typeMap = new Map();
  const totalAssets = safeSum(tracked.map((f) => Number.parseFloat(f.amount) || 0));

  tracked.forEach((fund) => {
    const sector = resolveFundSectorTag(fund);
    const amount = Number.parseFloat(fund.amount) || 0;
    const current = typeMap.get(sector) || { count: 0, amount: 0, funds: [] };
    typeMap.set(sector, {
      count: current.count + 1,
      amount: current.amount + amount,
      funds: [...current.funds, { code: fund.code, name: fund.name, amount }]
    });
  });

  const distribution = Array.from(typeMap.entries())
    .map(([type, data]) => ({
      type,
      count: data.count,
      amount: data.amount,
      percentage: totalAssets > 0 ? (data.amount / totalAssets) * 100 : 0,
      funds: data.funds
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const warnings = [];
  const suggestions = [];
  let score = 0;
  let severity = SEVERITY_LEVELS.LOW;

  if (distribution.length === 0) {
    return {
      type: 'type_concentration',
      title: '基金类型集中度',
      description: '分析持仓基金的类型分布',
      score: 0,
      severity: SEVERITY_LEVELS.LOW,
      warnings: [],
      suggestions: ['请添加至少一只自选基金并设置持仓金额'],
      details: {
        totalTracked: tracked.length,
        distribution: {}
      }
    };
  }

  const topType = distribution[0];

  if (tracked.length === 1) {
    warnings.push({
      severity: SEVERITY_LEVELS.HIGH,
      message: `仅持有一只基金(${topType.funds[0].name})，缺乏分散化投资`,
      details: {
        fund: topType.funds[0]
      }
    });
    score = SEVERITY_SCORES[SEVERITY_LEVELS.HIGH];
    severity = SEVERITY_LEVELS.HIGH;
    suggestions.push('建议增加不同类型的基金，降低单一标的风险');
  } else if (topType.percentage >= 70) {
    warnings.push({
      severity: SEVERITY_LEVELS.CRITICAL,
      message: `组合过于集中于"${topType.type}"类型，占比 ${topType.percentage.toFixed(1)}%`,
      details: {
        type: topType.type,
        percentage: topType.percentage,
        funds: topType.funds
      }
    });
    score = SEVERITY_SCORES[SEVERITY_LEVELS.CRITICAL];
    severity = SEVERITY_LEVELS.CRITICAL;
    suggestions.push(`强烈建议降低"${topType.type}"类型的持仓比例，增加其他类型基金配置`);
  } else if (topType.percentage >= 50) {
    warnings.push({
      severity: SEVERITY_LEVELS.MEDIUM,
      message: `组合中度集中于"${topType.type}"类型，占比 ${topType.percentage.toFixed(1)}%`,
      details: {
        type: topType.type,
        percentage: topType.percentage
      }
    });
    score = SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM];
    severity = SEVERITY_LEVELS.MEDIUM;
    suggestions.push(`建议适当分散"${topType.type}"类型的持仓，增加其他类型基金配置`);
  } else if (topType.percentage >= 30) {
    score = SEVERITY_SCORES[SEVERITY_LEVELS.LOW];
    severity = SEVERITY_LEVELS.LOW;
    suggestions.push('当前类型分布相对均衡，继续保持适度分散');
  }

  const hasBondType = distribution.some((d) => 
    d.type.includes('债券') || d.type.includes('固收') || d.type.includes('货币')
  );

  if (!hasBondType && tracked.length > 0 && totalAssets > 100000) {
    suggestions.push('建议配置债券基金或货币基金以分散风险，增强组合稳定性');
  }

  return {
    type: 'type_concentration',
    title: '基金类型集中度',
    description: '分析持仓基金的类型分布，评估分散化程度',
    score,
    severity,
    warnings,
    suggestions,
    details: {
      totalTracked: tracked.length,
      totalAssets,
      distribution
    }
  };
};

const calculateSectorOverlap = (funds) => {
  const tracked = getTrackedFunds(funds);
  if (tracked.length === 0) {
    return {
      type: 'sector_overlap',
      title: '行业分布重叠度',
      description: '分析基金重仓股的行业分布重叠情况',
      score: 0,
      severity: SEVERITY_LEVELS.LOW,
      warnings: [],
      suggestions: [],
      details: {
        totalTracked: 0,
        distribution: {}
      }
    };
  }

  const sectorMap = new Map();
  const fundsWithHoldings = tracked.filter((f) => f.holdings && f.holdings.length > 0);
  const fundsWithoutHoldings = tracked.filter((f) => !f.holdings || f.holdings.length === 0);

  fundsWithHoldings.forEach((fund) => {
    const amount = Number.parseFloat(fund.amount) || 0;
    const sector = resolveFundSectorTag(fund);
    const current = sectorMap.get(sector) || { count: 0, amount: 0, funds: [], holdings: [] };

    fund.holdings.slice(0, 5).forEach((stock) => {
      if (stock.name) {
        const stockSector = HOLDINGS_SECTOR_MAP[stock.name] || sector;
        if (!current.holdings.find((h) => h.code === stock.code)) {
          current.holdings.push({
            code: stock.code,
            name: stock.name,
            weight: stock.weight,
            sector: stockSector
          });
        }
      }
    });

    sectorMap.set(sector, {
      count: current.count + 1,
      amount: current.amount + amount,
      funds: [...current.funds, { code: fund.code, name: fund.name, amount }],
      holdings: current.holdings
    });
  });

  const stockOverlap = analyzeStockOverlap(tracked);

  const totalAssets = safeSum(tracked.map((f) => Number.parseFloat(f.amount) || 0));
  const distribution = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      amount: data.amount,
      percentage: totalAssets > 0 ? (data.amount / totalAssets) * 100 : 0,
      funds: data.funds,
      holdings: data.holdings
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const warnings = [];
  const suggestions = [];
  let score = 0;
  let severity = SEVERITY_LEVELS.LOW;

  if (stockOverlap.overlapCount > 0) {
    const overlapRatio = (stockOverlap.overlapCount / Math.max(1, stockOverlap.totalUniqueStocks)) * 100;
    
    if (overlapRatio >= 50) {
      warnings.push({
        severity: SEVERITY_LEVELS.HIGH,
        message: `持仓股票重叠度较高，${stockOverlap.overlapCount} 只股票被多只基金共同持有`,
        details: {
          overlapCount: stockOverlap.overlapCount,
          overlappingStocks: stockOverlap.overlappingStocks
        }
      });
      score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.HIGH]);
      severity = Math.max(severity, SEVERITY_LEVELS.HIGH);
      suggestions.push('建议减少持有同类型、同行业赛道的基金，避免重复投资');
    } else if (overlapRatio >= 20) {
      warnings.push({
        severity: SEVERITY_LEVELS.MEDIUM,
        message: `持仓存在一定重叠，${stockOverlap.overlapCount} 只股票被多只基金共同持有`,
        details: {
          overlapCount: stockOverlap.overlapCount,
          overlappingStocks: stockOverlap.overlappingStocks
        }
      });
      score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM]);
      severity = Math.max(severity, SEVERITY_LEVELS.MEDIUM);
    }
  }

  if (distribution.length > 0 && distribution[0].percentage >= 60) {
    warnings.push({
      severity: SEVERITY_LEVELS.HIGH,
      message: `行业高度集中于"${distribution[0].sector}"，占比 ${distribution[0].percentage.toFixed(1)}%`,
      details: {
        sector: distribution[0].sector,
        percentage: distribution[0].percentage
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.HIGH]);
    severity = Math.max(severity, SEVERITY_LEVELS.HIGH);
  } else if (distribution.length > 0 && distribution[0].percentage >= 40) {
    warnings.push({
      severity: SEVERITY_LEVELS.MEDIUM,
      message: `行业中度集中于"${distribution[0].sector}"，占比 ${distribution[0].percentage.toFixed(1)}%`,
      details: {
        sector: distribution[0].sector,
        percentage: distribution[0].percentage
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM]);
    severity = Math.max(severity, SEVERITY_LEVELS.MEDIUM);
  }

  if (fundsWithoutHoldings.length > 0 && tracked.length > 0) {
    suggestions.push(`建议展开 ${fundsWithoutHoldings.length} 只基金的详情以加载重仓股数据，获取更准确的行业分析`);
  }

  return {
    type: 'sector_overlap',
    title: '行业分布重叠度',
    description: '分析基金重仓股的行业分布和股票重叠情况',
    score,
    severity,
    warnings,
    suggestions,
    details: {
      totalTracked: tracked.length,
      totalAssets,
      distribution,
      stockOverlap,
      fundsWithHoldings: fundsWithHoldings.length,
      fundsWithoutHoldings: fundsWithoutHoldings.length
    }
  };
};

const analyzeStockOverlap = (funds) => {
  const stockFundMap = new Map();
  const fundsWithHoldings = funds.filter((f) => f.holdings && f.holdings.length > 0);

  fundsWithHoldings.forEach((fund) => {
    fund.holdings.slice(0, 10).forEach((stock) => {
      if (stock.code) {
        const current = stockFundMap.get(stock.code) || {
          code: stock.code,
          name: stock.name,
          funds: []
        };
        stockFundMap.set(stock.code, {
          ...current,
          funds: [...current.funds, { code: fund.code, name: fund.name }]
        });
      }
    });
  });

  const overlappingStocks = Array.from(stockFundMap.values())
    .filter((s) => s.funds.length > 1)
    .sort((a, b) => b.funds.length - a.funds.length);

  return {
    totalUniqueStocks: stockFundMap.size,
    overlapCount: overlappingStocks.length,
    overlappingStocks
  };
};

const calculateHoldingsCorrelation = (funds) => {
  const tracked = getTrackedFunds(funds);
  if (tracked.length === 0) {
    return {
      type: 'holdings_correlation',
      title: '持仓相关性分析',
      description: '基于基金类型和重仓股分析持仓相关性',
      score: 0,
      severity: SEVERITY_LEVELS.LOW,
      warnings: [],
      suggestions: [],
      details: {}
    };
  }

  const sectorMap = new Map();
  const typeMap = new Map();

  tracked.forEach((fund) => {
    const sector = resolveFundSectorTag(fund);
    const amount = Number.parseFloat(fund.amount) || 0;

    const sectorCurrent = sectorMap.get(sector) || { count: 0, amount: 0 };
    sectorMap.set(sector, {
      count: sectorCurrent.count + 1,
      amount: sectorCurrent.amount + amount
    });

    const fundType = fund.fundType || '其他';
    const typeCurrent = typeMap.get(fundType) || { count: 0, amount: 0 };
    typeMap.set(fundType, {
      count: typeCurrent.count + 1,
      amount: typeCurrent.amount + amount
    });
  });

  const totalAssets = safeSum(tracked.map((f) => Number.parseFloat(f.amount) || 0));
  const sectorDistribution = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      amount: data.amount,
      percentage: totalAssets > 0 ? (data.amount / totalAssets) * 100 : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const warnings = [];
  const suggestions = [];
  let score = 0;
  let severity = SEVERITY_LEVELS.LOW;

  if (tracked.length >= 3) {
    const topSectorPercentage = sectorDistribution[0]?.percentage || 0;
    const secondSectorPercentage = sectorDistribution[1]?.percentage || 0;

    if (topSectorPercentage >= 70) {
      warnings.push({
        severity: SEVERITY_LEVELS.HIGH,
        message: `持仓高度相关：${sectorDistribution[0].sector} 类型占比超过 70%，系统性风险较高`,
        details: {
          sector: sectorDistribution[0].sector,
          percentage: topSectorPercentage
        }
      });
      score = SEVERITY_SCORES[SEVERITY_LEVELS.HIGH];
      severity = SEVERITY_LEVELS.HIGH;
    } else if (topSectorPercentage >= 50 && secondSectorPercentage < 30) {
      warnings.push({
        severity: SEVERITY_LEVELS.MEDIUM,
        message: `持仓较为集中：${sectorDistribution[0].sector} 类型占比 ${topSectorPercentage.toFixed(1)}%`,
        details: {
          sector: sectorDistribution[0].sector,
          percentage: topSectorPercentage
        }
      });
      score = SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM];
      severity = SEVERITY_LEVELS.MEDIUM;
    }
  }

  if (sectorDistribution.length === 1 && tracked.length > 1) {
    warnings.push({
      severity: SEVERITY_LEVELS.HIGH,
      message: `所有基金均属于"${sectorDistribution[0].sector}"类型，相关性极高`,
      details: {
        sector: sectorDistribution[0].sector
      }
    });
    score = SEVERITY_SCORES[SEVERITY_LEVELS.HIGH];
    severity = SEVERITY_LEVELS.HIGH;
    suggestions.push(`建议添加其他类型的基金，如债券基金、QDII基金等，降低组合相关性`);
  }

  const hasStableType = sectorDistribution.some((s) => 
    s.sector.includes('债券') || s.sector.includes('固收') || s.sector.includes('货币')
  );

  if (!hasStableType && tracked.length >= 2) {
    suggestions.push('建议配置债券或固收类基金，降低整体组合波动');
  }

  const hasQDII = sectorDistribution.some((s) => 
    s.sector.includes('海外') || s.sector.includes('QDII') || s.sector.includes('美股') || s.sector.includes('港股')
  );

  if (!hasQDII && tracked.length >= 3) {
    suggestions.push('可考虑配置海外市场基金，通过地域分散进一步降低相关性');
  }

  return {
    type: 'holdings_correlation',
    title: '持仓相关性分析',
    description: '基于基金类型和行业分布分析持仓相关性',
    score,
    severity,
    warnings,
    suggestions,
    details: {
      totalTracked: tracked.length,
      totalAssets,
      sectorDistribution,
      typeDistribution: Array.from(typeMap.entries()).map(([type, data]) => ({
        type,
        count: data.count,
        amount: data.amount
      }))
    }
  };
};

const analyzeRiskExposure = (funds) => {
  const tracked = getTrackedFunds(funds);
  if (tracked.length === 0) {
    return {
      type: 'risk_exposure',
      title: '风险敞口评估',
      description: '评估组合面临的各类风险敞口',
      score: 0,
      severity: SEVERITY_LEVELS.LOW,
      warnings: [],
      suggestions: [],
      details: {}
    };
  }

  const warnings = [];
  const suggestions = [];
  let score = 0;
  let severity = SEVERITY_LEVELS.LOW;

  const sectorTags = tracked.map((f) => resolveFundSectorTag(f));
  
  const highVolatilitySectors = [
    '新能源', '半导体', '创业板', '科创', '军工高端制造', '互联网/AI'
  ];
  
  const lowVolatilitySectors = [
    '债券/固收', '红利', '货币', '金融地产'
  ];

  const highVolCount = sectorTags.filter((s) => 
    highVolatilitySectors.some((vs) => s.includes(vs))
  ).length;
  
  const lowVolCount = sectorTags.filter((s) => 
    lowVolatilitySectors.some((vs) => s.includes(vs))
  ).length;

  const totalTracked = tracked.length;
  const highVolRatio = totalTracked > 0 ? highVolCount / totalTracked : 0;

  if (highVolRatio >= 0.8 && totalTracked >= 2) {
    warnings.push({
      severity: SEVERITY_LEVELS.HIGH,
      message: '组合主要由高波动行业组成，风险敞口较大',
      details: {
        highVolCount,
        lowVolCount,
        highVolRatio
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.HIGH]);
    severity = Math.max(severity, SEVERITY_LEVELS.HIGH);
    suggestions.push('强烈建议增加债券、红利等低波动资产配置，降低整体组合风险');
  } else if (highVolRatio >= 0.6 && totalTracked >= 3) {
    warnings.push({
      severity: SEVERITY_LEVELS.MEDIUM,
      message: '组合偏向高波动行业，建议关注风险控制',
      details: {
        highVolCount,
        lowVolCount,
        highVolRatio
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM]);
    severity = Math.max(severity, SEVERITY_LEVELS.MEDIUM);
    suggestions.push('可适当配置债券基金或红利基金，平衡组合风险');
  }

  if (lowVolCount === 0 && totalTracked >= 2) {
    warnings.push({
      severity: SEVERITY_LEVELS.MEDIUM,
      message: '组合缺乏低波动资产，市场下跌时可能缺乏保护',
      details: {
        hasLowVol: false
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM]);
    severity = Math.max(severity, SEVERITY_LEVELS.MEDIUM);
  }

  const totalAssets = safeSum(tracked.map((f) => Number.parseFloat(f.amount) || 0));
  if (totalTracked === 1 && totalAssets > 50000) {
    warnings.push({
      severity: SEVERITY_LEVELS.HIGH,
      message: '仅持有单只基金，非系统性风险敞口极大',
      details: {
        fund: tracked[0]
      }
    });
    score = Math.max(score, SEVERITY_SCORES[SEVERITY_LEVELS.HIGH]);
    severity = Math.max(severity, SEVERITY_LEVELS.HIGH);
    suggestions.push('建议分散投资到至少3-5只不同类型的基金');
  }

  return {
    type: 'risk_exposure',
    title: '风险敞口评估',
    description: '评估组合面临的各类风险敞口',
    score,
    severity,
    warnings,
    suggestions,
    details: {
      totalTracked,
      totalAssets,
      highVolatilityCount: highVolCount,
      lowVolatilityCount: lowVolCount,
      highVolatilityRatio
    }
  };
};

const diagnosePortfolio = (funds) => {
  const tracked = getTrackedFunds(funds);
  
  if (tracked.length === 0) {
    return {
      overallScore: 0,
      overallSeverity: SEVERITY_LEVELS.LOW,
      overallLabel: '无持仓数据',
      hasData: false,
      diagnostics: [],
      allWarnings: [],
      allSuggestions: ['请添加至少一只自选基金并设置持仓金额后进行健康度诊断']
    };
  }

  const diagnostics = [
    calculateTypeConcentration(funds),
    calculateSectorOverlap(funds),
    calculateHoldingsCorrelation(funds),
    analyzeRiskExposure(funds)
  ];

  const allWarnings = diagnostics.flatMap((d) => d.warnings);
  const allSuggestions = diagnostics.flatMap((d) => d.suggestions);

  const validDiagnostics = diagnostics.filter((d) => d.score > 0 || d.warnings.length > 0);
  const maxScore = validDiagnostics.length > 0 
    ? Math.max(...validDiagnostics.map((d) => d.score))
    : 0;

  let overallSeverity = SEVERITY_LEVELS.LOW;
  if (maxScore >= SEVERITY_SCORES[SEVERITY_LEVELS.CRITICAL]) {
    overallSeverity = SEVERITY_LEVELS.CRITICAL;
  } else if (maxScore >= SEVERITY_SCORES[SEVERITY_LEVELS.HIGH]) {
    overallSeverity = SEVERITY_LEVELS.HIGH;
  } else if (maxScore >= SEVERITY_SCORES[SEVERITY_LEVELS.MEDIUM]) {
    overallSeverity = SEVERITY_LEVELS.MEDIUM;
  }

  const healthScore = Math.max(0, 100 - maxScore);

  let overallLabel = '健康';
  if (overallSeverity === SEVERITY_LEVELS.CRITICAL) {
    overallLabel = '需紧急调整';
  } else if (overallSeverity === SEVERITY_LEVELS.HIGH) {
    overallLabel = '需关注';
  } else if (overallSeverity === SEVERITY_LEVELS.MEDIUM) {
    overallLabel = '基本健康';
  }

  const uniqueSuggestions = [];
  const seenSuggestions = new Set();
  allSuggestions.forEach((s) => {
    if (!seenSuggestions.has(s)) {
      seenSuggestions.add(s);
      uniqueSuggestions.push(s);
    }
  });

  return {
    overallScore: healthScore,
    overallSeverity,
    overallLabel,
    overallColor: SEVERITY_COLORS[overallSeverity],
    hasData: true,
    diagnostics,
    allWarnings,
    allSuggestions: uniqueSuggestions,
    summary: {
      totalTracked: tracked.length,
      totalAssets: safeSum(tracked.map((f) => Number.parseFloat(f.amount) || 0)),
      criticalWarnings: allWarnings.filter((w) => w.severity === SEVERITY_LEVELS.CRITICAL).length,
      highWarnings: allWarnings.filter((w) => w.severity === SEVERITY_LEVELS.HIGH).length,
      mediumWarnings: allWarnings.filter((w) => w.severity === SEVERITY_LEVELS.MEDIUM).length
    }
  };
};

export {
  SEVERITY_LEVELS,
  SEVERITY_SCORES,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  getTrackedFunds,
  calculateTypeConcentration,
  calculateSectorOverlap,
  calculateHoldingsCorrelation,
  analyzeRiskExposure,
  diagnosePortfolio
};
