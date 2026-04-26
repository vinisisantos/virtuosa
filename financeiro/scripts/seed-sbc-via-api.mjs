// Quick script to seed SBC procedures via direct API call
// Usage: node scripts/seed-sbc-via-api.mjs

const BASE_URL = 'https://financeiro-blush-nine.vercel.app';

const procedures = [
  { name: "Heccus", price: 25.01, category: "Estética" },
  { name: "Lipo sem Corte (Sonofocus)", price: 22.65, category: "Estética" },
  { name: "Depilação Virilha Completa", price: 33.08, category: "Depilação" },
  { name: "Massagem Modeladora", price: 25.66, category: "Estética" },
  { name: "Carboxterapia", price: 25.99, category: "Estética" },
  { name: "Depilação Axilas", price: 18.25, category: "Depilação" },
  { name: "Drenagem Linfática", price: 56.33, category: "Estética" },
  { name: "Detox", price: 21.10, category: "Emagrecimento" },
  { name: "Crio Plats 01 região", price: 83.31, category: "Crio Plats" },
  { name: "Cellutec", price: 24.31, category: "Estética" },
  { name: "Depilação Perianal", price: 15.39, category: "Depilação" },
  { name: "Criofrequencia", price: 51.78, category: "Estética" },
  { name: "Enzimas TCC", price: 67.14, category: "Emagrecimento" },
  { name: "Enzimas E-10", price: 112.34, category: "Emagrecimento" },
  { name: "Depilação Buço", price: 14.81, category: "Depilação" },
  { name: "Corrente Russa", price: 27.51, category: "Estética" },
  { name: "Enzima Emagrecimento Ultra Detox", price: 105.38, category: "Emagrecimento" },
  { name: "Radio Frequência Corporal", price: 27.89, category: "Estética" },
  { name: "Lipo Cavitação", price: 25.40, category: "Estética" },
  { name: "Entrada de Pacote", price: 93.68, category: "Diversos" },
  { name: "Depilação Perna Inteira", price: 43.77, category: "Depilação" },
  { name: "Lipossomas", price: 87.95, category: "Estética" },
  { name: "Hyper Slim", price: 56.40, category: "Biomédico" },
  { name: "Lipo Turbinada", price: 64.71, category: "Estética" },
  { name: "Hidrolipo", price: 308.16, category: "Corporal" },
  { name: "Depilação Meia Perna", price: 37.55, category: "Depilação" },
  { name: "Magic Pump", price: 22.62, category: "Estética" },
  { name: "Secagem de vasinhos", price: 114.82, category: "Estética" },
  { name: "Endermoterapia", price: 21.07, category: "Estética" },
  { name: "MMI Emagrecimento", price: 111.94, category: "Emagrecimento" },
  { name: "Limpeza de Pele", price: 107.34, category: "Facial" },
  { name: "Drenagem local", price: 28.20, category: "Estética" },
  { name: "Radio Frequência Facial", price: 33.59, category: "Facial" },
  { name: "Nutracêutico - Chá Detox - 10 sachês", price: 11.31, category: "Produtos" },
  { name: "Criolipólise", price: 45.56, category: "Estética" },
  { name: "Velaryan gordura Localizada 30 min", price: 36.97, category: "Corporal" },
  { name: "Depilação Queixo", price: 15.17, category: "Depilação" },
  { name: "Depilação Rosto", price: 24.58, category: "Depilação" },
  { name: "Depilação Gluteos", price: 19.43, category: "Depilação" },
  { name: "Depilação Abdomen", price: 14.49, category: "Depilação" },
  { name: "Depilação Costas", price: 30.87, category: "Depilação" },
  { name: "Consulta Nutricionista", price: 114.13, category: "Consulta" },
  { name: "Enzima Ultra Detox", price: 141.25, category: "Emagrecimento" },
  { name: "Criofrequencia Facial", price: 61.32, category: "Facial" },
  { name: "Depilação Dedos dos pés", price: 9.79, category: "Laser" },
  { name: "Crio de Placas - KLD", price: 40.01, category: "Crio Plats" },
  { name: "Depilação Braço Inteiro", price: 22.45, category: "Depilação" },
  { name: "Gel Crio", price: 24.16, category: "Estética" },
  { name: "Fio Liso", price: 140.53, category: "Estética" },
  { name: "Ozônio retal", price: 48.32, category: "Estética" },
  { name: "Velaryan lipedema 40 min", price: 57.49, category: "Corporal" },
  { name: "Lipo Fast 2.0", price: 237.63, category: "Estética" },
  { name: "Linha Alba", price: 19.24, category: "Estética" },
  { name: "VELARYAN CELULITE (30 MINUTOS)", price: 53.69, category: "Biomédico" },
  { name: "Peeling Químico", price: 95.00, category: "Facial" },
  { name: "Laser Lavieen - Full Face", price: 145.28, category: "Biomédico" },
  { name: "Botox Dysport", price: 760.02, category: "Biomédico" },
  { name: "Nutracêutico - Detox Ultra - 60 cápsulas", price: 56.79, category: "Produtos" },
  { name: "Depilação Peito", price: 32.20, category: "Depilação" },
  { name: "Depilação dedo das mãos", price: 7.78, category: "Laser" },
  { name: "Spray Nicotinato de Metila - 200ml", price: 58.68, category: "Produtos" },
  { name: "Botox Face", price: 762.02, category: "Biomédico" },
  { name: "Monjifast", price: 508.05, category: "Emagrecimento" },
  { name: "Pós Lipo Fast", price: 77.09, category: "Protocolos Exclusivos" },
  { name: "Micro Agulhamento", price: 226.26, category: "Facial" },
  { name: "Ozônio Retal", price: 54.93, category: "Estética" },
  { name: "Bioestimulador Radiesse", price: 1213.23, category: "Biomédico" },
  { name: "Drenagem Pós Cirúrgico", price: 83.11, category: "Estética" },
  { name: "Depilação Virilha Cavada", price: 29.71, category: "Depilação" },
  { name: "Depilação Barba", price: 37.12, category: "Depilação" },
  { name: "Preenchimento Labial", price: 642.69, category: "Biomédico" },
  { name: "Carboxterapia Facial", price: 37.98, category: "Facial" },
  { name: "Infra", price: 17.15, category: "Estética" },
  { name: "Depilação Coxa Completa", price: 32.92, category: "Depilação" },
  { name: "Preenchimento Bigo chines", price: 672.97, category: "Biomédico" },
  { name: "Hidrolipo - PHD", price: 107.76, category: "Corporal" },
  { name: "Massagem Relaxante", price: 90.01, category: "Estética" },
  { name: "Infrared", price: 16.16, category: "Estética" },
  { name: "FlaciFast 2.0", price: 288.60, category: "Estética" },
  { name: "Depilação Pé", price: 8.63, category: "Laser" },
  { name: "Botox - Terço Superior", price: 646.79, category: "Biomédico" },
  { name: "Lipo de Papada", price: 242.92, category: "Estética" },
  { name: "Velaryan gordura localizada 20 min", price: 33.49, category: "Corporal" },
  { name: "Depilação Contorno Barba", price: 20.19, category: "Depilação" },
  { name: "Depilação Corpo todo", price: 85.58, category: "Depilação" },
  { name: "Depilação LOMBAR", price: 17.28, category: "Depilação" },
  { name: "Shot Crio Fast", price: 19.31, category: "Estética" },
  { name: "Bioestimulador", price: 1151.92, category: "Biomédico" },
  { name: "Skinboster", price: 358.89, category: "Biomédico" },
  { name: "Depilação Aureola", price: 12.35, category: "Laser" },
  { name: "Velaryan lipedema 20 min costas", price: 40.15, category: "Corporal" },
  { name: "Botox - Terço Superior 50 UI", price: 658.28, category: "Biomédico" },
  { name: "Peeling de Diamante", price: 47.98, category: "Corporal" },
  { name: "Drenagem Facial", price: 64.30, category: "Facial" },
  { name: "BIOESTIMULADOR DE COLAGENO", price: 1709.26, category: "Biomédico" },
  { name: "Botox Região", price: 326.18, category: "Biomédico" },
  { name: "Depilação Facial Feminino", price: 16.75, category: "Depilação" },
  { name: "Depilação Ante Braço", price: 27.87, category: "Depilação" },
  { name: "Bamboo Slim", price: 52.36, category: "Estética" },
  { name: "Café Solúvel", price: 86.69, category: "Estética" },
  { name: "Velaryan Gordura", price: 99.49, category: "Biomédico" },
  { name: "Chá MMI", price: 87.26, category: "Produtos" },
  { name: "Peeling Rose de Mer", price: 417.18, category: "Corporal" },
  { name: "Capsula MMI", price: 60.37, category: "Produtos" },
  { name: "LipoFast 2.0", price: 217.16, category: "Estética" },
  { name: "Capsula Crio Fast", price: 30.60, category: "Produtos" },
  { name: "Preenchimento Olheiras", price: 693.32, category: "Biomédico" },
  { name: "Preenchimento", price: 765.01, category: "Biomédico" },
  { name: "Bioestimulador Rennova", price: 1195.31, category: "Biomédico" },
  { name: "Pós LipoFast 2.0", price: 88.18, category: "Protocolos Exclusivos" },
  { name: "1 enzimas ozifast", price: 123.58, category: "Biomédico" },
  { name: "Ozônio Região", price: 42.68, category: "Estética" },
  { name: "Cha Crio Fast", price: 32.67, category: "Produtos" },
  { name: "Microfocado Full Face", price: 927.26, category: "Facial" },
  { name: "Chá LipoFast 2.0", price: 62.04, category: "Produtos" },
  { name: "Garrafa LipoFast 2.0", price: 36.34, category: "Produtos" },
  { name: "Velaryam", price: 42.57, category: "Corporal" },
  { name: "Bolsa MMI", price: 60.39, category: "Protocolos Exclusivos" },
  { name: "Laser Lavieen - Melasma", price: 175.99, category: "Biomédico" },
  { name: "Hidratação Facial", price: 59.46, category: "Facial" },
  { name: "Bumbum Fast", price: 168.60, category: "Protocolos Exclusivos" },
  { name: "Enzima para Celulite", price: 96.03, category: "Emagrecimento" },
  { name: "Microfocado Papada", price: 637.75, category: "Facial" },
  { name: "Capsula LipoFast 2.0", price: 91.72, category: "Produtos" },
  { name: "Fios de Sustentacao", price: 181.55, category: "Biomédico" },
  { name: "Necessaire Lipo Fast 2.0", price: 35.88, category: "Produtos" },
  { name: "Rennova Body Shape Gluteo - 1 Seringa", price: 925.36, category: "Biomédico" },
  { name: "Velaryan Celulite", price: 56.41, category: "Biomédico" },
  { name: "Hidratacao Fio de Seda", price: 87.37, category: "Estética" },
  { name: "Lipo Gesso", price: 65.99, category: "Estética" },
  { name: "Enzima - Detox Mary Iaczinski", price: 58.08, category: "Emagrecimento" },
  { name: "Depilação Costeleta", price: 21.59, category: "Laser" },
  { name: "Microfocado Abdômen", price: 1350.97, category: "Corporal" },
  { name: "Depilação Glabela", price: 5.72, category: "Laser" },
  { name: "Velaryan estimulo drenagem local 10 min", price: 84.45, category: "Corporal" },
  { name: "Sache colágeno Flacifast 2.0", price: 73.43, category: "Produtos" },
  { name: "Preenchimento - Mento", price: 810.26, category: "Biomédico" },
  { name: "Preenchimento Malar - 1 ml", price: 1010.95, category: "Biomédico" },
  { name: "Flacifast", price: 228.54, category: "Estética" },
  { name: "Glúteo Max", price: 1494.33, category: "Biomédico" },
  { name: "Depilação Ombro", price: 27.41, category: "Laser" },
  { name: "Necessaire Flacifast 2.0", price: 40.94, category: "Produtos" },
  { name: "Kit Lipo Force", price: 831.70, category: "Protocolos Exclusivos" },
  { name: "Copo Flacifast 2.0", price: 28.06, category: "Produtos" },
  { name: "Preenchimento Codigo de Barra - 1 ml", price: 672.36, category: "Biomédico" },
  { name: "MMI Definição", price: 102.83, category: "Protocolos Exclusivos" },
  { name: "Nicotinato de Metila - 500ml", price: 62.16, category: "Produtos" },
  { name: "Ácido Hialurônico - Flaci Fast 2.0", price: 57.76, category: "Protocolos Exclusivos" },
  { name: "Velaryan estimulo drenagem corpo todo 10 min costas", price: 45.00, category: "Corporal" },
  { name: "Lavieen Cicatriz", price: 154.90, category: "Biomédico" },
  { name: "Pump Gluteo", price: 1507.08, category: "Biomédico" },
  { name: "Velaryan Analgesia", price: 90.00, category: "Corporal" },
  { name: "Depilação Interno Coxa", price: 41.43, category: "Laser" },
  { name: "Limpeza de Pele - Acne e Pele Oleosa", price: 137.62, category: "Facial" },
  { name: "Garrafa Crio Fast", price: 43.35, category: "Produtos" },
  { name: "Cápsulas Flaci Fast", price: 58.20, category: "Protocolos Exclusivos" },
  { name: "CeluFast Turbinada", price: 87.18, category: "Protocolos Exclusivos" },
  { name: "Velaryan manutenção lipedema 20min", price: 28.54, category: "Corporal" },
  { name: "Mascara de Ouro", price: 62.74, category: "Facial" },
  { name: "Pison Tratamento Capilar", price: 175.00, category: "Biomédico" },
  { name: "Microfocado Interno de Coxa", price: 937.50, category: "Biomédico" },
  { name: "Pison Melasma", price: 162.38, category: "Biomédico" },
  { name: "Serum Col-Up Corporal - 200g", price: 55.96, category: "Produtos" },
  { name: "LIPO 3D ENGESSADA 2 ataduras", price: 74.68, category: "Estética" },
  { name: "Crio Fast III", price: 1528.91, category: "Estética" },
  { name: "Ácido Hialuronico - Conta gotas Flacifast 2.0", price: 71.21, category: "Produtos" },
  { name: "Laser Lavieen - Face Rejuvenescimento", price: 203.11, category: "Biomédico" },
  { name: "Microfocado Braços", price: 723.81, category: "Corporal" },
  { name: "Nutracêutico - Peptídeos de Colágeno - 15 sachês", price: 94.36, category: "Produtos" },
  { name: "Serum Facial Firm-Up - 30g", price: 121.37, category: "Produtos" },
  { name: "Secagem de vasinhos Promoção", price: 59.94, category: "Estética" },
  { name: "Lavieen Clareamento íntimo", price: 110.00, category: "Biomédico" },
  { name: "Nutracêutico - Ácido Hialurônico - 30 cápsulas", price: 60.50, category: "Produtos" },
  { name: "Fios Filler", price: 474.75, category: "Biomédico" },
  { name: "Serum Corporal Flaci Fast 180g", price: 58.67, category: "Produtos" },
  { name: "Cápsula Flacifast 2.0", price: 51.45, category: "Produtos" },
  { name: "Leite de Limpeza com Quinoa - 120ml", price: 41.03, category: "Produtos" },
  { name: "Ozi fast Contém 1 cápsula", price: 289.63, category: "Produtos" },
  { name: "Mascara Revitalizante", price: 55.28, category: "Facial" },
  { name: "Protocolo Mix Ultra - Mary Iaczinski", price: 540.30, category: "Protocolos Exclusivos" },
  { name: "Microfocado Pescoço", price: 695.59, category: "Facial" },
  { name: "Serum Antioleosidade Tea Tree - 30g", price: 83.65, category: "Produtos" },
  { name: "Pison Mancha Senil", price: 119.67, category: "Biomédico" },
  { name: "Creme Bumbum Fast", price: 162.00, category: "Protocolos Exclusivos" },
  { name: "Bioestimulador Nutriex", price: 899.93, category: "Biomédico" },
  { name: "Cápsula Bumbum Fast", price: 144.00, category: "Protocolos Exclusivos" },
  { name: "Laser Lavieen - Mãos", price: 200.00, category: "Biomédico" },
  { name: "Solúvel Chá Verde - Lipo Force", price: 180.00, category: "Protocolos Exclusivos" },
  { name: "Sabonete Facial Glicólico Tea Tree - 120ml", price: 93.60, category: "Produtos" },
  { name: "Luva massageadora - Bumbum Fast", price: 48.60, category: "Protocolos Exclusivos" },
  { name: "Bioestimulador Eleva", price: 1800.00, category: "Biomédico" },
  { name: "Laser Lavieen - Colo", price: 133.33, category: "Biomédico" },
  { name: "Garrafa Bumbum Fast", price: 35.10, category: "Protocolos Exclusivos" },
  { name: "Necessaire Crio Fast", price: 42.99, category: "Produtos" },
];

async function main() {
  console.log(`🔐 Logging in...`);
  
  // Login to get auth cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'viniciusn11@hotmaill.com', password: 'Vvini4518*' }),
  });
  
  if (!loginRes.ok) {
    console.error('❌ Login failed:', await loginRes.text());
    process.exit(1);
  }
  
  // Extract cookie from Set-Cookie header
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie?.split(';')[0] || '';
  console.log(`✅ Logged in! Cookie: ${cookie.substring(0, 30)}...`);
  
  // Add unit header for SBC
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': cookie,
    'x-unit': 'SBC',
  };
  
  console.log(`\n📦 Inserting ${procedures.length} procedures for SBC...`);
  
  // Call bulk API
  const bulkRes = await fetch(`${BASE_URL}/api/catalog/bulk`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      procedures: procedures.map(p => ({ ...p, unit: 'SBC' })),
      skipExisting: true,
    }),
  });
  
  if (!bulkRes.ok) {
    console.error('❌ Bulk insert failed:', await bulkRes.text());
    process.exit(1);
  }
  
  const result = await bulkRes.json();
  console.log(`\n✅ Resultado:`);
  console.log(`   Inseridos: ${result.inserted}`);
  console.log(`   Pulados (já existiam): ${result.skipped}`);
  console.log(`   Total enviados: ${result.total}`);
  if (result.errors?.length) {
    console.log(`   ⚠️ Erros: ${result.errors.join(', ')}`);
  }
}

main().catch(console.error);
