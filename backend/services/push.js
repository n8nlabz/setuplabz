const webpush = require("web-push");
const fs = require("fs");

const CONFIG_PATH = "/opt/n8nlabz/config.json";
const SUBSCRIPTIONS_PATH = "/opt/n8nlabz/push-subscriptions.json";

class PushService {
  constructor() {
    this.subscriptions = [];
    this.ready = false;
    this.loadSubscriptions();
    this.setupVapid();
  }

  setupVapid() {
    try {
      let config = {};
      try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      } catch {
        config = {};
      }

      if (!config.vapid_public_key || !config.vapid_private_key) {
        const keys = webpush.generateVAPIDKeys();
        config.vapid_public_key = keys.publicKey;
        config.vapid_private_key = keys.privateKey;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log("[PUSH] VAPID keys geradas e salvas.");
      }

      webpush.setVapidDetails(
        "mailto:" + (config.email || "admin@n8nlabz.com"),
        config.vapid_public_key,
        config.vapid_private_key
      );
      this.ready = true;
      console.log("[PUSH] Servico de push inicializado.");
    } catch (err) {
      console.log("[PUSH] Erro ao configurar VAPID: " + err.message);
      this.ready = false;
    }
  }

  loadSubscriptions() {
    try {
      if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
        this.subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, "utf-8"));
      }
    } catch {
      this.subscriptions = [];
    }
  }

  saveSubscriptions() {
    try {
      fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(this.subscriptions, null, 2));
    } catch {}
  }

  addSubscription(subscription) {
    if (!subscription || !subscription.endpoint) return;
    const exists = this.subscriptions.find((s) => s.endpoint === subscription.endpoint);
    if (!exists) {
      this.subscriptions.push(subscription);
      this.saveSubscriptions();
    }
  }

  removeSubscription(endpoint) {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
    this.saveSubscriptions();
  }

  getVapidPublicKey() {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return config.vapid_public_key || null;
    } catch {
      return null;
    }
  }

  async sendToAll(payload) {
    if (!this.ready || this.subscriptions.length === 0) return;
    const failed = [];
    const data = JSON.stringify(payload);

    for (const sub of this.subscriptions) {
      try {
        await webpush.sendNotification(sub, data);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          failed.push(sub.endpoint);
        }
      }
    }

    if (failed.length > 0) {
      this.subscriptions = this.subscriptions.filter((s) => !failed.includes(s.endpoint));
      this.saveSubscriptions();
    }
  }

  async notifyServiceDown(serviceName) {
    await this.sendToAll({
      title: "Servico offline!",
      body: serviceName + " parou de funcionar. Acesse o painel para verificar.",
      tag: "service-down-" + serviceName.toLowerCase().replace(/\s+/g, "-"),
      url: "/",
    });
  }

  async notifyServiceRecovered(serviceName) {
    await this.sendToAll({
      title: "Servico recuperado",
      body: serviceName + " voltou a funcionar normalmente.",
      tag: "service-up-" + serviceName.toLowerCase().replace(/\s+/g, "-"),
      url: "/",
    });
  }

  async notifyHighResource(resource, value) {
    await this.sendToAll({
      title: "Uso alto de recursos",
      body: resource + " esta em " + value + "%. Verifique seu servidor.",
      tag: "high-resource-" + resource.toLowerCase(),
      url: "/",
    });
  }

  async notifyBackupReminder() {
    await this.sendToAll({
      title: "Lembrete de backup",
      body: "Faz mais de 7 dias que voce nao faz backup. Recomendamos fazer um agora!",
      tag: "backup-reminder",
      url: "/",
    });
  }

  async notifyNewVersion(tool, version) {
    await this.sendToAll({
      title: "Nova versao disponivel!",
      body: tool + " tem uma nova versao: " + version + ". Quer atualizar?",
      tag: "new-version-" + tool.toLowerCase(),
      url: "/",
    });
  }
}

module.exports = new PushService();
