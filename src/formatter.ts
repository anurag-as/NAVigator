const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatINR(amount: number): string {
  return inrFormatter.format(amount)
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

export function formatGainLoss(amount: number): string {
  const n = Object.is(amount, -0) ? 0 : amount
  return n > 0 ? `+${formatINR(n)}` : formatINR(n)
}
