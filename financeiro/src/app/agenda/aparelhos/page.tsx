'use client';

import React, { useEffect, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { EquipmentCalendar } from '@/components/agenda/equipment-calendar';
import { EquipmentModals } from '@/components/agenda/equipment-modals';

export interface Aparelho {
  id: string;
  name: string;
  color: string;
  alocacoes: AlocacaoAparelho[];
}

export interface AlocacaoAparelho {
  id: string;
  aparelhoId: string;
  unit: string;
  date: string;
}

export default function AgendaAparelhosPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const fetchAparelhos = async () => {
    setIsLoadingData(true);
    try {
      const month = currentDate.getMonth();
      const year = currentDate.getFullYear();
      const res = await fetch(`/api/agenda/aparelhos?month=${month}&year=${year}`);
      if (res.ok) {
        setAparelhos(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => { fetchAparelhos(); }, [currentDate]);

  return (
    <main className="dashboard-container" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppHeader activePage="agenda" />

      <div className="dashboard-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 16px 12px' }}>
        {/* Page Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, padding: '14px 20px',
          background: 'var(--card-bg)', borderRadius: 14,
          border: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(230,0,126,0.25)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>precision_manufacturing</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Trânsito de Aparelhos</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Controle de movimentação entre unidades</p>
            </div>
          </div>
          <button
            onClick={() => setShowManageModal(true)}
            style={{
              padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(230,0,126,0.3)',
              background: 'rgba(230,0,126,0.08)',
              color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(230,0,126,0.08)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span>
            Gerenciar Aparelhos
          </button>
        </div>

        {/* Calendar — fills remaining space */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <EquipmentCalendar
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            aparelhos={aparelhos}
            isLoading={isLoadingData}
            onDayClick={(day) => setSelectedDay(day)}
          />
        </div>
      </div>

      <EquipmentModals
        showManageModal={showManageModal}
        setShowManageModal={setShowManageModal}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
        aparelhos={aparelhos}
        refresh={fetchAparelhos}
      />

      <MobileTabBar />
    </main>
  );
}
