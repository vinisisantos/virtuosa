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
  date: string; // ISO string
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

  useEffect(() => {
    fetchAparelhos();
  }, [currentDate]);

  return (
    <main className="dashboard-container">
      <AppHeader activePage="agenda" />

      <div className="dashboard-content" style={{ paddingBottom: 80 }}>
        {/* Page Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, padding: '20px 24px',
          background: 'var(--card-bg)', borderRadius: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(230,0,126,0.25)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>precision_manufacturing</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Trânsito de Aparelhos</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Controle de movimentação entre unidades</p>
            </div>
          </div>
          <button
            onClick={() => setShowManageModal(true)}
            style={{
              padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(230,0,126,0.3)',
              background: 'rgba(230,0,126,0.08)',
              color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(230,0,126,0.08)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
            Gerenciar Aparelhos
          </button>
        </div>

        {/* Calendar */}
        <div>
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
