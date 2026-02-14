#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
MAGENTA='\033[0;35m'

INSTALL_DIR="/opt/n8nlabz"
REPO_URL="https://github.com/n8nlabz/setuplabz.git"

# ── Root check ──
[ "$EUID" -ne 0 ] && { echo -e "  ${RED}❌${NC} Execute como root: sudo bash install.sh"; exit 1; }

clear
echo -e "${RED}"
echo '  ███╗   ██╗ █████╗ ███╗   ██╗    ██╗      █████╗ ██████╗ ███████╗'
echo '  ████╗  ██║██╔══██╗████╗  ██║    ██║     ██╔══██╗██╔══██╗╚══███╔╝'
echo '  ██╔██╗ ██║╚█████╔╝██╔██╗ ██║    ██║     ███████║██████╔╝  ███╔╝ '
echo '  ██║╚██╗██║██╔══██╗██║╚██╗██║    ██║     ██╔══██║██╔══██╗ ███╔╝  '
echo '  ██║ ╚████║╚█████╔╝██║ ╚████║    ███████╗██║  ██║██████╔╝███████╗'
echo '  ╚═╝  ╚═══╝ ╚════╝ ╚═╝  ╚═══╝    ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝'
echo -e "${NC}"
echo ""
echo -e "  ${BOLD}Painel de Instalação de Ferramentas da Comunidade N8N LABZ${NC}"
echo ""
echo -e "  Seja bem-vindo ao nosso painel! 🎉"
echo ""
echo -e "  Iremos preparar a sua VPS em poucos minutos, ok?"
echo -e "  Relaxa que é tudo automático 😎"
echo ""

# ══════════════════════════════════════
# COLETA DE DADOS
# ══════════════════════════════════════
echo -e "\n  ${MAGENTA}▸${NC} ${BOLD}Configuração inicial${NC}\n"

BASE_DOMAIN=""
while [ -z "$BASE_DOMAIN" ]; do
  printf "  📌 Qual o seu domínio base? (ex: seudominio.com.br): " >&2
  read BASE_DOMAIN < /dev/tty
  BASE_DOMAIN=$(echo "$BASE_DOMAIN" | sed 's|https\?://||' | sed 's|/||g' | xargs)
  [ -z "$BASE_DOMAIN" ] && echo -e "  ${YELLOW}⚠${NC}  Domínio base é obrigatório."
done

echo ""
echo -e "  Agora precisamos do seu email e senha para você ter acesso"
echo -e "  ao painel onde vai conseguir fazer toda a gestão da sua VPS"
echo -e "  de uma forma simples!"
echo ""

ADMIN_EMAIL=""
while [ -z "$ADMIN_EMAIL" ]; do
  printf "  📧 Seu email: " >&2
  read ADMIN_EMAIL < /dev/tty
  ADMIN_EMAIL=$(echo "$ADMIN_EMAIL" | xargs)
  [ -z "$ADMIN_EMAIL" ] && echo -e "  ${YELLOW}⚠${NC}  Email é obrigatório."
done

ADMIN_PASS=""
while true; do
  printf "  🔒 Sua senha: " >&2
  read -s ADMIN_PASS < /dev/tty
  echo ""
  if [ -z "$ADMIN_PASS" ]; then
    echo -e "  ${YELLOW}⚠${NC}  Senha é obrigatória."
    continue
  fi
  printf "  🔒 Confirme a senha: " >&2
  read -s ADMIN_PASS2 < /dev/tty
  echo ""
  if [ "$ADMIN_PASS" != "$ADMIN_PASS2" ]; then
    echo -e "  ${YELLOW}⚠${NC}  As senhas não coincidem. Tente novamente."
    ADMIN_PASS=""
    continue
  fi
  break
done

ADMIN_PASS_HASH=$(echo -n "$ADMIN_PASS" | sha256sum | cut -d' ' -f1)

echo ""
SERVER_NAME=""
while [ -z "$SERVER_NAME" ]; do
  printf "  🏷️  Nome do servidor (ex: n8nlabz, meuserver, minhaempresa): " >&2
  read SERVER_NAME < /dev/tty
  SERVER_NAME=$(echo "$SERVER_NAME" | xargs)
  [ -z "$SERVER_NAME" ] && echo -e "  ${YELLOW}⚠${NC}  Nome do servidor é obrigatório."
done

NETWORK_NAME=""
while [ -z "$NETWORK_NAME" ]; do
  printf "  🌐 Nome da rede (ex: n8nlabznet, minharede): " >&2
  read NETWORK_NAME < /dev/tty
  NETWORK_NAME=$(echo "$NETWORK_NAME" | xargs)
  [ -z "$NETWORK_NAME" ] && echo -e "  ${YELLOW}⚠${NC}  Nome da rede é obrigatório."
done

SERVER_IP=$(curl -4 -s ifconfig.me || curl -s ifconfig.me)

echo ""
echo -e "  ${YELLOW}⚠️  IMPORTANTE:${NC} Antes de continuar, você precisa apontar o DNS"
echo -e "  do subdomínio do seu painel para o IP desta VPS: ${BOLD}${SERVER_IP}${NC}"
echo ""
echo -e "  O subdomínio pode ser qualquer um, por exemplo:"
echo -e "  ${CYAN}  dashboard.seudominio.com.br${NC}"
echo -e "  ${CYAN}  painel.seudominio.com.br${NC}"
echo -e "  ${CYAN}  console.seudominio.com.br${NC}"
echo ""

DASHBOARD_DOMAIN=""
while [ -z "$DASHBOARD_DOMAIN" ]; do
  printf "  🌐 Digite o link completo do seu painel (ex: painel.seudominio.com.br): " >&2
  read DASHBOARD_DOMAIN < /dev/tty
  DASHBOARD_DOMAIN=$(echo "$DASHBOARD_DOMAIN" | sed 's|https\?://||' | sed 's|/||g' | xargs)
  [ -z "$DASHBOARD_DOMAIN" ] && echo -e "  ${YELLOW}⚠${NC}  Domínio do painel é obrigatório."
done

echo ""
echo -e "  ⏳ Preparando sua VPS... isso pode levar alguns minutos."
echo -e "     Não feche este terminal!"
echo ""

# ══════════════════════════════════════
# INSTALAÇÃO SILENCIOSA
# ══════════════════════════════════════

# Sistema
apt-get update >/dev/null 2>&1
apt-get upgrade -y >/dev/null 2>&1
apt-get install -y curl git jq apache2-utils >/dev/null 2>&1

# Docker
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker >/dev/null 2>&1 && systemctl start docker >/dev/null 2>&1
fi

# Swarm
SWARM_STATE=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null)
if [ "$SWARM_STATE" != "active" ]; then
  docker swarm init --advertise-addr "$SERVER_IP" >/dev/null 2>&1
fi

# Rede
if ! docker network ls --format '{{.Name}}' | grep -qx "${NETWORK_NAME}"; then
  docker network create --driver overlay --attachable "${NETWORK_NAME}" >/dev/null 2>&1
fi

# Volumes
for vol in volume_swarm_certificates volume_swarm_shared postgres_data n8n_redis evolution_instances evolution_redis portainer_data; do
  docker volume create "$vol" >/dev/null 2>&1 || true
done

# Traefik
TRAEFIK_COMPOSE="/tmp/traefik-compose.yml"
cat > "$TRAEFIK_COMPOSE" <<EOF
version: "3.8"
services:
  traefik:
    image: traefik:v3.5.3
    command:
      - "--api.dashboard=false"
      - "--providers.swarm=true"
      - "--providers.docker.endpoint=unix:///var/run/docker.sock"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=${NETWORK_NAME}"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
      - "--entrypoints.web.http.redirections.entrypoint.permanent=true"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.transport.respondingTimeouts.idleTimeout=3600"
      - "--certificatesresolvers.letsencryptresolver.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencryptresolver.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencryptresolver.acme.storage=/etc/traefik/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencryptresolver.acme.email=${ADMIN_EMAIL}"
      - "--log.level=ERROR"
      - "--log.format=common"
      - "--log.filePath=/var/log/traefik/traefik.log"
      - "--accesslog=true"
      - "--accesslog.filepath=/var/log/traefik/access-log"
    volumes:
      - "vol_certificates:/etc/traefik/letsencrypt"
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
    networks:
      - network_public
    ports:
      - target: 80
        published: 80
        mode: host
      - target: 443
        published: 443
        mode: host
    deploy:
      placement:
        constraints:
          - node.role == manager
      labels:
        - "traefik.enable=true"
        - "traefik.http.middlewares.redirect-https.redirectscheme.scheme=https"
        - "traefik.http.middlewares.redirect-https.redirectscheme.permanent=true"
        - "traefik.http.routers.http-catchall.rule=Host(BKTK{host:.+}BKTK)"
        - "traefik.http.routers.http-catchall.entrypoints=web"
        - "traefik.http.routers.http-catchall.middlewares=redirect-https@docker"
        - "traefik.http.routers.http-catchall.priority=1"

volumes:
  vol_certificates:
    external: true
    name: volume_swarm_certificates

networks:
  network_public:
    external: true
    name: ${NETWORK_NAME}
EOF
sed -i 's/BKTK/`/g' "$TRAEFIK_COMPOSE"
docker stack deploy -c "$TRAEFIK_COMPOSE" traefik >/dev/null 2>&1
rm -f "$TRAEFIK_COMPOSE"

# Repo
if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR" && git pull >/dev/null 2>&1
else
  [ -d "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || {
    echo -e "  ${RED}❌${NC} Falha ao clonar repositório. Verifique sua conexão."
    exit 1
  }
fi
mkdir -p "$INSTALL_DIR"/{backups,data}

# Config
cat > "$INSTALL_DIR/config.json" <<EOF
{
  "domain_base": "${BASE_DOMAIN}",
  "admin_email": "${ADMIN_EMAIL}",
  "admin_password_hash": "${ADMIN_PASS_HASH}",
  "server_name": "${SERVER_NAME}",
  "network_name": "${NETWORK_NAME}",
  "dashboard_domain": "${DASHBOARD_DOMAIN}",
  "ip": "${SERVER_IP}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

if [ ! -f "$INSTALL_DIR/credentials.json" ]; then
  echo '{}' > "$INSTALL_DIR/credentials.json"
fi

# Verificar arquivos
if [ ! -f "$INSTALL_DIR/Dockerfile" ] || [ ! -d "$INSTALL_DIR/backend" ] || [ ! -d "$INSTALL_DIR/frontend" ]; then
  echo -e "  ${RED}❌${NC} Arquivos do painel não encontrados. Verifique o repositório."
  exit 1
fi

# Build
cd "$INSTALL_DIR" && docker build -t n8nlabz-panel:latest . >/dev/null 2>&1

# Deploy painel
PANEL_COMPOSE="/tmp/panel-compose.yml"
cat > "$PANEL_COMPOSE" <<EOF
version: "3.8"
services:
  n8nlabz_panel:
    image: n8nlabz-panel:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${INSTALL_DIR}/config.json:/opt/n8nlabz/config.json
      - ${INSTALL_DIR}/credentials.json:/opt/n8nlabz/credentials.json
      - ${INSTALL_DIR}/backups:/opt/n8nlabz/backups
    environment:
      - NODE_ENV=production
      - PORT=3080
    networks:
      - network_public
    deploy:
      placement:
        constraints:
          - node.role == manager
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.n8nlabz.rule=Host(BKTK${DASHBOARD_DOMAIN}BKTK)"
        - "traefik.http.routers.n8nlabz.entrypoints=websecure"
        - "traefik.http.routers.n8nlabz.tls.certresolver=letsencryptresolver"
        - "traefik.http.services.n8nlabz.loadbalancer.server.port=3080"
        - "traefik.docker.network=${NETWORK_NAME}"

networks:
  network_public:
    external: true
    name: ${NETWORK_NAME}
EOF
sed -i 's/BKTK/`/g' "$PANEL_COMPOSE"
docker stack deploy -c "$PANEL_COMPOSE" panel >/dev/null 2>&1
rm -f "$PANEL_COMPOSE"

sleep 10

# ══════════════════════════════════════
# MENSAGEM FINAL
# ══════════════════════════════════════
echo ""
echo -e "  ════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}✅ Tudo pronto!${NC}"
echo ""
echo -e "  🌐 Acesse agora o seu painel:"
echo -e "     ${CYAN}https://${DASHBOARD_DOMAIN}${NC}"
echo ""
echo -e "  🔑 Use o email e senha que você cadastrou pra entrar."
echo ""
echo -e "  A partir de agora, instale todas as suas ferramentas"
echo -e "  direto pelo painel. Sem terminal, sem complicação! 🚀"
echo ""
echo -e "  ════════════════════════════════════════════════════════"
echo ""
