const express = require("express");
const client = require("prom-client");
const cassandra = require("cassandra-driver");
const redis = require("redis");

const app = express();

// Prometheus setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.2, 0.3, 0.5, 1, 2, 5]
});

register.registerMetric(httpDuration);

// Middleware to measure request duration
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  
  res.on("finish", () => {
    end({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
  });
  
  next();
});

// Environment variables
const USE_REDIS = process.env.USE_REDIS === "true";
const MAX_INFLIGHT = parseInt(process.env.MAX_INFLIGHT || "1000");

// ScyllaDB setup
const scyllaClient = new cassandra.Client({
  contactPoints: ["scylladb:9042"],
  localDataCenter: "datacenter1",
  keyspace: "irctc"
});

// Redis setup
let redisClient;
if (USE_REDIS) {
  redisClient = redis.createClient({
    url: "redis://redis:6379"
  });
  redisClient.connect().catch(console.error);
}

// In-flight request tracking
let inflightCount = 0;

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", inflight: inflightCount });
});

app.get("/search", async (req, res) => {
  // Backpressure check
  if (inflightCount >= MAX_INFLIGHT) {
    return res.status(503).json({ error: "Server busy" });
  }

  inflightCount++;

  try {
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({ error: "Missing from/to parameters" });
    }

    const cacheKey = `route:${from}:${to}`;

    // Try Redis cache first
    if (USE_REDIS && redisClient) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    // Query ScyllaDB
    const query = "SELECT * FROM routes WHERE origin = ? AND destination = ? LIMIT 10";
    const result = await scyllaClient.execute(query, [from, to], { prepare: true });

    const routes = result.rows.map(row => ({
      train_id: row.train_id,
      origin: row.origin,
      destination: row.destination,
      departure: row.departure_time,
      arrival: row.arrival_time,
      price: row.price
    }));

    // Cache in Redis
    if (USE_REDIS && redisClient) {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(routes));
    }

    res.json(routes);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    inflightCount--;
  }
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Redis enabled: ${USE_REDIS}`);
  console.log(`Max inflight: ${MAX_INFLIGHT}`);
});
