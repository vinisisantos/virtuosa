'use client';
import { AppHeader } from '@/components/app-header';
import { useAgenda } from '@/hooks/useAgenda';
import { MONTHS_PT, startOfWeek, endOfWeek, inputS, btnPrimary } from '@/components/agenda/agenda-constants';
import { AgendaSidebar } from '@/components/agenda/agenda-sidebar';
import { AgendaDayView } from '@/components/agenda/agenda-day-view';
import { AgendaWeekView } from '@/components/agenda/agenda-week-view';
import { AgendaMonthView } from '@/components/agenda/agenda-month-view';
import { AppointmentModal, ProfissionalModal } from '@/components/agenda/agenda-modals';
import { cardS } from '@/components/agenda/agenda-constants';

export default function AgendaPage() {
  const ag = useAgenda();

  const viewLabel = () => {
    if (ag.view === 'day') return `${ag.currentDate.getDate()} de ${MONTHS_PT[ag.currentDate.getMonth()]} de ${ag.currentDate.getFullYear()}`;
    if (ag.view === 'week') {
      const sw = startOfWeek(ag.currentDate);
      const ew = endOfWeek(ag.currentDate);
      return `${sw.getDate()} – ${ew.getDate()} de ${MONTHS_PT[ew.getMonth()].slice(0, 3).toLowerCase()}. ${ew.getFullYear()}`;
    }
    return `${MONTHS_PT[ag.currentDate.getMonth()]} ${ag.currentDate.getFullYear()}`;
  };

  return (
    <>
      <AppHeader activePage="agenda" />
      <main style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>calendar_month</span>
              Agenda
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-muted)' }}>search</span>
              <input value={ag.search} onChange={e => ag.setSearch(e.target.value)} placeholder="Buscar cliente..." style={{ ...inputS, width: 200, paddingLeft: 34, fontSize: '0.82rem' }} />
            </div>
            <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['day', 'week', 'month'] as const).map(v => (
                <button key={v} onClick={() => ag.setView(v)} style={{
                  padding: '8px 16px', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                  background: ag.view === v ? 'var(--primary)' : 'transparent', color: ag.view === v ? '#fff' : 'var(--text-muted)',
                }}>
                  {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Sidebar */}
          <AgendaSidebar
            currentDate={ag.currentDate} agendamentos={ag.agendamentos} profissionais={ag.profissionais}
            view={ag.view} setView={ag.setView} setCurrentDate={ag.setCurrentDate}
            canMultiUnit={ag.canMultiUnit}
            filterUnit={ag.filterUnit} setFilterUnit={ag.setFilterUnit}
            filterProf={ag.filterProf} setFilterProf={ag.setFilterProf}
            filterStatus={ag.filterStatus} setFilterStatus={ag.setFilterStatus}
            filterProced={ag.filterProced} setFilterProced={ag.setFilterProced}
            clearFilters={ag.clearFilters}
            showProfModal={ag.showProfModal} setShowProfModal={ag.setShowProfModal}
            profForm={ag.profForm} setProfForm={ag.setProfForm}
            goPrev={ag.goPrev} goNext={ag.goNext} goToday={ag.goToday}
          />

          {/* Main area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Date header */}
            <div style={{ ...cardS, padding: '12px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={ag.goPrev} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>chevron_left</span>
                </button>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{viewLabel()}</span>
                <button onClick={ag.goNext} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>chevron_right</span>
                </button>
              </div>
              <button onClick={() => ag.openNewModal()} style={btnPrimary}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Novo Agendamento
              </button>
            </div>

            {/* Views */}
            {ag.view === 'day' && <AgendaDayView currentDate={ag.currentDate} agendamentos={ag.agendamentos} profissionais={ag.profissionais} now={ag.now} gridRef={ag.gridRef} openNewModal={ag.openNewModal} openEditModal={ag.openEditModal} reschedule={ag.reschedule} />}
            {ag.view === 'week' && <AgendaWeekView currentDate={ag.currentDate} agendamentos={ag.agendamentos} now={ag.now} gridRef={ag.gridRef} setCurrentDate={ag.setCurrentDate} setView={ag.setView} openNewModal={ag.openNewModal} openEditModal={ag.openEditModal} />}
            {ag.view === 'month' && <AgendaMonthView currentDate={ag.currentDate} agendamentos={ag.agendamentos} setCurrentDate={ag.setCurrentDate} setView={ag.setView} />}
          </div>
        </div>

        {/* FAB */}
        <button onClick={() => ag.openNewModal()} style={{
          position: 'fixed', bottom: 32, right: 32, width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', border: 'none',
          boxShadow: '0 8px 24px rgba(230,0,126,0.35)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 100, transition: 'all 0.3s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
        </button>

        {/* Modals */}
        {ag.showModal && <AppointmentModal editingId={ag.editingId} form={ag.form} setForm={ag.setForm} profissionais={ag.profissionais} canMultiUnit={ag.canMultiUnit} catalogServices={ag.catalogServices} crmClients={ag.crmClients} onSave={ag.saveAgendamento} onDelete={ag.deleteAgendamento} onClose={() => ag.setShowModal(false)} />}
        {ag.showProfModal && <ProfissionalModal profForm={ag.profForm} setProfForm={ag.setProfForm} onSave={ag.saveProfissional} onClose={() => ag.setShowProfModal(false)} />}
      </main>
    </>
  );
}
