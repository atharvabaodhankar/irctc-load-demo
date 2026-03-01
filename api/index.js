const express = require('express');
const cassandra = require('cassandra-driver');
const redis = require('redis');
const { USE_REDIS, MAX_INFLIGHT, CACHE_TTL } = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

let inflight = 0;

// ScyllaDB client
const scyllaClient = new cassandra.Client({
  contactPoints: [process.env.SCYLLA_HOST || 'scylladb'],
  localDataCenter: 'datacenter1',
  keyspace: 'irctc'
});

// Redis client (conditional)
let redisClient = null;
if (USE_REDIS) {
  redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST || 'redis'}:6379`
  });
  redisClient.connect().catch(console.error);
}

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      USE_REDIS,
      MAX_INFLIGHT,
      CACHE_TTL
    },
    inflight
  });
});

app.get('/search', async (req, res) => {
  // Backpressure check
  if (inflight >= MAX_INFLIGHT) {
    return res.status(503).json({
      error: "System busy",
      reason: "backpressure",
      inflight
    });
  }

  inflight++;
  const startTime = Date.now();

  try {
    const { from, to, date } = req.query;
    const route = `${from}-${to}`;
    const cacheKey = `search:${route}:${date}`;

    // Try Redis first if enabled
    if (USE_REDIS && redisClient) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({
          data: JSON.parse(cached),
          source: 'cache',
          latency: Date.now() - startTime
        });
      }
    }

    // Fallback to ScyllaDB
    const query = 'SELECT * FROM availability WHERE route = ? AND travel_date = ?';
    const result = await scyllaClient.execute(query, [route, date], { prepare: true });

    const data = result.rows;

    // Cache the result if Redis is enabled
    if (USE_REDIS && redisClient) {
      await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    }

    res.json({
      data,
      source: 'database',
      latency: Date.now() - startTime
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    inflight--;
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Config: USE_REDIS=${USE_REDIS}, MAX_INFLIGHT=${MAX_INFLIGHT}, CACHE_TTL=${CACHE_TTL}`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
