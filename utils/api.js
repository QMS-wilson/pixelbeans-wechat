// 云函数版接口封装：把原有 /api/* 路径映射到云函数，页面代码无需改动。
const PATH_TO_FUNCTION = {
  "/api/access-status": "access-status",
  "/api/redeem-card": "redeem-card",
  "/api/logout-access": "logout-access",
  "/api/ai-optimize": "ai-optimize",
  "/api/download-prepare": "download-prepare",
};

function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const result = res && res.result;
        if (result && result.error) {
          const error = new Error(result.message || result.error);
          error.status = result.status || 400;
          reject(error);
          return;
        }
        resolve(result || {});
      },
      fail: (err) => {
        const message = err && err.errMsg ? `云函数调用失败：${err.errMsg}` : "云函数调用失败，请检查云开发环境。";
        reject(new Error(message));
      },
    });
  });
}

// 兼容旧调用：requestJson("/api/xxx", { method, data })
function requestJson(path, options = {}) {
  const cleanPath = String(path || "").split("?")[0];
  const name = PATH_TO_FUNCTION[cleanPath];
  if (!name) {
    return Promise.reject(new Error(`未找到云函数映射：${cleanPath}`));
  }
  return callFunction(name, (options && options.data) || {});
}

module.exports = {
  API_BASE: "",
  requestJson,
  callFunction,
};
