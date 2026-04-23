import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/config';

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const getAlertSettings = () => {
  if (!inBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ALERT_SETTINGS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('读取提醒设置失败:', error);
    return {};
  }
};

const setAlertSettings = (settings) => {
  if (!inBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.ALERT_SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('保存提醒设置失败:', error);
  }
};

const getAlertHistory = () => {
  if (!inBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ALERT_HISTORY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('读取提醒历史失败:', error);
    return {};
  }
};

const setAlertHistory = (history) => {
  if (!inBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.ALERT_HISTORY, JSON.stringify(history));
  } catch (error) {
    console.error('保存提醒历史失败:', error);
  }
};

const getTodayDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const checkIfAlertedToday = (fundCode, alertType) => {
  const history = getAlertHistory();
  const today = getTodayDateString();
  
  if (!history[today]) return false;
  if (!history[today][fundCode]) return false;
  return history[today][fundCode][alertType] === true;
};

const markAlertedToday = (fundCode, alertType) => {
  const history = getAlertHistory();
  const today = getTodayDateString();
  
  if (!history[today]) {
    history[today] = {};
  }
  
  if (!history[today][fundCode]) {
    history[today][fundCode] = {};
  }
  
  history[today][fundCode][alertType] = true;
  
  // 清理过期的历史记录（只保留最近7天）
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
  
  Object.keys(history).forEach(date => {
    if (date < sevenDaysAgoStr) {
      delete history[date];
    }
  });
  
  setAlertHistory(history);
};

function AlertSettingsModal({ fund, onClose, onSave }) {
  const [settings, setSettings] = useState({
    enabled: false,
    upThreshold: 5,
    downThreshold: 3,
    notifyOnUp: true,
    notifyOnDown: true
  });

  useEffect(() => {
    const allSettings = getAlertSettings();
    const fundSettings = allSettings[fund.code] || {};
    
    setSettings({
      enabled: fundSettings.enabled || false,
      upThreshold: fundSettings.upThreshold ?? 5,
      downThreshold: fundSettings.downThreshold ?? 3,
      notifyOnUp: fundSettings.notifyOnUp ?? true,
      notifyOnDown: fundSettings.notifyOnDown ?? true
    });
  }, [fund.code]);

  const handleSave = useCallback(() => {
    const allSettings = getAlertSettings();
    allSettings[fund.code] = {
      ...settings,
      fundName: fund.name
    };
    setAlertSettings(allSettings);
    
    if (onSave) {
      onSave(fund.code, settings);
    }
    
    onClose();
  }, [fund, settings, onClose, onSave]);

  const handleToggleEnabled = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  }, []);

  const handleUpThresholdChange = useCallback((e) => {
    const value = Number.parseFloat(e.target.value);
    if (Number.isFinite(value) && value >= 0) {
      setSettings(prev => ({
        ...prev,
        upThreshold: value
      }));
    }
  }, []);

  const handleDownThresholdChange = useCallback((e) => {
    const value = Number.parseFloat(e.target.value);
    if (Number.isFinite(value) && value >= 0) {
      setSettings(prev => ({
        ...prev,
        downThreshold: value
      }));
    }
  }, []);

  const handleToggleNotifyOnUp = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      notifyOnUp: !prev.notifyOnUp
    }));
  }, []);

  const handleToggleNotifyOnDown = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      notifyOnDown: !prev.notifyOnDown
    }));
  }, []);

  return (
    <div
      className="alert-settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="涨跌幅提醒设置"
      onClick={onClose}
    >
      <div className="alert-settings-card" onClick={(event) => event.stopPropagation()}>
        <div className="alert-settings-header">
          <h2 className="alert-settings-title">涨跌幅提醒设置</h2>
          <button
            type="button"
            className="alert-settings-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        
        <div className="alert-settings-fund-info">
          <span className="fund-name">{fund.name}</span>
          <span className="fund-code">({fund.code})</span>
        </div>

        <div className="alert-settings-form">
          <div className="settings-row">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={handleToggleEnabled}
                className="toggle-checkbox"
              />
              <span className="toggle-text">启用涨跌幅提醒</span>
            </label>
          </div>

          {settings.enabled && (
            <>
              <div className="settings-section">
                <div className="settings-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.notifyOnUp}
                      onChange={handleToggleNotifyOnUp}
                      className="toggle-checkbox"
                    />
                    <span className="toggle-text">涨幅提醒</span>
                  </label>
                  
                  {settings.notifyOnUp && (
                    <div className="threshold-input-group">
                      <span className="threshold-label">当涨幅超过</span>
                      <input
                        type="number"
                        className="threshold-input"
                        value={settings.upThreshold}
                        onChange={handleUpThresholdChange}
                        min="0"
                        step="0.1"
                      />
                      <span className="threshold-unit">% 时提醒</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.notifyOnDown}
                      onChange={handleToggleNotifyOnDown}
                      className="toggle-checkbox"
                    />
                    <span className="toggle-text">跌幅提醒</span>
                  </label>
                  
                  {settings.notifyOnDown && (
                    <div className="threshold-input-group">
                      <span className="threshold-label">当跌幅超过</span>
                      <input
                        type="number"
                        className="threshold-input"
                        value={settings.downThreshold}
                        onChange={handleDownThresholdChange}
                        min="0"
                        step="0.1"
                      />
                      <span className="threshold-unit">% 时提醒</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="settings-note">
                <p>注意：每种提醒类型（涨/跌）每日只会提醒一次，避免频繁打扰。</p>
              </div>
            </>
          )}
        </div>

        <div className="alert-settings-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="button"
            onClick={handleSave}
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

export {
  AlertSettingsModal,
  getAlertSettings,
  setAlertSettings,
  getAlertHistory,
  setAlertHistory,
  checkIfAlertedToday,
  markAlertedToday
};
