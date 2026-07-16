from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
from datetime import datetime
import requests
import json

app = Flask(__name__)
CORS(app)

@app.route('/api/search-suggestions/<query>')
def search_suggestions(query):
    """Return autocomplete suggestions for partial ticker/company name search."""
    try:
        import yfinance as yf
        from urllib.parse import unquote
        
        query = unquote(query).strip()
        if len(query) < 1:
            return jsonify({'suggestions': []})
        
        search = yf.Search(query, max_results=8)
        quotes = search.quotes or []
        
        suggestions = []
        for quote in quotes:
            suggestions.append({
                'symbol': quote.get('symbol', ''),
                'name': quote.get('shortname', quote.get('longname', '')),
                'exchange': quote.get('exchDisp', ''),
                'type': quote.get('typeDisp', quote.get('quoteType', '')),
            })
        
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        return jsonify({'suggestions': [], 'error': str(e)})

@app.route('/api/search/<ticker>')
def search_company(ticker):
    try:
        ticker = ticker.upper()
        stock = yf.Ticker(ticker)
        info = stock.info
        
        company_data = {
            'ticker': ticker,
            'name': info.get('longName', info.get('shortName', ticker)),
            'sector': info.get('sector', 'Unknown'),
            'industry': info.get('industry', 'Unknown'),
            'price': info.get('currentPrice', info.get('regularMarketPrice', 0)),
            'currency': info.get('currency', 'USD'),
            'marketCap': info.get('marketCap', 0),
            'peCurrent': float(info.get('trailingPE', 0)) if info.get('trailingPE') else 0,
            'dividend': float(info.get('dividendRate', info.get('trailingDividendRate', 0))),
            'dividendYield': float(info.get('dividendYield', info.get('trailingDividendYield', 0))),
            'eps': float(info.get('trailingEps', 0)) if info.get('trailingEps') else 0,
            'freeCashFlow': float(info.get('trailingFreeCashFlow', 0)) if info.get('trailingFreeCashFlow') else 0,
            'freeCashFlowPerShare': float(info.get('trailingFreeCashFlow', 0)) / float(info.get('sharesOutstanding', 1)) if info.get('trailingFreeCashFlow') else 0,
            'beta': float(info.get('beta', 0)) if info.get('beta') else 0,
        }
        
        # Get DGR from dividend history
        try:
            dividend_history = stock.dividends
            if dividend_history is not None and not dividend_history.empty:
                dividend_by_year = {}
                for date, dividend in dividend_history.items():
                    year = int(date.year)
                    if year not in dividend_by_year:
                        dividend_by_year[year] = float(dividend)
                    else:
                        dividend_by_year[year] += float(dividend)
            
            current_year = int(datetime.now().year)
            
            # Exclude current year if incomplete (less than 12 months)
            complete_years_sorted = sorted([k for k in dividend_by_year.keys() if k < current_year], reverse=True)
            
            # Get last 10, 5, 3 complete years
            last_10 = set(complete_years_sorted[:10]) if len(complete_years_sorted) >= 10 else set(complete_years_sorted)
            last_5 = set(complete_years_sorted[:5]) if len(complete_years_sorted) >= 5 else set(complete_years_sorted)
            last_3 = set(complete_years_sorted[:3]) if len(complete_years_sorted) >= 3 else set(complete_years_sorted)
            
            # Filter complete_years dict to only those years
            complete_years_filtered = {k: v for k, v in dividend_by_year.items() if k in last_10}
            
            company_data['dgr10'] = round(calculate_dgr(complete_years_filtered), 2) if len(complete_years_filtered) >= 2 else None
            
            recent_5 = {k: v for k, v in dividend_by_year.items() if k in last_5}
            company_data['dgr5'] = round(calculate_dgr(recent_5), 2) if recent_5 else None
            
            recent_3 = {k: v for k, v in dividend_by_year.items() if k in last_3}
            company_data['dgr3'] = round(calculate_dgr(recent_3), 2) if recent_3 else None
        except:
            pass
        
        return jsonify(company_data)
        
    except Exception as e:
        return handle_api_error(e)

@app.route('/api/pe-history/<ticker>')
def get_pe_history(ticker):
    try:
        stock = yf.Ticker(ticker)
        
        hist = stock.history(period='10y', interval='1wk')
        
        if hist is None or hist.empty:
            return jsonify({'ticker': ticker, 'pe_history': []})
        
        current_pe = float(stock.info.get('trailingPE', 0))
        current_eps = float(stock.info.get('trailingEps', 0)) if stock.info.get('trailingEps') else 0
        forward_eps = float(stock.info.get('forwardEps', 0)) if stock.info.get('forwardEps') else 0
        
        hist_by_year = {}
        for date, row in hist.iterrows():
            year = date.year
            if year not in hist_by_year:
                hist_by_year[year] = {'prices': [], 'eps': None}
            hist_by_year[year]['prices'].append(float(row['Close']))
        
        pe_history = []
        
        for year in sorted(hist_by_year.keys(), reverse=True):
            prices = hist_by_year[year]['prices']
            avg_price = sum(prices) / len(prices)
            
            eps = None
            fcf = None
            try:
                financials = stock.financials
                if financials is not None and not financials.empty:
                    net_income = financials.loc['Net Income', :]
                    shares = financials.loc['Diluted Average Shares', :] if 'Diluted Average Shares' in financials.index else financials.loc['Basic Average Shares', :]
                    
                    for i in range(len(net_income)):
                        ts = net_income.index[i]
                        if ts.year == year:
                            eps = float(net_income.iloc[i]) / float(shares.iloc[i])
                            break
                    
                    cashflow = stock.cashflow
                    if cashflow is not None and not cashflow.empty:
                        if 'Free Cash Flow' in cashflow.index:
                            fcf_data = cashflow.loc['Free Cash Flow', :]
                            for i in range(len(fcf_data)):
                                ts = fcf_data.index[i]
                                if ts.year == year:
                                    fcf = float(fcf_data.iloc[i]) / float(shares.iloc[i])
                                    break
            except:
                pass
            
            if eps is None and forward_eps > 0 and year == 2026:
                eps = forward_eps
            
            if eps is None and current_eps > 0:
                eps = current_eps
            
            if eps is not None and eps > 0 and avg_price > 0:
                pe = avg_price / eps
                pe_history.append({
                    'year': year,
                    'pe': round(pe, 2),
                    'avg_price': round(avg_price, 2),
                    'eps': round(eps, 2),
                    'fcf': round(fcf, 2) if fcf is not None else None
                })
        
        for i, item in enumerate(pe_history):
            if i > 0:
                prev_pe = pe_history[i - 1]['pe']
                item['change'] = round(((item['pe'] - prev_pe) / prev_pe) * 100, 2) if prev_pe > 0 else 0
            else:
                item['change'] = 0
        
        return jsonify({'ticker': ticker, 'pe_history': pe_history})
        
    except Exception as e:
        return handle_api_error(e)

@app.route('/api/fair-value/<ticker>')
def calculate_fair_value(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        price = float(info.get('currentPrice', info.get('regularMarketPrice', 0))) if info.get('currentPrice') or info.get('regularMarketPrice') else 0
        dividend = float(info.get('dividendRate', info.get('trailingDividendRate', 0)))
        dividend_yield = float(info.get('dividendYield', info.get('trailingDividendYield', 0)))
        eps = float(info.get('trailingEps', 0)) if info.get('trailingEps') else 0
        pe_current = float(info.get('trailingPE', 0)) if info.get('trailingPE') else 0
        
        growth_rate = float(info.get('pegRatio', 1) * 10) if info.get('pegRatio') else 8
        growth_rate_ggm = min(growth_rate, 3)
        
        dcf_value = calculate_dcf(price, eps, growth_rate)
        gordon_value = calculate_gordon_growth(dividend, dividend_yield, growth_rate_ggm)
        pe_relative = calculate_pe_relative(pe_current, price)
        ddm_value = calculate_ddm(dividend, dividend_yield, growth_rate_ggm)
        
        avg_fv = (dcf_value + gordon_value + pe_relative + ddm_value) / 4 if (dcf_value and gordon_value and pe_relative and ddm_value) else dcf_value or gordon_value or pe_relative or ddm_value
        
        fair_values = {
            'ticker': ticker,
            'current_price': round(price, 2),
            'fair_value_dcf': round(dcf_value, 2) if dcf_value else 0,
            'fair_value_gordon': round(gordon_value, 2) if gordon_value else 0,
            'fair_value_pe_relative': round(pe_relative, 2) if pe_relative else 0,
            'fair_value_ddm': round(ddm_value, 2) if ddm_value else 0,
            'average_fair_value': round(avg_fv, 2) if avg_fv else 0
        }
        
        return jsonify(fair_values)
        
    except Exception as e:
        return handle_api_error(e)

def calculate_dcf(current_price, eps, growth_rate):
    import sys
    print(f"DCF: price={current_price}, eps={eps}, growth={growth_rate}", file=sys.stderr)
    if eps <= 0:
        return current_price
    
    future_pe = 15
    future_eps = eps * ((1 + growth_rate / 100) ** 5)
    future_price = future_eps * future_pe
    present_value = future_price / ((1 + 0.10) ** 5)
    
    print(f"DCF result: {present_value}", file=sys.stderr)
    return present_value

def calculate_gordon_growth(dividend, yield_pct, growth_rate):
    if dividend <= 0 or yield_pct <= 0:
        return 0
    
    required_return = yield_pct + 2
    fair_yield = required_return - growth_rate
    
    if fair_yield <= 0:
        return 0
    
    return dividend * (1 + growth_rate / 100) / (fair_yield / 100)

def calculate_pe_relative(pe_current, price):
    if pe_current <= 0:
        return price
    
    fair_pe = 15
    return price * (fair_pe / pe_current)

def calculate_ddm(dividend, yield_pct, growth_rate):
    if dividend <= 0 or yield_pct <= 0:
        return 0
    
    required_return = yield_pct + 2
    fair_yield = required_return - growth_rate
    
    if fair_yield <= 0:
        return 0
    
    return dividend * (1 + growth_rate / 100) / (fair_yield / 100)

def calculate_dgr(dividends):
    if len(dividends) < 2:
        return None
    
    try:
        dividends_sorted = sorted(dividends.items(), key=lambda x: int(x[0]))
        
        if len(dividends_sorted) < 2:
            return None
        
        oldest_year = int(dividends_sorted[0][0])
        most_recent_year = int(dividends_sorted[-1][0])
        
        if oldest_year == most_recent_year:
            return None
        
        oldest_dividend = float(dividends_sorted[0][1])
        most_recent_dividend = float(dividends_sorted[-1][1])
        
        if oldest_dividend <= 0:
            return None
        
        years = most_recent_year - oldest_year
        dgr = (most_recent_dividend / oldest_dividend) ** (1/years) - 1
        return dgr * 100
    except Exception as e:
        print(f"calculate_dgr error: {e}", file=__import__('sys').stderr)
        return None

def handle_api_error(error):
    msg = str(error)
    if 'No data found' in msg or '404' in msg or 'not be found' in msg:
        return jsonify({'error_type': 'not_found', 'message': 'Ticker not found. Please check the symbol and try again.'}), 404
    if isinstance(error, (requests.exceptions.Timeout, requests.exceptions.ConnectionError)):
        return jsonify({'error_type': 'network', 'message': 'Service temporarily unavailable. Please try again later.'}), 503
    print(f"Unexpected error: {error}", file=__import__('sys').stderr)
    return jsonify({'error_type': 'internal', 'message': 'An unexpected error occurred. Please try again.'}), 500

def calculate_reverse_dcf_impl(fcf_per_share, discount_rate, terminal_growth, horizon, target_price):
    from scipy.optimize import brentq
    
    if fcf_per_share <= 0 or discount_rate <= 0:
        return 0
    
    r = discount_rate / 100
    g_term = terminal_growth / 100
    n = horizon
    f0 = fcf_per_share
    pv_target = target_price
    
    def dcf_diff(g):
        g = g / 100
        if g <= -0.99 or g >= r:
            return 1e10
        
        pv_growth = sum(f0 * ((1+g)/(1+r))**t for t in range(1, n+1))
        f_n = f0 * (1+g)**n
        pv_terminal = (f_n * (1+g_term)) / ((r - g_term) * (1+r)**n) if r > g_term else 1e10
        
        return (pv_growth + pv_terminal) - pv_target
    
    try:
        g_implied = brentq(dcf_diff, -49, 99)
        return round(g_implied, 2)
    except:
        return None

@app.route('/api/dividend-history/<ticker>')
def get_dividend_history(ticker):
    try:
        stock = yf.Ticker(ticker)
        
        dividends = stock.dividends
        if dividends is None or dividends.empty:
            return jsonify({'ticker': ticker, 'dividend_history': {}, 'dgr10': None, 'dgr5': None, 'dgr3': None})
        
        dividend_history = {}
        for date, dividend in dividends.items():
            year = date.year
            if year not in dividend_history:
                dividend_history[year] = float(dividend)
            else:
                dividend_history[year] += float(dividend)
        
        current_year = int(datetime.now().year)
        
        # Get the latest dividend rate from stock info for more accurate data
        current_dividend_rate = float(stock.info.get('dividendRate', 0))
        
        # Only update current year (2026) if dividendRate is available and differes from yfinance
        # Keep historical years (2023, 2024, 2025) as they are from yfinance 100% accurate
        if current_dividend_rate > 0 and current_year in dividend_history:
            historical = dividend_history[current_year]
            if abs(historical - current_dividend_rate) / current_dividend_rate > 0.05:
                dividend_history[current_year] = current_dividend_rate
        elif current_dividend_rate > 0 and current_year not in dividend_history:
            dividend_history[current_year] = current_dividend_rate
        
        complete_years_sorted = sorted([k for k in dividend_history.keys() if k < current_year], reverse=True)
        
        # Get last 10, 5, 3 complete years
        last_10 = set(complete_years_sorted[:10]) if len(complete_years_sorted) >= 10 else set(complete_years_sorted)
        last_5 = set(complete_years_sorted[:5]) if len(complete_years_sorted) >= 5 else set(complete_years_sorted)
        last_3 = set(complete_years_sorted[:3]) if len(complete_years_sorted) >= 3 else set(complete_years_sorted)
        
        dgr10 = calculate_dgr({k: v for k, v in dividend_history.items() if k in last_10})
        dgr5 = calculate_dgr({k: v for k, v in dividend_history.items() if k in last_5})
        dgr3 = calculate_dgr({k: v for k, v in dividend_history.items() if k in last_3})
        
        return jsonify({
            'ticker': ticker,
            'dividend_history': dividend_history,
            'dgr10': round(dgr10, 2) if dgr10 else None,
            'dgr5': round(dgr5, 2) if dgr5 else None,
            'dgr3': round(dgr3, 2) if dgr3 else None
        })
        
    except Exception as e:
        return handle_api_error(e)

@app.route('/api/reverse-dcf/<ticker>')
def calculate_reverse_dcf(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        price = float(info.get('currentPrice', info.get('regularMarketPrice', 0))) if info.get('currentPrice') or info.get('regularMarketPrice') else 0
        fcf_per_share = float(info.get('trailingFreeCashFlow', 0)) / float(info.get('sharesOutstanding', 1)) if info.get('trailingFreeCashFlow') else 0
        
        return jsonify({
            'ticker': ticker,
            'price': round(price, 2),
            'fcfPerShare': round(fcf_per_share, 2)
        })
        
    except Exception as e:
        return handle_api_error(e)

@app.route('/api/reverse-dcf/calculate', methods=['POST'])
def calculate_reverse_dcf_values():
    try:
        data = request.json
        
        fcf_per_share = float(data.get('fcfPerShare', 0))
        discount_rate = float(data.get('discountRate', 10))
        terminal_growth = float(data.get('terminalGrowth', 3))
        horizon = int(data.get('horizon', 10))
        target_price = float(data.get('targetPrice', 0))
        
        g_implied = calculate_reverse_dcf_impl(fcf_per_share, discount_rate, terminal_growth, horizon, target_price)
        
        return jsonify({
            'gImplied': g_implied,
            'interpretation': 'Overvalued' if g_implied and g_implied > 10 else ('Undervalued' if g_implied and g_implied < 3 else 'Fair')
        })
        
    except Exception as e:
        return handle_api_error(e)

if __name__ == '__main__':
    app.run(debug=True, port=5002, host='0.0.0.0')
