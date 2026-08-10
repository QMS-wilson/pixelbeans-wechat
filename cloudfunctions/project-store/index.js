const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PROJECTS_COLLECTION = "projects";

async function ensureCollection(name) {
  try {
    if (typeof db.createCollectionIfNotExists === "function") {
      await db.createCollectionIfNotExists(name);
      return true;
    }
    if (typeof db.createCollection === "function") {
      await db.createCollection(name);
      return true;
    }
  } catch (error) {
    // Collection already exists or concurrent creation race; ignore.
  }
  return false;
}

// 项目库云存储：
// 图纸 JSON 由客户端直接上传到云存储（projects/<id>.json，避开云函数入参大小限制）；
// 本函数负责元数据（projects 集合，按 openid 隔离）的查询 / 保存 / 删除。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event || {};
  console.log("[project-store] start", { action, OPENID });
  try {
    await ensureCollection(PROJECTS_COLLECTION);
    const coll = db.collection(PROJECTS_COLLECTION);

    if (action === "list") {
      const res = await coll.where({ openid: OPENID }).orderBy("savedAt", "desc").limit(100).get();
      console.log("[project-store] list done", { count: (res.data || []).length });
      return { success: true, projects: res.data || [] };
    }

    if (action === "saveMeta") {
      const { id, name, savedAt, cols, rows, paletteIndex, gridSize, mergeLevel, gridLineOn, sourceFingerprint, sourceType, fileID } = event || {};
      if (!id || !fileID) {
        return { error: "Missing id or fileID", message: "缺少项目 ID 或文件 ID。" };
      }
      const record = {
        openid: OPENID,
        name: String(name || "").slice(0, 60),
        savedAt: Number(savedAt) || Date.now(),
        cols: Number(cols) || 0,
        rows: Number(rows) || 0,
        paletteIndex: paletteIndex === undefined ? null : Number(paletteIndex),
        gridSize: gridSize === undefined ? null : Number(gridSize),
        mergeLevel: mergeLevel === undefined ? null : Number(mergeLevel),
        gridLineOn: !!gridLineOn,
        sourceFingerprint: String(sourceFingerprint || ""),
        sourceType: String(sourceType || "blank"),
        fileID,
        updatedAt: new Date().toISOString(),
      };
      await coll.doc(id).set({ data: record });
      console.log("[project-store] saveMeta done", { id, name: record.name });
      return { success: true, id };
    }

    if (action === "delete") {
      const { id } = event || {};
      if (!id) {
        return { error: "Missing id", message: "缺少项目 ID。" };
      }
      const found = await coll.where({ _id: id, openid: OPENID }).get();
      const doc = found.data && found.data[0];
      if (!doc) {
        return { error: "Project not found", message: "项目不存在或无权删除。" };
      }
      if (doc.fileID) {
        try {
          await cloud.deleteFile({ fileList: [doc.fileID] });
        } catch (error) {
          console.error("[project-store] deleteFile failed", { id, error: error && error.message });
        }
      }
      await coll.doc(id).remove();
      console.log("[project-store] delete done", { id });
      return { success: true };
    }

    return { error: "Unknown action", message: "未知操作。" };
  } catch (error) {
    console.error("[project-store] failed", { action, error: error && error.message });
    return { error: "Project store failed", message: (error && error.message) || "项目库操作失败" };
  }
};