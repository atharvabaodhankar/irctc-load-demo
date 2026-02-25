# Scenario 03 — Cache + Backpressure

## Question
Is it better to fail fast or fail late?

## Configuration
```bash
USE_REDIS=true
MAX_INFLIGHT=300
CACHE_TTL=30
```

## Expected Outcome
- Stable latency
- Controlled 503s
- System survives burst

## How to Run
```bash
USE_REDIS=true MAX_INFLIGHT=300 CACHE_TTL=30 docker-compose up -d
docker run --rm -i --network host grafana/k6 run - <load-tests/tatkal-spike.js
```

## Key Metrics to Watch
- p95 latency stability
- 503 error rate
- Max sustainable VUs

## Insight
This is real Tatkal logic. By limiting inflight requests, we maintain predictable latency for successful requests while gracefully rejecting excess load.
