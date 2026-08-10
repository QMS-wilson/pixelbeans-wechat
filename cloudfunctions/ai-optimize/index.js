const cloud = require("wx-server-sdk");
const {
  readStore,
  writeStore,
  getBinding,
  findCardByCode,
  getFreeTrialStatus,
  consumeFreeTrial,
  normalizeImageHash,
  assertCardAction,
  bindCardImage,
  consumeCardAction,
  buildAccessPayload,
  appendLog,
  optimizeImage,
  uploadImageResult,
  assembleUpload,
} = require("./lib/card-lib.js");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// AI 优化：付费卡密或免费体验
exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const { imageBase64, imageFileID: inputFileID, imageUploadId, prompt, imageHash, freeTrial, deviceId } = event || {};
    console.log("[ai-optimize] start", {
      OPENID,
      promptLength: prompt ? String(prompt).length : 0,
      imageHash,
      freeTrial: !!freeTrial,
      hasBase64: !!imageBase64,
      hasFileID: !!inputFileID,
      hasUploadId: !!imageUploadId,
    });
    // 大图走云存储：前端传 fileID 或分块 uploadId，函数下载后转 base64
    let resolvedImageBase64 = imageBase64;
    if (!resolvedImageBase64 && inputFileID) {
      const downloaded = await cloud.downloadFile({ fileID: inputFileID });
      resolvedImageBase64 = downloaded.fileContent.toString("base64");
    }
    if (!resolvedImageBase64 && imageUploadId) {
      const assembled = await assembleUpload(imageUploadId);
      resolvedImageBase64 = assembled.toString("base64");
    }
    console.log("[ai-optimize] image ready", { base64Length: resolvedImageBase64 ? resolvedImageBase64.length : 0 });
    if (!resolvedImageBase64) {
      return { error: "Missing imageBase64 parameter" };
    }

    const store = await readStore();
    const binding = getBinding(store, OPENID);
    const card = binding ? findCardByCode(store, binding.cardCode) : null;
    const isTrial = !card && freeTrial === true;

    if (isTrial) {
      const deviceTrial = getFreeTrialStatus(store, deviceId);
      const openidTrial = getFreeTrialStatus(store, `openid:${OPENID}`);
      if (!deviceTrial || deviceTrial.used || (openidTrial && openidTrial.used)) {
        return { error: "AI optimization denied", message: "免费 AI 体验次数已用完，请兑换卡密后继续使用。" };
      }
      const normalizedHash = normalizeImageHash(imageHash);
      if (!normalizedHash) {
        return { error: "AI optimization denied", message: "未识别到当前图片，请重新上传后重试。" };
      }
      console.log("[ai-optimize] trial optimize start", { deviceId });
      const result = await optimizeImage(resolvedImageBase64, prompt);
      console.log("[ai-optimize] trial optimize done", { taskId: result.taskId });
      const imageFileID = await uploadImageResult(result.imageUrl, result.taskId);
      console.log("[ai-optimize] trial result uploaded", { imageFileID });
      consumeFreeTrial(store, deviceId, normalizedHash);
      consumeFreeTrial(store, `openid:${OPENID}`, normalizedHash);
      appendLog(store, OPENID, { type: "ai_free_trial", imageHash: normalizedHash, detail: "free trial ai optimize" });
      await writeStore(store);
      return { success: true, imageFileID, taskId: result.taskId, freeTrialUsed: true };
    }

    if (!card) {
      return { error: "AI optimization denied", message: "请先兑换卡密后再操作。" };
    }
    const allowed = assertCardAction(card, imageHash, "ai");
    if (!allowed.ok) {
      await writeStore(store);
      return { error: "AI optimization denied", message: allowed.message };
    }
    const bindResult = bindCardImage(card, allowed.imageHash);
    if (!bindResult.ok) {
      await writeStore(store);
      return { error: "AI optimization denied", message: bindResult.message };
    }

    console.log("[ai-optimize] paid optimize start");
    const result = await optimizeImage(resolvedImageBase64, prompt);
    console.log("[ai-optimize] paid optimize done", { taskId: result.taskId });
    const imageFileID = await uploadImageResult(result.imageUrl, result.taskId);
    console.log("[ai-optimize] paid result uploaded", { imageFileID });
    consumeCardAction(card, "ai");
    appendLog(store, OPENID, {
      type: "ai_optimize",
      cardCode: card.code,
      imageHash: card.imageHash || allowed.imageHash,
      detail: "ai optimize success",
    });
    await writeStore(store);
    return { success: true, imageFileID, taskId: result.taskId, ...buildAccessPayload(card) };
  } catch (error) {
    console.error("[ai-optimize] failed", error);
    return { error: "AI optimization failed", message: error.message || "未知错误" };
  }
};
