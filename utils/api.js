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

// 大图分块上传：把 base64 切成小块逐块调用 upload-chunk 云函数（云函数内部写入云存储）。
// 云函数入参有大小限制，且客户端直传大文件容易连接重置，所以走分块。
function uploadDataChunks(dataUrl, prefix = "upload") {
  return new Promise((resolve, reject) => {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      reject(new Error("图片数据格式无效"));
      return;
    }
    const mime = match[1] || "image/jpeg";
    const b64 = match[2];
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const uploadId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const CHUNK_SIZE = 400 * 1024;
    const chunks = [];
    for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
      chunks.push(b64.slice(i, i + CHUNK_SIZE));
    }
    const total = chunks.length;
    const uploadChunk = (index) =>
      callFunction("upload-chunk", { uploadId, index, total, data: chunks[index] }).catch(() =>
        callFunction("upload-chunk", { uploadId, index, total, data: chunks[index] }),
      );
    (async () => {
      try {
        for (let i = 0; i < total; i += 1) {
          await uploadChunk(i);
        }
        resolve({ uploadId, ext, total });
      } catch (error) {
        reject(new Error(`图片分块上传失败：${(error && error.message) || ""}`));
      }
    })();
  });
}

module.exports = {
  API_BASE: "",
  requestJson,
  callFunction,
  uploadDataChunks,
};
