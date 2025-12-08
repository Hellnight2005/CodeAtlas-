const { randomUUID } = require("crypto");

function generateRequestId() {
  return randomUUID();
}

module.exports = generateRequestId;
