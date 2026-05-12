'use client';
import React from 'react';
import { CalcState, Insumo, fmt, calc } from './useCalc';

const card: React.CSSProperties = { background:'var(--card-bg)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-md)',padding:24 };
const inp: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',fontSize:'0.88rem',background:'var(--bg)',color:'var(--text-main)',fontFamily:'inherit',fontWeight:600,boxSizing:'border-box',textAlign:'right' };
const lbl: React.CSSProperties = { display:'block',fontSize:'0.7rem',fontWeight:700,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase' };
const row: React.CSSProperties = { display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)' };

interface Props { s: CalcState; set: (u: Partial<CalcState>) => void }

function NumField({ label, value, onChange, prefix='R$', suffix, min }: { label:string; value:number; onChange:(v:number)=>void; prefix?:string; suffix?:string; min?:number }) {
  return (
    <div style={row}>
      <span style={{ fontSize:'0.85rem',fontWeight:600 }}>{label}</span>
      <div style={{ display:'flex',alignItems:'center',gap:6,maxWidth:160 }}>
        {prefix && <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>{prefix}</span>}
        <input type="number" value={value||''} min={min||0} step="0.01"
          onChange={e=>onChange(parseFloat(e.target.value)||0)}
          style={{ ...inp, width: 110 }} />
        {suffix && <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function Etapa1({ s, set }: Props) {
  const r = calc(s);
  return (
    <div style={card}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
        <div style={{ width:36,height:36,borderRadius:10,background:'rgba(236,72,153,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize:20,color:'#ec4899' }}>schedule</span>
        </div>
        <div><div style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' }}>Etapa 1</div><div style={{ fontSize:'0.95rem',fontWeight:800 }}>Valor da Hora Maca</div></div>
      </div>
      <div style={{ fontSize:'0.72rem',fontWeight:800,color:'#ec4899',textTransform:'uppercase',marginBottom:4 }}>Custos Fixos Mensais</div>
      <NumField label="Aluguel / Espaço" value={s.aluguel} onChange={v=>set({aluguel:v})} />
      <NumField label="Energia Elétrica" value={s.energiaEletrica} onChange={v=>set({energiaEletrica:v})} />
      <NumField label="Água / Internet" value={s.aguaInternet} onChange={v=>set({aguaInternet:v})} />
      <NumField label="Contador" value={s.contador} onChange={v=>set({contador:v})} />
      <NumField label="Salários" value={s.salarios} onChange={v=>set({salarios:v})} />
      <NumField label="Pró-labore" value={s.proLabore} onChange={v=>set({proLabore:v})} />
      <div style={{ fontSize:'0.72rem',fontWeight:800,color:'#ec4899',textTransform:'uppercase',marginTop:16,marginBottom:4 }}>Custos Variáveis Mensais</div>
      <NumField label="Materiais / Insumos gerais" value={s.materiaisGerais} onChange={v=>set({materiaisGerais:v})} />
      <NumField label="Marketing / Tráfego" value={s.marketingTrafego} onChange={v=>set({marketingTrafego:v})} />
      <NumField label="Comissões" value={s.comissoes} onChange={v=>set({comissoes:v})} />
      <NumField label="Taxas e plataformas" value={s.taxasPlataformas} onChange={v=>set({taxasPlataformas:v})} />
      <NumField label="Outros" value={s.outros} onChange={v=>set({outros:v})} />
      <div style={{ ...row, borderBottom:'none',marginTop:8 }}>
        <span style={{ fontSize:'0.85rem',fontWeight:600 }}>Dias trabalhados / mês</span>
        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
          <input type="number" value={s.diasTrabalhados} min={1} onChange={e=>set({diasTrabalhados:parseInt(e.target.value)||1})} style={{ ...inp,width:60 }} />
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>dias</span>
        </div>
      </div>
      <div style={{ ...row, borderBottom:'none' }}>
        <span style={{ fontSize:'0.85rem',fontWeight:600 }}>Horas trabalhadas / dia</span>
        <div style={{ display:'flex',alignItems:'center',gap:4 }}>
          <input type="number" value={s.horasDia} min={0} onChange={e=>set({horasDia:parseInt(e.target.value)||0})} style={{ ...inp,width:50 }} />
          <span style={{ fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)' }}>h</span>
          <input type="number" value={s.minutosDia} min={0} max={59} onChange={e=>set({minutosDia:parseInt(e.target.value)||0})} style={{ ...inp,width:50 }} />
          <span style={{ fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)' }}>min</span>
        </div>
      </div>
      <div style={{ ...row, borderBottom:'none' }}>
        <span style={{ fontSize:'0.85rem',fontWeight:600 }}>Qnt de Salas / Profissionais</span>
        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
          <input type="number" value={s.qtdSalas} min={1} onChange={e=>set({qtdSalas:parseInt(e.target.value)||1})} style={{ ...inp,width:60 }} />
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>sala(s)</span>
        </div>
      </div>
      <div style={{ background:'linear-gradient(135deg,#fdf2f8,#fce7f3)',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12 }}>
        <span style={{ fontSize:'0.78rem',fontWeight:800,color:'#ec4899',display:'flex',alignItems:'center',gap:6 }}>▸ HORA MACA</span>
        <span style={{ fontSize:'1.1rem',fontWeight:900,color:'#be185d' }}>{fmt(r.horaMaca)}</span>
      </div>
    </div>
  );
}

export function Etapa2({ s, set }: Props) {
  const r = calc(s);
  return (
    <div style={card}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
        <div style={{ width:36,height:36,borderRadius:10,background:'rgba(99,102,241,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize:20,color:'#6366f1' }}>bar_chart</span>
        </div>
        <div><div style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' }}>Etapa 2</div><div style={{ fontSize:'0.95rem',fontWeight:800 }}>Impostos, Taxas & Lucratividade</div></div>
      </div>
      <NumField label="Impostos" value={s.impostos} onChange={v=>set({impostos:v})} prefix="" suffix="%" />
      <NumField label="Taxa Cartão de Crédito" value={s.taxaCartao} onChange={v=>set({taxaCartao:v})} prefix="" suffix="%" />
      <NumField label="Desconto ao Paciente" value={s.descontoPaciente} onChange={v=>set({descontoPaciente:v})} prefix="" suffix="%" />
      <NumField label="Lucro da Clínica (%)" value={s.lucroClinica} onChange={v=>set({lucroClinica:v})} prefix="" suffix="%" />
      <NumField label="Lucro do Profissional Parceiro (%)" value={s.lucroParceiro} onChange={v=>set({lucroParceiro:v})} prefix="" suffix="%" />
      <div style={{ background:'var(--bg)',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12,border:'1px solid var(--border)' }}>
        <span style={{ fontSize:'0.82rem',fontWeight:600 }}>Base de Custo Total</span>
        <span style={{ fontSize:'1.05rem',fontWeight:900,color:'var(--primary)' }}>{fmt(r.baseCusto)}</span>
      </div>
    </div>
  );
}

export function Etapa3({ s, set }: Props) {
  const r = calc(s);
  const updateInsumo = (idx:number, field:'nome'|'valor', val:string|number) => {
    const nw = [...s.insumos];
    if (field==='nome') nw[idx] = { ...nw[idx], nome: val as string };
    else nw[idx] = { ...nw[idx], valor: typeof val==='string' ? parseFloat(val)||0 : val };
    set({ insumos: nw });
  };
  return (
    <div style={card}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
        <div style={{ width:36,height:36,borderRadius:10,background:'rgba(16,185,129,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize:20,color:'#10b981' }}>inventory_2</span>
        </div>
        <div><div style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' }}>Etapa 3</div><div style={{ fontSize:'0.95rem',fontWeight:800 }}>Insumos do Procedimento</div></div>
      </div>
      {s.insumos.map((ins,i) => (
        <div key={i} style={{ ...row, gap: 8 }}>
          <input value={ins.nome} onChange={e=>updateInsumo(i,'nome',e.target.value)} style={{ ...inp,textAlign:'left',flex:1 }} />
          <div style={{ display:'flex',alignItems:'center',gap:4,minWidth:130 }}>
            <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>R$</span>
            <input type="number" value={ins.valor||''} onChange={e=>updateInsumo(i,'valor',e.target.value)} style={{ ...inp,width:90 }} />
          </div>
        </div>
      ))}
      <div style={{ background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12 }}>
        <span style={{ fontSize:'0.78rem',fontWeight:800,color:'#10b981',display:'flex',alignItems:'center',gap:6 }}>▸ TOTAL INSUMOS</span>
        <span style={{ fontSize:'1.1rem',fontWeight:900,color:'#059669' }}>{fmt(r.totalInsumos)}</span>
      </div>
    </div>
  );
}

export function Etapa4({ s, set }: Props) {
  const r = calc(s);
  return (
    <div style={card}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
        <div style={{ width:36,height:36,borderRadius:10,background:'rgba(245,158,11,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize:20,color:'#f59e0b' }}>description</span>
        </div>
        <div><div style={{ fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' }}>Etapa 4</div><div style={{ fontSize:'0.95rem',fontWeight:800 }}>Dados do Protocolo</div></div>
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={lbl}>Nome do Protocolo</label>
        <input value={s.nome} onChange={e=>set({nome:e.target.value})} placeholder="Ex: Preenchimento" style={{ ...inp,textAlign:'left',width:'100%' }} />
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={lbl}>Duração</label>
        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
          <input type="number" value={s.duracaoHoras} min={0} onChange={e=>set({duracaoHoras:parseInt(e.target.value)||0})} style={{ ...inp,width:60 }} />
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>h</span>
          <input type="number" value={s.duracaoMinutos} min={0} max={59} onChange={e=>set({duracaoMinutos:parseInt(e.target.value)||0})} style={{ ...inp,width:60 }} />
          <span style={{ fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)' }}>min</span>
        </div>
      </div>
      <div style={{ ...row, borderBottom:'none' }}>
        <span style={{ fontSize:'0.82rem',fontWeight:600 }}>Hora Maca (calculada)</span>
        <span style={{ fontWeight:800 }}>{fmt(r.horaMaca)}</span>
      </div>
      <div style={{ background:'linear-gradient(135deg,#fffbeb,#fef3c7)',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8 }}>
        <span style={{ fontSize:'0.78rem',fontWeight:800,color:'#f59e0b',display:'flex',alignItems:'center',gap:6 }}>▸ CUSTO HORA NO PROCEDIMENTO</span>
        <span style={{ fontSize:'1.1rem',fontWeight:900,color:'#d97706' }}>{fmt(r.custoHoraProcedimento)}</span>
      </div>
    </div>
  );
}
