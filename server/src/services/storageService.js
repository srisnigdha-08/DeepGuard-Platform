const fs   = require("fs").promises;
const path = require("path");

const saveBase64Image = async (base64Data, savePath) => {
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, Buffer.from(base64Data, "base64"));
  return savePath;
};

const deleteFile = async (filePath) => {
  try { await fs.unlink(filePath); } catch { /* silent — file may already be gone */ }
};

module.exports = { saveBase64Image, deleteFile };
