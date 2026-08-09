const cloud = require("wx-server-sdk");
const {
  readStore,
  writeStore,
  getBinding,
  findCardByCode,
  assertCardAction,
  bindCardImage,
  consumeCardAction,
  appendLog,
  prepareDownloadFile,
} = require("./lib/card-lib.js");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 下载预处理：校验卡密、扣次，生成文件上传到云存储，返回 fileID
exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const { filename = "export", imageHash, dataUrl, text } = event || {};
    const safeFilename = String(filename).replace(/[/\\\r\n\0]/g, "_").replace(/\.[^/.]+$/, "");

    const store = await readStore();
    const binding = getBinding(store, OPENID);
    const card = binding ? findCardByCode(store, binding.cardCode) : null;
    const allowed = assertCardAction(card, imageHash, "download");
    if (!allowed.ok) {
      await writeStore(store);
      return { error: "Download denied", message: allowed.message };
    }
    const bindResult = bindCardImage(card, allowed.imageHash);
    if (!bindResult.ok) {
      await writeStore(store);
      return { error: "Download denied", message: bindResult.message };
    }

    const prepared = await prepareDownloadFile({ dataUrl, text, filename: safeFilename });
    consumeCardAction(card, "download");
    appendLog(store, OPENID, {
      type: "download",
      cardCode: card.code,
      imageHash: card.imageHash || allowed.imageHash,
      detail: prepared.filename,
    });
    await writeStore(store);

    return { success: true, fileID: prepared.fileID, filename: prepared.filename, mime: prepared.mime };
  } catch (error) {
    return { error: "Download prepare failed", message: error.message || "下载准备失败" };
  }
};
