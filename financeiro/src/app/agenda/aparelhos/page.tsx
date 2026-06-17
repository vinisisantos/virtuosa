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

  // Modals state
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

      <div className="dashboard-content" style={{ paddingBottom: 80, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Trânsito de Aparelhos</h1>
          <button 
            onClick={() => setShowManageModal(true)}
            style={{ 
              padding: '8px 16px', borderRadius: 8, border: 'none', 
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)', 
              color: '#fff', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>precision_manufacturing</span>
            Gerenciar Aparelhos
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
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
