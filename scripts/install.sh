#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
MAGENTA='\033[0;35m'

INSTALL_DIR="/opt/n8nlabz"
REPO_URL="https://github.com/n8nlabz/setuplabz.git"

# ── Root check ──
[ "$EUID" -ne 0 ] && { echo -e "  ${RED}x${NC} Execute como root: sudo bash install.sh"; exit 1; }

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
echo -e "  ${BOLD}Painel de Instalacao de Ferramentas da Comunidade N8N LABZ${NC}"
echo ""

# ══════════════════════════════════════
# DETECCAO DE FERRAMENTAS EXISTENTES
# ══════════════════════════════════════

MIGRATION_MODE=""
DETECTED_TOOLS=""

detect_existing() {
  if ! command -v docker &>/dev/null; then
    return
  fi

  local found=""

  # Check Traefik
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "traefik"; then
    found="${found}traefik,"
  fi

  # Check Portainer
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "portainer"; then
    found="${found}portainer,"
  fi

  # Check PostgreSQL
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "postgres"; then
    found="${found}postgres,"
  fi

  # Check n8n
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "n8n"; then
    found="${found}n8n,"
  fi

  # Check Evolution API
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "evolution"; then
    found="${found}evolution,"
  fi

  DETECTED_TOOLS=$(echo "$found" | sed 's/,$//')
}

get_service_env() {
  local service_name="$1"
  local env_var="$2"
  docker service inspect "$service_name" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' 2>/dev/null | grep "^${env_var}=" | cut -d'=' -f2-
}

find_service_by_keyword() {
  docker service ls --format '{{.Name}}' 2>/dev/null | grep -i "$1" | head -1
}

detect_credentials() {
  local creds_json='{}'

  # Detect PostgreSQL credentials
  local pg_svc=$(find_service_by_keyword "postgres")
  if [ -n "$pg_svc" ]; then
    local pg_pass=$(get_service_env "$pg_svc" "POSTGRES_PASSWORD")
    local pg_user=$(get_service_env "$pg_svc" "POSTGRES_USER")
    [ -z "$pg_user" ] && pg_user="postgres"
    if [ -n "$pg_pass" ]; then
      creds_json=$(echo "$creds_json" | jq --arg u "$pg_user" --arg p "$pg_pass" '. + {postgres: {user: $u, password: $p}}')
    fi
  fi

  # Detect n8n credentials
  local n8n_svc=$(find_service_by_keyword "n8n" | grep -v redis | head -1)
  if [ -n "$n8n_svc" ]; then
    local n8n_host=$(get_service_env "$n8n_svc" "N8N_HOST")
    local n8n_enc=$(get_service_env "$n8n_svc" "N8N_ENCRYPTION_KEY")
    local n8n_db=$(get_service_env "$n8n_svc" "DB_POSTGRESDB_DATABASE")
    local n8n_db_user=$(get_service_env "$n8n_svc" "DB_POSTGRESDB_USER")
    local n8n_db_pass=$(get_service_env "$n8n_svc" "DB_POSTGRESDB_PASSWORD")

    local n8n_creds="{}"
    [ -n "$n8n_host" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "$n8n_host" '. + {domain: $v}')
    [ -n "$n8n_enc" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "$n8n_enc" '. + {encryption_key: $v}')
    [ -n "$n8n_db" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "$n8n_db" '. + {db_name: $v}')
    [ -n "$n8n_db_user" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "$n8n_db_user" '. + {db_user: $v}')
    [ -n "$n8n_db_pass" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "$n8n_db_pass" '. + {db_password: $v}')
    [ -n "$n8n_host" ] && n8n_creds=$(echo "$n8n_creds" | jq --arg v "https://$n8n_host" '. + {editor_url: $v}')

    if [ "$n8n_creds" != "{}" ]; then
      creds_json=$(echo "$creds_json" | jq --argjson c "$n8n_creds" '. + {n8n: $c}')
    fi
  fi

  # Detect Evolution credentials
  local evo_svc=$(find_service_by_keyword "evolution" | grep -v redis | head -1)
  if [ -n "$evo_svc" ]; then
    local evo_key=$(get_service_env "$evo_svc" "AUTHENTICATION_API_KEY")
    local evo_host=$(get_service_env "$evo_svc" "SERVER_URL")
    local evo_db=$(get_service_env "$evo_svc" "DATABASE_CONNECTION_URI")

    local evo_creds="{}"
    [ -n "$evo_key" ] && evo_creds=$(echo "$evo_creds" | jq --arg v "$evo_key" '. + {api_key: $v}')
    [ -n "$evo_host" ] && evo_creds=$(echo "$evo_creds" | jq --arg v "$evo_host" '. + {url: $v}')

    if [ "$evo_creds" != "{}" ]; then
      creds_json=$(echo "$creds_json" | jq --argjson c "$evo_creds" '. + {evolution: $c}')
    fi
  fi

  # Detect Portainer credentials
  local port_svc=$(find_service_by_keyword "portainer" | grep -v agent | head -1)
  if [ -n "$port_svc" ]; then
    # Portainer doesn't store creds in env vars, but we can detect the domain
    local port_labels
    port_labels=$(docker service inspect "$port_svc" --format '{{range $k, $v := .Spec.TaskTemplate.ContainerSpec.Labels}}{{$k}}={{$v}}{{println ""}}{{end}}' 2>/dev/null || true)
    # Also check deploy labels
    port_labels="${port_labels}$(docker service inspect "$port_svc" --format '{{range $k, $v := .Spec.Labels}}{{$k}}={{$v}}{{println ""}}{{end}}' 2>/dev/null || true)"
    local port_domain=$(echo "$port_labels" | grep "traefik.http.routers" | grep "rule=" | head -1 | sed "s/.*Host(\`\?\([^\`\)]*\)\`\?).*/\1/" | sed 's/^`//' | sed 's/`$//')
    if [ -n "$port_domain" ] && [ "$port_domain" != "$port_labels" ]; then
      creds_json=$(echo "$creds_json" | jq --arg v "$port_domain" '. + {portainer: {domain: $v}}')
    fi
  fi

  echo "$creds_json"
}

detect_existing

if [ -n "$DETECTED_TOOLS" ]; then
  echo -e "  ${YELLOW}Ferramentas detectadas nesta VPS:${NC}"
  echo ""

  IFS=',' read -ra TOOL_LIST <<< "$DETECTED_TOOLS"
  for tool in "${TOOL_LIST[@]}"; do
    case "$tool" in
      traefik)   echo -e "    ${GREEN}+${NC} Traefik (proxy reverso / SSL)" ;;
      portainer) echo -e "    ${GREEN}+${NC} Portainer (gerenciamento Docker)" ;;
      postgres)  echo -e "    ${GREEN}+${NC} PostgreSQL (banco de dados)" ;;
      n8n)       echo -e "    ${GREEN}+${NC} n8n (automacao)" ;;
      evolution) echo -e "    ${GREEN}+${NC} Evolution API (WhatsApp)" ;;
    esac
  done

  echo ""
  echo -e "  ${BOLD}Como deseja prosseguir?${NC}"
  echo ""
  echo -e "  ${CYAN}1)${NC} ${BOLD}Importar${NC} - Instalar apenas o painel e importar credenciais existentes"
  echo -e "     Suas ferramentas continuam funcionando normalmente."
  echo ""
  echo -e "  ${CYAN}2)${NC} ${BOLD}Instalacao limpa${NC} - Remover tudo e comecar do zero"
  echo -e "     ${RED}ATENCAO: Todos os dados e containers serao removidos!${NC}"
  echo ""

  CHOICE=""
  while [ "$CHOICE" != "1" ] && [ "$CHOICE" != "2" ]; do
    printf "  Escolha (1 ou 2): " >&2
    read CHOICE < /dev/tty
    CHOICE=$(echo "$CHOICE" | xargs)
    if [ "$CHOICE" != "1" ] && [ "$CHOICE" != "2" ]; then
      echo -e "  ${YELLOW}Opcao invalida. Digite 1 ou 2.${NC}"
    fi
  done

  if [ "$CHOICE" = "1" ]; then
    MIGRATION_MODE="import"
    echo ""
    echo -e "  ${GREEN}Modo importacao selecionado.${NC}"
    echo -e "  Suas ferramentas serao preservadas."
    echo ""
  else
    MIGRATION_MODE="clean"
    echo ""
    echo -e "  ${YELLOW}CONFIRMACAO NECESSARIA${NC}"
    echo -e "  Isso vai remover TODOS os containers, volumes e stacks existentes."
    echo ""
    CONFIRM=""
    printf "  Digite CONFIRMAR para prosseguir: " >&2
    read CONFIRM < /dev/tty
    if [ "$CONFIRM" != "CONFIRMAR" ]; then
      echo -e "\n  ${RED}Instalacao cancelada.${NC}"
      exit 0
    fi
    echo ""
    echo -e "  ${YELLOW}Removendo stacks existentes...${NC}"

    # Remove all stacks
    for stack in $(docker stack ls --format '{{.Name}}' 2>/dev/null); do
      echo -e "    Removendo stack: ${stack}"
      docker stack rm "$stack" >/dev/null 2>&1 || true
    done
    sleep 10

    # Remove all non-system volumes
    for vol in $(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -v '^$'); do
      docker volume rm "$vol" >/dev/null 2>&1 || true
    done

    echo -e "  ${GREEN}Limpeza concluida.${NC}"
    echo ""
  fi
else
  echo -e "  Seja bem-vindo ao nosso painel!"
  echo ""
  echo -e "  Iremos preparar a sua VPS em poucos minutos, ok?"
  echo -e "  Relaxa que e tudo automatico"
  echo ""
fi

# ══════════════════════════════════════
# COLETA DE DADOS
# ══════════════════════════════════════
echo -e "\n  ${MAGENTA}>>${NC} ${BOLD}Configuracao inicial${NC}\n"

BASE_DOMAIN=""
while [ -z "$BASE_DOMAIN" ]; do
  printf "  Qual o seu dominio base? (ex: seudominio.com.br): " >&2
  read BASE_DOMAIN < /dev/tty
  BASE_DOMAIN=$(echo "$BASE_DOMAIN" | sed 's|https\?://||' | sed 's|/||g' | xargs)
  [ -z "$BASE_DOMAIN" ] && echo -e "  ${YELLOW}!${NC}  Dominio base e obrigatorio."
done

echo ""
echo -e "  Agora precisamos do seu email e senha para voce ter acesso"
echo -e "  ao painel onde vai conseguir fazer toda a gestao da sua VPS"
echo -e "  de uma forma simples!"
echo ""

ADMIN_EMAIL=""
while [ -z "$ADMIN_EMAIL" ]; do
  printf "  Seu email: " >&2
  read ADMIN_EMAIL < /dev/tty
  ADMIN_EMAIL=$(echo "$ADMIN_EMAIL" | xargs)
  [ -z "$ADMIN_EMAIL" ] && echo -e "  ${YELLOW}!${NC}  Email e obrigatorio."
done

ADMIN_PASS=""
while true; do
  printf "  Sua senha: " >&2
  read -s ADMIN_PASS < /dev/tty
  echo ""
  if [ -z "$ADMIN_PASS" ]; then
    echo -e "  ${YELLOW}!${NC}  Senha e obrigatoria."
    continue
  fi
  printf "  Confirme a senha: " >&2
  read -s ADMIN_PASS2 < /dev/tty
  echo ""
  if [ "$ADMIN_PASS" != "$ADMIN_PASS2" ]; then
    echo -e "  ${YELLOW}!${NC}  As senhas nao coincidem. Tente novamente."
    ADMIN_PASS=""
    continue
  fi
  break
done

ADMIN_PASS_HASH=$(echo -n "$ADMIN_PASS" | sha256sum | cut -d' ' -f1)

echo ""
SERVER_NAME=""
while [ -z "$SERVER_NAME" ]; do
  printf "  Nome do servidor (ex: n8nlabz, meuserver, minhaempresa): " >&2
  read SERVER_NAME < /dev/tty
  SERVER_NAME=$(echo "$SERVER_NAME" | xargs)
  [ -z "$SERVER_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome do servidor e obrigatorio."
done

NETWORK_NAME=""
while [ -z "$NETWORK_NAME" ]; do
  printf "  Nome da rede (ex: n8nlabznet, minharede): " >&2
  read NETWORK_NAME < /dev/tty
  NETWORK_NAME=$(echo "$NETWORK_NAME" | xargs)
  [ -z "$NETWORK_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome da rede e obrigatorio."
done

SERVER_IP=$(curl -4 -s ifconfig.me || curl -s ifconfig.me)

echo ""
echo -e "  ${YELLOW}IMPORTANTE:${NC} Antes de continuar, voce precisa apontar o DNS"
echo -e "  do subdominio do seu painel para o IP desta VPS: ${BOLD}${SERVER_IP}${NC}"
echo ""
echo -e "  O subdominio pode ser qualquer um, por exemplo:"
echo -e "  ${CYAN}  dashboard.seudominio.com.br${NC}"
echo -e "  ${CYAN}  painel.seudominio.com.br${NC}"
echo -e "  ${CYAN}  console.seudominio.com.br${NC}"
echo ""

DASHBOARD_DOMAIN=""
while [ -z "$DASHBOARD_DOMAIN" ]; do
  printf "  Digite o link completo do seu painel (ex: painel.seudominio.com.br): " >&2
  read DASHBOARD_DOMAIN < /dev/tty
  DASHBOARD_DOMAIN=$(echo "$DASHBOARD_DOMAIN" | sed 's|https\?://||' | sed 's|/||g' | xargs)
  [ -z "$DASHBOARD_DOMAIN" ] && echo -e "  ${YELLOW}!${NC}  Dominio do painel e obrigatorio."
done

echo ""
echo -e "  Preparando sua VPS... isso pode levar alguns minutos."
echo -e "     Nao feche este terminal!"
echo ""

# ══════════════════════════════════════
# INSTALACAO SILENCIOSA
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

# Traefik (skip if import mode and traefik already exists)
if [ "$MIGRATION_MODE" != "import" ] || ! docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "traefik"; then
  TRAEFIK_COMPOSE="/tmp/traefik-compose.yml"
  cat > "$TRAEFIK_COMPOSE" <<'TRAEFIKEOF'
version: "3.8"
services:
  traefik:
    image: traefik:v2.11
    command:
      - "--api.dashboard=false"
      - "--providers.docker.swarmMode=true"
      - "--providers.docker.endpoint=unix:///var/run/docker.sock"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=NETWORK_PLACEHOLDER"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
      - "--entrypoints.web.http.redirections.entrypoint.permanent=true"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.transport.respondingTimeouts.idleTimeout=3600"
      - "--certificatesresolvers.letsencryptresolver.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencryptresolver.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencryptresolver.acme.storage=/etc/traefik/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencryptresolver.acme.email=EMAIL_PLACEHOLDER"
      - "--log.level=ERROR"
      - "--log.format=common"
      - "--log.filePath=/var/log/traefik/traefik.log"
      - "--accesslog=true"
      - "--accesslog.filepath=/var/log/traefik/access-log"
    environment:
      - DOCKER_API_VERSION=1.44
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
    name: NETWORK_PLACEHOLDER
TRAEFIKEOF
  sed -i "s/NETWORK_PLACEHOLDER/${NETWORK_NAME}/g" "$TRAEFIK_COMPOSE"
  sed -i "s/EMAIL_PLACEHOLDER/${ADMIN_EMAIL}/g" "$TRAEFIK_COMPOSE"
  sed -i 's/BKTK/`/g' "$TRAEFIK_COMPOSE"
  docker stack deploy -c "$TRAEFIK_COMPOSE" traefik >/dev/null 2>&1
  rm -f "$TRAEFIK_COMPOSE"
fi

# Repo
if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR" && git pull >/dev/null 2>&1
else
  [ -d "$INSTALL_DIR" ] && rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || {
    echo -e "  ${RED}x${NC} Falha ao clonar repositorio. Verifique sua conexao."
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

# Credentials - import mode: detect and save existing credentials
if [ "$MIGRATION_MODE" = "import" ]; then
  echo -e "  ${CYAN}Detectando credenciais existentes...${NC}"
  DETECTED_CREDS=$(detect_credentials)
  echo "$DETECTED_CREDS" > "$INSTALL_DIR/credentials.json"
  echo -e "  ${GREEN}Credenciais importadas com sucesso.${NC}"
  echo ""
elif [ ! -f "$INSTALL_DIR/credentials.json" ]; then
  echo '{}' > "$INSTALL_DIR/credentials.json"
fi

# Verificar arquivos
if [ ! -f "$INSTALL_DIR/Dockerfile" ] || [ ! -d "$INSTALL_DIR/backend" ] || [ ! -d "$INSTALL_DIR/frontend" ]; then
  echo -e "  ${RED}x${NC} Arquivos do painel nao encontrados. Verifique o repositorio."
  exit 1
fi

# Build
cd "$INSTALL_DIR" && docker build -t n8nlabz-panel:latest . >/dev/null 2>&1

# Remove old panel stack if exists
docker stack rm panel >/dev/null 2>&1 || true
sleep 5

# Deploy painel
PANEL_COMPOSE="/tmp/panel-compose.yml"
cat > "$PANEL_COMPOSE" <<'PANELEOF'
version: "3.8"
services:
  n8nlabz_panel:
    image: n8nlabz-panel:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - INSTALL_DIR_PLACEHOLDER/config.json:/opt/n8nlabz/config.json
      - INSTALL_DIR_PLACEHOLDER/credentials.json:/opt/n8nlabz/credentials.json
      - INSTALL_DIR_PLACEHOLDER/backups:/opt/n8nlabz/backups
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
        - "traefik.http.routers.n8nlabz.rule=Host(BKTKDASHBOARD_PLACEHOLDERBKTK)"
        - "traefik.http.routers.n8nlabz.entrypoints=websecure"
        - "traefik.http.routers.n8nlabz.tls.certresolver=letsencryptresolver"
        - "traefik.http.services.n8nlabz.loadbalancer.server.port=3080"
        - "traefik.docker.network=NETWORK_PLACEHOLDER"

networks:
  network_public:
    external: true
    name: NETWORK_PLACEHOLDER
PANELEOF
sed -i "s|INSTALL_DIR_PLACEHOLDER|${INSTALL_DIR}|g" "$PANEL_COMPOSE"
sed -i "s/DASHBOARD_PLACEHOLDER/${DASHBOARD_DOMAIN}/g" "$PANEL_COMPOSE"
sed -i "s/NETWORK_PLACEHOLDER/${NETWORK_NAME}/g" "$PANEL_COMPOSE"
sed -i 's/BKTK/`/g' "$PANEL_COMPOSE"
docker stack deploy -c "$PANEL_COMPOSE" panel >/dev/null 2>&1
rm -f "$PANEL_COMPOSE"

sleep 10

# ══════════════════════════════════════
# DETECTED TOOLS — mark as installed
# ══════════════════════════════════════
if [ "$MIGRATION_MODE" = "import" ] && [ -n "$DETECTED_TOOLS" ]; then
  # Create installed.json so the panel knows what's already installed
  INSTALLED_JSON="[]"
  IFS=',' read -ra TOOL_LIST <<< "$DETECTED_TOOLS"
  for tool in "${TOOL_LIST[@]}"; do
    case "$tool" in
      n8n|evolution|portainer)
        INSTALLED_JSON=$(echo "$INSTALLED_JSON" | jq --arg t "$tool" '. + [$t]')
        ;;
    esac
  done
  echo "$INSTALLED_JSON" > "$INSTALL_DIR/installed.json"
fi

# ══════════════════════════════════════
# MENSAGEM FINAL
# ══════════════════════════════════════
echo ""
echo -e "  ════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}Tudo pronto!${NC}"
echo ""
echo -e "  Acesse agora o seu painel:"
echo -e "     ${CYAN}https://${DASHBOARD_DOMAIN}${NC}"
echo ""
echo -e "  Use o email e senha que voce cadastrou pra entrar."
echo ""

if [ "$MIGRATION_MODE" = "import" ]; then
  echo -e "  ${GREEN}Modo importacao:${NC} Suas ferramentas existentes foram"
  echo -e "  detectadas e as credenciais importadas automaticamente."
  echo -e "  Acesse a aba ${BOLD}Credenciais${NC} no painel para verificar."
  echo ""
fi

echo -e "  A partir de agora, instale todas as suas ferramentas"
echo -e "  direto pelo painel. Sem terminal, sem complicacao!"
echo ""
echo -e "  ════════════════════════════════════════════════════════"
echo ""
