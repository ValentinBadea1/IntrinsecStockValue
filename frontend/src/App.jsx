import { useState, useEffect, useRef } from 'react'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

function App() {
  const formatNumber = (num) => {
    if (!num) return 'N/A'
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    return `$${num.toLocaleString()}`
  }

  const [ticker, setTicker] = useState('')
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [peHistory, setPeHistory] = useState([])
  const [dividendHistory, setDividendHistory] = useState([])
  const [fairValue, setFairValue] = useState(null)
  const [dcfParams, setDcfParams] = useState({
    growthRate: 8,
    futurePE: 15,
    discountRate: 10,
    reverseGrowthRate: 3,
    reverseDiscountRate: 10
  })
  const [gordonParams, setGordonParams] = useState({
    growthRate: 3,
    requiredReturn: 10
  })
   const [reverseDdmParams, setReverseDdmParams] = useState({
     dividend: 0,
     growthRate: 3
   })
       const [expectedReturnParams, setExpectedReturnParams] = useState({
        currentPe: 0,
        expectedEpsGrowth: 5,
        futurePe: 15,
        pe10YearAvg: 0
      })
  const [reverseDcfParams, setReverseDcfParams] = useState({
    fcfPerShare: 0,
    discountRate: 10,
    terminalGrowth: 3,
    horizon: 10,
    gImplied: 0
  })
  const [compareList, setCompareList] = useState([])
  const debounceTimer = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    const query = ticker.trim()
    if (query.length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      setActiveSuggestionIndex(-1)
      return
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggestions/${encodeURIComponent(query)}`)
        const data = await res.json()
        setSuggestions(data.suggestions || [])
        setShowSuggestions(true)
        setActiveSuggestionIndex(-1)
      } catch {
        setSuggestions([])
      }
    }, 200)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [ticker])

  const selectSuggestion = (suggestion) => {
    setTicker(suggestion.symbol)
    setSuggestions([])
    setShowSuggestions(false)
    setActiveSuggestionIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        break
      case 'Enter':
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
          e.preventDefault()
          const selected = suggestions[activeSuggestionIndex]
          selectSuggestion(selected)
          // Manually trigger search after selecting
          setTimeout(() => {
            const form = inputRef.current?.closest('form')
            if (form) form.dispatchEvent(new Event('submit', { cancelable: true }))
          }, 0)
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setActiveSuggestionIndex(-1)
        break
    }
  }

  const addToCompare = () => {
    if (!company) return
    if (compareList.find(c => c.ticker === company.ticker)) return
    setCompareList([...compareList, { ...company }])
  }

  const removeFromCompare = (ticker) => {
    setCompareList(compareList.filter(c => c.ticker !== ticker))
  }

  const epsData = peHistory.length > 0 ? {
    labels: peHistory.map(p => `20${p.year % 100}`),
    datasets: [
      {
        label: 'EPS',
        data: peHistory.map(p => p.eps),
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.1)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#34d399',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      },
      {
        label: 'FCF',
        data: peHistory.map(p => p.fcf !== null ? p.fcf : null),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#60a5fa',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }
    ]
  } : { labels: [], datasets: [] }

  const epsOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
      title: { display: true, text: 'EPS & FCF Evolution', color: '#94a3b8', font: { size: 14 } }
    },
    scales: {
      y: {
        grid: { color: '#334155' },
        ticks: { color: '#cbd5e1' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#cbd5e1' }
      }
    }
  }

  const calculateDCF = (eps, currentPrice) => {
    if (eps <= 0) return currentPrice
    const { growthRate, futurePE, discountRate } = dcfParams
    const futureEPS = eps * Math.pow(1 + growthRate / 100, 5)
    const futurePrice = futureEPS * futurePE
    const presentValue = futurePrice / Math.pow(1 + discountRate / 100, 5)
    return presentValue
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!ticker.trim()) {
      setError('Please enter a ticker symbol')
      return
    }

    setLoading(true)
    setError('')
    setCompany(null)
    setPeHistory([])
    setFairValue(null)

    try {
      const responses = await Promise.all([
        fetch(`/api/search/${ticker.toUpperCase()}`),
        fetch(`/api/pe-history/${ticker.toUpperCase()}`),
        fetch(`/api/fair-value/${ticker.toUpperCase()}`),
        fetch(`/api/dividend-history/${ticker.toUpperCase()}`)
      ])

      if (!responses[0].ok) {
        const errData = await responses[0].json()
        throw new Error(errData.message || 'Company not found')
      }

      const [companyData, peData, fvData, dividendData] = await Promise.all(responses.map(r => r.json()))

      setCompany({ ...companyData, dgr10: dividendData.dgr10, dgr5: dividendData.dgr5, dgr3: dividendData.dgr3 })
      
      if (companyData) {
        setReverseDdmParams({
          currentPrice: companyData.price || 0,
          dividend: companyData.dividend || 0,
          expectedReturn: reverseDdmParams.expectedReturn
        })
        setExpectedReturnParams({
          currentPrice: companyData.price || 0,
          dividendYield: companyData.dividendYield || 0,
          currentPe: (peData.pe_history && peData.pe_history.length > 0) ? peData.pe_history[0].pe : companyData.peCurrent,
          expectedEpsGrowth: expectedReturnParams.expectedEpsGrowth,
          futurePe: (peData.pe_history && peData.pe_history.length > 0) ? peData.pe_history[0].pe : 20,
          pe10YearAvg: (peData.pe_history && peData.pe_history.length > 0) 
            ? parseFloat((peData.pe_history.reduce((sum, item) => sum + item.pe, 0) / peData.pe_history.length).toFixed(2))
            : 0
        })
        setReverseDcfParams({
          fcfPerShare: companyData.freeCashFlowPerShare || 0,
          discountRate: reverseDcfParams.discountRate,
          terminalGrowth: reverseDcfParams.terminalGrowth,
          horizon: reverseDcfParams.horizon,
          gImplied: 0
        })
      }
      const reversedPeHistory = (peData.pe_history || []).slice().reverse()
      setPeHistory(reversedPeHistory.slice(0, 10))
      setDividendHistory(dividendData.dividend_history || {})
      setFairValue(fvData)
      
      if (companyData.fcfPerShare && companyData.fcfPerShare > 0) {
        try {
          const dcfResponse = await fetch('/api/reverse-dcf/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fcfPerShare: companyData.fcfPerShare,
              discountRate: reverseDcfParams.discountRate,
              terminalGrowth: reverseDcfParams.terminalGrowth,
              horizon: reverseDcfParams.horizon,
              targetPrice: companyData.price
            })
          })
          const dcfData = await dcfResponse.json()
          if (dcfData.gImplied !== undefined) {
            setReverseDcfParams(prev => ({ ...prev, gImplied: dcfData.gImplied }))
          }
        } catch (err) {
          console.error('Reverse DCF calculation error:', err)
        }
      }

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const currentMetrics = [
    { label: 'Current Price', value: company ? `$${company.price.toFixed(2)}` : '-' },
    { label: 'Current PE', value: company ? company.peCurrent.toFixed(2) : '-' },
    { label: 'Dividend', value: company && company.dividend > 0 ? `$${company.dividend.toFixed(2)}` : 'N/A' },
    { label: 'Div Yield', value: company && company.dividendYield > 0 ? `${company.dividendYield.toFixed(2)}%` : 'N/A' },
    { label: 'EPS', value: company ? company.eps.toFixed(2) : '-' },
    { label: 'Market Cap', value: company ? formatNumber(company.marketCap) : '-' },
    { label: 'Beta', value: company ? company.beta.toFixed(2) : '-' },
    { label: 'Sector', value: company ? company.sector : '-' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            Fair Value Calculator
          </h1>
          <p className="text-slate-400 text-sm md:text-base">Search companies and calculate intrinsic value using multiple valuation models</p>
        </header>

        <form onSubmit={handleSearch} className="mb-6 md:mb-8 relative">
          <div className="flex gap-3 md:gap-4 flex-col md:flex-row">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Enter ticker (e.g., AAPL, MSFT, KO)"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 md:px-6 py-3 md:py-4 text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                disabled={loading}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden max-h-80 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <li
                      key={s.symbol}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectSuggestion(s)
                        // Trigger search after selection
                        const form = inputRef.current?.closest('form')
                        if (form) form.dispatchEvent(new Event('submit', { cancelable: true }))
                      }}
                      className={`px-4 py-3 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                        i === activeSuggestionIndex
                          ? 'bg-emerald-600/30 border-l-2 border-emerald-400'
                          : 'hover:bg-slate-700/70 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-bold text-emerald-400 text-sm whitespace-nowrap">{s.symbol}</span>
                        <span className="text-slate-300 text-sm truncate">{s.name}</span>
                      </div>
                      <span className="text-slate-500 text-xs whitespace-nowrap">{s.exchange}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white px-6 md:px-8 py-3 md:py-4 rounded-lg font-semibold transition-all transform hover:scale-105 active:scale-95 text-base md:text-lg"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {error && <p className="text-red-400 mt-3 text-center text-sm md:text-base">{error}</p>}
        </form>

        {company && (
          <>
            <div className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-1">
                  <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600">
                    <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2 md:gap-3">
                      <span className="text-2xl md:text-3xl">{company.ticker}</span>
                      <span className="truncate">{company.name}</span>
                      <button
                        onClick={addToCompare}
                        className="ml-auto text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg font-semibold transition-all"
                      >
                        + Add to Compare
                      </button>
                    </h2>
                    <div className="space-y-2 md:space-y-3 text-sm md:text-base">
                      <div className="flex justify-between py-2 border-b border-slate-600">
                        <span className="text-slate-400">Sector</span>
                        <span className="text-right">{company.sector}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-600">
                        <span className="text-slate-400">Industry</span>
                        <span className="text-right truncate">{company.industry}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-600">
                        <span className="text-slate-400">Beta</span>
                        <span className="text-right">{company.beta.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-1">
                  <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600">
                    <h2 className="text-xl md:text-2xl font-bold mb-4">Current Metrics</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                      {currentMetrics.map((metric, index) => (
                        <div key={index} className="p-3 md:p-4 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">{metric.label}</span>
                          <span className="text-lg md:text-xl font-bold text-emerald-400">{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            {compareList.length > 0 && (
              <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600">
                <h2 className="text-xl md:text-2xl font-bold mb-4">Compare Companies</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-3 px-4 text-slate-400">Metric</th>
                        {compareList.map(c => (
                          <th key={c.ticker} className="text-right py-3 px-4 text-slate-400">
                            {c.ticker}
                            <button
                              onClick={() => removeFromCompare(c.ticker)}
                              className="ml-2 text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Price', key: 'price', fmt: (v) => `$${v.toFixed(2)}` },
                        { label: 'PE', key: 'peCurrent', fmt: (v) => v.toFixed(2) },
                        { label: 'EPS', key: 'eps', fmt: (v) => v.toFixed(2) },
                        { label: 'Dividend', key: 'dividend', fmt: (v) => v > 0 ? `$${v.toFixed(2)}` : 'N/A' },
                        { label: 'Div Yield', key: 'dividendYield', fmt: (v) => v > 0 ? `${v.toFixed(2)}%` : 'N/A' },
                        { label: 'FCF/Share', key: 'freeCashFlowPerShare', fmt: (v) => v > 0 ? `$${v.toFixed(2)}` : 'N/A' },
                        { label: 'Market Cap', key: 'marketCap', fmt: (v) => formatNumber(v) },
                        { label: 'Beta', key: 'beta', fmt: (v) => v.toFixed(2) },
                        { label: 'DGR 10Y', key: 'dgr10', fmt: (v) => v != null ? `${v.toFixed(2)}%` : 'N/A' },
                        { label: 'DGR 5Y', key: 'dgr5', fmt: (v) => v != null ? `${v.toFixed(2)}%` : 'N/A' },
                        { label: 'DGR 3Y', key: 'dgr3', fmt: (v) => v != null ? `${v.toFixed(2)}%` : 'N/A' },
                      ].map(row => (
                        <tr key={row.key} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-300">{row.label}</td>
                          {compareList.map(c => (
                            <td key={c.ticker} className="py-3 px-4 text-right text-slate-300">
                              {row.fmt(c[row.key] != null ? c[row.key] : 0)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="w-full">
              <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600">
                <h2 className="text-xl md:text-2xl font-bold mb-4">PE History (5 Years)</h2>
                  {peHistory.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm md:text-base">
                          <thead>
                            <tr className="border-b border-slate-600">
                              <th className="text-left py-3 px-4 text-slate-400">Metric</th>
                              {peHistory.map((pe, index) => (
                                <th key={index} className="text-right py-3 px-4 text-slate-400">{pe.year}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-300">Avg Price</td>
                              {peHistory.map((pe, index) => (
                                <td key={index} className="py-3 px-4 text-right text-slate-300">${pe.avg_price.toFixed(2)}</td>
                              ))}
                            </tr>
                            <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-300">EPS</td>
                              {peHistory.map((pe, index) => (
                                <td key={index} className="py-3 px-4 text-right text-slate-300">{pe.eps.toFixed(2)}</td>
                              ))}
                            </tr>
                            <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-300">FCF</td>
                              {peHistory.map((pe, index) => (
                                <td key={index} className="py-3 px-4 text-right text-slate-300">{pe.fcf !== null ? `$${pe.fcf.toFixed(2)}` : 'N/A'}</td>
                              ))}
                            </tr>
                            <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-300">PE Ratio</td>
                              {peHistory.map((pe, index) => (
                                <td key={index} className="py-3 px-4 text-right font-semibold">{pe.pe.toFixed(2)}</td>
                              ))}
                            </tr>
                            <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-300">Change</td>
                              {peHistory.map((pe, index) => {
                                const prevPe = index > 0 ? peHistory[index - 1].pe : pe.pe
                                const change = prevPe > 0 ? ((pe.pe - prevPe) / prevPe) * 100: 0
                                return (
                                  <td key={index} className={`py-3 px-4 text-right ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                  </td>
                                )
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {Object.keys(dividendHistory).length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-3 text-center text-slate-300">Dividends Evolution (2010 - Present)</h3>
                        <div className="h-64">
                          <Line 
                            data={{
                              labels: Object.keys(dividendHistory).sort().filter(y => parseInt(y) >= 2010 && parseInt(y) < 2026).map(y => y),
                              datasets: [{
                                label: 'Annual Dividend ($)',
                                data: Object.keys(dividendHistory).sort().filter(y => parseInt(y) >= 2010 && parseInt(y) < 2026).map(y => dividendHistory[y]),
                                borderColor: '#f472b6',
                                backgroundColor: 'rgba(244, 114, 182, 0.1)',
                                tension: 0.3,
                                fill: true,
                                pointBackgroundColor: '#f472b6',
                                pointBorderColor: '#fff',
                                pointBorderWidth: 2,
                                pointRadius: 4
                              }]
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true, position: 'top', labels: { color: '#cbd5e1', usePointStyle: true } },
                                title: { display: true, text: 'Annual Dividend Payments', color: '#94a3b8', font: { size: 14 } }
                              },
                              scales: {
                                y: {
                                  grid: { color: '#334155' },
                                  ticks: { 
                                    color: '#cbd5e1',
                                    callback: (value) => `$${value}`
                                  }
                                },
                                x: {
                                  grid: { display: false },
                                  ticks: { color: '#cbd5e1' }
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600 mt-6">
                      <h2 className="text-xl md:text-2xl font-bold mb-4 text-cyan-400">Expected Return</h2>
                      
                      <div className="p-4 bg-cyan-900/30 rounded-lg border border-cyan-800/50 mb-4">
                        <h3 className="font-semibold mb-2 text-cyan-300">Formula:</h3>
                        <p className="text-sm md:text-base text-slate-200 font-mono">
                          Expected Return (Anualizat) = Average Dividend Yield + g + [(PE₁₀/PE₀)^(1/10) - 1]
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Current Price</span>
                          <span className="text-2xl md:text-3xl font-bold text-emerald-400">${company ? company.price.toFixed(2) : '0.00'}</span>
                        </div>
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Dividend Yield</span>
                          <span className="text-2xl md:text-3xl font-bold text-emerald-400">{company ? company.dividendYield.toFixed(2) + '%' : '-'}</span>
                        </div>
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Current PE</span>
                          <span className="text-2xl md:text-3xl font-bold text-emerald-400">{company ? company.peCurrent.toFixed(2) : '-'}</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Expected EPS Growth</span>
                          <div className="flex items-center gap-3">
                            <input 
                              type="range" 
                              min="0" 
                              max="20" 
                              step="0.1"
                              value={expectedReturnParams.expectedEpsGrowth}
                              onChange={(e) => setExpectedReturnParams({...expectedReturnParams, expectedEpsGrowth: parseFloat(e.target.value) || 0})}
                              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <span className="text-lg font-bold text-emerald-400 min-w-[3rem] text-right">{expectedReturnParams.expectedEpsGrowth.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Future PE</span>
                          <div className="flex items-center gap-3">
                            <input 
                              type="range" 
                              min="0" 
                              max="50" 
                              step="0.1"
                              value={expectedReturnParams.futurePe}
                              onChange={(e) => setExpectedReturnParams({...expectedReturnParams, futurePe: parseFloat(e.target.value) || 0})}
                              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <span className="text-lg font-bold text-emerald-400 min-w-[4rem] text-right">{expectedReturnParams.futurePe.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-cyan-900/30 rounded-lg border border-cyan-800/50">
                        <span className="text-slate-300 text-sm md:text-base block mb-1">Expected Total Return</span>
                        <div className="text-2xl md:text-3xl font-bold text-cyan-400">
                          {(() => {
                            const divYield = company ? company.dividendYield : 0
                            const epsGrowth = expectedReturnParams.expectedEpsGrowth
                            const futurePE = expectedReturnParams.futurePe
                            const currentPE = company ? company.peCurrent : 0
                            const peGrowthAnnualized = currentPE > 0 ? Math.pow(futurePE / currentPE, 1/10) - 1 : 0
                            const peChangePercent = peGrowthAnnualized * 100
                            return (divYield + epsGrowth + peChangePercent).toFixed(2) + '%'
                          })()}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Breakdown: Dividend Yield + EPS Growth + PE Change
                        </p>
                      </div>
                      
                      <div className="mt-4 p-3 bg-cyan-900/20 rounded-lg border border-cyan-800/30 text-xs md:text-sm text-slate-300">
                        <p><span className="text-cyan-400 font-semibold">Use case:</span> "What annualized total return can I expect from dividends, growth, and PE multiple expansion over 10 years?"</p>
                      </div>
                    </div>

                    <div className="bg-slate-700/50 backdrop-blur-sm rounded-xl p-5 md:p-6 border border-slate-600 mt-6">
                      <h2 className="text-xl md:text-2xl font-bold mb-4 text-pink-400">Reverse DDM</h2>
                      
                       <div className="p-4 bg-pink-900/30 rounded-lg border border-pink-800/50 mb-4">
                         <h3 className="font-semibold mb-2 text-pink-300">Formula:</h3>
                         <p className="text-sm md:text-base text-slate-200 font-mono">
                           g = r - (D₁/P)
                         </p>
                         <p className="text-xs md:text-sm text-slate-400 mt-2">
                           Where: r = required return, D₁ = next year's dividend, P = current price
                         </p>
                       </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Current Price</span>
                          <span className="text-2xl md:text-3xl font-bold text-emerald-400">${company ? company.price.toFixed(2) : '0.00'}</span>
                        </div>
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <span className="text-slate-400 text-xs md:text-sm block mb-1">Dividend per Share</span>
                          <span className="text-2xl md:text-3xl font-bold text-emerald-400">${company ? company.dividend.toFixed(2) : '0.00'}</span>
                        </div>
                      </div>
                      
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                         <div className="p-3 bg-slate-800/50 rounded-lg">
                           <span className="text-slate-400 text-xs md:text-sm block mb-1">Required Return (r)</span>
                           <span className="text-xl font-bold text-cyan-400">10.0%</span>
                         </div>
                         <div className="p-3 bg-slate-800/50 rounded-lg">
                           <span className="text-slate-400 text-xs md:text-sm block mb-1">Growth Rate (g)</span>
                           <div className="text-2xl md:text-3xl font-bold text-pink-400">
                             {(() => {
                               const div = company ? company.dividend : 0
                               const price = company ? company.price : 0
                               if (price > 0 && div > 0) {
                                 const g = 10 - (div / price) * 100
                                 return g.toFixed(2) + '%'
                               }
                               return '-'
                             })()}
                           </div>
                         </div>
                       </div>
                       
                       <div className="p-4 bg-pink-900/30 rounded-lg border border-pink-800/50">
                         <p className="text-xs text-slate-400">
                           {(() => {
                             const div = company ? company.dividend : 0
                             const price = company ? company.price : 0
                             if (price > 0 && div > 0) {
                               const g = 10 - (div / price) * 100
                               if (g > 5) return 'Interpretation: Growth rate needed is reasonable'
                               if (g < 0) return 'Interpretation: Negative growth rate required - possibly overvalued'
                               return 'Interpretation: Growth rate needed is modest'
                             }
                             return 'Insufficient data'
                           })()}
                         </p>
                       </div>
                       
                       <div className="mt-4 p-3 bg-pink-900/20 rounded-lg border border-pink-800/30 text-xs md:text-sm text-slate-300">
                         <p><span className="text-pink-400 font-semibold">Use case:</span> "What growth rate do I need for a 10% return?"</p>
                       </div>
                     </div>

                    <div className="p-3 md:p-4 bg-blue-900/30 rounded-lg border border-blue-800/50 mt-6">
                      <p className="text-xs md:text-sm text-slate-400">
                        * Data provided by Yahoo Finance. Calculations are based on historical data and assumptions. Market conditions change rapidly. This is not financial advice.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}

         {!company && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">Enter a ticker symbol to start analyzing a company</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
