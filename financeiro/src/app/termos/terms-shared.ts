import type { CSSProperties, FocusEvent } from 'react';

/* ──────────── Types ──────────── */
export interface DocTemplate {
  id: number; name: string; type: string; content: string;
  fileName?: string;
  fileBase64?: string;
  backgroundPdf?: string;
  backgroundPdfName?: string;
  active: boolean; createdAt: string; updatedAt: string;
}
export interface GeneratedDoc {
  id: number; templateId: number; templateName: string;
  clientName: string; html: string; createdAt: string;
}

/* ──────────── Constants ──────────── */
export const STORAGE_TEMPLATES = 'virtuosa_doc_templates';
export const STORAGE_GENERATED = 'virtuosa_doc_generated';
export const DOC_TYPES = ['Contrato de prestação de serviço', 'Termo de consentimento', 'Termo de responsabilidade', 'Termo personalizado'];

export const EDITOR_FONTS = [
  // System fonts
  { name: 'Arial', family: 'Arial, sans-serif' },
  { name: 'Times New Roman', family: "'Times New Roman', serif" },
  { name: 'Courier New', family: "'Courier New', monospace" },
  { name: 'Georgia', family: 'Georgia, serif' },
  // Google Fonts - Sans-Serif
  { name: 'Inter', family: "'Inter', sans-serif" },
  { name: 'Roboto', family: "'Roboto', sans-serif" },
  { name: 'Open Sans', family: "'Open Sans', sans-serif" },
  { name: 'Lato', family: "'Lato', sans-serif" },
  { name: 'Montserrat', family: "'Montserrat', sans-serif" },
  { name: 'Poppins', family: "'Poppins', sans-serif" },
  { name: 'Nunito', family: "'Nunito', sans-serif" },
  { name: 'Noto Sans', family: "'Noto Sans', sans-serif" },
  { name: 'Raleway', family: "'Raleway', sans-serif" },
  { name: 'Oswald', family: "'Oswald', sans-serif" },
  { name: 'Ubuntu', family: "'Ubuntu', sans-serif" },
  { name: 'Quicksand', family: "'Quicksand', sans-serif" },
  { name: 'Cabin', family: "'Cabin', sans-serif" },
  { name: 'Source Sans 3', family: "'Source Sans 3', sans-serif" },
  // Google Fonts - Serif
  { name: 'Merriweather', family: "'Merriweather', serif" },
  { name: 'Playfair Display', family: "'Playfair Display', serif" },
  { name: 'PT Serif', family: "'PT Serif', serif" },
  { name: 'Crimson Text', family: "'Crimson Text', serif" },
  { name: 'EB Garamond', family: "'EB Garamond', serif" },
  { name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif" },
  // Google Fonts - Handwriting / Display
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Great Vibes', family: "'Great Vibes', cursive" },
];

export const VARIABLES: { key: string; label: string; group: string }[] = [
  { key: 'nome_completo', label: 'Nome Completo', group: 'Cliente' },
  { key: 'cpf', label: 'CPF', group: 'Cliente' },
  { key: 'rg', label: 'RG', group: 'Cliente' },
  { key: 'data_nascimento', label: 'Data de Nascimento', group: 'Cliente' },
  { key: 'telefone', label: 'Telefone', group: 'Cliente' },
  { key: 'email', label: 'E-mail', group: 'Cliente' },
  { key: 'endereco_completo', label: 'Endereço Completo', group: 'Cliente' },
  { key: 'sexo', label: 'Sexo', group: 'Cliente' },
  { key: 'estado_civil', label: 'Estado Civil', group: 'Cliente' },
  { key: 'profissao', label: 'Profissão', group: 'Cliente' },
  { key: 'data_hoje', label: 'Data de Hoje', group: 'Sistema' },
  { key: 'nome_clinica', label: 'Nome da Clínica', group: 'Clínica' },
  { key: 'endereco_clinica', label: 'Endereço da Clínica', group: 'Clínica' },
  { key: 'cidade_clinica', label: 'Cidade da Clínica', group: 'Clínica' },
  { key: 'cnpj_clinica', label: 'CNPJ da Clínica', group: 'Clínica' },
  { key: 'subtotal_venda', label: 'Subtotal da Venda', group: 'Venda' },
  { key: 'valor_desconto', label: 'Valor de Desconto', group: 'Venda' },
  { key: 'total_venda', label: 'Total da Venda', group: 'Venda' },
  { key: 'condicoes_pagamento', label: 'Condições de Pagamento', group: 'Venda' },
  { key: 'data_venda', label: 'Data da Venda', group: 'Venda' },
  { key: 'itens_da_venda', label: 'Itens da Venda', group: 'Tabelas' },
  { key: 'condicoes_pagamento_venda', label: 'Condições de Pagamento da Venda', group: 'Tabelas' },
  { key: 'conselho_profissional', label: 'Conselho do Profissional', group: 'Profissional' },
  { key: 'nome_responsavel', label: 'Nome do Responsável', group: 'Profissional' },
  { key: 'documento_responsavel', label: 'Documento do Responsável', group: 'Profissional' },
  { key: 'nome_profissional', label: 'Nome do Profissional', group: 'Profissional' },
];

export const TABLE_VARIABLES: Record<string, string> = {
  itens_da_venda: `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb"><th style="text-align:left;padding:10px 12px;font-weight:700">Item</th><th style="text-align:left;padding:10px 12px;font-weight:700">Quantidade</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor unitário (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor desconto unitário (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Total (R$)</th></tr></thead><tbody><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">Consulta</td><td style="padding:10px 12px">1</td><td style="padding:10px 12px">250,00</td><td style="padding:10px 12px">0,00</td><td style="padding:10px 12px">250,00</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">Atendimento</td><td style="padding:10px 12px">1</td><td style="padding:10px 12px">150,00</td><td style="padding:10px 12px">0,00</td><td style="padding:10px 12px">150,00</td></tr></tbody></table>`,
  condicoes_pagamento_venda: `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb"><th style="text-align:left;padding:10px 12px;font-weight:700">Parcela</th><th style="text-align:left;padding:10px 12px;font-weight:700">Método de pagamento</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Vencimento</th></tr></thead><tbody><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">1</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/07/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">2</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/08/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">3</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/09/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">4</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/10/2025</td></tr></tbody></table>`,
};

export const VAR_GROUPS = [...new Set(VARIABLES.map(v => v.group))];

/* ──────────── Unit Profiles ──────────── */
export const UNIT_PROFILES: Record<string, { nome_clinica: string; endereco_clinica: string; cidade_clinica: string; cnpj_clinica: string }> = {
  Barueri: {
    nome_clinica: 'Virtuosa Barueri',
    endereco_clinica: 'Av. Vinte e Seis de Março, 701 - Térreo - Centro, Barueri - SP, 06401-050',
    cidade_clinica: 'Barueri - SP',
    cnpj_clinica: '63.676.273/0001-70',
  },
  SBC: {
    nome_clinica: 'Virtuosa São Bernardo',
    endereco_clinica: 'Av. das Nações Unidas, 30 - Jardim do Mar, São Bernardo do Campo - SP, 09726-110',
    cidade_clinica: 'São Bernardo do Campo - SP',
    cnpj_clinica: '55.176.726/0001-71',
  },
  Osasco: {
    nome_clinica: 'Virtuosa Osasco',
    endereco_clinica: 'Rua Eloy Candido Lopes, 61 - Centro, Osasco - SP, 06010-130',
    cidade_clinica: 'Osasco - SP',
    cnpj_clinica: '51.590.266/0001-72',
  },
  SCS: {
    nome_clinica: 'Virtuosa São Caetano do Sul',
    endereco_clinica: 'Av. Vital Brasil Filho, 143 - Osvaldo Cruz, São Caetano do Sul - SP, 09541-130',
    cidade_clinica: 'São Caetano do Sul - SP',
    cnpj_clinica: '54.516.326/0001-52', // Using generic for template until real is provided
  },
};

/* ──────────── Default Contract Template ──────────── */
export const V = (key: string) => `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.06));color:#8b5cf6;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.85em;border:1px solid rgba(139,92,246,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:0 2px" data-var="${key}">{{${key}}}</span>`;

export const DEFAULT_CONTRACT_HTML = `
<div style="display:flex;align-items:center;border-left:4px solid #f472b6;padding-left:16px;margin-bottom:24px">
  <img src="\${DOCUMENT_BACKGROUND_URL}" alt="Virtuosa Clínica Estética" style="height:60px" />
</div>

<h2 style="text-align:center;margin-bottom:4px;font-family:Arial,sans-serif"><strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS – CONSULTA DE AVALIAÇÃO</strong></h2>
<hr style="border:none;border-top:2px solid #e5e7eb;margin:16px 0">

<p style="font-family:Arial,sans-serif">Pelo presente instrumento particular de contrato de prestação de serviços, de um lado:</p>

<p style="font-family:Arial,sans-serif"><strong>CONTRATANTE:</strong> \${V('nome_completo')}, \${V('estado_civil')}, \${V('profissao')}, portador(a) do CPF nº \${V('cpf')} e RG nº \${V('rg')}, residente e domiciliado(a) à \${V('endereco_completo')};</p>

<p style="font-family:Arial,sans-serif">E de outro lado:</p>

<p style="font-family:Arial,sans-serif"><strong>CONTRATADA:</strong> \${V('nome_clinica')}, inscrito(a) no CPF/CNPJ sob nº \${V('cnpj_clinica')}, com endereço à \${V('endereco_clinica')}, doravante denominado(a) <strong>PRESTADOR(A)</strong>,</p>

<p style="font-family:Arial,sans-serif">Celebram entre si o presente contrato de prestação de serviços, que será regido pelas cláusulas e condições seguintes:</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 1 – OBJETO DO CONTRATO</strong></h3>

<p style="font-family:Arial,sans-serif">O presente contrato tem por objeto a <strong>prestação de serviços clínicos estéticos</strong> pela <strong>CONTRATADA</strong> diretamente ao <strong>CONTRATANTE</strong>, de acordo com os prazos, preços e condições ajustados neste instrumento.</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 2 – VALOR E FORMA DE PAGAMENTO</strong></h3>

<p style="font-family:Arial,sans-serif">Os serviços e itens deste contrato, juntamente com seus respectivos valores, estão detalhados na tabela a seguir:</p>

<p style="font-family:Arial,sans-serif;margin-top:16px">Itens da venda</p>

\${V('itens_da_venda')}
\${TABLE_VARIABLES.itens_da_venda}

<p style="font-family:Arial,sans-serif">O pagamento será efetuado da seguinte forma, conforme acordado entre as partes:</p>

\${V('condicoes_pagamento_venda')}
\${TABLE_VARIABLES.condicoes_pagamento_venda}

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 3 – PRAZO PARA REALIZAÇÃO</strong></h3>

<p style="font-family:Arial,sans-serif">Os serviços contratados deverão ser realizados integralmente dentro do prazo máximo de <strong>180 (cento e oitenta) dias</strong> contados da data da assinatura deste instrumento.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro:</strong> Findo o prazo previsto no caput desta cláusula, a <strong>CONTRATADA</strong> não será obrigada a manter a continuidade da prestação dos serviços, visto que o tempo assinalado é plenamente suficiente para a execução dos procedimentos estéticos, inclusive com eventuais reagendamentos por parte do <strong>CONTRATANTE</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo:</strong> Caso a <strong>CONTRATADA</strong> realize qualquer procedimento após o prazo assinalado e sem a assinatura de novo instrumento contratual, tal ato será considerado de livre vontade, não caracterizando a conduta uma novação contratual ou renúncia a qualquer disposição constante deste contrato.</p>

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 4 – RESCISÃO</strong></h3>

<p style="font-family:Arial,sans-serif">Na hipótese de desistência por iniciativa do <strong>CONTRATANTE</strong>, este obriga-se a comunicar a <strong>CONTRATADA</strong> por escrito.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro – Direito de Arrependimento (Art. 49 do CDC)</strong><br>
O direito de arrependimento no prazo de 7 (sete) dias, com devolução integral dos valores pagos, somente será aplicável às contratações realizadas fora do estabelecimento comercial da <strong>CONTRATADA</strong>, tais como por telefone, internet ou outro meio remoto.<br>
Nas contratações realizadas <strong>presencialmente na clínica</strong>, não haverá direito de arrependimento previsto no art. 49 do CDC.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo – Cancelamento sem início das sessões</strong><br>
Na hipótese de desistência do <strong>CONTRATANTE</strong> em contrato firmado <strong>presencialmente</strong>, desde que nenhuma sessão tenha sido iniciada, será devida multa rescisória correspondente a <strong>10% (dez por cento) sobre o valor integral do contrato (sem desconto)</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Terceiro – Cancelamento após início das sessões</strong><br>
Na hipótese de desistência do <strong>CONTRATANTE</strong> durante a <strong>execução dos serviços contratados</strong>, será devido à <strong>CONTRATADA</strong>:</p>

<p style="font-family:Arial,sans-serif">I – o pagamento integral das sessões já realizadas, calculadas pelo <strong>valor unitário cheio de tabela</strong>, independentemente de desconto concedido no pacote;</p>

<p style="font-family:Arial,sans-serif">II – multa compensatória de <strong>10% (dez por cento) sobre o valor remanescente do contrato</strong> (saldo referente às sessões não utilizadas), considerando sempre o valor integral do pacote (sem desconto).</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quarto – Restituições, Comprovante e Condições Recíprocas</strong><br>
Os valores eventualmente já pagos pelo <strong>CONTRATANTE</strong> serão utilizados para abatimento das quantias devidas. Se houver saldo a favor da <strong>CONTRATADA</strong>, este deverá ser quitado pelo <strong>CONTRATANTE</strong> no ato do cancelamento. Se houver saldo a favor do <strong>CONTRATANTE</strong>, será restituído em até 30 (trinta) dias, <strong>exclusivamente pelo mesmo meio de pagamento original utilizado na contratação</strong>, ficando o prazo final de crédito sujeito às políticas da instituição financeira ou operadora de cartão.</p>

<p style="font-family:Arial,sans-serif">A <strong>CONTRATADA</strong> emitirá comprovante formal de cancelamento em até <strong>7 (sete) dias</strong> após a solicitação.</p>

<p style="font-family:Arial,sans-serif">Todas as condições previstas nesta cláusula aplicam-se também aos casos em que a rescisão seja realizada por iniciativa da <strong>CONTRATADA</strong>.</p>

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 5 – REAGENDAMENTO</strong></h3>

<p style="font-family:Arial,sans-serif">O <strong>CONTRATANTE</strong> deverá comparecer pontualmente nos horários previamente agendados, sob pena de prejudicar o andamento dos atendimentos subsequentes.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro</strong> – O reagendamento de sessões deverá ser solicitado com antecedência mínima de 12 (doze) horas, dentro do horário comercial da <strong>CONTRATADA</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo</strong> – O não comparecimento injustificado a qualquer sessão agendada implicará a dedução desta do saldo de sessões contratadas, não havendo direito à reposição.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Terceiro</strong> – O <strong>CONTRATANTE</strong> poderá remarcar, no máximo, 3 (três) atendimentos durante a vigência do contrato.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quarto</strong> – O atraso superior a 10 (dez) minutos poderá impossibilitar a realização do atendimento, a critério da <strong>CONTRATADA</strong>, em razão da agenda subsequente, sendo a sessão considerada como realizada.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quinto</strong> – No caso de sessões de cortesia oferecidas pela <strong>CONTRATADA</strong>, a ausência do <strong>CONTRATANTE</strong> no horário agendado implicará a perda automática da sessão, que será considerada como realizada.</p>

<hr style="border:none;border-top:2px solid #e5e7eb;margin:24px 0">

<div data-page-break="true" style="height:2px; width:100%; clear:both;"></div>
<p style="text-align:center;font-family:Arial,sans-serif">E por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, na presença de duas testemunhas.</p>

<p style="text-align:center;font-family:Arial,sans-serif">\${V('cidade_clinica')}, \${V('data_hoje')}</p>

<br><br>

<div style="display:flex;justify-content:space-around;margin-top:40px;font-family:Arial,sans-serif">
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #1a1a1a;padding-top:8px;font-weight:700">CONTRATANTE</div>
<div style="font-size:0.85em;color:#666;margin-top:4px">\${V('nome_completo')}</div>
<div style="font-size:0.8em;color:#888">CPF: \${V('cpf')}</div>
</div>
<div style="text-align:center;min-width:250px">
<div style="height:55px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-bottom:5px">
<div style="font-family:'Times New Roman', Times, serif; font-size:24px; font-style:italic; font-weight:bold; color:#1a1a1a; transform:rotate(-3deg); white-space:nowrap; opacity:0.85">\${V('nome_clinica')}</div>
<div style="font-size:7px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-top:2px;">Assinatura Digital Eletrônica</div>
</div>
<div style="border-top:1px solid #1a1a1a;padding-top:8px;font-weight:700">CONTRATADA</div>
<div style="font-size:0.85em;color:#666;margin-top:4px">\${V('nome_clinica')}</div>
<div style="font-size:0.8em;color:#888">CNPJ: \${V('cnpj_clinica')}</div>
</div>
</div>

<br><br>

<div style="display:flex;justify-content:space-around;margin-top:30px;font-family:Arial,sans-serif">
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #999;padding-top:8px;font-size:0.85em;color:#666">Testemunha 1</div>
<div style="font-size:0.8em;color:#888">Nome/CPF:</div>
</div>
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #999;padding-top:8px;font-size:0.85em;color:#666">Testemunha 2</div>
<div style="font-size:0.8em;color:#888">Nome/CPF:</div>
</div>
</div>
`;

/* ──────────── Styles ──────────── */
export const cardS: CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 18,
  padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};
export const inputS: CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid var(--border)',
  outline: 'none', fontSize: '0.88rem', background: 'var(--bg)', color: 'var(--text-main)',
  fontFamily: 'inherit', fontWeight: 600, transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
};
export const labelS: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
};
export const btnPrimary: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '14px 28px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: '0.9rem',
  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s', color: '#fff',
  background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
  boxShadow: '0 4px 15px rgba(230,0,126,0.25)',
};
export const focusIn = (e: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px rgba(230,0,126,0.1)';
};
export const focusOut = (e: FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none';
};
