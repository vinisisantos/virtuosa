'use client';

import { DatePicker } from '@/components/ui/date-picker';

export interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  urgencyFilter: string;
  onUrgencyChange: (urgency: string) => void;
  dateFrom: string;
  onDateFromChange: (date: string) => void;
  dateTo: string;
  onDateToChange: (date: string) => void;
}

export function OrderFilters({
  searchQuery, onSearchChange, statusFilter, onStatusChange,
  urgencyFilter, onUrgencyChange, dateFrom, onDateFromChange,
  dateTo, onDateToChange,
}: OrderFiltersProps) {
  return (
    <div className="orders-filter-toolbar" aria-label="Filtros de pedidos">
      <label className="orders-filter-search">
        <span className="material-symbols-outlined" aria-hidden="true">search</span>
        <span className="sr-only">Buscar produto</span>
        <input
          type="search"
          placeholder="Buscar produto por nome..."
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
        />
      </label>
      <label className="orders-filter-select">
        <span className="sr-only">Filtrar por status</span>
        <select value={statusFilter} onChange={event => onStatusChange(event.target.value)}>
          <option value="All">Todos os status</option>
          <option value="Aguardando">Aguardando</option>
          <option value="Pedido">Pedido Feito</option>
          <option value="Entregue">Entregue</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      </label>
      <label className="orders-filter-select">
        <span className="sr-only">Filtrar por urgência</span>
        <select value={urgencyFilter} onChange={event => onUrgencyChange(event.target.value)}>
          <option value="All">Todas as urgências</option>
          <option value="Baixa">Baixa</option>
          <option value="Média">Média</option>
          <option value="Alta">Alta</option>
          <option value="Urgente">Urgente</option>
        </select>
      </label>
      <div className="orders-filter-dates" aria-label="Período dos pedidos">
        <span>Período</span>
        <DatePicker value={dateFrom} onChange={onDateFromChange} variant="compact" placeholder="Início" />
        <span>até</span>
        <DatePicker value={dateTo} onChange={onDateToChange} variant="compact" placeholder="Fim" />
        {(dateFrom || dateTo) && (
          <button type="button" onClick={() => { onDateFromChange(''); onDateToChange(''); }} aria-label="Limpar período">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        )}
      </div>
      <style>{`
        .orders-filter-toolbar { display: grid; grid-template-columns: minmax(170px, 1fr) repeat(2, minmax(150px, 170px)); gap: 10px; align-items: center; min-width: 0; margin-bottom: 18px; }
        .orders-filter-toolbar > * { min-width: 0; }
        .orders-filter-search { display: flex; align-items: center; position: relative; min-width: 0; }
        .orders-filter-search > .material-symbols-outlined { position: absolute; left: 12px; font-size: 19px; color: var(--text-muted); pointer-events: none; }
        .orders-filter-search input, .orders-filter-select select { display: block; box-sizing: border-box; width: 100%; min-width: 0; height: 44px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card-bg); color: var(--text-main); font-family: inherit; font-size: 0.82rem; font-weight: 600; line-height: 1.3; }
        .orders-filter-search input { padding-left: 40px; }
        .orders-filter-search input::placeholder { color: var(--text-muted); }
        .orders-filter-select { position: relative; display: block; }
        .orders-filter-select select { appearance: none; padding-right: 32px; cursor: pointer; }
        .orders-filter-select::after { content: ''; position: absolute; top: 17px; right: 14px; width: 7px; height: 7px; border-right: 2px solid var(--text-muted); border-bottom: 2px solid var(--text-muted); transform: rotate(45deg); pointer-events: none; }
        .orders-filter-dates { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text-muted); font-size: 0.78rem; font-weight: 700; }
        .orders-filter-dates > div { width: 142px; max-width: 100%; min-width: 0; }
        .orders-filter-dates > button { display: grid; place-items: center; flex: none; min-width: 36px; min-height: 36px; border: 1px solid var(--border); border-radius: 8px; background: var(--card-bg); color: var(--text-muted); cursor: pointer; }
        .orders-filter-dates > button .material-symbols-outlined { font-size: 17px; }
        @media (min-width: 1180px) { .orders-filter-toolbar { grid-template-columns: minmax(170px, 1fr) repeat(2, 170px) auto; } .orders-filter-dates { grid-column: auto; } .orders-filter-dates > div { width: 116px; } }
        @media (max-width: 640px) { .orders-filter-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); } .orders-filter-search, .orders-filter-dates { grid-column: 1 / -1; } .orders-filter-dates { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: 6px; } .orders-filter-dates > span:first-child { grid-column: 1 / -1; } .orders-filter-dates > div { width: 100%; } }
        @media (max-width: 350px) { .orders-filter-toolbar { grid-template-columns: minmax(0, 1fr); } .orders-filter-search, .orders-filter-dates { grid-column: 1; } }
      `}</style>
    </div>
  );
}
