#!/bin/bash
# deploy.sh — Script para atualizar frontend e/ou backend

set -e

show_help() {
  cat << EOF
Nexus Finance — Script de Deploy

Uso:
  ./deploy.sh [frontend|backend|all]

Opções:
  frontend    Deploy apenas do frontend (Vercel)
  backend     Deploy apenas do backend (Fly.io)
  all         Deploy completo (frontend + backend)

Exemplos:
  ./deploy.sh frontend     # Atualiza só o Vercel
  ./deploy.sh backend      # Atualiza só o Fly.io
  ./deploy.sh all          # Atualiza tudo
EOF
}

deploy_frontend() {
  echo "📦 Deployando frontend no Vercel..."
  vercel --prod
  echo "✅ Frontend atualizado!"
}

deploy_backend() {
  echo "🚀 Deployando backend no Fly.io..."
  cd backend
  fly deploy
  cd ..
  echo "✅ Backend atualizado!"
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
    echo "❌ Opção inválida: $1"
    show_help
    exit 1
    ;;
esac

echo ""
echo "🎉 Deploy concluído!"
echo ""
echo "URLs:"
echo "  Frontend: https://gestao-htvb05zze-rupelios-projects.vercel.app"
echo "  Backend:  https://gestao-api.fly.dev"
echo "  Health:   https://gestao-api.fly.dev/health"
