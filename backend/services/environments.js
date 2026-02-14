const DockerService = require("./docker");
const InstallService = require("./install");
const PortainerAPI = require("./portainer-api");
const fs = require("fs");

const ENVS_PATH = "/opt/n8nlabz/environments.json";

class EnvironmentService {
  static loadEnvironments() {
    try {
      if (fs.existsSync(ENVS_PATH)) {
        return JSON.parse(fs.readFileSync(ENVS_PATH, "utf-8"));
      }
    } catch {}
    return [];
  }

  static saveEnvironments(envs) {
    fs.writeFileSync(ENVS_PATH, JSON.stringify(envs, null, 2));
  }

  static async createEnvironment(name, tools, onLog) {
    const config = InstallService.loadConfig();
    const base = config.domain_base;
    if (!base) throw new Error("Domínio base não configurado");

    const envs = this.loadEnvironments();
    if (envs.find((e) => e.name === name)) {
      throw new Error("Ambiente '" + name + "' já existe");
    }

    const env = {
      name,
      created_at: new Date().toISOString(),
      stacks: [],
      status: "creating",
    };

    if (onLog) onLog("Criando ambiente de teste: " + name, "info");

    // Create dedicated postgres for this environment
    const pgPass = InstallService.genPass();
    const pgStackName = name + "_postgres";
    const pgCompose = InstallService.getPostgresCompose(pgPass);
    if (onLog) onLog("Criando PostgreSQL dedicado para o ambiente...", "info");
    await InstallService.deployStack(pgStackName, pgCompose);
    await InstallService.waitForService(pgStackName + "_", 120000);
    await new Promise((r) => setTimeout(r, 5000));
    env.stacks.push(pgStackName);

    // Install requested tools
    for (const toolId of (tools || ["n8n"])) {
      const prefix = name;
      const stackName = prefix + "_" + toolId;

      if (toolId === "n8n") {
        const domain = prefix + "-n8n." + base;
        const encKey = InstallService.genPass(32);
        if (onLog) onLog("Criando n8n no ambiente " + name + "...", "info");

        // Create database in environment's postgres
        const composeConfig = {
          domain_n8n: domain,
          pg_password: pgPass,
          encryption_key: encKey,
        };
        const compose = InstallService.getN8nSimpleCompose(composeConfig);
        await InstallService.deployStack(stackName, compose);
        env.stacks.push(stackName);
      }

      if (toolId === "evolution") {
        const domain = prefix + "-evolution." + base;
        const apiKey = InstallService.genPass(32);
        if (onLog) onLog("Criando Evolution no ambiente " + name + "...", "info");

        const composeConfig = {
          domain_evolution: domain,
          pg_password: pgPass,
          evolution_key: apiKey,
        };
        const compose = InstallService.getEvolutionCompose(composeConfig);
        await InstallService.deployStack(stackName, compose);
        env.stacks.push(stackName);
      }
    }

    env.status = "running";
    envs.push(env);
    this.saveEnvironments(envs);

    if (onLog) onLog("Ambiente '" + name + "' criado com sucesso!", "success");
    return env;
  }

  static async destroyEnvironment(name, onLog) {
    const envs = this.loadEnvironments();
    const env = envs.find((e) => e.name === name);
    if (!env) throw new Error("Ambiente não encontrado");

    if (onLog) onLog("Destruindo ambiente: " + name, "info");

    // Try Portainer API first, fallback to Docker CLI
    let client = null;
    try {
      client = new PortainerAPI();
      await client.authenticate();
    } catch {
      client = null;
    }

    for (const stack of (env.stacks || [])) {
      try {
        if (onLog) onLog("Removendo stack: " + stack, "info");
        if (client) {
          try {
            await client.removeStackByName(stack);
            if (onLog) onLog("Stack " + stack + " removida via Portainer.", "info");
            continue;
          } catch {}
        }
        // Fallback Docker CLI
        await DockerService.removeStack(stack);
      } catch (err) {
        if (onLog) onLog("Aviso: " + err.message, "info");
      }
    }

    const updated = envs.filter((e) => e.name !== name);
    this.saveEnvironments(updated);

    if (onLog) onLog("Ambiente '" + name + "' destruido.", "success");
    return { success: true };
  }

  static getEnvironmentStatus() {
    const envs = this.loadEnvironments();
    const containers = DockerService.listContainers();

    return envs.map((env) => {
      const envContainers = containers.filter((c) =>
        env.stacks.some((s) => c.name.toLowerCase().includes(s.toLowerCase()))
      );
      const running = envContainers.filter((c) => c.state === "running").length;
      return {
        ...env,
        containers_total: envContainers.length,
        containers_running: running,
        status: envContainers.length > 0 && running === envContainers.length ? "running" : env.status,
      };
    });
  }
}

module.exports = EnvironmentService;
