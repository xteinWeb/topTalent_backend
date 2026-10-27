// Content-Disposition de descarga que conserva tildes/ñ: filename ASCII de respaldo + filename* en UTF-8 (RFC 6266)
function setAttachmentHeader(res, fileName) {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
}

module.exports = { setAttachmentHeader };
