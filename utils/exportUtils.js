/**
 * 导出工具 - 支持将图表导出为图片或PDF
 */

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const svgToDataUrl = (svgElement) => {
  if (!svgElement) return null;
  
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const encodedData = encodeURIComponent(svgData)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  
  return `data:image/svg+xml;charset=utf-8,${encodedData}`;
};

const drawSvgOnCanvas = (svgDataUrl, width, height, backgroundColor = '#ffffff') => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2;
    
    canvas.width = width * scale;
    canvas.height = height * scale;
    
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
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

const getChartBackgroundColor = () => {
  if (!inBrowser()) return '#ffffff';
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? '#1E293B' : '#ffffff';
};

export const exportChartAsImage = async (chartContainer, options = {}) => {
  if (!inBrowser()) {
    throw new Error('导出功能仅在浏览器环境可用');
  }
  
  const {
    filename = 'chart',
    format = 'png',
    quality = 0.95
  } = options;
  
  const svgElement = chartContainer.querySelector('svg');
  if (!svgElement) {
    throw new Error('未找到图表元素');
  }
  
  const rect = chartContainer.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 400;
  const bgColor = getChartBackgroundColor();
  
  const svgDataUrl = svgToDataUrl(svgElement);
  const canvas = await drawSvgOnCanvas(svgDataUrl, width, height, bgColor);
  
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, quality);
  
  const link = document.createElement('a');
  link.download = `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return true;
};

export const exportChartAsPdf = async (chartContainer, options = {}) => {
  if (!inBrowser()) {
    throw new Error('导出功能仅在浏览器环境可用');
  }
  
  const {
    filename = 'report',
    title = '收益分析报告',
    subtitle = ''
  } = options;
  
  const svgElement = chartContainer.querySelector('svg');
  if (!svgElement) {
    throw new Error('未找到图表元素');
  }
  
  const rect = chartContainer.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 400;
  const bgColor = getChartBackgroundColor();
  
  const svgDataUrl = svgToDataUrl(svgElement);
  const canvas = await drawSvgOnCanvas(svgDataUrl, width, height, bgColor);
  
  const pdfWidth = 841.89;
  const pdfHeight = 595.28;
  const margin = 40;
  
  const pdfCanvas = document.createElement('canvas');
  const pdfCtx = pdfCanvas.getContext('2d');
  const scale = 2;
  
  pdfCanvas.width = pdfWidth * scale;
  pdfCanvas.height = pdfHeight * scale;
  pdfCtx.scale(scale, scale);
  
  pdfCtx.fillStyle = bgColor;
  pdfCtx.fillRect(0, 0, pdfWidth, pdfHeight);
  
  pdfCtx.fillStyle = getTextColor();
  pdfCtx.font = 'bold 24px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  pdfCtx.textAlign = 'left';
  pdfCtx.fillText(title, margin, 50);
  
  if (subtitle) {
    pdfCtx.font = '14px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
    pdfCtx.fillStyle = getSecondaryTextColor();
    pdfCtx.fillText(subtitle, margin, 75);
  }
  
  const chartTop = 100;
  const availableWidth = pdfWidth - margin * 2;
  const availableHeight = pdfHeight - chartTop - margin;
  
  const chartRatio = width / height;
  let drawWidth = availableWidth;
  let drawHeight = drawWidth / chartRatio;
  
  if (drawHeight > availableHeight) {
    drawHeight = availableHeight;
    drawWidth = drawHeight * chartRatio;
  }
  
  const drawX = margin + (availableWidth - drawWidth) / 2;
  const drawY = chartTop + (availableHeight - drawHeight) / 2;
  
  pdfCtx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight);
  
  pdfCtx.font = '11px "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  pdfCtx.fillStyle = getSecondaryTextColor();
  pdfCtx.textAlign = 'center';
  const dateStr = new Date().toLocaleString('zh-CN');
  pdfCtx.fillText(`生成时间: ${dateStr}`, pdfWidth / 2, pdfHeight - 20);
  
  const dataUrl = pdfCanvas.toDataURL('image/png', 0.95);
  
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return true;
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

export const captureElement = async (element, options = {}) => {
  if (!inBrowser()) {
    throw new Error('截图功能仅在浏览器环境可用');
  }
  
  const {
    filename = 'screenshot',
    format = 'png',
    scale = 2
  } = options;
  
  const rect = element.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const bgColor = getChartBackgroundColor();
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  const svgElements = element.querySelectorAll('svg');
  
  for (const svg of svgElements) {
    const svgRect = svg.getBoundingClientRect();
    const relativeX = svgRect.left - rect.left;
    const relativeY = svgRect.top - rect.top;
    
    const svgDataUrl = svgToDataUrl(svg);
    
    try {
      const svgCanvas = await drawSvgOnCanvas(svgDataUrl, svgRect.width, svgRect.height, 'transparent');
      ctx.drawImage(svgCanvas, relativeX, relativeY, svgRect.width, svgRect.height);
    } catch (e) {
      console.warn('SVG转换失败:', e);
    }
  }
  
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, 0.95);
  
  const link = document.createElement('a');
  link.download = `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`;
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
  exportChartAsImage,
  exportChartAsPdf,
  captureElement,
  triggerPrint
};
