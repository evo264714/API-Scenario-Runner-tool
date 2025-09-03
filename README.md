# 🧪 API Scenario Runner

A **general-purpose REST API testing tool** built with Node.js.  
It executes test **scenarios defined in JSON**, manages authentication tokens across steps, performs assertions, and saves evidence automatically. 

---

## 🚀 Features
- **Scenario-driven**: Define tests in JSON (no code changes required).
- **Variable templating**: Use `{{token}}` and other variables extracted from earlier responses.
- **Assertions**: Check HTTP status codes and JSON fields (exact match or regex).
- **Session management**: Save values (like JWT tokens) and reuse them later.
- **Evidence generation**: Saves full request/response logs (`.json`) and a summary CSV.
- **Fuzzing mode**: Auto-generate random inputs for marked fields (`FZZ` → replaced with random strings).

---

## 📦 Installation

### 1. Prerequisites
- **Node.js v18+** (download from [https://nodejs.org](https://nodejs.org))  
- **Git** (download from [https://git-scm.com](https://git-scm.com))  

### 2. Clone & install
```bash
git clone https://github.com/<your-username>/api-scenario-runner.git
cd api-scenario-runner
npm install
