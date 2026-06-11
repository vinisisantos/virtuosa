fetch('http://localhost:3000/api/payroll/payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids: ['some-fake-id'] })
}).then(r => r.json()).then(console.log).catch(console.error);
