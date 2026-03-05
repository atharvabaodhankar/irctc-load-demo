# IRCTC-Style System Design Playground

A hands-on system design laboratory for understanding how architectural decisions affect system behavior under burst traffic conditions, inspired by IRCTC's Tatkal booking scenario.

## What This Project Is (And Isn't)

This is **not** an IRCTC clone. This is a controlled environment for experimenting with distributed systems patterns and observing their real-world behavior under load.

The goal is to answer questions like:
- What happens when every request hits the database?
- Does adding cache solve all scalability problems?
- How does backpressure affect system survivability?
- When does horizontal scaling help, and when doesn't it?

Instead of theoretical discussions, this project provides **measurable evidence** through load testing and observability.

## Problem Statement

High-concurrency, read-heavy systems face a common challenge: burst traffic that creates hot partitions in the database. The IRCTC Tatkal booking window is a real-world example where thousands of users query the same route at the same time.

This project simulates that scenario and demonstrates how different architectural patterns handle (or fail to handle) the load.

## Why Observability Is Critical

When you run a load test and claim "the system handled 10,000 users," that statement is meaningless without data.

You need to answer:
- What was the latency distribution?
- How many requests failed?
- At what point did the system start degrading?
- Which component became the bottleneck?

**Logs are insufficient** because:
- They don't show trends over time
- They can't calculate percentiles
- They're too verbose during high load
- They don't aggregate across multiple instances

This is why we use **Prometheus** (metrics collection) and **Grafana** (visualization). Prometheus scrapes metrics from the API every few seconds and stores them as time-series data. Grafana queries Prometheus and renders graphs that show system behavior in real-time.

The relationship is simple:
```
API exposes /metrics → Prometheus scrapes → Grafana visualizes
```

Grafana never talks to your API directly. It only queries Prometheus.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│  │   API    │   │   API    │   │   API    │           │
│  │ (replica)│   │ (replica)│   │ (replica)│           │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘           │
│       │              │              │                   │
│       └──────────────┼──────────────┘                   │
│                      │                                   │
│       ┌──────────────┴──────────────┐                   │
│       │                             │                   │
│       ▼                             ▼                   │
│  ┌─────────┐                  ┌──────────┐             │
│  │  Redis  │                  │ ScyllaDB │             │
│  │ (cache) │                  │   (DB)   │             │
│  └─────────┘                  └──────────┘             │
│                                                          │
│  ┌────────────┐         ┌──────────┐                   │
│  │ Prometheus │────────▶│ Grafana  │                   │
│  │  (metrics) │         │  (viz)   │                   │
│  └────────────┘         └──────────┘                   │
│                                                          │
│  ┌────────────┐                                         │
│  │     k6     │  (load generator)                       │
│  └────────────┘                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| API | Stateless application server | Node.js + Express |
| Redis | Read-through cache | Redis 7 |
| ScyllaDB | Primary data store (hot partition scenario) | ScyllaDB 5.4 |
| Prometheus | Metrics collection and storage | Prometheus |
| Grafana | Metrics visualization | Grafana |
| k6 | Load testing | Grafana k6 |

### Key Configuration Toggles

The system behavior is controlled via environment variables:

- `USE_REDIS` - Enable/disable caching layer
- `MAX_INFLIGHT` - Backpressure threshold (max concurrent requests)
- `CACHE_TTL` - Cache expiration time in seconds

## Scenario-Based Analysis

### Scenario 1: Database Only (No Cache, No Backpressure)

**Configuration:**
```yaml
USE_REDIS: false
MAX_INFLIGHT: 1000
API replicas: 1
```

**What happens:**

Every request hits ScyllaDB directly. Since all users are querying the same route (DEL to MUM on the same date), this creates a hot partition. The database becomes the bottleneck immediately.

**Observed behavior:**

![Scenario 1 Grafana Dashboard](/imgs/grafana-senario-1.png)

The graph shows:
- Latency spikes uncontrollably
- Error rate climbs rapidly
- System cannot sustain even moderate load
- No graceful degradation

**Why it fails:**

Without caching, every request creates contention on the same database partition. ScyllaDB is designed for distributed workloads, but when all traffic targets one partition, it behaves like a single-threaded bottleneck.

**Key insight:** Database-only architectures cannot handle burst traffic on hot data.

---

### Scenario 4: Cache + Backpressure + Horizontal Scaling

**Configuration:**
```yaml
USE_REDIS: true
MAX_INFLIGHT: 400
API replicas: 3
CACHE_TTL: 300
```

**What happens:**

Redis absorbs the read pressure. The first request hits the database and caches the result. Subsequent requests are served from cache with sub-millisecond latency.

Backpressure limits concurrent requests per API instance. When the limit is reached, the API returns 503 (Service Unavailable) immediately instead of queuing requests and eventually timing out.

Horizontal scaling distributes load across three API instances, tripling the effective capacity.

**Observed behavior:**

![Scenario 4 Grafana Dashboard](/imgs/grafana-senario-3.png)

The dashboard shows:
- Stable p95 latency around 200-300ms
- Controlled error rate (503s are intentional)
- System survives sustained high load
- Throughput plateaus at system capacity

![Latency Graph Detail](/imgs/grafana-senario-3-(2).png)

The p95 latency graph demonstrates:
- Latency remains predictable even under load
- No exponential degradation
- Clear capacity boundary

**Why it works:**

1. **Cache eliminates database contention** - Only the first request hits ScyllaDB
2. **Backpressure prevents cascade failures** - Rejecting requests early is better than timing out late
3. **Horizontal scaling increases capacity** - More API instances = more concurrent request handling

**Key insight:** This is how real Tatkal systems work. Controlled failure is better than uncontrolled collapse.

---

## Understanding Prometheus Metrics

Prometheus collects metrics from the API's `/metrics` endpoint. The most important metric is `http_request_duration_seconds`, which is a histogram.

![Prometheus Metrics View](/imgs/promentheus-senario-3.png.png)

### What Are Histogram Buckets?

A histogram divides latency into buckets. For example:
```
buckets: [0.1, 0.2, 0.3, 0.5, 1, 2, 5]
```

This means:
- `le="0.1"` - Requests that completed in ≤ 100ms
- `le="0.2"` - Requests that completed in ≤ 200ms
- `le="0.5"` - Requests that completed in ≤ 500ms
- And so on...

Prometheus counts how many requests fall into each bucket. This allows calculating percentiles.

### Why p95 Latency?

**Average latency hides pain.** If 95% of requests complete in 100ms but 5% take 10 seconds, the average might look acceptable, but users are suffering.

**p95 latency** means: 95% of requests completed faster than this value. It's a better indicator of user experience because it shows what the slowest users are experiencing (excluding outliers).

In production systems, p95 and p99 are more important than average.

### How Grafana Calculates p95

Grafana uses this PromQL query:
```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[1m])) by (le)
)
```

This tells Prometheus: "Look at the histogram buckets, calculate the rate of requests per second over the last minute, and tell me the 95th percentile latency."

---

## Load Test Results

k6 generates virtual users (VUs) that simulate real traffic. Each VU makes HTTP requests to the API.

![k6 Terminal Output](/imgs/terminal.png)

### Reading k6 Output

Key metrics from the screenshot:

- **http_req_duration**: Latency distribution
  - `avg`: Average response time
  - `p(95)`: 95th percentile latency
  - `p(99)`: 99th percentile latency

- **http_reqs**: Total requests made

- **vus**: Number of concurrent virtual users

- **http_req_failed**: Percentage of failed requests

### Controlled Failures vs. Crashes

Notice the presence of 503 errors. This is **intentional and good**.

When the system reaches capacity (MAX_INFLIGHT limit), it returns 503 immediately. This is called **backpressure** or **load shedding**.

**Without backpressure:**
- Requests queue up
- Memory usage grows
- Eventually, the process crashes or times out
- All users experience failure

**With backpressure:**
- Some requests are rejected immediately
- Accepted requests complete successfully with predictable latency
- System remains stable
- Some users experience failure, but not all

This is the difference between **graceful degradation** and **catastrophic failure**.

---

## How to Run the Project

### Prerequisites

- Docker Desktop installed and running
- At least 4GB RAM available for Docker
- PowerShell (Windows) or Bash (Linux/Mac)

### Step 1: Clone and Start Services

```bash
git clone <repository-url>
cd irctc-system-design-playground

docker compose up --build
```

Wait approximately 30-60 seconds for all services to initialize. ScyllaDB takes the longest to start.

### Step 2: Verify Services

Check that all services are running:

```bash
docker compose ps
```

You should see:
- api (3 replicas)
- redis
- scylladb
- prometheus
- grafana

### Step 3: Access Interfaces

| Service | URL | Credentials |
|---------|-----|-------------|
| API Health | http://localhost:3000/health | - |
| API Metrics | http://localhost:3000/metrics | - |
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3001 | admin / admin |

### Step 4: Configure Grafana

1. Open Grafana at http://localhost:3001
2. Login with `admin` / `admin`
3. Go to **Configuration → Data Sources**
4. Add **Prometheus**
5. Set URL: `http://prometheus:9090`
6. Click **Save & Test**

### Step 5: Create Dashboard

Create a new dashboard with these panels:

**Panel 1: Request Rate**
```promql
sum(rate(http_request_duration_seconds_count[1m]))
```

**Panel 2: p95 Latency**
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
```

**Panel 3: Error Rate**
```promql
sum(rate(http_request_duration_seconds_count{status=~"5.."}[1m])) / sum(rate(http_request_duration_seconds_count[1m])) * 100
```

### Step 6: Run Load Tests

Use the provided PowerShell script:

```powershell
.\run-scenario.ps1 -Scenario 1   # DB Only
.\run-scenario.ps1 -Scenario 2   # DB + Cache
.\run-scenario.ps1 -Scenario 3   # Cache + Backpressure
.\run-scenario.ps1 -Scenario 4   # Horizontal Scaling
```

Or run k6 manually:

```bash
docker run --rm -v $(pwd)/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-spike.js
```

### Step 7: Observe in Grafana

Open Grafana and watch the graphs update in real-time as the load test runs. You'll see latency, throughput, and error rates change based on the scenario configuration.

---

## Key Learnings

### 1. Cache Does Not Solve Entry-Point Bottlenecks

Adding Redis eliminates database load, but the API layer can still become overwhelmed. If 10,000 requests arrive simultaneously, the API must handle all of them, even if they're served from cache.

**Lesson:** Cache solves backend bottlenecks, not frontend bottlenecks.

### 2. Backpressure Enables Graceful Failure

Limiting concurrent requests (MAX_INFLIGHT) prevents the system from collapsing under load. Rejecting requests early with 503 is better than accepting them and timing out later.

**Lesson:** Controlled failure is a feature, not a bug.

### 3. Horizontal Scaling Improves Latency and Error Rate

Adding more API replicas distributes load and increases capacity. However, scaling has limits. Eventually, shared resources (Redis, ScyllaDB) become the bottleneck.

**Lesson:** Horizontal scaling works until shared resources saturate.

### 4. Observability Turns Assumptions Into Proof

Without Prometheus and Grafana, you can only guess whether optimizations worked. With observability, you can prove it with data.

**Lesson:** Measure, don't assume.

### 5. p95 Latency Matters More Than Average

Average latency hides the experience of slow users. p95 and p99 show what real users experience.

**Lesson:** Optimize for percentiles, not averages.

---

## Project Structure

```
irctc-system-design-playground/
├── api/
│   ├── index.js          # Main API with metrics
│   ├── config.js         # Configuration toggles
│   ├── Dockerfile
│   └── package.json
├── load-tests/
│   ├── tatkal-light.js   # 2-3k users
│   ├── tatkal-medium.js  # 10k users
│   └── tatkal-spike.js   # Sudden burst
├── scylla/
│   ├── init.cql          # Schema + sample data
│   └── init.sh           # Initialization script
├── scenarios/
│   ├── 01-db-only.md
│   ├── 02-db-with-cache.md
│   ├── 03-cache-with-backpressure.md
│   └── 04-horizontal-scale.md
├── imgs/                 # Screenshots and graphs
├── prometheus.yml        # Prometheus configuration
├── docker-compose.yml    # Service orchestration
├── run-scenario.ps1      # Helper script
└── README.md
```

---

## Advanced Usage

### Modifying Load Profiles

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

### Adding Custom Metrics

In `api/index.js`, add new metrics:

```javascript
const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits'
});

// Increment when cache hit occurs
cacheHits.inc();
```

### Experimenting with Configuration

Modify `docker-compose.yml` to test different configurations:

```yaml
environment:
  - USE_REDIS=true
  - MAX_INFLIGHT=200    # Lower = more 503s, but stable latency
  - CACHE_TTL=60        # Shorter = more DB hits
```

---

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker ps

# View logs
docker compose logs

# Clean restart
docker compose down -v
docker compose up --build
```

### Grafana shows "No data"

1. Verify Prometheus is scraping: http://localhost:9090/targets
2. Check data source URL is `http://prometheus:9090` (not localhost)
3. Ensure time range is set to "Last 5 minutes"
4. Generate traffic: `curl http://localhost:3000/search?from=DEL&to=MUM`

### Load tests fail

```bash
# Verify API is accessible
curl http://localhost:3000/health

# Check correct network name
docker network ls

# Use correct network in k6 command
docker run --rm -v $(pwd)/load-tests:/scripts --network irctc-load-demo_default grafana/k6 run /scripts/tatkal-light.js
```

---

## Tech Stack

- **API:** Node.js 18 + Express
- **Database:** ScyllaDB 5.4 (Cassandra-compatible)
- **Cache:** Redis 7
- **Metrics:** Prometheus + prom-client
- **Visualization:** Grafana
- **Load Testing:** k6
- **Orchestration:** Docker Compose

---

## Further Reading

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Tutorials](https://grafana.com/tutorials/)
- [k6 Load Testing Guide](https://k6.io/docs/)
- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

---

## License

MIT

---

## Contributing

This is a learning project. Contributions that add new scenarios, improve documentation, or demonstrate additional system design patterns are welcome.

---

**Remember:** This project is not about building features. It's about building intuition through experimentation and evidence.

Start with Scenario 1 and progress through each one to see how architectural decisions impact system behavior under load.
