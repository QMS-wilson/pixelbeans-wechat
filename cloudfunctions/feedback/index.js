const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 意见反馈：写入 feedback 集合
exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const content = String((event && event.content) || "").trim();
    if (!content) {
      return { error: "Empty feedback", message: "反馈内容不能为空。" };
    }
    if (content.length > 1000) {
      return { error: "Too long", message: "反馈内容过长（最多 1000 字）。" };
    }
    const res = await db.collection("feedback").add({
      data: {
        content,
        openid: OPENID,
        createdAt: new Date().toISOString(),
        status: "new",
      },
    });
    return { success: true, id: res._id };
  } catch (error) {
    return { error: "Feedback failed", message: error.message || "提交失败" };
  }
};
