const ADMIN_KEY_STORAGE = "pixelbeansAdminKey";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function callAdmin(data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: "card-admin",
      data,
      success: (res) => resolve(res.result || {}),
      fail: (err) => reject(new Error((err && err.errMsg) || "云函数调用失败")),
    });
  });
}

Page({
  data: {
    adminKey: "",
    cards: [],
    logs: [],
    summary: { unused: 0, active: 0, exhausted: 0 },
    loaded: false,
    loading: false,
    genCount: "10",
    genPrefix: "PB",
    genNote: "",
    message: "",
    messageType: "",
  },

  onLoad() {
    const adminKey = wx.getStorageSync(ADMIN_KEY_STORAGE) || "";
    this.setData({ adminKey });
    if (adminKey) this.loadCards();
  },

  onAdminKeyInput(e) {
    this.setData({ adminKey: e.detail.value });
  },
  onGenCount(e) {
    this.setData({ genCount: e.detail.value });
  },
  onGenPrefix(e) {
    this.setData({ genPrefix: e.detail.value });
  },
  onGenNote(e) {
    this.setData({ genNote: e.detail.value });
  },

  setMessage(message, type = "") {
    this.setData({ message, messageType: type });
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this.setData({ message: "" }), 3000);
  },

  async loadCards() {
    this.setData({ loading: true });
    try {
      const result = await callAdmin({ action: "list", adminKey: this.data.adminKey });
      if (result.error) {
        this.setMessage(result.message || "密钥无效", "error");
        return;
      }
      const cards = (result.cards || []).map((card) => ({
        ...card,
        statusText: card.status === "active" ? "已激活" : card.status === "exhausted" ? "已失效" : "未使用",
        createdAtText: formatDate(card.createdAt),
      }));
      const logs = (result.logs || []).map((log) => ({ ...log, createdAtText: formatDate(log.createdAt) }));
      const summary = {
        unused: cards.filter((c) => c.status === "unused").length,
        active: cards.filter((c) => c.status === "active").length,
        exhausted: cards.filter((c) => c.status === "exhausted").length,
      };
      this.setData({ cards, logs, summary, loaded: true });
    } catch (error) {
      this.setMessage(error.message || "加载失败", "error");
    } finally {
      this.setData({ loading: false });
    }
  },

  async generateCards() {
    this.setData({ loading: true });
    try {
      const count = Math.min(200, Math.max(1, Number(this.data.genCount) || 10));
      const result = await callAdmin({
        action: "generate",
        adminKey: this.data.adminKey,
        count,
        prefix: this.data.genPrefix,
        note: this.data.genNote,
      });
      if (result.error) {
        this.setMessage(result.message || "生成失败", "error");
        return;
      }
      this.setMessage(`已生成 ${result.cards.length} 张卡密`);
      await this.loadCards();
    } catch (error) {
      this.setMessage(error.message || "生成失败", "error");
    } finally {
      this.setData({ loading: false });
    }
  },

  async resetCard(e) {
    const cardCode = e.currentTarget.dataset.code;
    this.setData({ loading: true });
    try {
      const result = await callAdmin({ action: "reset", adminKey: this.data.adminKey, cardCode });
      if (result.error) {
        this.setMessage(result.message || "重置失败", "error");
        return;
      }
      this.setMessage(`已重置 ${cardCode}`);
      await this.loadCards();
    } catch (error) {
      this.setMessage(error.message || "重置失败", "error");
    } finally {
      this.setData({ loading: false });
    }
  },

  clearKey() {
    wx.removeStorageSync(ADMIN_KEY_STORAGE);
    this.setData({ adminKey: "", cards: [], logs: [], loaded: false });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/index/index" }) });
  },
});
