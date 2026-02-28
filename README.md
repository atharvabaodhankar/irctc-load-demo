# IRCTC System Design Playground

This project is a system design playground that demonstrates how architectural choices affect the survivability of read-heavy systems under burst traffic, inspired by IRCTC Tatkal booking behavior.

## Why This Exists

Most system design discussions are theoretical. This playground lets you:
- Toggle architectural patterns with environment variables
- Observe real failure modes under load
- Build intuition about distributed systems trade-offs

## Architecture Toggles

All configuration lives in `api/config.js`:

```javascript
USE_REDIS          // Enable/disable caching layer
MAX_INFLIGHT       // Backpressure threshold
CACHE_TTL          // Cache expiration in seconds
```

## Project Structure

```
irctc-system-design-playground/
├── api/
│   ├── index.js          ← Main API with toggle-aware logic
│   ├── config.js         ← Architecture toggles
│   ├── Dockerfile
│   └── package.json
├── load-tests/
│   ├── tatkal-light.js   ← 2-3k users
│   ├── tatkal-medium.js  ← 10k users
│   └── tatkal-spike.js   ← Sudden burst
├── scylla/
│   └── init.cql          ← Schema + sample data
├── scenarios/
│   ├── 01-db-only.md
│   ├── 02-db-with-cache.md
│   ├── 03-cache-with-backpressure.md
│   └── 04-horizontal-scale.md
├── run-scenario.ps1      ← PowerShell helper script
├── run-test.ps1          ← Test runner script
└── docker-compose.yml
```

## Prerequisites

- Docker Desktop installed and running
- PowerShell (Windows) or Bash (Linux/Mac)
- At least 4GB RAM available for Docker

## Quick Start

### Option 1: Using Helper Scripts (Recommended for Windows)

```powershell
# Run complete scenarios with one command
.\run-scenario.ps1 -Scenario 1   # DB Only
.\run-scenario.ps1 -Scenario 2   # DB + Cache
.\run-scenario.ps1 -Scenario 3   # Cache + Backpressure
.\run-scenario.ps1 -Scenario 4   # Horizontal Scaling
```

### Option 2: Manual Setup

#### Step 1: Start Infrastructure

```powershell
# Start all services
docker-compose up -d

# Wait for services to be ready (30 seconds)
Start-Sleep -Seconds 30

# Check if API is healthy
curl http://localhost:3000/health
```

#### Step 2: Run Load Tests

**PowerShell (Windows):**
```powershell
# Light load (2-3k users)
docker run --rm -v ${PWD}/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-light.js

# Medium load (10k users)
docker run --rm -v ${PWD}/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-medium.js

# Spike test (sudden burst)
docker run --rm -v ${PWD}/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-spike.js
```

**Bash (Linux/Mac):**
```bash
# Light load
docker run --rm -v $(pwd)/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-light.js

# Medium load
docker run --rm -v $(pwd)/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-medium.js

# Spike test
docker run --rm -v $(pwd)/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-spike.js
```

## Scenarios

### Scenario 01 — DB Only

**Question:** What happens if every request hits the database?

**Configuration:**
```powershell
$env:USE_REDIS = "false"
$env:MAX_INFLIGHT = "1000"
docker-compose up -d
```

**Run Test:**
```powershell
.\run-test.ps1 -TestType medium
```

**Expected Outcome:**
- DB hot partition
- Latency spike
- Eventual failures

**Key Insight:** Without caching, the database becomes the bottleneck. Every request creates contention on the same partition (route + date).

---

### Scenario 02 — DB + Cache

**Question:** Can cache absorb read pressure?

**Configuration:**
```powershell
$env:USE_REDIS = "true"
$env:MAX_INFLIGHT = "1000"
$env:CACHE_TTL = "30"
docker-compose up -d
```

**Run Test:**
```powershell
.\run-test.ps1 -TestType medium
```

**Expected Outcome:**
- DB load flattens
- Latency improves
- API still collapses at entry point

**Key Insight:** Cache alone ≠ scalability. While Redis absorbs read pressure, the API layer still becomes overwhelmed without backpressure control.

---

### Scenario 03 — Cache + Backpressure ⭐ (Recommended)

**Question:** Is it better to fail fast or fail late?

**Configuration:**
```powershell
$env:USE_REDIS = "true"
$env:MAX_INFLIGHT = "300"
$env:CACHE_TTL = "30"
docker-compose up -d
```

**Run Test:**
```powershell
.\run-test.ps1 -TestType spike
```

**Expected Outcome:**
- Stable latency
- Controlled 503s
- System survives burst

**Key Insight:** This is real Tatkal logic. By limiting inflight requests, we maintain predictable latency for successful requests while gracefully rejecting excess load.

---

### Scenario 04 — Horizontal Scaling

**Question:** What changes when we add replicas?

**Configuration:**
```powershell
$env:USE_REDIS = "true"
$env:MAX_INFLIGHT = "300"
$env:CACHE_TTL = "30"
docker-compose up -d --scale api=3
```

**Run Test:**
```powershell
.\run-test.ps1 -TestType spike
```

**Expected Outcome:**
- Dramatic improvement
- Linear scaling up to a point
- Redis becomes the bottleneck

**Key Insight:** Horizontal scaling works until shared resources (Redis, DB) become the bottleneck. This demonstrates why distributed systems need careful capacity planning.

---

## Key Metrics to Track

Track only these 5 metrics:

1. **p95 latency** - 95th percentile response time
2. **Error rate** - Percentage of failed requests
3. **Redis hit vs miss** - Cache effectiveness
4. **ScyllaDB query count** - Database load
5. **Max sustainable VUs** - Maximum virtual users system can handle

## Useful Commands

### Service Management

```powershell
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Clean up volumes (fresh start)
docker-compose down -v

# Restart a specific service
docker-compose restart api

# Scale API horizontally
docker-compose up -d --scale api=3
```

### Testing & Debugging

```powershell
# Check API health
curl http://localhost:3000/health

# Manual search test
curl "http://localhost:3000/search?from=DEL&to=MUM&date=2024-12-25"

# Check Redis cache
docker exec -it irctc-load-demo-redis-1 redis-cli
> KEYS *
> GET "search:DEL-MUM:2024-12-25"

# Check ScyllaDB
docker exec -it scylladb cqlsh
> USE irctc;
> SELECT * FROM availability;
```

### Load Test Variations

```powershell
# Run only specific test
.\run-test.ps1 -TestType light    # 2-3k users
.\run-test.ps1 -TestType medium   # 10k users
.\run-test.ps1 -TestType spike    # Sudden burst

# Run complete scenario
.\run-scenario.ps1 -Scenario 1    # Includes setup + test
```

## Understanding the Results

### K6 Output Explained

```
✓ status is 200 or 503
✓ latency < 1000ms

checks.........................: 95.00%  ← Success rate
http_req_duration..............: avg=250ms p95=450ms  ← Response times
http_reqs......................: 50000   ← Total requests
vus............................: 10000   ← Virtual users
```

**Good Results:**
- p95 latency < 500ms
- Error rate < 5%
- High cache hit ratio (>80%)

**Bad Results:**
- p95 latency > 2000ms
- Error rate > 20%
- Timeouts and connection errors

## Troubleshooting

### Services won't start

```powershell
# Check Docker is running
docker ps

# Check logs for errors
docker-compose logs

# Clean restart
docker-compose down -v
docker-compose up -d
```

### Load tests fail to connect

```powershell
# Verify API is accessible
curl http://localhost:3000/health

# Check network name
docker network ls

# Use correct network name in test command
docker run --rm -v ${PWD}/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-light.js
```

### High memory usage

```powershell
# Reduce ScyllaDB memory
# Edit docker-compose.yml: --memory 512M

# Reduce concurrent users in load tests
# Edit load-tests/*.js: target values
```

## What You'll Learn

- Why caching isn't a silver bullet
- When to fail fast vs fail late
- How backpressure protects systems
- Where horizontal scaling helps (and where it doesn't)
- Real-world trade-offs in distributed systems

## Tech Stack

- **API:** Node.js + Express
- **Database:** ScyllaDB (Cassandra-compatible)
- **Cache:** Redis
- **Load Testing:** K6
- **Orchestration:** Docker Compose

## Advanced Usage

### Custom Load Profiles

Edit `load-tests/tatkal-*.js` to create custom scenarios:

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 5000 },   // Ramp up
    { duration: '2m', target: 5000 },    // Sustain
    { duration: '30s', target: 0 },      // Ramp down
  ],
};
```

### Custom Architecture Toggles

Add new toggles in `api/config.js`:

```javascript
module.exports = {
  USE_REDIS: process.env.USE_REDIS === "true",
  MAX_INFLIGHT: parseInt(process.env.MAX_INFLIGHT || "500"),
  CACHE_TTL: parseInt(process.env.CACHE_TTL || "30"),
  // Add your own toggles here
};
```

## Contributing

This is a learning playground. Feel free to:
- Add new scenarios
- Experiment with different architectures
- Document your findings
- Share insights

## License

MIT - Use this for learning and experimentation

---

**Remember:** This isn't about building features. It's about building intuition, evidence, and explanations.

Start with Scenario 01 and progress through each one to see how architectural decisions impact system behavior under load.
