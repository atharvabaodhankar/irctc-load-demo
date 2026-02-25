# Scenario 04 — Horizontal Scaling

## Question
What changes when we add replicas?

## Configuration
```bash
USE_REDIS=true
MAX_INFLIGHT=300
CACHE_TTL=30
# Multiple API containers
```

## Expected Outcome
- Dramatic improvement
- Linear scaling up to a point
- Redis becomes the bottleneck

## How to Run
```bash
# Scale API to 3 replicas
docker-compose up -d --scale api=3
docker run --rm -i --network host grafana/k6 run - <load-tests/tatkal-spike.js
```

## Key Metrics to Watch
- Total throughput
- Redis connection count
- Load distribution

## Insight
Horizontal scaling works until shared resources (Redis, DB) become the bottleneck. This demonstrates why distributed systems need careful capacity planning.
