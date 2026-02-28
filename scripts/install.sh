#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
MAGENTA='\033[0;35m'

INSTALL_DIR="/opt/n8nlabz"
REPO_URL="https://github.com/n8nlabz/setuplabz.git"

# ── Sanitize helper: strip \r\n and spaces ──
sanitize() {
  echo "$1" | tr -d '\r\n' | xargs
}

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

  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "traefik"; then
    found="${found}traefik,"
  fi
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "portainer"; then
    found="${found}portainer,"
  fi
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "postgres"; then
    found="${found}postgres,"
  fi
  if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "n8n"; then
    found="${found}n8n,"
  fi
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

# ── Auto-detect existing configuration ──
detect_config() {
  DETECTED_NETWORK=""
  DETECTED_DOMAIN=""
  DETECTED_SERVER=""
  DETECTED_EMAIL=""

  # 1. Network — first overlay network that's not ingress
  DETECTED_NETWORK=$(docker network ls --filter driver=overlay --format '{{.Name}}' 2>/dev/null | grep -v ingress | head -1)

  # 2. Domain base — from existing config.json
  if [ -f "$INSTALL_DIR/config.json" ]; then
    local cfg_domain
    cfg_domain=$(jq -r '.domain_base // empty' "$INSTALL_DIR/config.json" 2>/dev/null)
    [ -n "$cfg_domain" ] && DETECTED_DOMAIN="$cfg_domain"

    local cfg_email
    cfg_email=$(jq -r '.admin_email // empty' "$INSTALL_DIR/config.json" 2>/dev/null)
    [ -n "$cfg_email" ] && DETECTED_EMAIL="$cfg_email"

    local cfg_server
    cfg_server=$(jq -r '.server_name // empty' "$INSTALL_DIR/config.json" 2>/dev/null)
    [ -n "$cfg_server" ] && DETECTED_SERVER="$cfg_server"

    local cfg_network
    cfg_network=$(jq -r '.network_name // empty' "$INSTALL_DIR/config.json" 2>/dev/null)
    [ -n "$cfg_network" ] && DETECTED_NETWORK="$cfg_network"
  fi

  # 3. Domain base — from n8n N8N_HOST env var (fallback)
  if [ -z "$DETECTED_DOMAIN" ]; then
    local n8n_svc
    n8n_svc=$(find_service_by_keyword "n8n" | grep -v redis | head -1)
    if [ -n "$n8n_svc" ]; then
      local n8n_host
      n8n_host=$(get_service_env "$n8n_svc" "N8N_HOST")
      if [ -n "$n8n_host" ]; then
        # n8n.example.com → example.com (remove first subdomain)
        DETECTED_DOMAIN=$(echo "$n8n_host" | sed 's/^[^.]*\.//')
      fi
    fi
  fi

  # 4. Domain base — from evolution SERVER_URL (fallback)
  if [ -z "$DETECTED_DOMAIN" ]; then
    local evo_svc
    evo_svc=$(find_service_by_keyword "evolution" | grep -v redis | head -1)
    if [ -n "$evo_svc" ]; then
      local evo_url
      evo_url=$(get_service_env "$evo_svc" "SERVER_URL")
      if [ -n "$evo_url" ]; then
        # https://evolution.example.com → example.com
        local evo_host
        evo_host=$(echo "$evo_url" | sed 's|https\?://||' | sed 's|/.*||')
        DETECTED_DOMAIN=$(echo "$evo_host" | sed 's/^[^.]*\.//')
      fi
    fi
  fi

  # 5. Server name — from hostname (fallback)
  if [ -z "$DETECTED_SERVER" ]; then
    DETECTED_SERVER=$(hostname 2>/dev/null | cut -d'.' -f1)
  fi
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
    local port_labels
    port_labels=$(docker service inspect "$port_svc" --format '{{range $k, $v := .Spec.TaskTemplate.ContainerSpec.Labels}}{{$k}}={{$v}}{{println ""}}{{end}}' 2>/dev/null || true)
    port_labels="${port_labels}$(docker service inspect "$port_svc" --format '{{range $k, $v := .Spec.Labels}}{{$k}}={{$v}}{{println ""}}{{end}}' 2>/dev/null || true)"
    local port_domain=$(echo "$port_labels" | grep "traefik.http.routers" | grep "rule=" | head -1 | sed "s/.*Host(\`\?\([^\`\)]*\)\`\?).*/\1/" | sed 's/^`//' | sed 's/`$//')
    if [ -n "$port_domain" ] && [ "$port_domain" != "$port_labels" ]; then
      creds_json=$(echo "$creds_json" | jq --arg v "$port_domain" '. + {portainer: {domain: $v}}')
    fi
  fi

  echo "$creds_json"
}

# ══════════════════════════════════════
# DETECCAO E ESCOLHA DE MODO
# ══════════════════════════════════════

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
    read -r CHOICE < /dev/tty
    CHOICE=$(sanitize "$CHOICE")
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
    read -r CONFIRM < /dev/tty
    CONFIRM=$(sanitize "$CONFIRM")
    if [ "$CONFIRM" != "CONFIRMAR" ]; then
      echo -e "\n  ${RED}Instalacao cancelada.${NC}"
      exit 0
    fi
    echo ""
    echo -e "  ${YELLOW}Removendo stacks existentes...${NC}"

    for stack in $(docker stack ls --format '{{.Name}}' 2>/dev/null); do
      echo -e "    Removendo stack: ${stack}"
      docker stack rm "$stack" >/dev/null 2>&1 || true
    done
    sleep 10

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

SERVER_IP=$(curl -4 -s --max-time 10 ifconfig.me 2>/dev/null || curl -s --max-time 10 ifconfig.me 2>/dev/null || echo "")

if [ "$MIGRATION_MODE" = "import" ]; then
  # ─────────────────────────────────────
  # MODO IMPORTACAO: auto-detect + minimal questions
  # ─────────────────────────────────────
  echo -e "  ${CYAN}Detectando configuracoes existentes...${NC}"
  echo ""

  detect_config

  # Show what was detected
  if [ -n "$DETECTED_NETWORK" ]; then
    echo -e "     Rede: ${BOLD}${DETECTED_NETWORK}${NC} ${GREEN}OK${NC}"
  else
    echo -e "     Rede: ${YELLOW}nao detectada${NC}"
  fi
  if [ -n "$DETECTED_DOMAIN" ]; then
    echo -e "     Dominio base: ${BOLD}${DETECTED_DOMAIN}${NC} ${GREEN}OK${NC}"
  else
    echo -e "     Dominio base: ${YELLOW}nao detectado${NC}"
  fi
  if [ -n "$DETECTED_SERVER" ]; then
    echo -e "     Servidor: ${BOLD}${DETECTED_SERVER}${NC} ${GREEN}OK${NC}"
  else
    echo -e "     Servidor: ${YELLOW}nao detectado${NC}"
  fi
  if [ -n "$DETECTED_EMAIL" ]; then
    echo -e "     Email: ${BOLD}${DETECTED_EMAIL}${NC} ${GREEN}OK${NC}"
  else
    echo -e "     Email: ${YELLOW}nao detectado${NC}"
  fi
  echo ""

  # Use detected values, ask only for missing ones
  NETWORK_NAME="$DETECTED_NETWORK"
  BASE_DOMAIN="$DETECTED_DOMAIN"
  SERVER_NAME="$DETECTED_SERVER"
  ADMIN_EMAIL="$DETECTED_EMAIL"

  # Ask for missing fields
  if [ -z "$BASE_DOMAIN" ]; then
    echo -e "  Nao conseguimos detectar o dominio base."
    while [ -z "$BASE_DOMAIN" ]; do
      printf "  Qual o seu dominio base? (ex: seudominio.com.br): " >&2
      read -r BASE_DOMAIN < /dev/tty
      BASE_DOMAIN=$(sanitize "$BASE_DOMAIN")
      BASE_DOMAIN=$(echo "$BASE_DOMAIN" | sed 's|https\?://||' | sed 's|/||g')
      [ -z "$BASE_DOMAIN" ] && echo -e "  ${YELLOW}!${NC}  Dominio base e obrigatorio."
    done
    echo ""
  fi

  if [ -z "$ADMIN_EMAIL" ]; then
    echo -e "  Nao conseguimos detectar o email."
    while [ -z "$ADMIN_EMAIL" ]; do
      printf "  Seu email: " >&2
      read -r ADMIN_EMAIL < /dev/tty
      ADMIN_EMAIL=$(sanitize "$ADMIN_EMAIL")
      [ -z "$ADMIN_EMAIL" ] && echo -e "  ${YELLOW}!${NC}  Email e obrigatorio."
    done
    echo ""
  fi

  if [ -z "$SERVER_NAME" ]; then
    echo -e "  Nao conseguimos detectar o nome do servidor."
    while [ -z "$SERVER_NAME" ]; do
      printf "  Nome do servidor (ex: n8nlabz): " >&2
      read -r SERVER_NAME < /dev/tty
      SERVER_NAME=$(sanitize "$SERVER_NAME")
      [ -z "$SERVER_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome do servidor e obrigatorio."
    done
    echo ""
  fi

  if [ -z "$NETWORK_NAME" ]; then
    echo -e "  Nao conseguimos detectar a rede."
    while [ -z "$NETWORK_NAME" ]; do
      printf "  Nome da rede (ex: n8nlabznet): " >&2
      read -r NETWORK_NAME < /dev/tty
      NETWORK_NAME=$(sanitize "$NETWORK_NAME")
      [ -z "$NETWORK_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome da rede e obrigatorio."
    done
    echo ""
  fi

  # Always ask: password
  echo -e "\n  ${MAGENTA}>>${NC} ${BOLD}Precisamos apenas de algumas informacoes para o painel:${NC}\n"

  ADMIN_PASS=""
  while true; do
    printf "  Sua senha para o painel: " >&2
    read -rs ADMIN_PASS < /dev/tty
    echo ""
    ADMIN_PASS=$(echo "$ADMIN_PASS" | tr -d '\r')
    if [ -z "$ADMIN_PASS" ]; then
      echo -e "  ${YELLOW}!${NC}  Senha e obrigatoria."
      continue
    fi
    printf "  Confirme a senha: " >&2
    read -rs ADMIN_PASS2 < /dev/tty
    echo ""
    ADMIN_PASS2=$(echo "$ADMIN_PASS2" | tr -d '\r')
    if [ "$ADMIN_PASS" != "$ADMIN_PASS2" ]; then
      echo -e "  ${YELLOW}!${NC}  As senhas nao coincidem. Tente novamente."
      ADMIN_PASS=""
      continue
    fi
    break
  done

  ADMIN_PASS_HASH=$(echo -n "$ADMIN_PASS" | sha256sum | cut -d' ' -f1)

  # Always ask: dashboard domain
  echo ""
  echo -e "  ${YELLOW}IMPORTANTE:${NC} Antes de continuar, voce precisa apontar o DNS"
  echo -e "  do subdominio do seu painel para o IP desta VPS: ${BOLD}${SERVER_IP}${NC}"
  echo ""
  echo -e "  O subdominio pode ser qualquer um, por exemplo:"
  echo -e "  ${CYAN}  painel.${BASE_DOMAIN}${NC}"
  echo -e "  ${CYAN}  dashboard.${BASE_DOMAIN}${NC}"
  echo ""

  DASHBOARD_DOMAIN=""
  while [ -z "$DASHBOARD_DOMAIN" ]; do
    printf "  Digite o link do seu painel (ex: painel.${BASE_DOMAIN}): " >&2
    read -r DASHBOARD_DOMAIN < /dev/tty
    DASHBOARD_DOMAIN=$(sanitize "$DASHBOARD_DOMAIN")
    DASHBOARD_DOMAIN=$(echo "$DASHBOARD_DOMAIN" | sed 's|https\?://||' | sed 's|/||g')
    [ -z "$DASHBOARD_DOMAIN" ] && echo -e "  ${YELLOW}!${NC}  Dominio do painel e obrigatorio."
  done

else
  # ─────────────────────────────────────
  # INSTALACAO NOVA / LIMPA: perguntar tudo
  # ─────────────────────────────────────
  echo -e "\n  ${MAGENTA}>>${NC} ${BOLD}Configuracao inicial${NC}\n"

  BASE_DOMAIN=""
  while [ -z "$BASE_DOMAIN" ]; do
    printf "  Qual o seu dominio base? (ex: seudominio.com.br): " >&2
    read -r BASE_DOMAIN < /dev/tty
    BASE_DOMAIN=$(sanitize "$BASE_DOMAIN")
    BASE_DOMAIN=$(echo "$BASE_DOMAIN" | sed 's|https\?://||' | sed 's|/||g')
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
    read -r ADMIN_EMAIL < /dev/tty
    ADMIN_EMAIL=$(sanitize "$ADMIN_EMAIL")
    [ -z "$ADMIN_EMAIL" ] && echo -e "  ${YELLOW}!${NC}  Email e obrigatorio."
  done

  ADMIN_PASS=""
  while true; do
    printf "  Sua senha: " >&2
    read -rs ADMIN_PASS < /dev/tty
    echo ""
    ADMIN_PASS=$(echo "$ADMIN_PASS" | tr -d '\r')
    if [ -z "$ADMIN_PASS" ]; then
      echo -e "  ${YELLOW}!${NC}  Senha e obrigatoria."
      continue
    fi
    printf "  Confirme a senha: " >&2
    read -rs ADMIN_PASS2 < /dev/tty
    echo ""
    ADMIN_PASS2=$(echo "$ADMIN_PASS2" | tr -d '\r')
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
    read -r SERVER_NAME < /dev/tty
    SERVER_NAME=$(sanitize "$SERVER_NAME")
    [ -z "$SERVER_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome do servidor e obrigatorio."
  done

  NETWORK_NAME=""
  while [ -z "$NETWORK_NAME" ]; do
    printf "  Nome da rede (ex: n8nlabznet, minharede): " >&2
    read -r NETWORK_NAME < /dev/tty
    NETWORK_NAME=$(sanitize "$NETWORK_NAME")
    [ -z "$NETWORK_NAME" ] && echo -e "  ${YELLOW}!${NC}  Nome da rede e obrigatorio."
  done

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
    read -r DASHBOARD_DOMAIN < /dev/tty
    DASHBOARD_DOMAIN=$(sanitize "$DASHBOARD_DOMAIN")
    DASHBOARD_DOMAIN=$(echo "$DASHBOARD_DOMAIN" | sed 's|https\?://||' | sed 's|/||g')
    [ -z "$DASHBOARD_DOMAIN" ] && echo -e "  ${YELLOW}!${NC}  Dominio do painel e obrigatorio."
  done
fi

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

# Docker DNS — garante resolucao de subdominios recem-criados
echo '{"dns": ["8.8.8.8", "8.8.4.4"]}' > /etc/docker/daemon.json
systemctl restart docker

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
# PORTAINER — auto-add environment
# ══════════════════════════════════════
if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qi "portainer"; then
  PORTAINER_DOMAIN=$(jq -r '.portainer.domain // empty' "$INSTALL_DIR/credentials.json" 2>/dev/null)
  PORTAINER_PASSWORD=$(jq -r '.portainer.password // empty' "$INSTALL_DIR/credentials.json" 2>/dev/null)

  if [ -z "$PORTAINER_DOMAIN" ]; then
    PORTAINER_DOMAIN="portainer.${BASE_DOMAIN}"
  fi
  if [ -z "$PORTAINER_PASSWORD" ]; then
    PORTAINER_PASSWORD="${ADMIN_PASS}"
  fi

  echo -e "  ${CYAN}Configurando ambiente do Portainer via ${PORTAINER_DOMAIN}...${NC}"

  PORTAINER_READY=""
  for i in $(seq 1 30); do
    HTTP_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "https://${PORTAINER_DOMAIN}/api/status" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      PORTAINER_READY="1"
      break
    fi
    sleep 10
  done

  if [ -n "$PORTAINER_READY" ]; then
    curl -k -s -X POST "https://${PORTAINER_DOMAIN}/api/users/admin/init" \
      -H "Content-Type: application/json" \
      -d "{\"Username\":\"admin\",\"Password\":\"${PORTAINER_PASSWORD}\"}" >/dev/null 2>&1 || true

    PORTAINER_TOKEN=$(curl -k -s -X POST "https://${PORTAINER_DOMAIN}/api/auth" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"admin\",\"password\":\"${PORTAINER_PASSWORD}\"}" 2>/dev/null | jq -r '.jwt')

    if [ -n "$PORTAINER_TOKEN" ] && [ "$PORTAINER_TOKEN" != "null" ]; then
      curl -k -s -X POST "https://${PORTAINER_DOMAIN}/api/endpoints" \
        -H "Authorization: Bearer ${PORTAINER_TOKEN}" \
        -F "Name=primary" \
        -F "EndpointCreationType=2" \
        -F "URL=tcp://tasks.portainer_agent:9001" \
        -F "GroupID=1" \
        -F "TLS=true" \
        -F "TLSSkipVerify=true" \
        -F "TLSSkipClientVerify=true" >/dev/null 2>&1 || true
      echo -e "  ${GREEN}Ambiente do Portainer configurado automaticamente${NC}"
    else
      echo -e "  ${YELLOW}Nao foi possivel configurar o ambiente do Portainer automaticamente${NC}"
    fi
  else
    echo -e "  ${YELLOW}Portainer ainda nao respondeu. Configure o ambiente manualmente.${NC}"
  fi
  echo ""
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
