import type { Metadata } from 'next';
import Image from 'next/image';

import { EvaluationPageShell } from './evaluation-page-shell';
import { MetaPixel } from './meta-pixel';
import styles from './avaliacao.module.css';

export const metadata: Metadata = {
  title: 'Clínica Virtuosa Osasco — Avaliação gratuita',
  description: 'Rascunho visual da landing page de avaliação da Clínica Virtuosa Osasco.',
  robots: { index: false, follow: false, nocache: true },
};

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0 5.4 5.4 0 0 0 0 7.65l8.42 8.42 8.42-8.42a5.4 5.4 0 0 0 0-7.65z" />
    </svg>
  );
}

export default function EvaluationDraftPage() {
  return (
    <EvaluationPageShell>
      <div className={styles.page}>
        <MetaPixel />
        <header className={styles.header}>
          <Image
            className={styles.logo}
            src="/landing/virtuosa-logo.png"
            alt="Clínica Virtuosa"
            width={1320}
            height={1151}
            priority
          />
        </header>

        <div className={styles.container}>
          <section className={styles.hero} aria-labelledby="evaluation-title">
            <div className={styles.intro}>
              <span className={styles.kicker}>Estética avançada</span>
              <h1 className={styles.display} id="evaluation-title">
                <span className={styles.displayLine}>Sua avaliação</span>
                <span className={styles.displayLine}><span className={styles.accent}>gratuita</span> começa aqui.</span>
              </h1>
              <p className={styles.sub}>
                Na Clínica Virtuosa, cada tratamento começa por uma avaliação individual, feita com calma e sem compromisso. Deixe seu nome e telefone — nossa equipe entra em contato pelo WhatsApp para encontrar o melhor horário.
              </p>
            </div>

            <div className={styles.formColumn} id="formulario">
              <div className={styles.leadForm}>
                <h2 className={styles.formTitle}>Agende sua avaliação gratuita</h2>
                <p className={styles.formNote}><ClockIcon />Leva menos de 30 segundos</p>

                <form className={styles.form} aria-label="Formulário de avaliação — rascunho visual">
                  <div className={styles.field}>
                    <label htmlFor="evaluation-name">Nome</label>
                    <div className={styles.inputWrap}>
                      <PersonIcon />
                      <input
                        className={styles.input}
                        id="evaluation-name"
                        name="nome"
                        type="text"
                        autoComplete="name"
                        placeholder="Seu nome completo"
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="evaluation-phone">Telefone / WhatsApp</label>
                    <div className={styles.inputWrap}>
                      <MessageIcon />
                      <input
                        className={styles.input}
                        id="evaluation-phone"
                        name="telefone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="(11) 90000-0000"
                      />
                    </div>
                  </div>

                  <button
                    className={styles.submitButton}
                    type="button"
                    aria-disabled="true"
                    title="Rascunho visual — o envio ainda não está ativo"
                  >
                    <WhatsAppIcon />
                    <span>Quero minha avaliação gratuita</span>
                  </button>

                  <p className={styles.lgpd}>
                    Avaliação gratuita e sem compromisso. Ao enviar, você concorda em ser contatada pela Clínica Virtuosa. Seus dados são usados apenas para o agendamento, conforme a LGPD.
                  </p>
                </form>
              </div>
            </div>

            <div className={styles.extras}>
              <ul className={styles.marks}>
                <li><CheckIcon /><span>Avaliação gratuita e sem compromisso</span></li>
                <li><HeartIcon /><span>Atendimento personalizado, do primeiro contato ao resultado</span></li>
                <li><MessageIcon /><span>Retorno rápido pelo WhatsApp</span></li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </EvaluationPageShell>
  );
}
