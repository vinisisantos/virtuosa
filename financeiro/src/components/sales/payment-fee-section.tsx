'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/toast';
import { adminCompactInputStyle as inputS, adminLabelStyle as labelS } from '@/components/admin/admin-styles';
import { formatCurrency as fmt } from '@/lib/currency';
import {
  calculatePaymentFee,
  normalizeInstallmentRates,
  PAYMENT_FEE_METHODS,
  PaymentFeeMethod,
  PaymentFeePayer,
} from '@/lib/payment-fees';

interface PaymentFeeConfig {
  id: string;
  name: string;
  method: PaymentFeeMethod;
  brand: string | null;
  unit: string;
  fixedFee: number;
  fixedRate: number;
  installmentRates: unknown;
  feePayer: PaymentFeePayer;
  isActive: boolean;
}

interface ConfigDraft {
  id: string | null;
  name: string;
  brand: string;
  fixedFee: string;
  fixedRate: string;
  feePayer: PaymentFeePayer;
  installmentRates: Record<string, string>;
}

interface PaymentFeeSectionProps {
  unit: string;
  baseAmount: number;
  paymentMethod: string;
  installments: number;
  selectedConfigId: string | null;
  onPaymentMethodChange: (method: string) => void;
  onInstallmentsChange: (installments: number) => void;
  onConfigChange: (configId: string | null) => void;
}

const METHOD_LABELS: Record<string, string> = {
  pix: '⚡ PIX',
  credito: '💳 Cartão de crédito',
  debito: '💳 Cartão de débito',
  dinheiro: '💵 Dinheiro',
  link: '🔗 Link de pagamento',
};

function emptyDraft(): ConfigDraft {
  return {
    id: null,
    name: '',
    brand: '',
    fixedFee: '0',
    fixedRate: '0',
    feePayer: 'clinic',
    installmentRates: {},
  };
}

function draftFromConfig(config: PaymentFeeConfig): ConfigDraft {
  const rates = normalizeInstallmentRates(config.installmentRates);
  return {
    id: config.id,
    name: config.name,
    brand: config.brand || '',
    fixedFee: String(config.fixedFee),
    fixedRate: String(config.fixedRate),
    feePayer: config.feePayer,
    installmentRates: Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, String(value)])),
  };
}

function configurationLabel(config: PaymentFeeConfig) {
  return [config.name, config.brand].filter(Boolean).join(' · ');
}

export function PaymentFeeSection({
  unit,
  baseAmount,
  paymentMethod,
  installments,
  selectedConfigId,
  onPaymentMethodChange,
  onInstallmentsChange,
  onConfigChange,
}: PaymentFeeSectionProps) {
  const [configurations, setConfigurations] = useState<PaymentFeeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft);
  const acceptsFeeConfig = PAYMENT_FEE_METHODS.includes(paymentMethod as PaymentFeeMethod);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    onConfigChange(null);
    fetch(`/api/payment-fee-configs?unit=${encodeURIComponent(unit)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Falha ao carregar taxas.');
        return response.json();
      })
      .then(data => setConfigurations(Array.isArray(data.configurations) ? data.configurations : []))
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          toast(error instanceof Error ? error.message : 'Falha ao carregar taxas.', 'error');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [unit, onConfigChange]);

  useEffect(() => {
    if (!acceptsFeeConfig) onConfigChange(null);
    if (paymentMethod === 'debito' && installments !== 1) onInstallmentsChange(1);
  }, [acceptsFeeConfig, installments, onConfigChange, onInstallmentsChange, paymentMethod]);

  const matchingConfigurations = useMemo(
    () => configurations.filter(config => config.method === paymentMethod),
    [configurations, paymentMethod],
  );
  const selectedConfig = configurations.find(config => config.id === selectedConfigId) || null;
  const selectedRates = normalizeInstallmentRates(selectedConfig?.installmentRates);
  const installmentRate = selectedConfig ? (selectedRates[String(installments)] ?? 0) : 0;
  const calculationResult = useMemo(() => {
    try {
      return {
        calculation: calculatePaymentFee({
          baseAmount,
          installments,
          fixedFee: selectedConfig?.fixedFee ?? 0,
          fixedRate: selectedConfig?.fixedRate ?? 0,
          installmentRate,
          feePayer: selectedConfig?.feePayer === 'client' ? 'client' : 'clinic',
        }),
        error: null,
      };
    } catch (error) {
      return {
        calculation: null,
        error: error instanceof Error ? error.message : 'Não foi possível calcular a taxa.',
      };
    }
  }, [baseAmount, installmentRate, installments, selectedConfig]);
  const calculation = calculationResult.calculation;

  const openNewConfiguration = () => {
    setDraft(emptyDraft());
    setShowConfigForm(true);
  };

  const openEditConfiguration = () => {
    if (!selectedConfig) return;
    setDraft(draftFromConfig(selectedConfig));
    setShowConfigForm(true);
  };

  const saveConfiguration = async () => {
    if (!acceptsFeeConfig) return;
    if (!draft.name.trim()) {
      toast('Informe o nome da operadora ou máquina.', 'error');
      return;
    }

    setSavingConfig(true);
    try {
      const response = await fetch('/api/payment-fee-configs', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}),
          unit,
          name: draft.name,
          method: paymentMethod,
          brand: draft.brand,
          fixedFee: Number(draft.fixedFee || 0),
          fixedRate: Number(draft.fixedRate || 0),
          feePayer: draft.feePayer,
          installmentRates: Object.fromEntries(
            Object.entries(draft.installmentRates).map(([key, value]) => [key, Number(value || 0)]),
          ),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar configuração.');

      const saved = data.configuration as PaymentFeeConfig;
      setConfigurations(current => {
        const withoutSaved = current.filter(config => config.id !== saved.id);
        return [...withoutSaved, saved].sort((a, b) => configurationLabel(a).localeCompare(configurationLabel(b), 'pt-BR'));
      });
      onConfigChange(saved.id);
      setShowConfigForm(false);
      toast(draft.id ? 'Configuração atualizada.' : 'Configuração salva e selecionada.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Falha ao salvar configuração.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const rateInstallments = paymentMethod === 'debito' ? [1] : Array.from({ length: 18 }, (_, index) => index + 1);
  const installmentSummary = calculation?.installmentValues || [];
  const installmentsAreEqual = installmentSummary.length <= 1
    || installmentSummary.every(value => value === installmentSummary[0]);

  return (
    <div className="payment-fee-section">
      <div className="payment-fee-heading">
        <div>
          <h3>Pagamento e taxas</h3>
          <p>Separe o desconto comercial do custo da operadora.</p>
        </div>
        {selectedConfig && (
          <button type="button" className="payment-fee-link" onClick={openEditConfiguration}>
            <span className="material-symbols-outlined">edit</span>
            Editar configuração
          </button>
        )}
      </div>

      <div className="payment-fee-fields">
        <div>
          <label style={labelS}>Forma de pagamento</label>
          <select
            value={paymentMethod}
            onChange={event => {
              const method = event.target.value;
              onPaymentMethodChange(method);
              onConfigChange(null);
              if (method !== 'credito' && method !== 'link') onInstallmentsChange(1);
            }}
            style={{ ...inputS, cursor: 'pointer' }}
          >
            {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {(paymentMethod === 'credito' || paymentMethod === 'link') && (
          <div>
            <label style={labelS}>Parcelas</label>
            <select value={installments} onChange={event => onInstallmentsChange(Number(event.target.value))} style={{ ...inputS, cursor: 'pointer' }}>
              {Array.from({ length: 18 }, (_, index) => index + 1).map(value => (
                <option key={value} value={value}>{value}x</option>
              ))}
            </select>
          </div>
        )}

        {acceptsFeeConfig && (
          <div className="payment-fee-config-field">
            <label style={labelS}>Operadora / máquina</label>
            <select
              value={selectedConfigId || ''}
              onChange={event => onConfigChange(event.target.value || null)}
              style={{ ...inputS, cursor: 'pointer' }}
              disabled={loading}
            >
              <option value="">{loading ? 'Carregando...' : 'Sem taxa configurada'}</option>
              {matchingConfigurations.map(config => (
                <option key={config.id} value={config.id}>{configurationLabel(config)}</option>
              ))}
            </select>
          </div>
        )}

        {acceptsFeeConfig && (
          <button type="button" className="payment-fee-new" onClick={openNewConfiguration}>
            <span className="material-symbols-outlined">add</span>
            Nova configuração
          </button>
        )}
      </div>

      {selectedConfig && (
        <div className="payment-fee-rule-summary">
          <span><strong>Taxa fixa:</strong> {fmt(selectedConfig.fixedFee)} + {selectedConfig.fixedRate.toLocaleString('pt-BR')}%</span>
          <span><strong>Taxa de {installments}x:</strong> {installmentRate.toLocaleString('pt-BR')}%</span>
          <span><strong>Responsável:</strong> {selectedConfig.feePayer === 'client' ? 'Paciente' : 'Clínica'}</span>
        </div>
      )}

      {calculationResult.error && baseAmount > 0 && (
        <div className="payment-fee-error">{calculationResult.error}</div>
      )}

      {calculation && baseAmount > 0 && (
        <div className="payment-fee-totals">
          <div><span>Venda após descontos</span><strong>{fmt(calculation.baseAmount)}</strong></div>
          <div><span>Taxa da operação</span><strong className="fee">− {fmt(calculation.feeAmount)}</strong></div>
          <div><span>Total cobrado</span><strong>{fmt(calculation.chargedAmount)}</strong></div>
          <div><span>Líquido da clínica</span><strong className="net">{fmt(calculation.netAmount)}</strong></div>
          <div className="payment-fee-installments">
            <span>{installments} {installments === 1 ? 'parcela' : 'parcelas'}</span>
            <strong>
              {installmentsAreEqual
                ? `${installments}x de ${fmt(installmentSummary[0] || 0)}`
                : `1ª de ${fmt(installmentSummary[0] || 0)} · demais de ${fmt(installmentSummary[1] || 0)}`}
            </strong>
          </div>
        </div>
      )}

      {showConfigForm && (
        <div className="payment-fee-editor">
          <div className="payment-fee-editor-header">
            <div>
              <h4>{draft.id ? 'Editar configuração' : 'Nova configuração'}</h4>
              <p>Os valores serão usados nas próximas vendas desta unidade.</p>
            </div>
            <button type="button" onClick={() => setShowConfigForm(false)} aria-label="Fechar configuração">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="payment-fee-editor-fields">
            <div>
              <label style={labelS}>Operadora / máquina *</label>
              <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} style={inputS} placeholder="Ex.: Stone, InfinitePay" />
            </div>
            <div>
              <label style={labelS}>Bandeira (opcional)</label>
              <input value={draft.brand} onChange={event => setDraft(current => ({ ...current, brand: event.target.value }))} style={inputS} placeholder="Ex.: Visa, Mastercard" />
            </div>
            <div>
              <label style={labelS}>Taxa fixa (R$)</label>
              <input type="number" min="0" step="0.01" value={draft.fixedFee} onChange={event => setDraft(current => ({ ...current, fixedFee: event.target.value }))} style={inputS} />
            </div>
            <div>
              <label style={labelS}>Taxa fixa (%)</label>
              <input type="number" min="0" max="99.99" step="0.01" value={draft.fixedRate} onChange={event => setDraft(current => ({ ...current, fixedRate: event.target.value }))} style={inputS} />
            </div>
            <div className="payment-fee-payer">
              <label style={labelS}>Quem absorve a taxa?</label>
              <div>
                <button type="button" className={draft.feePayer === 'clinic' ? 'active' : ''} onClick={() => setDraft(current => ({ ...current, feePayer: 'clinic' }))}>Clínica</button>
                <button type="button" className={draft.feePayer === 'client' ? 'active' : ''} onClick={() => setDraft(current => ({ ...current, feePayer: 'client' }))}>Repassar ao paciente</button>
              </div>
            </div>
          </div>

          <div className="payment-fee-rate-title">
            <strong>Taxa por parcelamento</strong>
            <span>Informe a taxa percentual cobrada nesta condição.</span>
          </div>
          <div className="payment-fee-rate-grid">
            {rateInstallments.map(value => (
              <label key={value}>
                <span>{paymentMethod === 'debito' ? 'Débito' : `${value}x`}</span>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="99.99"
                    step="0.01"
                    value={draft.installmentRates[String(value)] || ''}
                    onChange={event => setDraft(current => ({
                      ...current,
                      installmentRates: { ...current.installmentRates, [String(value)]: event.target.value },
                    }))}
                    placeholder="0,00"
                  />
                  <span>%</span>
                </div>
              </label>
            ))}
          </div>

          <div className="payment-fee-editor-actions">
            <button type="button" onClick={() => setShowConfigForm(false)}>Cancelar</button>
            <button type="button" className="primary" onClick={saveConfiguration} disabled={savingConfig}>
              {savingConfig ? 'Salvando...' : 'Salvar e usar'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .payment-fee-section { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .payment-fee-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .payment-fee-heading h3, .payment-fee-editor h4 { margin: 0; color: var(--text-main); font-size: 1rem; font-weight: 900; }
        .payment-fee-heading p, .payment-fee-editor p { margin: 4px 0 0; color: var(--text-muted); font-size: .76rem; }
        .payment-fee-link { border: 0; background: none; color: var(--primary); font: inherit; font-size: .76rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 4px; }
        .payment-fee-link :global(.material-symbols-outlined) { font-size: 16px; }
        .payment-fee-fields { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(100px, .55fr) minmax(190px, 1.2fr) auto; align-items: end; gap: 12px; }
        .payment-fee-config-field { min-width: 0; }
        .payment-fee-new { min-height: 42px; border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border)); border-radius: 10px; background: color-mix(in srgb, var(--primary) 7%, transparent); color: var(--primary); font: inherit; font-size: .76rem; font-weight: 800; cursor: pointer; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; }
        .payment-fee-new :global(.material-symbols-outlined) { font-size: 17px; }
        .payment-fee-rule-summary { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; color: var(--text-muted); font-size: .72rem; }
        .payment-fee-rule-summary strong { color: var(--text-main); }
        .payment-fee-error { margin-top: 12px; padding: 9px 11px; border: 1px solid rgba(239,68,68,.22); border-radius: 9px; background: rgba(239,68,68,.06); color: #ef4444; font-size: .72rem; font-weight: 700; }
        .payment-fee-totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
        .payment-fee-totals > div { background: var(--card-bg); border: 1px solid var(--border); border-radius: 11px; padding: 10px 12px; min-width: 0; }
        .payment-fee-totals span { display: block; color: var(--text-muted); font-size: .66rem; font-weight: 700; margin-bottom: 4px; }
        .payment-fee-totals strong { color: var(--text-main); font-size: .88rem; }
        .payment-fee-totals strong.fee { color: #ef4444; }
        .payment-fee-totals strong.net { color: #10b981; }
        .payment-fee-totals .payment-fee-installments { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .payment-fee-totals .payment-fee-installments span { margin: 0; }
        .payment-fee-editor { margin-top: 16px; border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border)); background: var(--card-bg); border-radius: 14px; padding: 16px; }
        .payment-fee-editor-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
        .payment-fee-editor-header > button { border: 0; background: none; color: var(--text-muted); cursor: pointer; padding: 2px; }
        .payment-fee-editor-header :global(.material-symbols-outlined) { font-size: 20px; }
        .payment-fee-editor-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .payment-fee-payer { grid-column: span 2; }
        .payment-fee-payer > div { display: grid; grid-template-columns: 1fr 1.4fr; gap: 5px; min-height: 42px; }
        .payment-fee-payer button { border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--text-muted); font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; padding: 0 8px; }
        .payment-fee-payer button.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); }
        .payment-fee-rate-title { display: flex; align-items: baseline; gap: 8px; margin: 16px 0 8px; }
        .payment-fee-rate-title strong { color: var(--text-main); font-size: .8rem; }
        .payment-fee-rate-title span { color: var(--text-muted); font-size: .68rem; }
        .payment-fee-rate-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px; }
        .payment-fee-rate-grid label > span { display: block; color: var(--text-muted); font-size: .66rem; font-weight: 700; margin: 0 0 4px 2px; }
        .payment-fee-rate-grid label > div { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); overflow: hidden; }
        .payment-fee-rate-grid input { width: 100%; min-width: 0; height: 38px; border: 0; outline: 0; background: transparent; color: var(--text-main); padding: 0 4px 0 9px; font: inherit; font-size: .76rem; font-weight: 700; }
        .payment-fee-rate-grid label > div > span { color: var(--text-muted); font-size: .7rem; padding-right: 8px; }
        .payment-fee-editor-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .payment-fee-editor-actions button { min-height: 40px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-main); font: inherit; font-size: .78rem; font-weight: 800; cursor: pointer; padding: 0 18px; }
        .payment-fee-editor-actions button.primary { border: 0; background: var(--primary); color: white; }
        .payment-fee-editor-actions button:disabled { opacity: .55; cursor: wait; }
        @media (max-width: 760px) {
          .payment-fee-section { padding: 15px; }
          .payment-fee-heading { align-items: stretch; flex-direction: column; }
          .payment-fee-link { align-self: flex-start; }
          .payment-fee-fields { grid-template-columns: 1fr 1fr; }
          .payment-fee-config-field, .payment-fee-new { grid-column: 1 / -1; }
          .payment-fee-totals { grid-template-columns: 1fr 1fr; }
          .payment-fee-editor-fields { grid-template-columns: 1fr 1fr; }
          .payment-fee-payer { grid-column: 1 / -1; }
          .payment-fee-rate-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 430px) {
          .payment-fee-fields, .payment-fee-totals, .payment-fee-editor-fields { grid-template-columns: 1fr; }
          .payment-fee-config-field, .payment-fee-new, .payment-fee-payer { grid-column: auto; }
          .payment-fee-totals .payment-fee-installments { grid-column: auto; align-items: flex-start; flex-direction: column; }
          .payment-fee-rate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .payment-fee-rate-title { align-items: flex-start; flex-direction: column; gap: 2px; }
          .payment-fee-payer > div { grid-template-columns: 1fr; }
          .payment-fee-payer button { min-height: 40px; }
          .payment-fee-editor-actions { display: grid; grid-template-columns: 1fr 1fr; }
          .payment-fee-editor-actions button { padding: 0 8px; }
        }
      `}</style>
    </div>
  );
}
