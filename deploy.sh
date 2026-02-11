#!/bin/bash
# deploy.sh - deploy frontend/backend

set -euo pipefail

show_help() {
  cat << 'EOF'
GoFund - Script de Deploy

Uso:
  ./deploy.sh [frontend|backend|all]

Opcoes:
  frontend    Deploy apenas do frontend (Vercel)
  backend     Deploy apenas do backend (Fly.io)
  all         Deploy completo (frontend + backend)

Exemplos:
  ./deploy.sh frontend
  ./deploy.sh backend
  ./deploy.sh all
EOF
}

set_vercel_project_env() {
  if [ -f ".vercel/project.json" ]; then
    export VERCEL_ORG_ID="$(node -e "process.stdout.write(require('./.vercel/project.json').orgId)")"
    export VERCEL_PROJECT_ID="$(node -e "process.stdout.write(require('./.vercel/project.json').projectId)")"
  fi
}

deploy_frontend() {
  echo "[frontend] Deployando no Vercel..."
  set_vercel_project_env
  vercel --prod --yes --cwd frontend-vue
  echo "[frontend] Deploy concluido."
}

deploy_backend() {
  echo "[backend] Deployando no Fly.io..."
  (cd backend && fly deploy)
  echo "[backend] Deploy concluido."
}

case "${1:-all}" in
  frontend)
    deploy_frontend
    ;;
  backend)
    deploy_backend
    ;;
  all)
    deploy_backend
    deploy_frontend
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo "Opcao invalida: $1"
    show_help
    exit 1
    ;;
esac

echo
echo "Deploy finalizado."
echo "Frontend: https://gestao-htvb05zze-rupelios-projects.vercel.app"
echo "Backend:  https://gestao-api.fly.dev"
echo "Health:   https://gestao-api.fly.dev/health"