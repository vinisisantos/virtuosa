export function getInitialPayrollCompetence(now = new Date()) {
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  return currentMonth === 1
    ? { month: 12, year: currentYear - 1 }
    : { month: currentMonth - 1, year: currentYear };
}
