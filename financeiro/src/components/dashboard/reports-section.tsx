'use client';
import { useState } from 'react';
import { LogEntry, fmt, cardS } from '@/hooks/useDashboard';
import DOMPurify from 'dompurify';

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface Props {
  totalRev:number; totalCost:number; balance:number;
  sortedProcs:[string,number][];
  filteredLogs:LogEntry[];
  showClearModal:boolean; setShowClearModal:(v:boolean)=>void;
  clearAll:()=>void;
  selectedMonth:number; selectedYear:number;
  monthlyEvolution:{month:string;rev:number;cost:number}[];
  margin:number;
  forecastData?:{prediction:string;confidence:string;analysis:string}|null;
}

export function ReportsSection({ totalRev, totalCost, balance, sortedProcs, filteredLogs, showClearModal, setShowClearModal, clearAll, selectedMonth, selectedYear, monthlyEvolution, margin, forecastData: initialForecast }:Props) {
  const [forecast, setForecast] = useState(initialForecast || null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const loadForecast = async () => {
    setForecastLoading(true);
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyEvolution, currentMonth: MONTHS[selectedMonth], currentYear: selectedYear, totalRev, totalCost, margin }),
      });
      const data = await res.json();
      if (data.success) setForecast(data.forecast);
    } catch { /* ignore */ }
    finally { setForecastLoading(false); }
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    const pink = [230, 0, 126] as [number, number, number];
    const monthName = MONTHS[selectedMonth];

    // Header
    doc.setFillColor(...pink);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('VIRTUOSA ESTÉTICA', 14, 18);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Relatório Financeiro — ${monthName} ${selectedYear}`, 14, 28);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 35);

    // Summary boxes
    let y = 50;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo do Mês', 14, y);
    y += 10;
    
    doc.setFontSize(10);
    const summaryData = [
      ['Receita Total', fmt(totalRev)],
      ['Custos Totais', fmt(totalCost)],
      ['Resultado Líquido', fmt(balance)],
      ['Margem de Lucro', margin.toFixed(1) + '%'],
      ['Total de Lançamentos', String(filteredLogs.length)],
    ];
    autoTable(doc, {
      startY: y, head: [['Indicador', 'Valor']], body: summaryData,
      theme: 'grid', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    });

    // Sales table
    const sales = filteredLogs.filter(l => l.type === 'sale');
    if (sales.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Vendas', 14, y);
      const salesRows = sales.map(s => [
        s.date ? new Date(s.date).toLocaleDateString('pt-BR') : '',
        s.name, fmt(s.value), s.unit || '', s.payment || '',
      ]);
      autoTable(doc, {
        startY: y + 5, head: [['Data', 'Cliente', 'Valor', 'Unidade', 'Pagamento']], body: salesRows,
        theme: 'striped', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { halign: 'right' } },
      });
    }

    // Costs table
    const costs = filteredLogs.filter(l => l.type === 'cost');
    if (costs.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 15;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Custos', 14, y);
      const costRows = costs.map(c => [
        c.date ? new Date(c.date).toLocaleDateString('pt-BR') : '',
        c.name, fmt(c.value), c.category || '', c.unit || '',
      ]);
      autoTable(doc, {
        startY: y + 5, head: [['Data', 'Descrição', 'Valor', 'Categoria', 'Unidade']], body: costRows,
        theme: 'striped', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { halign: 'right' } },
      });
    }

    // Top procedures
    if (sortedProcs.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 15;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Top Procedimentos', 14, y);
      const procRows = sortedProcs.slice(0, 10).map(([name, val], i) => [
        String(i + 1), name, fmt(val),
      ]);
      autoTable(doc, {
        startY: y + 5, head: [['#', 'Procedimento', 'Faturamento']], body: procRows,
        theme: 'striped', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 2: { halign: 'right' } },
      });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Virtuosa Estética — Relatório Confidencial — Página ${i}/${pageCount}`, 105, 290, { align: 'center' });
    }

    doc.save(`virtuosa_relatorio_${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.pdf`);
  };

  const exportCSV = () => {
    const sales = filteredLogs.filter(l => l.type === 'sale');
    const costs = filteredLogs.filter(l => l.type === 'cost');

    let csv = '\uFEFF'; // BOM for Excel
    csv += 'RELATÓRIO FINANCEIRO - VIRTUOSA ESTÉTICA\n\n';
    
    // Sales
    csv += 'VENDAS\n';
    csv += 'Data;Nome;Valor;Unidade;Pagamento;Observação\n';
    sales.forEach(s => {
      const date = s.date ? new Date(s.date).toLocaleDateString('pt-BR') : '';
      csv += `${date};${s.name};${s.value.toFixed(2).replace('.',',')};${s.unit || ''};${s.payment || ''};${(s.obs || '').replace(/;/g, ' ')}\n`;
    });
    csv += `\nTotal Vendas:;${totalRev.toFixed(2).replace('.',',')}\n\n`;
    
    // Costs
    csv += 'CUSTOS\n';
    csv += 'Data;Nome;Valor;Categoria;Unidade;Observação\n';
    costs.forEach(c => {
      const date = c.date ? new Date(c.date).toLocaleDateString('pt-BR') : '';
      csv += `${date};${c.name};${c.value.toFixed(2).replace('.',',')};${c.category || ''};${c.unit || ''};${(c.obs || '').replace(/;/g, ' ')}\n`;
    });
    csv += `\nTotal Custos:;${totalCost.toFixed(2).replace('.',',')}\n\n`;
    
    // Summary
    csv += 'RESUMO\n';
    csv += `Receita Total:;${totalRev.toFixed(2).replace('.',',')}\n`;
    csv += `Custos Totais:;${totalCost.toFixed(2).replace('.',',')}\n`;
    csv += `Resultado Líquido:;${balance.toFixed(2).replace('.',',')}\n`;
    csv += `Total Lançamentos:;${filteredLogs.length}\n\n`;
    
    // Top procedures
    csv += 'TOP PROCEDIMENTOS\n';
    csv += 'Procedimento;Faturamento;Vendas\n';
    sortedProcs.forEach(([name, val]) => {
      const count = sales.filter(l => l.name === name).length;
      csv += `${name};${val.toFixed(2).replace('.',',')};${count}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    link.download = `virtuosa_relatorio_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header \u2014 mobile-first */}
      <div style={{textAlign:'center',marginBottom:20}}>
        <h2 style={{fontSize:'1.2rem',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <span className="material-symbols-outlined" style={{color:'var(--primary)',fontSize:22}}>monitoring</span>
          Relat\u00f3rios & An\u00e1lise
        </h2>
        <p style={{color:'var(--text-muted)',fontSize:'0.82rem',margin:'4px 0 0'}}>Vis\u00e3o detalhada do desempenho financeiro.</p>
      </div>

      {/* Export buttons \u2014 grid 2 colunas em mobile */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
        <button onClick={exportCSV} style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'13px 10px',borderRadius:12,
          border:'none',background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',
          fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',
          boxShadow:'0 4px 12px rgba(16,185,129,0.25)',minHeight:48,
        }}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>table_view</span>
          Exportar CSV
        </button>
        <button onClick={exportPDF} style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'13px 10px',borderRadius:12,
          border:'none',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',
          fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',
          boxShadow:'0 4px 12px rgba(239,68,68,0.25)',minHeight:48,
        }}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>picture_as_pdf</span>
          Exportar PDF
        </button>
        <button onClick={loadForecast} disabled={forecastLoading} style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:7,padding:'13px 10px',borderRadius:12,
          border:'none',background:'linear-gradient(135deg,#6366f1,#4f46e5)',color:'#fff',
          fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',
          boxShadow:'0 4px 12px rgba(99,102,241,0.25)',
          opacity:forecastLoading?0.7:1,gridColumn:'1/-1',minHeight:48,
        }}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>{forecastLoading?'progress_activity':'auto_awesome'}</span>
          {forecastLoading ? 'Analisando...' : '\uD83D\uDD2E Previs\u00e3o IA'}
        </button>
      </div>

      {/* AI Forecast \u2014 cards full-width no mobile */}
      {forecast && (
        <div style={{...cardS,marginBottom:20,border:'1px solid rgba(99,102,241,0.15)',background:'rgba(99,102,241,0.03)',padding:'16px 14px'}}>
          <h2 style={{margin:'0 0 12px',fontSize:'0.95rem',fontWeight:900,display:'flex',alignItems:'center',gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#6366f1',fontSize:18}}>auto_awesome</span>
            Previs\u00e3o de Faturamento (IA)
          </h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:12}}>
            <div style={{padding:'12px',borderRadius:12,background:'rgba(99,102,241,0.06)'}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.4px'}}>Pr\u00f3ximo M\u00eas</div>
              <div style={{fontSize:'1.2rem',fontWeight:900,color:'#6366f1'}}>{forecast.prediction}</div>
            </div>
            <div style={{padding:'12px',borderRadius:12,background:'rgba(16,185,129,0.06)'}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.4px'}}>Confian\u00e7a</div>
              <div style={{fontSize:'1.2rem',fontWeight:900,color:'#10b981'}}>{forecast.confidence}</div>
            </div>
          </div>
          <div style={{fontSize:'0.83rem',color:'var(--text-main)',lineHeight:1.6}} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(forecast.analysis.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>'))}} />
        </div>
      )}

      {/* KPI Stats \u2014 minmax menor para caber 2 colunas em mobile */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:20}}>
        {[
          {label:'Receita Total',value:fmt(totalRev),icon:'trending_up',color:'#00c853'},
          {label:'Custos Totais',value:fmt(totalCost),icon:'trending_down',color:'var(--primary)'},
          {label:'Resultado L\u00edquido',value:fmt(balance),icon:'account_balance',color:'#2196f3'},
          {label:'Total de Lan\u00e7amentos',value:String(filteredLogs.length),icon:'receipt_long',color:'#ff9800'},
        ].map((s,i)=>(
          <div key={i} style={{...cardS,padding:'14px 12px'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span className="material-symbols-outlined" style={{fontSize:22,color:s.color,background:`${s.color}15`,borderRadius:10,padding:7,flexShrink:0}}>{s.icon}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.3px'}}>{s.label}</div>
                <div style={{fontSize:'1.1rem',fontWeight:900,color:s.color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Procedimentos */}
      <div style={{...cardS,padding:'16px 14px',marginBottom:16}}>
        <h2 style={{margin:'0 0 14px',fontSize:'0.95rem',fontWeight:900,display:'flex',alignItems:'center',gap:8}}>
          <span className="material-symbols-outlined" style={{color:'var(--primary)',fontSize:20}}>emoji_events</span>
          Top Procedimentos
        </h2>
        {sortedProcs.length===0
          ? <p style={{textAlign:'center',color:'var(--text-muted)',padding:20,fontSize:'0.85rem'}}>Nenhum dado dispon\u00edvel.</p>
          : sortedProcs.slice(0,8).map(([name,val],i)=>{
            const maxVal=sortedProcs[0][1]; const perc=(val/maxVal)*100; const count=filteredLogs.filter(l=>l.type==='sale'&&l.name===name).length;
            return (
              <div key={name} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <span style={{width:26,height:26,borderRadius:8,background:'rgba(230,0,126,0.08)',color:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'0.78rem',flexShrink:0}}>{i+1}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
                  <div style={{height:4,background:'var(--border)',borderRadius:4,marginTop:4}}>
                    <div style={{height:'100%',width:perc+'%',background:'linear-gradient(90deg,var(--primary),#ff4db1)',borderRadius:4}}/>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontWeight:800,fontSize:'0.85rem'}}>{fmt(val)}</div>
                  <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{count} venda{count>1?'s':''}</div>
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Danger Zone \u2014 empilhado em mobile */}
      <div style={{padding:'16px 14px',borderRadius:16,border:'2px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.03)',display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
          <span className="material-symbols-outlined" style={{color:'#ef4444',fontSize:24,flexShrink:0}}>warning</span>
          <div>
            <strong style={{color:'#c62828',fontSize:'0.9rem'}}>Zona de Perigo</strong>
            <p style={{color:'var(--text-muted)',fontSize:'0.8rem',margin:'3px 0 0'}}>Apaga permanentemente todos os dados do sistema.</p>
          </div>
        </div>
        <button onClick={()=>setShowClearModal(true)} style={{padding:'12px 16px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:'0.85rem',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:6,minHeight:46}}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>delete_forever</span>
          Limpar Todos os Dados
        </button>
      </div>

      {/* Clear Modal */}
      {showClearModal&&(
        <div onClick={()=>setShowClearModal(false)} style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--card-bg)',borderRadius:20,padding:28,maxWidth:420,width:'100%',textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <span className="material-symbols-outlined" style={{fontSize:48,color:'#e53935',display:'block',marginBottom:10}}>warning</span>
            <h3 style={{margin:'0 0 8px',fontSize:'1.2rem',color:'#c62828'}}>Resetar Todos os Dados?</h3>
            <p style={{margin:'0 0 20px',color:'var(--text-muted)',fontSize:'0.87rem'}}>Esta a\u00e7\u00e3o \u00e9 <strong>irrevers\u00edvel</strong>.</p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <button onClick={clearAll} style={{padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#e53935,#c62828)',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit',minHeight:48}}>🗑️ Confirmar Reset</button>
              <button onClick={()=>setShowClearModal(false)} style={{padding:'12px',borderRadius:12,border:'1px solid var(--border)',background:'var(--card-bg)',color:'var(--text-muted)',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'}}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
