const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureCollection(name) {
  if (typeof db.createCollection !== "function") return;
  try {
    await db.createCollection(name);
  } catch (error) {
    // 已存在则忽略
  }
}

// 分块上传：客户端把大图 base64 切成小块，逐块调本函数。
// 每块上传到云存储（chunks/<uploadId>/<index>.b64），并在 chunks 集合记录 fileID。
exports.main = async (event) => {
  try {
    const { uploadId, index, total, data } = event || {};
    if (!uploadId || typeof index !== "number" || !total || typeof data !== "string" || !data) {
      return { error: "Invalid chunk", message: "分块参数不完整。" };
    }
    if (data.length > 600 * 1024) {
      return { error: "Chunk too large", message: "单块过大（超过 600KB）。" };
    }
    const uploaded = await cloud.uploadFile({
      cloudPath: `chunks/${uploadId}/${index}.b64`,
      fileContent: data,
    });
    const fileID = uploaded.fileID;
    const coll = db.collection("chunks");
    const doc = coll.doc(uploadId);
    try {
      await doc.update({ data: { [`parts.${index}`]: fileID, total } });
    } catch (error) {
      try {
        await coll.add({ _id: uploadId, parts: { [index]: fileID }, total, createdAt: new Date().toISOString() });
      } catch (error2) {
        await doc.update({ data: { [`parts.${index}`]: fileID, total } });
      }
    }
    return { success: true, index };
  } catch (error) {
    return { error: "Chunk upload failed", message: error.message || "分块上传失败" };
  }
};
