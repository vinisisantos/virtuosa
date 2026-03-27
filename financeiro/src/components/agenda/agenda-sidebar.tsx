import React from 'react';
import type { Agendamento, Profissional, AgendaForm } from './agenda-constants';
import { MONTHS_PT, DAYS_PT, STATUS_COLORS, getMonthDays, isSameDay, dateKey, cardS, btnPrimary, inputS, selectS } from './agenda-constants';

interface Props {
  currentDate: Date;
  agendamentos: Agendamento[];
  profissionais: Profissional[];
  view: 'day' | 'week' | 'month';
  setView: (v: 'day' | 'week' | 'month') => void;
  setCurrentDate: (d: Date) => void;
  canMultiUnit: boolean;
  filterUnit: string; setFilterUnit: (v: string) => void;
  filterProf: string; setFilterProf: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  filterProced: string; setFilterProced: (v: string) => void;
  clearFilters: () => void;
  showProfModal: boolean; setShowProfModal: (v: boolean) => void;
  profForm: { name: string; color: string; unit: string };
  setProfForm: (f: { name: string; color: string; unit: string }) => void;
  goPrev: () => void; goNext: () => void; goToday: () => void;
}

export function AgendaSidebar({ currentDate, agendamentos, profissionais, view, setView, setCurrentDate, canMultiUnit, filterUnit, setFilterUnit, filterProf, setFilterProf, filterStatus, setFilterStatus, filterProced, setFilterProced, clearFilters, setShowProfModal, profForm, setProfForm, goPrev, goNext, goToday }: Props) {
  const miniCalDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
  const today = new Date();

  return (
    <div style={{ width: 240, flexShrink: 0 }}>
      {/* Navigation */}
      <div style={{ ...cardS, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button onClick={goPrev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>chevron_left</span>
          </button>
          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{MONTHS_PT[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
          <button onClick={goNext} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>chevron_right</span>
          </button>
        </div>
        <button onClick={goToday} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 12, padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>today</span> Hoje
        </button>
        {/* Mini calendar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, fontSize: '0.7rem', textAlign: 'center' }}>
          {DAYS_PT.map(d => <div key={d} style={{ fontWeight: 800, color: 'var(--text-muted)', padding: '4px 0', fontSize: '0.65rem' }}>{d[0]}</div>)}
          {miniCalDays.map((d, i) => {
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, currentDate);
            const isCurrentMonth = d.getMonth() === currentDate.getMonth();
            const hasAppts = agendamentos.some(a => isSameDay(new Date(a.startTime), d));
            return (
              <div key={i} onClick={() => { setCurrentDate(d); if (view === 'month') setView('day'); }}
                style={{
                  padding: '4px 0', borderRadius: 8, cursor: 'pointer', fontWeight: isToday || isSelected ? 800 : 500,
                  background: isSelected ? 'var(--primary)' : isToday ? 'rgba(230,0,126,0.1)' : 'transparent',
                  color: isSelected ? '#fff' : !isCurrentMonth ? 'var(--text-muted)' : isToday ? 'var(--primary)' : 'var(--text-main)',
                  position: 'relative', transition: 'all 0.15s',
                }}
              >
                {d.getDate()}
                {hasAppts && !isSelected && <div style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--primary)', margin: '1px auto 0' }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...cardS, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>Filtros</span>
          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Limpar filtros</button>
        </div>
        {canMultiUnit && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
            <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
              <option value="">Todas</option>
              {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Profissional</label>
          <select value={filterProf} onChange={e => setFilterProf(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
            <option value="">Todos</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectS, padding: '8px 10px', fontSize: '0.82rem' }}>
            <option value="">Todos</option>
            {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Procedimento</label>
          <input value={filterProced} onChange={e => setFilterProced(e.target.value)} placeholder="Filtrar..." style={{ ...inputS, padding: '8px 10px', fontSize: '0.82rem' }} />
        </div>
      </div>

      {/* Professionals */}
      <div style={{ ...cardS, padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>Profissionais</span>
          <button onClick={() => { setProfForm({ name: '', color: '#e600a0', unit: filterUnit || 'Barueri' }); setShowProfModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>add_circle</span>
          </button>
        </div>
        {profissionais.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.82rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: p.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{p.name}</span>
          </div>
        ))}
        {profissionais.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Nenhum profissional cadastrado</div>}
      </div>

      {/* Legend */}
      <div style={{ ...cardS, padding: 16, marginTop: 16 }}>
        <span style={{ fontWeight: 800, fontSize: '0.82rem', display: 'block', marginBottom: 8 }}>Legenda</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: v.border, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
