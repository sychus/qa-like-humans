import { useEffect, useState } from 'react';
import { DecisionInbox } from './components/DecisionInbox.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { MissionForm } from './components/MissionForm.tsx';
import { OfficeCanvas } from './components/OfficeCanvas.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { connectSocket } from './state/store.ts';

export function App() {
  const [showForm, setShowForm] = useState(false);

  useEffect(() => connectSocket(), []);

  return (
    <div className="app">
      <ErrorBoundary name="Top bar">
        <TopBar onNewMission={() => setShowForm(true)} />
      </ErrorBoundary>
      <main>
        <section className="stage">
          <ErrorBoundary name="Office">
            <OfficeCanvas />
          </ErrorBoundary>
          <ErrorBoundary name="Decision inbox">
            <DecisionInbox />
          </ErrorBoundary>
        </section>
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>
      </main>
      {showForm && (
        <ErrorBoundary name="Mission form">
          <MissionForm onClose={() => setShowForm(false)} />
        </ErrorBoundary>
      )}
    </div>
  );
}
