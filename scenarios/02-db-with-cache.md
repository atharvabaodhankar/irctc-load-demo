# Scenario 02 — DB + Cache

## Question
Can cache absorb read pressure?

## Configuration
```bash
USE_REDIS=true
MAX_INFLIGHT=1000
CACHE_TTL=30
```

## Expected Outcome
- DB load flattens
- Latency improves
- API still collapses at entry point

## How to Run
```bash
USE_REDIS=true MAX_INFLIGHT=1000 CACHE_TTL=30 docker-compose up -d
docker run --rm -i --network host grafana/k6 run - <load-tests/tatkal-medium.js
```

## Key Metrics to Watch
- Redis hit vs miss ratio
- p95 latency
- API inflight requests

## Insight
Cache alone ≠ scalability. While Redis absorbs read pressure, the API layer still becomes overwhelmed without backpressure control.
