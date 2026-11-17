import type { Metadata } from 'next';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { ProductPageShell } from './product-page-shell';
import {
  ALICE_POINTS,
  CONTACT_EMAIL,
  CONTACT_HREF,
  DEMO_CTA,
  MODULES,
  PAIN_POINTS,
  PIPELINE_PREVIEW,
  PRODUCT_NAME,
} from './product-content';
import styles from './produto.module.css';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — CRM e IA para clínicas de estética`,
  description: 'CRM, WhatsApp, agenda, contratos, financeiro e assistente de IA para clínicas de estética, em uso diário nas unidades da Clínica Virtuosa.',
  // Indexação fica desligada até o responsável decidir divulgar a página em buscadores.
  robots: { index: false, follow: false, nocache: true },
};

export default function ProductPage() {
  return (
    <ProductPageShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.wordmark}>
            <span className={styles.wordmarkDot} aria-hidden="true" />
            {PRODUCT_NAME}
          </span>
          <nav className={styles.navigation} aria-label="Navegação do produto">
            <a className={styles.modulesLink} href="#modulos">O sistema</a>
            <a className={styles.headerLink} href={CONTACT_HREF}>
              Fale conosco <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </nav>
        </header>

        <main className={styles.main}>
          <section className={styles.hero} aria-labelledby="product-title">
            <div className={styles.heroText}>
              <h1 id="product-title" className={styles.title}>Do WhatsApp ao financeiro da sua clínica.</h1>
              <p className={styles.lead}>
                Organize as conversas do WhatsApp, acompanhe os agendamentos e registre contratos e pagamentos.
                Recepção e gestão consultam as informações no mesmo sistema.
              </p>
              <p className={styles.productScope}>Gestão de contatos, atendimentos e rotina financeira para clínicas de estética.</p>
              <div className={styles.actions}>
                <a className={styles.primaryButton} href={CONTACT_HREF} aria-label={`${DEMO_CTA} por e-mail`}>
                  {DEMO_CTA} <ArrowUpRight size={18} aria-hidden="true" />
                </a>
                <a className={styles.secondaryButton} href="#modulos">
                  Ver módulos <ArrowRight size={17} aria-hidden="true" />
                </a>
              </div>
              <p className={styles.proof}>
                Em uso diário na <strong>Clínica Virtuosa</strong>.<br />
                São Bernardo do Campo e Osasco.
              </p>
            </div>

            <figure className={styles.preview} aria-label="Exemplo ilustrativo de um funil por unidade">
              <div className={styles.previewHeading}>
                <h2>Funil de atendimentos</h2>
                <span>SBC</span>
              </div>
              <ol className={styles.previewStages}>
                {PIPELINE_PREVIEW.map((column) => (
                  <li key={column.stage} className={styles.previewStage}>
                    <h3>{column.stage}</h3>
                    <ul>
                      {column.cards.map((card) => <li key={card}>{card}</li>)}
                    </ul>
                  </li>
                ))}
              </ol>
              <figcaption className={styles.previewCaption}>
                Exemplo ilustrativo, com dados de demonstração.
              </figcaption>
            </figure>
          </section>

          <section className={`${styles.section} ${styles.painSection}`} aria-labelledby="pain-title">
            <h2 id="pain-title" className={styles.sectionTitle}>O que trava a clínica hoje</h2>
            <ul className={styles.painList}>
              {PAIN_POINTS.map((item) => (
                <li key={item.title} className={styles.painItem}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="modulos" className={`${styles.section} ${styles.modulesSection}`} aria-labelledby="modules-title">
            <h2 id="modules-title" className={styles.sectionTitle}>Da recepção à gestão, no mesmo sistema</h2>
            <div className={styles.moduleGroups}>
              {['Na recepção', 'Na gestão'].map((group, groupIndex) => (
                <section key={group} className={styles.moduleGroup} aria-labelledby={`module-group-${groupIndex}`}>
                  <h3 id={`module-group-${groupIndex}`} className={styles.groupTitle}>{group}</h3>
                  <ul>
                    {MODULES.slice(groupIndex * 4, groupIndex * 4 + 4).map((item) => (
                      <li key={item.title} className={styles.moduleItem}>
                        <h4>{item.title}</h4>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>

          <section className={styles.alice} aria-labelledby="alice-title">
            <div className={styles.aliceInner}>
              <div>
                <h2 id="alice-title" className={styles.aliceTitle}>Alice ajuda a conduzir o atendimento.</h2>
                <p className={styles.aliceIntro}>
                  Uma assistente de IA no WhatsApp para responder dúvidas e entender o interesse de cada contato,
                  usando o conteúdo e o tom de atendimento da clínica.
                </p>
                <p className={styles.aliceAvailability}>
                  O modo automático está em piloto em São Bernardo do Campo. Consulte os modos disponíveis
                  para a sua clínica na demonstração.
                </p>
              </div>
              <ul className={styles.aliceList}>
                {ALICE_POINTS.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          </section>

          <section className={`${styles.section} ${styles.origin}`} aria-labelledby="origin-title">
            <h2 id="origin-title" className={styles.originTitle}>Nascido dentro <br />de uma clínica.</h2>
            <p>
              O {PRODUCT_NAME} foi criado e é usado todos os dias pela equipe da <strong>Clínica Virtuosa</strong>, em São Bernardo do
              Campo e Osasco. Cada módulo saiu de um problema real da operação. O próximo passo é levar o sistema para
              outras clínicas de estética.
            </p>
          </section>

          <section className={styles.cta} aria-labelledby="cta-title">
            <div>
              <h2 id="cta-title" className={styles.ctaTitle}>Comece por uma demonstração.</h2>
              <p>
                Escreva para a equipe com sua cidade, número de unidades e o que precisa organizar.
                Indique os módulos que gostaria de conhecer.
              </p>
              <p>
                Na conversa, consulte a disponibilidade dos recursos, a implantação, o suporte
                e as condições comerciais.
              </p>
            </div>
            <div className={styles.contactActions}>
              <a className={styles.primaryButton} href={CONTACT_HREF} aria-label={`${DEMO_CTA} por e-mail`}>
                {DEMO_CTA} <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <p className={styles.contactHint}>Abre seu aplicativo de e-mail.</p>
              <a className={styles.ctaEmail} href={CONTACT_HREF}>{CONTACT_EMAIL}</a>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <p>© 2026 {PRODUCT_NAME}. Desenvolvido pela Clínica Virtuosa.</p>
        </footer>
      </div>
    </ProductPageShell>
  );
}
