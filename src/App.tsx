/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EngineProvider } from './context/EngineContext';
import { AppLayout } from './layouts/AppLayout';
import { WorkspacePage } from './pages/WorkspacePage';
import { IngestionPage } from './pages/IngestionPage';
import { AnalyticalSuitesPage } from './pages/AnalyticalSuitesPage';
import { TelemetryPage } from './pages/TelemetryPage';

export default function App() {
  return (
    <EngineProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<WorkspacePage />} />
            <Route path="/ingestion" element={<IngestionPage />} />
            <Route path="/analytics" element={<AnalyticalSuitesPage />} />
            <Route path="/telemetry" element={<TelemetryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </EngineProvider>
  );
}
