# ============================================================
# AI Resume Tailor — Makefile
# ============================================================

.PHONY: help install-backend install-frontend install run-backend run-frontend run-all lint test clean

VENV := venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Install ---
install-backend: ## Create venv and install Python deps
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

install-frontend: ## Install frontend deps
	cd frontend && npm install

install: install-backend install-frontend ## Install all dependencies

# --- Run ---
run-backend: ## Start FastAPI dev server on :8000
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --port 8000

run-frontend: ## Start Vite dev server on :5173
	cd frontend && npm run dev

run-all: ## Start both servers (backend bg + frontend fg)
	@echo "Starting backend on :8000..."
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --port 8000 &
	@echo "Starting frontend on :5173..."
	cd frontend && npm run dev

# --- Quality ---
lint: ## Run linters
	$(PYTHON) -m ruff check backend/
	cd frontend && npm run lint

test: ## Run tests
	$(PYTHON) -m pytest backend/tests/ -v
	cd frontend && npm test

# --- Utilities ---
clean: ## Remove build artifacts
	rm -rf __pycache__ backend/__pycache__ backend/app/__pycache__
	rm -rf frontend/dist frontend/node_modules/.vite
	rm -rf data/chroma_db data/uploads data/output
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

spacy-model: ## Download spaCy English model
	$(PYTHON) -m spacy download en_core_web_sm

playwright-install: ## Install Playwright browsers
	$(PYTHON) -m playwright install chromium
