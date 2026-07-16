# Stock Fair Value Calculator

## Architecture

**Monorepo with two components:**
- `frontend/` - React 19 + Vite 5 SPA (port 5173)
- `backend/` - Flask Python API (port 5000, configured as 5002 in app.py)

## Setup & Commands

### Backend (Python/Flask)
```bash
cd backend
python -m venv venv  # Create venv if missing
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python app.py  # Runs on port 5002
```

### Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev  # Runs on port 5173, proxies /api to http://127.0.0.1:5000
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search/<ticker>` | GET | Company info, metrics, DGR |
| `/api/pe-history/<ticker>` | GET | 10-year PE history with EPS/FCF |
| `/api/fair-value/<ticker>` | GET | Intrinsic value (DCF, Gordon, PE rel, DDM) |
| `/api/dividend-history/<ticker>` | GET | Annual dividends + DGR10/5/3 |
| `/api/reverse-dcf/<ticker>` | GET | FCF per share baseline |
| `/api/reverse-dcf/calculate` | POST | Implied growth rate |

## Key Values

- **Backend target**: Vite proxy sends `/api` to `http://127.0.0.1:5000`
- **Free cash flow**: Uses `trailingFreeCashFlow` / `sharesOutstanding`
- **Dividend growth**: Calculated from complete years only (excludes current year if incomplete)
- **Fair value averaging**: DCF + Gordon + PE relative + DDM (all 4) or whichever_available

## Notable Patterns

- Backend port in code (`app.py:387`) is 5002, but Vite proxy target is 5000
- Yfinance data only; no local caching
- No TypeScript; vanilla JS/JSX
- Tailwind CSS with custom colors (slate-700/800, emerald-400/600, etc.)

## Common Tasks

- **Add new endpoint**: Add to `backend/app.py`, restart backend, frontend auto-proxies
- **Update UI**: Modify `frontend/src/App.jsx` (main view) or `frontend/src/App.css` (styles)
- **Rebuild frontend**: `npm run build` → outputs to `frontend/dist/`
