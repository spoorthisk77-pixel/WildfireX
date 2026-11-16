/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { OverviewPage } from './pages/OverviewPage';
import { ForestExplorerPage } from './pages/ForestExplorerPage';
import { Landscape3DPage } from './pages/Landscape3DPage';
import { DatasetCentrePage } from './pages/DatasetCentrePage';
import { GeospatialLabPage } from './pages/GeospatialLabPage';
import { ObservationsPage } from './pages/ObservationsPage';
import { CellularAutomataPage } from './pages/CellularAutomataPage';
import { GraphTheoryPage } from './pages/GraphTheoryPage';
import { CombinatoricsPage } from './pages/CombinatoricsPage';
import { MathematicalLogicPage } from './pages/MathematicalLogicPage';
import { GeneratingRecurrencePage } from './pages/GeneratingRecurrencePage';
import { TreesAlgorithmsPage } from './pages/TreesAlgorithmsPage';
import { ScenarioComparisonPage } from './pages/ScenarioComparisonPage';
import { ReportsExportsPage } from './pages/ReportsExportsPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { SyllabusCoveragePage } from './pages/SyllabusCoveragePage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/forest-explorer" element={<ForestExplorerPage />} />
          <Route path="/landscape-3d" element={<Landscape3DPage />} />
          <Route path="/datasets" element={<DatasetCentrePage />} />
          <Route path="/geospatial" element={<GeospatialLabPage />} />
          <Route path="/observations" element={<ObservationsPage />} />
          <Route path="/cellular-automata" element={<CellularAutomataPage />} />
          <Route path="/graph-theory" element={<GraphTheoryPage />} />
          <Route path="/combinatorics" element={<CombinatoricsPage />} />
          <Route path="/mathematical-logic" element={<MathematicalLogicPage />} />
          <Route path="/generating-functions" element={<GeneratingRecurrencePage initialSection="generating" />} />
          <Route path="/recurrence-relations" element={<GeneratingRecurrencePage initialSection="recurrence" />} />
          <Route path="/trees-algorithms" element={<TreesAlgorithmsPage />} />
          <Route path="/scenario-comparison" element={<ScenarioComparisonPage />} />
          <Route path="/reports" element={<ReportsExportsPage />} />
          <Route path="/data-quality" element={<DataQualityPage />} />
          <Route path="/syllabus-coverage" element={<SyllabusCoveragePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

