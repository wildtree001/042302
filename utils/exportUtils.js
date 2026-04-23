/**
 * 导出工具 - 支持导出PNG图片和打印功能
 */

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const getBackgroundColor = () => {
  if (!inBrowser()) return '#ffffff';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#1E293B' : '#FAFBFC';
};

const getTextColor = () => {
  if (!inBrowser()) return '#1A202C';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#F1F5F9' : '#1A202C';
};

const getSecondaryTextColor = () => {
  if (!inBrowser()) return '#64748B';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#94A3B8' : '#64748B';
};

const getPositiveColor = () => '#c3412f';
const getNegativeColor = () => '#0f8f9a';
const getAccentColor = () => '#0f8f9a';

const svgToDataUrl = (svgElement) => {
  if (!svgElement) return null;
  
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const encodedData = encodeURIComponent(svgData)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  
  return `data:image/svg+xml;charset=utf-8,${encodedData}`;
};

const drawSvgOnCanvas = async (svgDataUrl, width, height, backgroundColor = '#ffffff') => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2;
    
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    
    img.onerror = (err) => {
      reject(err);
    };
    
    img.src = svgDataUrl;
  });
};

const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
  const words = text.split('');
  let line = '';
  const lines = [];
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n];
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  
  lines.forEach((lineText, index) => {
    ctx.fillText(lineText, x, y + index * lineHeight);
  });
};

export const exportAnalyticsReport = async (element, options = {}) => {
  if (!inBrowser()) {
    throw new Error('导出功能仅在浏览器环境可用');
  }
  
  const {
    filename = '收益分析报告',
    title = '历史收益统计分析',
    subtitle = '',
    summary = null,
    chartData = null
  } = options;
  
  if (!element) {
    throw new Error('未找到要导出的元素');
  }

  const bgColor = getBackgroundColor();
  const textColor = getTextColor();
  const secondaryTextColor = getSecondaryTextColor();
  const positiveColor = getPositiveColor();
  const negativeColor = getNegativeColor();
  const accentColor = getAccentColor();
  
  const canvasWidth = 1200;
  const canvasHeight = 900;
  const scale = 2;
  const margin = 60;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;
  ctx.scale(scale, scale);
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  ctx.fillStyle = '#0f8f9a';
  ctx.font = 'bold 14px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('FUND ANALYTICS REPORT', margin, 50);
  
  ctx.fillStyle = textColor;
  ctx.font = 'bold 32px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, margin, 100);
  
  if (subtitle) {
    ctx.fillStyle = secondaryTextColor;
    ctx.font = '14px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(subtitle, margin, 128);
  }
  
  ctx.strokeStyle = 'rgba(15, 143, 154, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, 150);
  ctx.lineTo(canvasWidth - margin, 150);
  ctx.stroke();
  
  if (summary) {
    const summaryTop = 180;
    const summaryHeight = 100;
    
    ctx.fillStyle = 'rgba(15, 143, 154, 0.05)';
    ctx.fillRect(margin - 10, summaryTop - 15, canvasWidth - margin * 2 + 20, summaryHeight + 30);
    
    ctx.strokeStyle = 'rgba(15, 143, 154, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin - 10, summaryTop - 15, canvasWidth - margin * 2 + 20, summaryHeight + 30);
    
    const summaryItems = [
      { label: '当前收益', value: summary.current },
      { label: '区间最高', value: summary.max },
      { label: '区间最低', value: summary.min },
      { label: '平均收益', value: summary.avg }
    ];
    
    const itemWidth = (canvasWidth - margin * 2) / 4;
    
    summaryItems.forEach((item, index) => {
      const itemX = margin + index * itemWidth + itemWidth / 2;
      
      ctx.fillStyle = secondaryTextColor;
      ctx.font = '12px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, itemX, summaryTop + 25);
      
      const valueStr = Number.isFinite(item.value) 
        ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%` 
        : '--';
      
      const isPositive = Number.isFinite(item.value) && item.value >= 0;
      ctx.fillStyle = item.label === '区间最低' ? negativeColor : 
                       item.label === '区间最高' ? positiveColor :
                       isPositive ? positiveColor : negativeColor;
      ctx.font = 'bold 24px "JetBrains Mono", "SF Mono", Consolas, monospace';
      ctx.fillText(valueStr, itemX, summaryTop + 65);
    });
    
    ctx.textAlign = 'left';
  }
  
  const chartTop = summary ? 320 : 180;
  const availableWidth = canvasWidth - margin * 2;
  const availableHeight = canvasHeight - chartTop - 100;
  
  const svgElement = element.querySelector('svg');
  if (svgElement) {
    try {
      const svgRect = svgElement.getBoundingClientRect();
      const chartRatio = svgRect.width / svgRect.height || 2;
      
      let drawWidth = availableWidth;
      let drawHeight = drawWidth / chartRatio;
      
      if (drawHeight > availableHeight) {
        drawHeight = availableHeight;
        drawWidth = drawHeight * chartRatio;
      }
      
      const drawX = margin + (availableWidth - drawWidth) / 2;
      const drawY = chartTop + (availableHeight - drawHeight) / 2;
      
      const svgDataUrl = svgToDataUrl(svgElement);
      const chartCanvas = await drawSvgOnCanvas(svgDataUrl, drawWidth, drawHeight, 'transparent');
      
      ctx.drawImage(chartCanvas, drawX, drawY, drawWidth, drawHeight);
      
      if (chartData) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(drawX + 15, drawY + 15, 320, 28);
        
        ctx.fillStyle = secondaryTextColor;
        ctx.font = '11px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
        const chartInfo = `时间范围: ${chartData.period || '--'} | 聚合方式: ${chartData.aggregation || '--'} | 基准: ${chartData.benchmark || '--'}`;
        ctx.fillText(chartInfo, drawX + 25, drawY + 33);
      }
      
    } catch (err) {
      console.warn('图表渲染失败:', err);
      ctx.fillStyle = secondaryTextColor;
      ctx.font = '14px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('图表渲染失败，请重试', margin, chartTop + availableHeight / 2);
    }
  } else {
    ctx.fillStyle = secondaryTextColor;
    ctx.font = '14px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('未找到图表数据', margin, chartTop + availableHeight / 2);
  }
  
  ctx.strokeStyle = 'rgba(15, 143, 154, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, canvasHeight - 60);
  ctx.lineTo(canvasWidth - margin, canvasHeight - 60);
  ctx.stroke();
  
  ctx.fillStyle = secondaryTextColor;
  ctx.font = '12px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('基金实时估值工作台 - 收益统计分析', margin, canvasHeight - 38);
  
  ctx.textAlign = 'right';
  const dateStr = new Date().toLocaleString('zh-CN');
  ctx.fillText(`生成时间: ${dateStr}`, canvasWidth - margin, canvasHeight - 38);
  
  const dataUrl = canvas.toDataURL('image/png', 0.95);
  
  const link = document.createElement('a');
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return true;
};

export const triggerPrint = (title = '收益分析报告') => {
  if (!inBrowser()) return;
  
  const originalTitle = document.title;
  document.title = title;
  
  setTimeout(() => {
    window.print();
    document.title = originalTitle;
  }, 100);
};

export default {
  exportAnalyticsReport,
  triggerPrint
};
