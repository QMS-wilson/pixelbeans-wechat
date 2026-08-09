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

// 把 base64 数据写到本地临时文件并上传到云存储，返回 fileID。
// 云函数入参有大小限制，大图不能直接塞进 callFunction。
function uploadDataUrl(dataUrl, prefix = "upload", retries = 3) {
  return new Promise((resolve, reject) => {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      reject(new Error("图片数据格式无效"));
      return;
    }
    const mime = match[1] || "image/jpeg";
    const b64 = match[2];
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const filePath = `${wx.env.USER_DATA_PATH}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
      wx.getFileSystemManager().writeFileSync(filePath, wx.base64ToArrayBuffer(b64));
    } catch (error) {
      reject(new Error(`写入临时文件失败：${error.message || ""}`));
      return;
    }
    const uploadOnce = (attempt) => {
      wx.cloud.uploadFile({
        cloudPath: `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: (err) => {
          if (attempt < retries) {
            setTimeout(() => uploadOnce(attempt + 1), 800 * attempt);
          } else {
            const detail = (err && err.errMsg) || (err && err.message) || "";
            reject(new Error(`上传云存储失败（网络中断，已重试 ${retries} 次）：${detail}`));
          }
        },
      });
    };
    uploadOnce(1);
  });
}

module.exports = {
  API_BASE: "",
  requestJson,
  callFunction,
  uploadDataUrl,
};
