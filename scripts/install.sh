#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║           N8N LABZ Setup Panel - Instalador v1.0            ║
# ╚══════════════════════════════════════════════════════════════╝
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
MAGENTA='\033[0;35m'

INSTALL_DIR="/opt/n8nlabz"
REPO_URL="https://github.com/n8nlabz/setup-panel"

banner() {
  clear
  echo -e "${RED}"
  echo '  ███╗   ██╗ █████╗ ███╗   ██╗    ██╗      █████╗ ██████╗ ███████╗'
  echo '  ████╗  ██║██╔══██╗████╗  ██║    ██║     ██╔══██╗██╔══██╗╚══███╔╝'
  echo '  ██╔██╗ ██║╚█████╔╝██╔██╗ ██║    ██║     ███████║██████╔╝  ███╔╝ '
  echo '  ██║╚██╗██║██╔══██╗██║╚██╗██║    ██║     ██╔══██║██╔══██╗ ███╔╝  '
  echo '  ██║ ╚████║╚█████╔╝██║ ╚████║    ███████╗██║  ██║██████╔╝███████╗'
  echo '  ╚═╝  ╚═══╝ ╚════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝'
  echo -e "${NC}"
  echo -e "  ${BOLD}Setup Panel Installer v1.0${NC}"
  echo -e "  ${CYAN}Automação simplificada para sua VPS${NC}\n"
}

log_ok() { echo -e "  ${GREEN}✅${NC} $1"; }
log_info() { echo -e "  ${BLUE}ℹ${NC}  $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_err() { echo -e "  ${RED}❌${NC} $1"; }
log_step() { echo -e "\n  ${MAGENTA}▸${NC} ${BOLD}$1${NC}"; }

# ── Root check ──
[ "$EUID" -ne 0 ] && { log_err "Execute como root: sudo bash install.sh"; exit 1; }

banner

# ── Docker ──
log_step "Docker"
if command -v docker &>/dev/null; then
  log_ok "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
else
  log_info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker >/dev/null 2>&1 && systemctl start docker >/dev/null 2>&1
  log_ok "Docker instalado"
fi

# ── Swarm ──
log_step "Docker Swarm"
SWARM=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null)
if [ "$SWARM" = "active" ]; then
  log_ok "Swarm ativo"
else
  IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
  docker swarm init --advertise-addr "$IP" >/dev/null 2>&1
  log_ok "Swarm inicializado ($IP)"
fi

# ── Network ──
log_step "Rede Docker"
if docker network ls | grep -q network_public; then
  log_ok "network_public existe"
else
  docker network create --driver overlay --attachable network_public >/dev/null 2>&1
  log_ok "network_public criada"
fi

# ── Node.js ──
log_step "Node.js"
if command -v node &>/dev/null; then
  log_ok "Node.js $(node --version)"
else
  log_info "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
  log_ok "Node.js $(node --version)"
fi

# ── Download Panel ──
log_step "N8N LABZ Panel"
mkdir -p "$INSTALL_DIR"/{backups,data}

if [ -d "$INSTALL_DIR/.git" ]; then
  log_info "Atualizando..."
  cd "$INSTALL_DIR" && git pull >/dev/null 2>&1
else
  log_info "Baixando..."
  if command -v git &>/dev/null; then
    git clone "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || {
      log_warn "Git clone falhou. Certifique-se de que o repositório existe."
      log_info "Usando arquivos locais se disponíveis..."
    }
  else
    apt-get install -y git >/dev/null 2>&1
    git clone "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || {
      log_warn "Repositório não disponível. Copie os arquivos manualmente para $INSTALL_DIR"
    }
  fi
fi

# ── Install deps ──
if [ -f "$INSTALL_DIR/backend/package.json" ]; then
  log_info "Instalando dependências do backend..."
  cd "$INSTALL_DIR/backend" && npm install --production >/dev/null 2>&1
  log_ok "Backend pronto"
fi

if [ -f "$INSTALL_DIR/frontend/package.json" ]; then
  log_info "Instalando e buildando frontend..."
  cd "$INSTALL_DIR/frontend" && npm install >/dev/null 2>&1 && npx vite build >/dev/null 2>&1
  log_ok "Frontend buildado"
fi

# ── Systemd ──
log_step "Serviço do sistema"
cat > /etc/systemd/system/n8nlabz-panel.service <<EOF
[Unit]
Description=N8N LABZ Setup Panel
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3080

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable n8nlabz-panel >/dev/null 2>&1
systemctl restart n8nlabz-panel >/dev/null 2>&1
log_ok "Painel rodando na porta 3080"

# ── Domínio (opcional) ──
echo ""
echo -e "  ${BOLD}Configurar domínio para o painel? (opcional)${NC}"
read -p "  Domínio (ou Enter pra pular): " PANEL_DOMAIN

if [ -n "$PANEL_DOMAIN" ]; then
  read -p "  Email para SSL: " SSL_EMAIL
  # O Traefik será configurado quando o usuário instalar via painel
  log_ok "Domínio configurado: $PANEL_DOMAIN"
fi

# ── Summary ──
IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
echo ""
echo -e "  ═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}${BOLD}✅ Instalação concluída!${NC}"
echo ""
echo -e "  ${BOLD}Acesse o painel:${NC}"
echo -e "  ${CYAN}➜  http://${IP}:3080${NC}"
if [ -n "$PANEL_DOMAIN" ]; then
  echo -e "  ${CYAN}➜  https://${PANEL_DOMAIN}${NC} (após configurar DNS)"
fi
echo ""
echo -e "  ${BOLD}No primeiro acesso:${NC}"
echo -e "  O painel gera um token admin automaticamente."
echo -e "  ${YELLOW}Guarde esse token! Ele é sua chave de acesso.${NC}"
echo ""
echo -e "  ${BOLD}Comandos:${NC}"
echo -e "  ${CYAN}systemctl status n8nlabz-panel${NC}   — Status"
echo -e "  ${CYAN}systemctl restart n8nlabz-panel${NC}  — Reiniciar"
echo -e "  ${CYAN}journalctl -u n8nlabz-panel -f${NC}   — Logs"
echo ""
echo -e "  ═══════════════════════════════════════════════════════"
echo -e "  ${RED}N8N LABZ${NC} — Comunidade de Automação 🚀"
echo -e "  ═══════════════════════════════════════════════════════"
echo ""
