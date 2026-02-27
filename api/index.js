const express = require("express");
const redis = require("redis");
const cassandra = require("cassandra-driver");

const app = express();
let inflight = 0;
const MAX_INFLIGHT = 1000;

/* Redis */
const redisClient = redis.createClient({
  url: "redis://redis:6379",
});
redisClient.connect();

/* ScyllaDB */
const scyllaClient = new cassandra.Client({
  contactPoints: ["scylladb"],
  localDataCenter: "datacenter1",
  keyspace: "irctc",
});

app.get("/search", async (req, res) => {
  if (inflight > MAX_INFLIGHT) {
    return res.status(503).json({ error: "System busy, try again" });
  }

  inflight++;
  try {
    // existing logic
  } finally {
    inflight--;
  }

  const route = "MUM-DEL";
  const date = "2026-02-20";
  const cacheKey = `${route}:${date}`;

  // 1️⃣ Check cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return res.json({
      source: "redis",
      data: JSON.parse(cached),
    });
  }

  // 2️⃣ Hit ScyllaDB
  const query =
    "SELECT train_no, status FROM availability WHERE route=? AND travel_date=?";
  const result = await scyllaClient.execute(query, [route, date], {
    prepare: true,
  });

  const rows = result.rows;

  // 3️⃣ Cache result
  await redisClient.setEx(cacheKey, 30, JSON.stringify(rows));

  res.json({
    source: "scylladb",
    data: rows,
  });
});

const server = app.listen(3000, () => {
  console.log("API running on port 3000");
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
