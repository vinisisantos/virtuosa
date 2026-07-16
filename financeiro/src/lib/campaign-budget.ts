const DAY_MS = 24 * 60 * 60 * 1000

function dateKeyToUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

export function campaignBudgetPeriod(input: {
  dailyBudget: number
  startDate: string
  endDate?: string | null
  reportFrom?: string | null
  reportTo?: string | null
}) {
  const effectiveStart = [input.startDate, input.reportFrom].filter(Boolean).sort().at(-1)!
  const effectiveEnd = [input.endDate, input.reportTo || todayInSaoPaulo()].filter(Boolean).sort()[0]!
  if (!effectiveStart || !effectiveEnd || effectiveStart > effectiveEnd) {
    return { days: 0, estimatedSpend: 0 }
  }

  const days = Math.floor((dateKeyToUtc(effectiveEnd) - dateKeyToUtc(effectiveStart)) / DAY_MS) + 1
  return {
    days,
    estimatedSpend: Math.round(input.dailyBudget * days * 100) / 100,
  }
}

export function allocateSharedBudget(total: number, weightedKeys: Array<{ key: string; weight: number }>) {
  const allocation = new Map<string, number>()
  const totalWeight = weightedKeys.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
  if (total <= 0 || totalWeight <= 0) return allocation

  const positive = weightedKeys.filter(item => item.weight > 0)
  let allocated = 0
  positive.forEach((item, index) => {
    const value = index === positive.length - 1
      ? Math.round((total - allocated) * 100) / 100
      : Math.round((total * item.weight / totalWeight) * 100) / 100
    allocation.set(item.key, value)
    allocated += value
  })
  return allocation
}
