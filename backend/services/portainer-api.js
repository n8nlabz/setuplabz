const fs = require("fs");

const CREDENTIALS_PATH = "/opt/n8nlabz/credentials.json";
const CONFIG_PATH = "/opt/n8nlabz/config.json";
const BASE_URL = "http://portainer_portainer:9000/api";

class PortainerAPI {
  constructor() {
    this.jwt = null;
    this.endpointId = null;
    this.swarmId = null;
  }

  // ─── HTTP helper ───

  async request(path, options = {}) {
    const url = BASE_URL + path;
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.jwt) headers["Authorization"] = "Bearer " + this.jwt;

    const res = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || 30000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      const msg = (data && data.message) || (data && data.details) || text || ("HTTP " + res.status);
      throw new Error("Portainer API [" + res.status + "]: " + msg);
    }
    return data;
  }

  // ─── Auth ───

  async authenticate() {
    const creds = this.loadPortainerCredentials();
    if (!creds.username || !creds.password) {
      throw new Error("Credenciais do Portainer nao encontradas");
    }

    const data = await this.request("/auth", {
      method: "POST",
      body: JSON.stringify({ Username: creds.username, Password: creds.password }),
    });

    if (!data.jwt) throw new Error("Token JWT nao retornado pelo Portainer");
    this.jwt = data.jwt;

    // Get endpoint and swarm IDs
    const endpoints = await this.request("/endpoints");
    if (!endpoints || endpoints.length === 0) {
      throw new Error("Nenhum endpoint encontrado no Portainer");
    }
    this.endpointId = endpoints[0].Id;

    const swarmInfo = await this.request("/endpoints/" + this.endpointId + "/docker/swarm");
    this.swarmId = swarmInfo.ID;

    return { jwt: this.jwt, endpointId: this.endpointId, swarmId: this.swarmId };
  }

  loadPortainerCredentials() {
    // Try credentials.json first
    try {
      if (fs.existsSync(CREDENTIALS_PATH)) {
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
        if (creds.portainer && creds.portainer.username && creds.portainer.password) {
          return { username: creds.portainer.username, password: creds.portainer.password };
        }
      }
    } catch {}

    // Fallback to config.json
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        if (config.portainer_username && config.portainer_password) {
          return { username: config.portainer_username, password: config.portainer_password };
        }
      }
    } catch {}

    return {};
  }

  // ─── Stack Operations ───

  async listStacks() {
    return this.request("/stacks");
  }

  async getStackByName(name) {
    const stacks = await this.listStacks();
    return stacks.find((s) => s.Name === name) || null;
  }

  async createStack(name, composeYAML) {
    const data = await this.request(
      "/stacks/create/swarm/string?endpointId=" + this.endpointId,
      {
        method: "POST",
        body: JSON.stringify({
          name: name,
          swarmID: this.swarmId,
          stackFileContent: composeYAML,
        }),
        timeout: 60000,
      }
    );
    if (!data.Id) throw new Error("Stack nao foi criada: " + JSON.stringify(data));
    return data;
  }

  async updateStack(stackId, composeYAML) {
    return this.request(
      "/stacks/" + stackId + "?endpointId=" + this.endpointId,
      {
        method: "PUT",
        body: JSON.stringify({
          stackFileContent: composeYAML,
          prune: true,
        }),
        timeout: 60000,
      }
    );
  }

  async removeStack(stackId) {
    return this.request(
      "/stacks/" + stackId + "?endpointId=" + this.endpointId,
      { method: "DELETE", timeout: 30000 }
    );
  }

  // ─── High-level: deploy (create or update) ───

  async deployStack(name, composeYAML) {
    const existing = await this.getStackByName(name);
    if (existing) {
      await this.updateStack(existing.Id, composeYAML);
      return { method: "portainer", action: "updated", stackId: existing.Id };
    } else {
      const created = await this.createStack(name, composeYAML);
      return { method: "portainer", action: "created", stackId: created.Id };
    }
  }

  // ─── High-level: remove by name ───

  async removeStackByName(name) {
    const existing = await this.getStackByName(name);
    if (!existing) {
      throw new Error("Stack '" + name + "' nao encontrada no Portainer");
    }
    await this.removeStack(existing.Id);
    return { method: "portainer", stackId: existing.Id };
  }

  // ─── High-level: update image version via compose ───

  async updateStackCompose(name, composeYAML) {
    const existing = await this.getStackByName(name);
    if (!existing) {
      throw new Error("Stack '" + name + "' nao encontrada no Portainer");
    }
    await this.updateStack(existing.Id, composeYAML);
    return { method: "portainer", stackId: existing.Id };
  }
}

module.exports = PortainerAPI;
