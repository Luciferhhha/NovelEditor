import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import App from './App';
import { useThemeStore } from './store/themeStore';
import { useLocale } from './i18n';
import './styles.css';

function Root() {
  const mode = useThemeStore(s => s.theme);
  const loc = useLocale(s => s.locale);
  return (
    <ConfigProvider
      locale={loc === 'zh' ? zhCN : enUS}
      theme={{
        token: { colorPrimary: '#4a6fa5', borderRadius: 6 },
        algorithm: mode === 'dark' ? theme.darkAlgorithm : undefined,
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);