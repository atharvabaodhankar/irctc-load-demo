module.exports = {
  USE_REDIS: process.env.USE_REDIS === "true",
  MAX_INFLIGHT: parseInt(process.env.MAX_INFLIGHT || "500"),
  CACHE_TTL: parseInt(process.env.CACHE_TTL || "30"),
};
