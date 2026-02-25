# Scenario 01 — DB Only

## Question
What happens if every request hits the database?

## Configuration
```bash
USE_REDIS=false
MAX_INFLIGHT=1000
```

## Expected Outcome
- DB hot partition
- Latency spike
- Eventual failures

## How to Run
```bash
USE_REDIS=false MAX_INFLIGHT=1000 docker-compose up -d
docker run --rm -i --network host grafana/k6 run - <load-tests/tatkal-medium.js
```

## Key Metrics to Watch
- p95 latency
- ScyllaDB query count
- Error rate

## Insight
Without caching, the database becomes the bottleneck. Every request creates contention on the same partition (route + date).
