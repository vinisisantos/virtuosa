'use client';

import { useRef, useState, type ReactNode } from 'react';
import { getCatMeta } from '@/components/category-selector';
import type { CostRecurrence } from '@/lib/cost-recurrence';
import type { DueDateShortcut } from '@/lib/cost-due-date-shortcuts';
import styles from './cost-expense-form.module.css';

// Collapsed grid shows 7 categories + "Mais" on desktop; CSS hides the last two on phones (5 + "Mais").
const COLLAPSED_COUNT = 7;
const MOBILE_COLLAPSED_COUNT = 5;

function collapsedCategories(categories: string[], selected: string) {
  const index = categories.indexOf(selected);
  if (index < MOBILE_COLLAPSED_COUNT) return categories.slice(0, COLLAPSED_COUNT);
  // Keep the selected category inside the slots that stay visible on phones.
  const others = categories.filter(category => category !== selected);
  return [...others.slice(0, MOBILE_COLLAPSED_COUNT - 1), selected, ...others.slice(MOBILE_COLLAPSED_COUNT - 1, COLLAPSED_COUNT - 1)];
}

export function CostCategoryGrid({ value, categories, onChange, onCreateCategory }: {
  value: string;
  categories: string[];
  onChange: (category: string) => void;
  onCreateCategory: (category: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const newCategoryRef = useRef<HTMLInputElement>(null);
  const hasHiddenCategories = categories.length > COLLAPSED_COUNT;
  const visible = expanded || !hasHiddenCategories ? categories : collapsedCategories(categories, value);

  const startCreating = () => {
    setCreating(true);
    requestAnimationFrame(() => newCategoryRef.current?.focus());
  };

  const createCategory = () => {
    const category = newCategory.trim().replace(/\s+/g, ' ');
    if (!category) return;
    const existing = categories.find(item => item.toLocaleLowerCase('pt-BR') === category.toLocaleLowerCase('pt-BR'));
    if (!existing) onCreateCategory(category);
    onChange(existing || category);
    setNewCategory('');
    setCreating(false);
  };

  return <div>
    <div className={styles.categoryGrid} role="radiogroup" aria-label="Categoria" data-expanded={expanded || !hasHiddenCategories}>
      {visible.map((category, index) => {
        const meta = getCatMeta(category);
        const selected = category === value;
        return <button
          key={category}
          type="button"
          role="radio"
          aria-checked={selected}
          className={styles.categoryTile}
          data-mobile-extra={index >= MOBILE_COLLAPSED_COUNT || undefined}
          onClick={() => onChange(category)}
        >
          <span className={`material-symbols-outlined ${styles.categoryIcon}`} style={{ color: meta.color, background: `${meta.color}1f` }} aria-hidden="true">{meta.icon}</span>
          <span className={styles.categoryLabel}>{category}</span>
        </button>;
      })}
      {expanded && !creating && <button type="button" className={styles.categoryTile} onClick={startCreating}>
        <span className={`material-symbols-outlined ${styles.categoryIcon}`} aria-hidden="true">add</span>
        <span className={styles.categoryLabel}>Nova</span>
      </button>}
      {hasHiddenCategories && <button type="button" className={styles.categoryTile} aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setCreating(false); }}>
        <span className={`material-symbols-outlined ${styles.categoryIcon}`} aria-hidden="true">{expanded ? 'expand_less' : 'grid_view'}</span>
        <span className={styles.categoryLabel}>{expanded ? 'Menos' : 'Mais'}</span>
      </button>}
      {!hasHiddenCategories && !creating && <button type="button" className={styles.categoryTile} onClick={startCreating}>
        <span className={`material-symbols-outlined ${styles.categoryIcon}`} aria-hidden="true">add</span>
        <span className={styles.categoryLabel}>Nova</span>
      </button>}
    </div>
    {creating && <div className={styles.newCategory}>
      <input
        ref={newCategoryRef}
        type="text"
        value={newCategory}
        maxLength={40}
        aria-label="Nome da nova categoria"
        placeholder="Ex: Manutenção"
        onChange={event => setNewCategory(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); createCategory(); }
          if (event.key === 'Escape') setCreating(false);
        }}
      />
      <button type="button" onClick={createCategory} disabled={!newCategory.trim()}>Criar</button>
      <button type="button" onClick={() => setCreating(false)} aria-label="Cancelar nova categoria">
        <span className="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>}
  </div>;
}

export function DueDateShortcuts({ shortcuts, value, onChange }: {
  shortcuts: DueDateShortcut[];
  value: string;
  onChange: (date: string) => void;
}) {
  return <div className={styles.chips} aria-label="Atalhos de vencimento">
    {shortcuts.map(shortcut => <button
      key={shortcut.date}
      type="button"
      aria-pressed={shortcut.date === value}
      onClick={() => onChange(shortcut.date)}
    >{shortcut.label}</button>)}
  </div>;
}

const RECURRENCE_OPTIONS: { value: CostRecurrence; label: string }[] = [
  { value: 'once', label: 'Só esta vez' },
  { value: 'monthly', label: 'Todo mês' },
  { value: 'weekly', label: 'Toda semana' },
];

export function CostRecurrencePicker({ value, onChange }: {
  value: CostRecurrence;
  onChange: (recurrence: CostRecurrence) => void;
}) {
  return <div className={styles.segmented} role="radiogroup" aria-label="Recorrência">
    {RECURRENCE_OPTIONS.map(option => <button
      key={option.value}
      type="button"
      role="radio"
      aria-checked={value === option.value}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>;
}

export function CostFormMoreOptions({ open, summary, onToggle, children }: {
  open: boolean;
  summary: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return <div className={styles.moreOptions}>
    <button type="button" className={styles.moreOptionsToggle} aria-expanded={open} onClick={onToggle}>
      <span className="material-symbols-outlined" aria-hidden="true">tune</span>
      <span className={styles.moreOptionsLabel}>Mais opções<small>{summary}</small></span>
      <span className="material-symbols-outlined" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
    </button>
    {open && <div className={styles.moreOptionsBody}>{children}</div>}
  </div>;
}
