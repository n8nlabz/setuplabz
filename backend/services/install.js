const DockerService = require("./docker");
const PortainerAPI = require("./portainer-api");
const crypto = require("crypto");
const fs = require("fs");

const CONFIG_PATH = "/opt/n8nlabz/config.json";
const CREDENTIALS_PATH = "/opt/n8nlabz/credentials.json";

class InstallService {
  // ─── Utilities ───

  static genPass(len = 24) {
    return crypto.randomBytes(len).toString("base64url").slice(0, len);
  }

  static hostRule(domain) {
    return "Host(BKTK" + domain + "BKTK)";
  }

  static replaceBKTK(str) {
    return str.replace(/BKTK/g, String.fromCharCode(96));
  }

  static loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      }
    } catch {}
    return {};
  }

  static getNetworkName() {
    const config = this.loadConfig();
    return config.network_name || "network_public";
  }

  static getSuggestedSubdomains() {
    const config = this.loadConfig();
    const base = config.domain_base;
    if (!base) return {};
    return {
      domain_portainer: "portainer." + base,
      domain_n8n: "n8n." + base,
      domain_webhook: "webhook." + base,
      domain_evolution: "evolution." + base,
      email_ssl: config.admin_email || "",
    };
  }

  // ─── Credentials Persistence ───

  static loadCredentials() {
    try {
      if (fs.existsSync(CREDENTIALS_PATH)) {
        return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
      }
    } catch {}
    return {};
  }

  static saveCredentials(toolId, creds) {
    const all = this.loadCredentials();
    all[toolId] = { ...creds, installed_at: new Date().toISOString() };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(all, null, 2));
  }

  // ─── Portainer API Integration ───

  static async getPortainerClient() {
    const client = new PortainerAPI();
    await client.authenticate();
    return client;
  }

  static async deployStack(stackName, composeContent) {
    const finalCompose = this.replaceBKTK(composeContent);
    try {
      const client = await this.getPortainerClient();
      const result = await client.deployStack(stackName, finalCompose);
      return { success: true, method: "portainer", action: result.action };
    } catch (err) {
      console.log("[DEPLOY] Portainer API falhou para " + stackName + ": " + err.message + ". Usando Docker CLI.");
      return await DockerService.deployStack(stackName, finalCompose);
    }
  }

  static async removeStackViaPortainer(stackName) {
    try {
      const client = await this.getPortainerClient();
      await client.removeStackByName(stackName);
      return { success: true, method: "portainer" };
    } catch (err) {
      console.log("[REMOVE] Portainer API falhou para " + stackName + ": " + err.message + ". Usando Docker CLI.");
      return await DockerService.removeStack(stackName);
    }
  }

  // ─── Service Health Check ───

  static async waitForService(serviceName, timeout = 300000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const output = DockerService.run(
          "docker service ls --filter name=" + serviceName + " --format '{{.Replicas}}'"
        );
        const lines = output.split("\n").filter(Boolean);
        const allReady = lines.length > 0 && lines.every((line) => {
          const match = line.match(/(\d+)\/(\d+)/);
          return match && match[1] === match[2] && parseInt(match[1]) > 0;
        });
        if (allReady) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
  }

  // ─── PostgreSQL Shared ───

  static isPostgresInstalled() {
    const containers = DockerService.listContainers();
    return containers.some(
      (c) => c.name.toLowerCase().includes("postgres_postgres") && c.state === "running"
    );
  }

  static async ensurePostgres(onLog) {
    if (this.isPostgresInstalled()) {
      if (onLog) onLog("PostgreSQL compartilhado já está rodando.", "info");
      return;
    }
    if (onLog) onLog("Instalando PostgreSQL compartilhado...", "info");
    const pgRootPass = this.genPass();
    const compose = this.getPostgresCompose(pgRootPass);
    await this.deployStack("postgres", compose);

    if (onLog) onLog("Aguardando PostgreSQL ficar pronto...", "info");
    await this.waitForService("postgres_postgres", 120000);
    await new Promise((r) => setTimeout(r, 5000));

    this.saveCredentials("postgres", {
      host: "postgres_postgres",
      port: 5432,
      user: "postgres",
      password: pgRootPass,
      databases: [],
    });
    if (onLog) onLog("PostgreSQL compartilhado instalado!", "success");
  }

  static async createDatabase(dbName, onLog) {
    const containers = DockerService.listContainers();
    const pgContainer = containers.find(
      (c) => c.name.toLowerCase().includes("postgres_postgres") && c.state === "running"
    );
    if (!pgContainer) throw new Error("Container PostgreSQL não encontrado");

    const creds = this.loadCredentials();
    const pgPass = creds.postgres?.password;
    if (!pgPass) throw new Error("Senha do PostgreSQL não encontrada");

    try {
      DockerService.execInContainer(
        pgContainer.id,
        "PGPASSWORD='" + pgPass + "' psql -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='" + dbName + "'\" | grep -q 1 || " +
        "PGPASSWORD='" + pgPass + "' psql -U postgres -c \"CREATE DATABASE " + dbName + "\""
      );

      const allCreds = this.loadCredentials();
      if (allCreds.postgres && !allCreds.postgres.databases.includes(dbName)) {
        allCreds.postgres.databases.push(dbName);
        fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(allCreds, null, 2));
      }

      if (onLog) onLog("Banco '" + dbName + "' criado.", "info");
    } catch (err) {
      if (onLog) onLog("Aviso ao criar banco: " + err.message, "info");
    }
  }

  // ─── Traefik Check ───

  static isTraefikRunning() {
    const containers = DockerService.listContainers();
    return containers.some(
      (c) => c.name.toLowerCase().includes("traefik") && c.state === "running"
    );
  }

  // ══════════════════════════════════════
  // COMPOSE TEMPLATES (comentados em PT-BR)
  // ══════════════════════════════════════

  static getPostgresCompose(pgRootPass) {
    var net = this.getNetworkName();
    return 'version: "3.8"\n' +
      "services:\n" +
      "  postgres:\n" +
      "    image: postgres:16 ## Versão do PostgreSQL\n" +
      "    environment:\n" +
      "    ## 🔐 Credenciais do banco de dados\n" +
      "      - POSTGRES_USER=postgres ## Usuário root do PostgreSQL\n" +
      "      - POSTGRES_PASSWORD=" + pgRootPass + " ## Senha gerada automaticamente\n" +
      "    ## 🕒 Fuso Horário\n" +
      "      - TZ=America/Sao_Paulo\n" +
      "    volumes:\n" +
      "      - postgres_data:/var/lib/postgresql/data ## Persistência dos dados\n" +
      "    networks:\n" +
      "      - network_public ## Rede compartilhada entre serviços\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "\n" +
      "volumes:\n" +
      "  postgres_data:\n" +
      "    external: true\n" +
      "    name: postgres_data\n" +
      "\n" +
      "networks:\n" +
      "  network_public:\n" +
      "    external: true\n" +
      "    name: " + net + "\n";
  }

  static getPortainerCompose(c) {
    var net = this.getNetworkName();
    return 'version: "3.8"\n' +
      "services:\n" +
      "  agent:\n" +
      "    image: portainer/agent:latest ## Agente do Portainer para comunicação com Docker\n" +
      "    volumes:\n" +
      "      - /var/run/docker.sock:/var/run/docker.sock\n" +
      "      - /var/lib/docker/volumes:/var/lib/docker/volumes\n" +
      "    networks:\n" +
      "      - agent_network ## Rede interna do Portainer\n" +
      "    deploy:\n" +
      "      mode: global ## Roda em todos os nós do Swarm\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.platform.os == linux\n" +
      "\n" +
      "  portainer:\n" +
      "    image: portainer/portainer-ce:latest ## Painel de gerenciamento Docker\n" +
      "    command: -H tcp://tasks.portainer_agent:9001 --tlsskipverify\n" +
      "    volumes:\n" +
      "      - portainer_data:/data ## Persistência das configurações\n" +
      "    networks:\n" +
      "      - network_public ## Rede pública (Traefik)\n" +
      "      - agent_network ## Rede interna do agente\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      labels:\n" +
      '        - "traefik.enable=true"\n' +
      '        - "traefik.http.routers.portainer.rule=' + this.hostRule(c.domain_portainer) + '"\n' +
      '        - "traefik.http.routers.portainer.entrypoints=websecure"\n' +
      '        - "traefik.http.routers.portainer.tls.certresolver=letsencryptresolver"\n' +
      '        - "traefik.http.services.portainer.loadbalancer.server.port=9000"\n' +
      '        - "traefik.docker.network=' + net + '"\n' +
      "\n" +
      "volumes:\n" +
      "  portainer_data:\n" +
      "    external: true\n" +
      "    name: portainer_data\n" +
      "\n" +
      "networks:\n" +
      "  network_public:\n" +
      "    external: true\n" +
      "    name: " + net + "\n" +
      "  agent_network:\n" +
      "    driver: overlay\n" +
      "    attachable: true\n";
  }

  static getN8nSimpleCompose(c) {
    var net = this.getNetworkName();
    var rp = c.router_prefix || "";
    return 'version: "3.8"\n' +
      "services:\n" +
      "  n8n_editor:\n" +
      "    image: n8nio/n8n:latest ## Versão do N8N\n" +
      "\n" +
      "    networks:\n" +
      "      - network_public ## Nome da rede interna\n" +
      "\n" +
      "    environment:\n" +
      "    ## 🗄️ Banco de Dados (PostgreSQL)\n" +
      "      - DB_TYPE=postgresdb\n" +
      "      - DB_POSTGRESDB_DATABASE=n8n_db ## Nome do banco\n" +
      "      - DB_POSTGRESDB_HOST=" + (c.pg_host || "postgres_postgres") + " ## Host do PostgreSQL (DNS do Swarm)\n" +
      "      - DB_POSTGRESDB_PORT=5432\n" +
      "      - DB_POSTGRESDB_USER=postgres ## Usuário do banco\n" +
      "      - DB_POSTGRESDB_PASSWORD=" + c.pg_password + " ## Senha do PostgreSQL\n" +
      "\n" +
      "    ## 🔐 Criptografia\n" +
      "      - N8N_ENCRYPTION_KEY=" + c.encryption_key + " ## Chave de criptografia (NÃO altere depois de instalado)\n" +
      "\n" +
      "    ## 🌐 URLs e Configurações de Acesso\n" +
      "      - N8N_HOST=" + c.domain_n8n + "\n" +
      "      - N8N_EDITOR_BASE_URL=https://" + c.domain_n8n + "/\n" +
      "      - WEBHOOK_URL=https://" + c.domain_n8n + " ## URL dos webhooks\n" +
      "      - N8N_PROTOCOL=https\n" +
      "      - N8N_PROXY_HOPS=1\n" +
      "\n" +
      "    ## ⚙️ Ambiente de Execução\n" +
      "      - NODE_ENV=production\n" +
      "      - N8N_REINSTALL_MISSING_PACKAGES=true\n" +
      "\n" +
      "    ## 📦 Pacotes da Comunidade\n" +
      "      - N8N_COMMUNITY_PACKAGES_ENABLED=true ## Permite instalar nodes da comunidade\n" +
      "      - N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true\n" +
      "      - N8N_PUBLIC_API_DISABLED=false\n" +
      "\n" +
      "    ## 📊 Métricas e Limpeza\n" +
      "      - N8N_METRICS=true\n" +
      "      - EXECUTIONS_DATA_PRUNE=true ## Limpa execuções antigas\n" +
      "      - EXECUTIONS_DATA_MAX_AGE=336 ## Mantém execuções por 14 dias\n" +
      "\n" +
      "    ## 🧩 Funções Personalizadas\n" +
      "      - NODE_FUNCTION_ALLOW_BUILTIN=* ## Permite todos os módulos Node.js\n" +
      "      - NODE_FUNCTION_ALLOW_EXTERNAL=moment,lodash\n" +
      "      - N8N_ONBOARDING_FLOW_DISABLED=true\n" +
      "\n" +
      "    ## 🕒 Fuso Horário\n" +
      "      - GENERIC_TIMEZONE=America/Sao_Paulo\n" +
      "      - TZ=America/Sao_Paulo\n" +
      "\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "      labels:\n" +
      '        - "traefik.enable=true"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.rule=' + this.hostRule(c.domain_n8n) + '"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.entrypoints=websecure"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.tls.certresolver=letsencryptresolver"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.service=' + rp + 'n8n_editor"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_editor.loadbalancer.server.port=5678"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_editor.loadbalancer.passHostHeader=1"\n' +
      "\n" +
      "networks:\n" +
      "  network_public:\n" +
      "    external: true\n" +
      "    name: " + net + "\n";
  }

  static getN8nQueueCompose(c) {
    var net = this.getNetworkName();
    var rp = c.router_prefix || "";
    var webhookDomain = c.domain_webhook || c.domain_n8n;

    var sharedEnv =
      "    ## 🗄️ Banco de Dados (PostgreSQL)\n" +
      "      - DB_TYPE=postgresdb\n" +
      "      - DB_POSTGRESDB_DATABASE=n8n_db ## Nome do banco\n" +
      "      - DB_POSTGRESDB_HOST=" + (c.pg_host || "postgres_postgres") + " ## Host do PostgreSQL (DNS do Swarm)\n" +
      "      - DB_POSTGRESDB_PORT=5432\n" +
      "      - DB_POSTGRESDB_USER=postgres ## Usuário do banco\n" +
      "      - DB_POSTGRESDB_PASSWORD=" + c.pg_password + " ## Senha do PostgreSQL\n" +
      "\n" +
      "    ## 🔐 Criptografia\n" +
      "      - N8N_ENCRYPTION_KEY=" + c.encryption_key + " ## Chave de criptografia (NÃO altere depois de instalado)\n" +
      "\n" +
      "    ## ⚙️ Modo de Execução\n" +
      "      - EXECUTIONS_MODE=queue ## Modo fila (recomendado para produção)\n" +
      "\n" +
      "    ## 🔁 Redis (Fila de Execução)\n" +
      "      - QUEUE_BULL_REDIS_HOST=" + (c.redis_host || "n8n_n8n_redis") + " ## Host do Redis (DNS do Swarm)\n" +
      "      - QUEUE_BULL_REDIS_PORT=6379\n" +
      "      - QUEUE_BULL_REDIS_DB=1\n" +
      "\n" +
      "    ## 🕒 Fuso Horário\n" +
      "      - GENERIC_TIMEZONE=America/Sao_Paulo\n" +
      "      - TZ=America/Sao_Paulo\n" +
      "      - N8N_FIX_MIGRATIONS=true\n";

    var smtpEnv = "";
    if (c.smtp_host) {
      smtpEnv =
        "\n" +
        "    ## 📧 SMTP (Email)\n" +
        "      - N8N_SMTP_SENDER=" + (c.smtp_email || "") + "\n" +
        "      - N8N_SMTP_USER=" + (c.smtp_user || "") + "\n" +
        "      - N8N_SMTP_PASS=" + (c.smtp_pass || "") + "\n" +
        "      - N8N_SMTP_HOST=" + c.smtp_host + "\n" +
        "      - N8N_SMTP_PORT=" + (c.smtp_port || "587") + "\n" +
        "      - N8N_SMTP_SSL=false\n";
    }

    return 'version: "3.8"\n' +
      "services:\n" +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Editor — Interface visual do n8n\n" +
      "  ## ═══════════════════════════════════\n" +
      "  n8n_editor:\n" +
      "    image: n8nio/n8n:latest ## Versão do N8N\n" +
      "    command: start\n" +
      "    networks:\n" +
      "      - network_public ## Nome da rede interna\n" +
      "    environment:\n" +
      sharedEnv +
      "\n" +
      "    ## 🌐 URLs e Configurações de Acesso\n" +
      "      - N8N_HOST=" + c.domain_n8n + "\n" +
      "      - N8N_EDITOR_BASE_URL=https://" + c.domain_n8n + "/\n" +
      "      - WEBHOOK_URL=https://" + webhookDomain + "/ ## URL dos webhooks\n" +
      "      - N8N_PROTOCOL=https\n" +
      "      - N8N_PROXY_HOPS=1\n" +
      "      - NODE_ENV=production\n" +
      "\n" +
      "    ## ⏱️ Timeouts\n" +
      "      - EXECUTIONS_TIMEOUT=3600 ## Timeout de execução (1 hora)\n" +
      "      - EXECUTIONS_TIMEOUT_MAX=7200 ## Timeout máximo (2 horas)\n" +
      "      - OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true ## Execuções manuais vão para workers\n" +
      "\n" +
      "    ## 🤖 Runners (IA)\n" +
      "      - N8N_RUNNERS_ENABLED=true\n" +
      "      - N8N_RUNNERS_MODE=internal\n" +
      "\n" +
      "    ## 📦 Pacotes da Comunidade\n" +
      "      - N8N_REINSTALL_MISSING_PACKAGES=true\n" +
      "      - N8N_COMMUNITY_PACKAGES_ENABLED=true ## Permite instalar nodes da comunidade\n" +
      "      - N8N_PUBLIC_API_DISABLED=false\n" +
      "\n" +
      "    ## 📊 Métricas e Limpeza\n" +
      "      - N8N_METRICS=true\n" +
      "      - EXECUTIONS_DATA_PRUNE=true ## Limpa execuções antigas\n" +
      "      - EXECUTIONS_DATA_MAX_AGE=336 ## Mantém execuções por 14 dias\n" +
      "\n" +
      "    ## 🧩 Funções Personalizadas\n" +
      "      - NODE_FUNCTION_ALLOW_BUILTIN=* ## Permite todos os módulos Node.js\n" +
      "      - NODE_FUNCTION_ALLOW_EXTERNAL=moment,lodash\n" +
      "      - N8N_ONBOARDING_FLOW_DISABLED=true\n" +
      smtpEnv +
      "\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "      labels:\n" +
      '        - "traefik.enable=true"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.rule=' + this.hostRule(c.domain_n8n) + '"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.entrypoints=websecure"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.priority=10"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.tls.certresolver=letsencryptresolver"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_editor.service=' + rp + 'n8n_editor"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_editor.loadbalancer.server.port=5678"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_editor.loadbalancer.passHostHeader=1"\n' +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Webhook — Processa webhooks recebidos\n" +
      "  ## ═══════════════════════════════════\n" +
      "  n8n_webhook:\n" +
      "    image: n8nio/n8n:latest ## Mesma versão do editor\n" +
      "    command: webhook\n" +
      "    networks:\n" +
      "      - network_public\n" +
      "    environment:\n" +
      sharedEnv +
      "\n" +
      "    ## 🌐 URLs\n" +
      "      - N8N_HOST=" + c.domain_n8n + "\n" +
      "      - N8N_EDITOR_BASE_URL=https://" + c.domain_n8n + "/\n" +
      "      - WEBHOOK_URL=https://" + webhookDomain + "/\n" +
      "      - N8N_PROTOCOL=https\n" +
      "      - NODE_ENV=production\n" +
      "\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "      labels:\n" +
      '        - "traefik.enable=true"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_webhook.rule=' + this.hostRule(webhookDomain) + '"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_webhook.entrypoints=websecure"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_webhook.priority=5"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_webhook.tls.certresolver=letsencryptresolver"\n' +
      '        - "traefik.http.routers.' + rp + 'n8n_webhook.service=' + rp + 'n8n_webhook"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_webhook.loadbalancer.server.port=5678"\n' +
      '        - "traefik.http.services.' + rp + 'n8n_webhook.loadbalancer.passHostHeader=1"\n' +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Worker — Executa os workflows em background\n" +
      "  ## ═══════════════════════════════════\n" +
      "  n8n_worker:\n" +
      "    image: n8nio/n8n:latest ## Mesma versão do editor\n" +
      "    command: worker --concurrency=10 ## Até 10 execuções simultâneas\n" +
      "    networks:\n" +
      "      - network_public\n" +
      "    environment:\n" +
      sharedEnv +
      "\n" +
      "    ## 📦 Pacotes (Worker precisa dos mesmos nodes)\n" +
      "      - N8N_REINSTALL_MISSING_PACKAGES=true\n" +
      "      - NODE_FUNCTION_ALLOW_BUILTIN=*\n" +
      "      - NODE_FUNCTION_ALLOW_EXTERNAL=moment,lodash\n" +
      "\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Redis — Fila de execuções\n" +
      "  ## ═══════════════════════════════════\n" +
      "  n8n_redis:\n" +
      "    image: redis:latest ## Redis para fila de execuções\n" +
      '    command: ["redis-server", "--appendonly", "yes", "--port", "6379"]\n' +
      "    volumes:\n" +
      "      - n8n_redis:/data ## Persistência da fila\n" +
      "    networks:\n" +
      "      - network_public\n" +
      "    deploy:\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "\n" +
      "volumes:\n" +
      "  n8n_redis:\n" +
      "    external: true\n" +
      "    name: n8n_redis\n" +
      "\n" +
      "networks:\n" +
      "  network_public:\n" +
      "    external: true\n" +
      "    name: " + net + "\n";
  }

  static getEvolutionCompose(c) {
    var net = this.getNetworkName();
    var rp = c.router_prefix || "";
    return 'version: "3.8"\n' +
      "services:\n" +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Evolution API — Integração WhatsApp\n" +
      "  ## ═══════════════════════════════════\n" +
      "  evolution_api:\n" +
      "    image: atendai/evolution-api:latest ## Versão da Evolution API\n" +
      "    volumes:\n" +
      "      - evolution_instances:/evolution/instances ## Persistência das instâncias WhatsApp\n" +
      "    networks:\n" +
      "      - network_public ## Nome da rede interna\n" +
      "    environment:\n" +
      "\n" +
      "    ## 🌐 URL do Servidor\n" +
      "      - SERVER_URL=https://" + c.domain_evolution + "\n" +
      "\n" +
      "    ## 🔑 Autenticação da API\n" +
      "      - AUTHENTICATION_API_KEY=" + c.evolution_key + " ## Chave da API (use para autenticar requisições)\n" +
      "      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true\n" +
      "\n" +
      "    ## ⚙️ Configurações Gerais\n" +
      "      - DEL_INSTANCE=false\n" +
      "      - QRCODE_LIMIT=1902\n" +
      "      - LANGUAGE=pt-BR\n" +
      "      - CONFIG_SESSION_PHONE_CLIENT=N8NLABZ\n" +
      "      - CONFIG_SESSION_PHONE_NAME=Chrome\n" +
      "\n" +
      "    ## 🗄️ Banco de Dados (PostgreSQL)\n" +
      "      - DATABASE_ENABLED=true\n" +
      "      - DATABASE_PROVIDER=postgresql\n" +
      "      - DATABASE_CONNECTION_URI=postgresql://postgres:" + c.pg_password + "@" + (c.pg_host || "postgres_postgres") + ":5432/evolution_db ## Conexão com PostgreSQL compartilhado\n" +
      "      - DATABASE_CONNECTION_CLIENT_NAME=evolution\n" +
      "      - DATABASE_SAVE_DATA_INSTANCE=true\n" +
      "      - DATABASE_SAVE_DATA_NEW_MESSAGE=true\n" +
      "      - DATABASE_SAVE_MESSAGE_UPDATE=true\n" +
      "      - DATABASE_SAVE_DATA_CONTACTS=true\n" +
      "      - DATABASE_SAVE_DATA_CHATS=true\n" +
      "      - DATABASE_SAVE_DATA_LABELS=true\n" +
      "      - DATABASE_SAVE_DATA_HISTORIC=true\n" +
      "\n" +
      "    ## 🤖 Integrações habilitadas\n" +
      "      - N8N_ENABLED=true\n" +
      "      - EVOAI_ENABLED=true\n" +
      "      - OPENAI_ENABLED=true\n" +
      "      - DIFY_ENABLED=true\n" +
      "      - TYPEBOT_ENABLED=true\n" +
      "      - TYPEBOT_API_VERSION=latest\n" +
      "      - CHATWOOT_ENABLED=true\n" +
      "\n" +
      "    ## 🔁 Cache Redis\n" +
      "      - CACHE_REDIS_ENABLED=true\n" +
      "      - CACHE_REDIS_URI=redis://" + (c.evo_redis_host || "evolution_evolution_redis") + ":6379/1 ## Redis dedicado para cache\n" +
      "      - CACHE_REDIS_PREFIX_KEY=evolution\n" +
      "      - CACHE_REDIS_SAVE_INSTANCES=false\n" +
      "      - CACHE_LOCAL_ENABLED=false\n" +
      "\n" +
      "    ## 🚫 Serviços desabilitados\n" +
      "      - S3_ENABLED=false\n" +
      "      - TELEMETRY=false\n" +
      "      - WEBSOCKET_ENABLED=false\n" +
      "      - RABBITMQ_ENABLED=false\n" +
      "      - WEBHOOK_GLOBAL_ENABLED=false\n" +
      "      - PROVIDER_ENABLED=false\n" +
      "\n" +
      "    ## 📱 WhatsApp Business\n" +
      "      - WA_BUSINESS_TOKEN_WEBHOOK=evolution\n" +
      "      - WA_BUSINESS_URL=https://graph.facebook.com\n" +
      "      - WA_BUSINESS_VERSION=v23.0\n" +
      "      - WA_BUSINESS_LANGUAGE=pt_BR\n" +
      "\n" +
      "    deploy:\n" +
      "      mode: replicated\n" +
      "      replicas: 1\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      labels:\n" +
      '        - "traefik.enable=true"\n' +
      '        - "traefik.http.routers.' + rp + 'evolution.rule=' + this.hostRule(c.domain_evolution) + '"\n' +
      '        - "traefik.http.routers.' + rp + 'evolution.entrypoints=websecure"\n' +
      '        - "traefik.http.routers.' + rp + 'evolution.tls.certresolver=letsencryptresolver"\n' +
      '        - "traefik.http.routers.' + rp + 'evolution.service=' + rp + 'evolution"\n' +
      '        - "traefik.http.services.' + rp + 'evolution.loadbalancer.server.port=8080"\n' +
      '        - "traefik.http.services.' + rp + 'evolution.loadbalancer.passHostHeader=true"\n' +
      "\n" +
      "  ## ═══════════════════════════════════\n" +
      "  ## Redis — Cache da Evolution\n" +
      "  ## ═══════════════════════════════════\n" +
      "  evolution_redis:\n" +
      "    image: redis:latest ## Redis dedicado para cache da Evolution\n" +
      '    command: ["redis-server", "--appendonly", "yes", "--port", "6379"]\n' +
      "    volumes:\n" +
      "      - evolution_redis:/data ## Persistência do cache\n" +
      "    networks:\n" +
      "      - network_public\n" +
      "    deploy:\n" +
      "      placement:\n" +
      "        constraints:\n" +
      "          - node.role == manager\n" +
      "      resources:\n" +
      "        limits:\n" +
      '          cpus: "1"\n' +
      "          memory: 1024M\n" +
      "\n" +
      "volumes:\n" +
      "  evolution_instances:\n" +
      "    external: true\n" +
      "    name: evolution_instances\n" +
      "  evolution_redis:\n" +
      "    external: true\n" +
      "    name: evolution_redis\n" +
      "\n" +
      "networks:\n" +
      "  network_public:\n" +
      "    external: true\n" +
      "    name: " + net + "\n";
  }

  // ─── Portainer Admin Init ───

  static async initPortainerAdmin(password, addLog) {
    const portainerUrl = "http://portainer_portainer:9000";
    for (let i = 0; i < 30; i++) {
      try {
        const status = DockerService.run(
          'curl -s -o /dev/null -w "%{http_code}" --max-time 5 ' + portainerUrl + "/api/status"
        );
        if (status.trim() === "200") {
          const payload = JSON.stringify({ Username: "admin", Password: password });
          const payloadPath = "/tmp/portainer-init.json";
          fs.writeFileSync(payloadPath, payload);
          try {
            DockerService.run(
              "curl -s -X POST " + portainerUrl + "/api/users/admin/init " +
              '-H "Content-Type: application/json" ' +
              "-d @" + payloadPath
            );
            if (addLog) addLog("Admin do Portainer configurado!", "success");
          } catch {
            if (addLog) addLog("Portainer pode já ter admin configurado.", "info");
          } finally {
            try { fs.unlinkSync(payloadPath); } catch {}
          }

          await new Promise((r) => setTimeout(r, 15000));
          await this.addPortainerEnvironment(portainerUrl, password, addLog);
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (addLog) addLog("Portainer ainda inicializando. Configure o admin no primeiro acesso.", "info");
  }

  static async addPortainerEnvironment(portainerUrl, password, addLog) {
    try {
      const authPayload = JSON.stringify({ Username: "admin", Password: password });
      const authPath = "/tmp/portainer-auth.json";
      fs.writeFileSync(authPath, authPayload);
      const authResult = DockerService.run(
        "curl -s -X POST " + portainerUrl + "/api/auth " +
        '-H "Content-Type: application/json" ' +
        "-d @" + authPath
      );
      try { fs.unlinkSync(authPath); } catch {}

      const jwt = JSON.parse(authResult).jwt;
      if (!jwt) {
        if (addLog) addLog("Não foi possível obter token do Portainer.", "info");
        return;
      }

      const envPayload = JSON.stringify({
        Name: "local",
        EndpointCreationType: 2,
        URL: "tcp://tasks.portainer_agent:9001",
        TLS: true,
        TLSSkipVerify: true,
      });
      const envPath = "/tmp/portainer-env.json";
      fs.writeFileSync(envPath, envPayload);
      DockerService.run(
        "curl -s -X POST " + portainerUrl + "/api/endpoints " +
        '-H "Content-Type: application/json" ' +
        '-H "Authorization: Bearer ' + jwt + '" ' +
        "-d @" + envPath
      );
      try { fs.unlinkSync(envPath); } catch {}
      if (addLog) addLog("Environment 'local' adicionado ao Portainer!", "success");
    } catch (err) {
      if (addLog) addLog("Aviso ao adicionar environment: " + err.message, "info");
    }
  }

  // ─── Update Service Image ───

  static async updateImage(toolId, version, onLog) {
    const imageMap = {
      n8n: { image: "n8nio/n8n", services: ["n8n_n8n_editor", "n8n_n8n_webhook", "n8n_n8n_worker"] },
      evolution: { image: "atendai/evolution-api", services: ["evolution_evolution_api"] },
      portainer: { image: "portainer/portainer-ce", services: ["portainer_portainer"] },
    };

    const tool = imageMap[toolId];
    if (!tool) throw new Error("Ferramenta desconhecida: " + toolId);

    // Try Portainer API first: regenerate compose with new version and update stack
    try {
      const client = await this.getPortainerClient();
      const stackName = toolId;
      const existing = await client.getStackByName(stackName);

      if (existing) {
        if (onLog) onLog("Atualizando via Portainer API...", "info");

        // Get current compose and replace image tags
        let compose = existing.StackFileContent || "";
        if (compose) {
          // Replace image version for all matching images
          const oldImagePattern = tool.image.replace("/", "\\/") + ":[^\\s\"]+";
          const newImage = tool.image + ":" + version;
          compose = compose.replace(new RegExp(oldImagePattern, "g"), newImage);

          await client.updateStack(existing.Id, compose);
          if (onLog) onLog("Stack " + stackName + " atualizada para " + newImage + " via Portainer!", "success");
          return [{ service: stackName, success: true, method: "portainer" }];
        }
      }
    } catch (err) {
      if (onLog) onLog("Portainer API indisponivel, usando Docker CLI: " + err.message, "info");
    }

    // Fallback: docker service update per service
    const results = [];
    for (const service of tool.services) {
      try {
        const fullImage = tool.image + ":" + version;
        if (onLog) onLog("Atualizando " + service + " para " + fullImage + "...", "info");
        DockerService.run(
          "docker service update --image " + fullImage + " " + service,
          { timeout: 300000 }
        );
        results.push({ service, success: true, method: "docker-cli" });
        if (onLog) onLog(service + " atualizado!", "success");
      } catch (err) {
        results.push({ service, success: false, error: err.message });
        if (onLog) onLog("Erro ao atualizar " + service + ": " + err.message, "error");
      }
    }
    return results;
  }

  // ─── Core Install ───

  static async installTool(toolId, config, onLog) {
    const log = (text, type = "default") => {
      const entry = { text, type, time: new Date().toLocaleTimeString("pt-BR", { hour12: false }).slice(0, 8) };
      if (onLog) onLog(entry);
      return entry;
    };

    const logs = [];
    const addLog = (text, type) => { const l = log(text, type); logs.push(l); };

    try {
      addLog("Verificando rede Docker...", "info");
      DockerService.ensureNetwork(this.getNetworkName(), "overlay");

      let compose, stackName, credentials = {};

      switch (toolId) {
        case "portainer": {
          stackName = "portainer";
          const portainerPass = config.admin_password || this.genPass();
          addLog("Gerando configuração Portainer + Agent...", "info");
          compose = this.getPortainerCompose(config);
          credentials = {
            url: "https://" + config.domain_portainer,
            domain: config.domain_portainer,
            username: "admin",
            password: portainerPass,
          };
          break;
        }

        case "n8n": {
          addLog("Verificando dependências...", "info");
          await this.ensurePostgres((text, type) => addLog(text, type));

          const mode = config.n8n_mode || "simple";
          stackName = "n8n";

          const pgCreds = this.loadCredentials();
          const pgPass = pgCreds.postgres?.password;
          if (!pgPass) throw new Error("Senha do PostgreSQL não encontrada");

          const encKey = this.genPass(32);

          addLog("Criando banco de dados n8n...", "info");
          await this.createDatabase("n8n_db", (text, type) => addLog(text, type));

          const composeConfig = { ...config, pg_password: pgPass, encryption_key: encKey };

          if (mode === "queue") {
            addLog("Gerando configuração n8n (modo avançado com filas)...", "info");
            compose = this.getN8nQueueCompose(composeConfig);
            credentials = {
              editor_url: "https://" + config.domain_n8n,
              webhook_url: "https://" + (config.domain_webhook || config.domain_n8n),
              domain: config.domain_n8n,
              domain_webhook: config.domain_webhook || config.domain_n8n,
              note: "Email e senha são criados no primeiro acesso ao n8n",
              mode: "queue",
              encryption_key: encKey,
            };
          } else {
            addLog("Gerando configuração n8n (modo simples)...", "info");
            compose = this.getN8nSimpleCompose(composeConfig);
            credentials = {
              editor_url: "https://" + config.domain_n8n,
              webhook_url: "https://" + config.domain_n8n,
              domain: config.domain_n8n,
              note: "Email e senha são criados no primeiro acesso ao n8n",
              mode: "simple",
              encryption_key: encKey,
            };
          }

          if (config.smtp_host) {
            credentials.smtp = {
              email: config.smtp_email,
              host: config.smtp_host,
              port: config.smtp_port || "587",
            };
          }
          break;
        }

        case "evolution": {
          addLog("Verificando dependências...", "info");
          await this.ensurePostgres((text, type) => addLog(text, type));

          stackName = "evolution";
          const pgCreds2 = this.loadCredentials();
          const pgPass2 = pgCreds2.postgres?.password;
          if (!pgPass2) throw new Error("Senha do PostgreSQL não encontrada");

          const apiKey = config.evolution_key || this.genPass(32);

          addLog("Criando banco de dados Evolution...", "info");
          await this.createDatabase("evolution_db", (text, type) => addLog(text, type));

          addLog("Gerando configuração Evolution API...", "info");
          compose = this.getEvolutionCompose({ ...config, pg_password: pgPass2, evolution_key: apiKey });
          credentials = {
            base_url: "https://" + config.domain_evolution,
            manager_url: "https://" + config.domain_evolution + "/manager",
            domain: config.domain_evolution,
            api_key: apiKey,
          };
          break;
        }

        default:
          throw new Error("Ferramenta desconhecida: " + toolId);
      }

      addLog('Deploy da stack "' + stackName + '"...', "info");
      const deployResult = await this.deployStack(stackName, compose);
      addLog("Deploy iniciado via " + (deployResult.method || "docker-cli") + ".", "info");

      addLog("Aguardando serviços ficarem prontos...", "info");
      const ready = await this.waitForService(stackName + "_", 180000);
      if (!ready) {
        addLog("Timeout aguardando serviço, mas o deploy foi iniciado.", "info");
      }

      if (toolId === "portainer") {
        await this.initPortainerAdmin(credentials.password, (text, type) => addLog(text, type));
        const cfg = this.loadConfig();
        cfg.portainer_domain = credentials.domain;
        cfg.portainer_username = "admin";
        cfg.portainer_password = credentials.password;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      }

      this.saveCredentials(toolId, credentials);
      addLog("Credenciais salvas.", "info");

      addLog(toolId + " instalado com sucesso!", "success");
      return { success: true, stackName, logs, credentials };
    } catch (err) {
      addLog("Erro: " + err.message, "error");
      return { success: false, error: err.message, logs };
    }
  }

  // ─── Detection ───

  static getInstalledTools() {
    const containers = DockerService.listContainers();
    const tools = new Set();
    containers.forEach((c) => {
      const n = c.name.toLowerCase();
      if (n.includes("portainer_portainer")) tools.add("portainer");
      if (n.includes("n8n_n8n_editor") || n.includes("n8n_n8n")) tools.add("n8n");
      if (n.includes("evolution_evolution_api") || n.includes("evolution_evolution")) tools.add("evolution");
    });
    return Array.from(tools);
  }

  // ─── Uninstall ───

  static async uninstallTool(toolId) {
    const map = { portainer: "portainer", n8n: "n8n", evolution: "evolution" };
    const name = map[toolId];
    if (!name) throw new Error("Ferramenta desconhecida");

    const result = await this.removeStackViaPortainer(name);

    const creds = this.loadCredentials();
    delete creds[toolId];
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2));

    return result;
  }
}

module.exports = InstallService;
