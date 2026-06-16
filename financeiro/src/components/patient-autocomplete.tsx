'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/components/toast';

/* ──────────────────────────────────────────────────────────────
   PatientAutocomplete — Reusable smart patient picker
   ────────────────────────────────────────────────────────────── */

export interface PatientData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  rg: string | null;
  birthdate: string | null;
  gender: string | null;
  profissao: string | null;
  estadoCivil: string | null;
  unit: string;
  notes?: string | null;
  cep?: string | null;
  estado?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  pais?: string | null;
}

interface PatientAutocompleteProps {
  /** Currently selected patient (controlled) */
  value?: PatientData | null;
  /** Callback when a patient is selected */
  onSelect: (patient: PatientData) => void;
  /** Callback when selection is cleared */
  onClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Unit filter for search */
  unit?: string;
  /** Style variant */
  variant?: 'default' | 'compact';
  /** Whether to allow creating new patients inline */
  allowCreate?: boolean;
  /** If true, only return name (no full binding) */
  nameOnly?: boolean;
  /** Optional callback for name-only changes */
  onNameChange?: (name: string) => void;
  /** Label text */
  label?: string;
  /** Required field indicator */
  required?: boolean;
  /** Available units for new patient creation */
  units?: string[];
}

/* ── Styles ── */
const inputBase: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12,
  border: '1px solid var(--border)', fontSize: '0.88rem',
  outline: 'none', background: 'var(--bg)', boxSizing: 'border-box',
  color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 46,
};
const labelBase: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase',
};

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return p;
};
const fmtCpf = (c: string) => {
  const d = c.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return c;
};

export function PatientAutocomplete({
  value,
  onSelect,
  onClear,
  placeholder = 'Digite o nome do paciente...',
  unit,
  variant = 'default',
  allowCreate = true,
  nameOnly = false,
  onNameChange,
  label,
  required = false,
  units = [ 'Osasco', 'SBC', 'SCS'],
}: PatientAutocompleteProps) {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState<PatientData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PatientData | null>(value || null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', phone: '', email: '', cpf: '', rg: '',
    birthdate: '', gender: '', profissao: '', estadoCivil: '',
    unit: units[0] || 'SCS', notes: '',
    cep: '', estado: '', cidade: '', bairro: '', rua: '', numero: '', complemento: '',
  });

  // Duplicate handling
  const [duplicates, setDuplicates] = useState<PatientData[]>([]);
  const [showDupWarning, setShowDupWarning] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync with external value
  useEffect(() => {
    if (value) {
      setSelected(value);
      setQuery(value.name);
    } else if (value === null) {
      setSelected(null);
      setQuery('');
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPatients = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: '8' });
      if (unit) params.set('unit', unit);
      const res = await fetch(`/api/clients/search?${params}`);
      const data = await res.json();
      setResults(data.clients || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [unit]);

  const handleInputChange = (text: string) => {
    setQuery(text);
    if (onNameChange) onNameChange(text);

    // If was selected, clear selection
    if (selected) {
      setSelected(null);
      if (onClear) onClear();
    }

    // Debounced search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchPatients(text);
      if (text.trim().length >= 2) setShowDropdown(true);
    }, 300);
  };

  const handleSelect = (patient: PatientData) => {
    setSelected(patient);
    setQuery(patient.name);
    setShowDropdown(false);
    onSelect(patient);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
    if (onClear) onClear();
    if (onNameChange) onNameChange('');
  };

  const openCreateModal = () => {
    setCreateForm(prev => ({
      ...prev,
      name: query,
      unit: unit || units[0] || 'SCS',
    }));
    setShowDropdown(false);
    setShowCreateModal(true);
    setDuplicates([]);
    setShowDupWarning(false);
  };

  const handleCreatePatient = async (forceCreate = false) => {
    if (!createForm.name.trim()) {
      toast('Nome obrigatório', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          stage: 'entrada',
          force: forceCreate,
        }),
      });
      const data = await res.json();

      if (res.status === 409 && data.duplicate) {
        // Show duplicate warning
        setDuplicates(data.candidates || []);
        setShowDupWarning(true);
        setCreating(false);
        return;
      }

      if (data.success && data.client) {
        toast('Paciente cadastrado com sucesso!', 'success');
        setShowCreateModal(false);
        setShowDupWarning(false);
        const newPatient: PatientData = data.client;
        handleSelect(newPatient);
      } else {
        toast(data.error || 'Erro ao cadastrar', 'error');
      }
    } catch {
      toast('Erro de conexão', 'error');
    }
    setCreating(false);
  };

  const handleSelectDuplicate = (dup: PatientData) => {
    setShowDupWarning(false);
    setShowCreateModal(false);
    handleSelect(dup);
    toast('Paciente existente selecionado!', 'success');
  };

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const getColor = (name: string) => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#e600a0', '#ef4444', '#8b5cf6', '#14b8a6'];
    let hash = 0;
    for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative' }}>
        {/* Label */}
        {label && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...labelBase, marginBottom: 0 }}>{label}{required ? ' *' : ''}</label>
            {selected && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, color: '#10b981',
                background: 'rgba(16,185,129,0.08)', padding: '2px 8px', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
                Vinculado
              </span>
            )}
          </div>
        )}

        {/* Input container */}
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 18, color: selected ? '#10b981' : 'var(--text-muted)',
            transition: 'color 0.2s',
          }}>
            {selected ? 'person_check' : 'person_search'}
          </span>

          <input
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onFocus={() => { if (query.trim().length >= 2 && !selected) { searchPatients(query); setShowDropdown(true); } }}
            placeholder={placeholder}
            autoComplete="off"
            style={{
              ...inputBase,
              paddingLeft: 38,
              paddingRight: selected ? 38 : 16,
              height: variant === 'compact' ? 42 : 46,
              borderColor: selected ? 'rgba(16,185,129,0.3)' : showDropdown ? 'var(--primary)' : 'var(--border)',
              boxShadow: showDropdown ? '0 0 0 3px rgba(230,0,126,0.08)' : 'none',
              transition: 'all 0.2s',
            }}
          />

          {/* Clear button */}
          {(selected || query) && (
            <button
              onClick={handleClear}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && !selected && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            maxHeight: 320, overflowY: 'auto', marginTop: 4,
            animation: 'fadeInDown 0.15s ease-out',
          }}>
            {/* Loading */}
            {loading && (
              <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 6 }}>progress_activity</span>
                Buscando pacientes...
              </div>
            )}

            {/* Results */}
            {!loading && results.length > 0 && results.map(client => {
              const color = getColor(client.name);
              return (
                <div
                  key={client.id}
                  onMouseDown={e => { e.preventDefault(); handleSelect(client); }}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    gap: 10, borderBottom: '1px solid var(--border)', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0,
                  }}>
                    {getInitials(client.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {client.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {client.phone && <span>📱 {fmtPhone(client.phone)}</span>}
                      {client.cpf && <span>🪪 {fmtCpf(client.cpf)}</span>}
                      {client.email && <span>✉️ {client.email}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                    {client.unit}
                  </span>
                </div>
              );
            })}

            {/* No results */}
            {!loading && results.length === 0 && query.trim().length >= 2 && (
              <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, opacity: 0.3, display: 'block', marginBottom: 4 }}>person_off</span>
                Nenhum paciente encontrado
              </div>
            )}

            {/* Create new button */}
            {allowCreate && !loading && query.trim().length >= 2 && (
              <div
                onMouseDown={e => { e.preventDefault(); openCreateModal(); }}
                style={{
                  padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  gap: 8, borderTop: results.length > 0 ? '2px solid var(--border)' : 'none',
                  background: 'rgba(99,102,241,0.03)', transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.03)')}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>person_add</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--primary)' }}>Cadastrar novo paciente</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Criar cadastro para &quot;{query.trim()}&quot;
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ CREATE PATIENT MODAL ═══ */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 20,
          }}
          onClick={() => { setShowCreateModal(false); setShowDupWarning(false); }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)', borderRadius: 24, border: '1px solid var(--border)',
              maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeInScale 0.2s ease-out',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 28px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
              position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10, borderRadius: '24px 24px 0 0',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>person_add</span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>Cadastrar Novo Paciente</h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Preencha os dados do paciente para salvar no sistema
                </p>
              </div>
              <button onClick={() => { setShowCreateModal(false); setShowDupWarning(false); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            <div style={{ padding: '20px 28px' }}>
              {/* ── Duplicate Warning ── */}
              {showDupWarning && duplicates.length > 0 && (
                <div style={{
                  marginBottom: 20, padding: '16px 20px', borderRadius: 16,
                  background: 'rgba(245,158,11,0.06)', border: '2px solid rgba(245,158,11,0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#f59e0b' }}>warning</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#f59e0b' }}>Possível duplicidade detectada!</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Paciente(s) com dados semelhantes já existe(m) no sistema:
                      </div>
                    </div>
                  </div>

                  {duplicates.map(dup => (
                    <div
                      key={dup.id}
                      onClick={() => handleSelectDuplicate(dup)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)',
                        marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = 'rgba(16,185,129,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card-bg)'; }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `linear-gradient(135deg, ${getColor(dup.name)}, ${getColor(dup.name)}cc)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '0.65rem', fontWeight: 900, flexShrink: 0,
                      }}>
                        {getInitials(dup.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{dup.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', gap: 8 }}>
                          {dup.phone && <span>📱 {fmtPhone(dup.phone)}</span>}
                          {dup.cpf && <span>🪪 {fmtCpf(dup.cpf)}</span>}
                          {dup.email && <span>✉️ {dup.email}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>Selecionar →</span>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => handleCreatePatient(true)}
                      disabled={creating}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)',
                        background: 'rgba(245,158,11,0.06)', color: '#f59e0b', fontWeight: 700,
                        fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {creating ? 'Criando...' : 'Criar mesmo assim'}
                    </button>
                    <button
                      onClick={() => { setShowDupWarning(false); }}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700,
                        fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Form Fields ── */}
              {!showDupWarning && (
                <>
                  {/* Row 1: Nome */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelBase}>Nome completo *</label>
                    <input
                      value={createForm.name}
                      onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                      style={inputBase}
                      placeholder="Ex: Maria Silva Santos"
                      autoFocus
                    />
                  </div>

                  {/* Row 2: CPF + RG */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>CPF</label>
                      <input
                        value={createForm.cpf}
                        onChange={e => setCreateForm(f => ({ ...f, cpf: e.target.value }))}
                        style={inputBase}
                        placeholder="000.000.000-00"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>RG</label>
                      <input
                        value={createForm.rg}
                        onChange={e => setCreateForm(f => ({ ...f, rg: e.target.value }))}
                        style={inputBase}
                        placeholder="00.000.000-0"
                      />
                    </div>
                  </div>

                  {/* Row 3: Phone + Email */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Telefone</label>
                      <input
                        value={createForm.phone}
                        onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                        style={inputBase}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>E-mail</label>
                      <input
                        value={createForm.email}
                        onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                        style={inputBase}
                        placeholder="paciente@email.com"
                        type="email"
                      />
                    </div>
                  </div>

                  {/* Row 4: Birthdate + Gender */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Data de Nascimento</label>
                      <input
                        value={createForm.birthdate}
                        onChange={e => setCreateForm(f => ({ ...f, birthdate: e.target.value }))}
                        style={inputBase}
                        type="date"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Sexo</label>
                      <select
                        value={createForm.gender}
                        onChange={e => setCreateForm(f => ({ ...f, gender: e.target.value }))}
                        style={{ ...inputBase, cursor: 'pointer' }}
                      >
                        <option value="">Selecione</option>
                        <option value="feminino">Feminino</option>
                        <option value="masculino">Masculino</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 5: Profissão + Estado Civil */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Profissão</label>
                      <input
                        value={createForm.profissao}
                        onChange={e => setCreateForm(f => ({ ...f, profissao: e.target.value }))}
                        style={inputBase}
                        placeholder="Ex: Advogada"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Estado Civil</label>
                      <select
                        value={createForm.estadoCivil}
                        onChange={e => setCreateForm(f => ({ ...f, estadoCivil: e.target.value }))}
                        style={{ ...inputBase, cursor: 'pointer' }}
                      >
                        <option value="">Selecione</option>
                        <option value="solteiro">Solteiro(a)</option>
                        <option value="casado">Casado(a)</option>
                        <option value="divorciado">Divorciado(a)</option>
                        <option value="viuvo">Viúvo(a)</option>
                        <option value="uniao_estavel">União Estável</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 6: Unit */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Unidade</label>
                      <select
                        value={createForm.unit}
                        onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}
                        style={{ ...inputBase, cursor: 'pointer' }}
                      >
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelBase}>CEP</label>
                      <input
                        value={createForm.cep}
                        onChange={e => setCreateForm(f => ({ ...f, cep: e.target.value }))}
                        style={inputBase}
                        placeholder="00000-000"
                      />
                    </div>
                  </div>

                  {/* Row 7: Address */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Rua</label>
                      <input
                        value={createForm.rua}
                        onChange={e => setCreateForm(f => ({ ...f, rua: e.target.value }))}
                        style={inputBase}
                        placeholder="Rua/Avenida"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Nº</label>
                      <input
                        value={createForm.numero}
                        onChange={e => setCreateForm(f => ({ ...f, numero: e.target.value }))}
                        style={inputBase}
                        placeholder="Nº"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={labelBase}>Bairro</label>
                      <input
                        value={createForm.bairro}
                        onChange={e => setCreateForm(f => ({ ...f, bairro: e.target.value }))}
                        style={inputBase}
                        placeholder="Bairro"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Cidade</label>
                      <input
                        value={createForm.cidade}
                        onChange={e => setCreateForm(f => ({ ...f, cidade: e.target.value }))}
                        style={inputBase}
                        placeholder="Cidade"
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Estado</label>
                      <input
                        value={createForm.estado}
                        onChange={e => setCreateForm(f => ({ ...f, estado: e.target.value }))}
                        style={inputBase}
                        placeholder="SP"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelBase}>Observações</label>
                    <textarea
                      value={createForm.notes}
                      onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      style={{ ...inputBase, height: 'auto', resize: 'vertical' }}
                      placeholder="Observações opcionais..."
                    />
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                    <button
                      onClick={() => { setShowCreateModal(false); setShowDupWarning(false); }}
                      style={{
                        padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border)',
                        background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem',
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleCreatePatient(false)}
                      disabled={creating || !createForm.name.trim()}
                      style={{
                        padding: '12px 32px', borderRadius: 12, border: 'none',
                        background: creating || !createForm.name.trim() ? '#ccc' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                        color: '#fff', fontWeight: 800, cursor: creating ? 'wait' : 'pointer',
                        fontFamily: 'inherit', fontSize: '0.88rem',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        {creating ? 'hourglass_top' : 'person_add'}
                      </span>
                      {creating ? 'Salvando...' : 'Cadastrar Paciente'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
