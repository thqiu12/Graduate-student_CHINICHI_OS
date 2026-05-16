// src/main.tsx
// 知日塾大学院考学进度管理系统 - 前端入口文件

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'antd/dist/reset.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('未找到根元素 #root');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
