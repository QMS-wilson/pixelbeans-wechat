const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CHUNKS_COLLECTION = "chunks";

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

function isCollectionNotExist(error) {
  return (
    error &&
    (String(error.errCode) === "-502005" ||
      String(error.errCode) === "DATABASE_COLLECTION_NOT_EXIST" ||
      /collection not exist/i.test(String(error.errMsg || error.message || "")))
  );
}

// Chunked upload: the client splits large base64 data into small pieces and
// calls this function once per piece. Each piece is written to cloud storage
// (chunks/<uploadId>/<index>.b64) and its fileID is recorded in the chunks
// collection (doc _id = uploadId) so the server can reassemble the file later.
exports.main = async (event) => {
  try {
    const { uploadId, index, total, data } = event || {};
    if (!uploadId || typeof index !== "number" || !total || typeof data !== "string" || !data) {
      return { error: "Invalid chunk", message: "Chunk parameters incomplete." };
    }
    if (data.length > 600 * 1024) {
      return { error: "Chunk too large", message: "Single chunk exceeds 600KB." };
    }

    // Make sure the chunks collection exists before any write.
    await ensureCollection(CHUNKS_COLLECTION);

    const uploaded = await cloud.uploadFile({
      cloudPath: `chunks/${uploadId}/${index}.b64`,
      fileContent: data,
    });
    const fileID = uploaded.fileID;

    const coll = db.collection(CHUNKS_COLLECTION);
    const doc = coll.doc(uploadId);

    const writePart = async () => {
      try {
        await doc.update({ data: { [`parts.${index}`]: fileID, total } });
      } catch (error) {
        if (isCollectionNotExist(error)) {
          // Collection was missing: create it, then add the document.
          await ensureCollection(CHUNKS_COLLECTION);
          await coll.add({
            _id: uploadId,
            parts: { [index]: fileID },
            total,
            createdAt: new Date().toISOString(),
          });
          return;
        }
        // Document does not exist yet: create it.
        await coll.add({
          _id: uploadId,
          parts: { [index]: fileID },
          total,
          createdAt: new Date().toISOString(),
        });
      }
    };

    try {
      await writePart();
    } catch (error) {
      // A concurrent chunk created the doc first: fall back to update.
      try {
        await doc.update({ data: { [`parts.${index}`]: fileID, total } });
      } catch (error2) {
        throw error2;
      }
    }

    return { success: true, index };
  } catch (error) {
    return {
      error: "Chunk upload failed",
      message: (error && error.message) || "Chunk upload failed",
    };
  }
};