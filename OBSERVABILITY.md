# Observability Guide: Prometheus & Grafana

## Table of Contents

1. [Why Observability Matters](#why-observability-matters)
2. [Understanding the Stack](#understanding-the-stack)
3. [Architecture Overview](#architecture-overview)
4. [Complete Setup Guide](#complete-setup-guide)
5. [Creating Dashboards](#creating-dashboards)
6. [Query Examples](#query-examples)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Why Observability Matters

### The Problem

When you run a load test and say:

> "The system survived 10,000 concurrent users"

This statement is **meaningless** without evidence.

You need to answer:
- What was the latency?
- How many requests failed?
- When did the system start degrading?
- Which component became the bottleneck?

### The Solution

**Observability** = The ability to understand system behavior by examining its outputs.

For distributed systems, this means:
- **Metrics** - Numerical measurements over time
- **Visualization** - Graphs that show patterns
- **Analysis** - Understanding cause and effect

---

## Understanding the Stack

### What is Prometheus?

Prometheus is a **time-series database** and **metrics collector**.

**Key Concepts:**

1. **Pull-based model**: Prometheus scrapes metrics from targets
2. **Time-series data**: Every metric is stored with timestamps
3. **Labels**: Metrics can have dimensions (method, status, route)
4. **PromQL**: Query language for analyzing metrics

**What Prometheus Does:**
- Collects metrics every N seconds (scrape interval)
- Stores them efficiently
- Provides a query interface
- Alerts when thresholds are breached

**What Prometheus Does NOT Do:**
- Create pretty dashboards (that's Grafana's job)
- Store logs (use ELK/Loki for that)
- Trace requests (use Jaeger/Zipkin for that)

### What is Grafana?

Grafana is a **visualization platform**.

**Key Concepts:**

1. **Data sources**: Grafana reads from Prometheus, InfluxDB, etc.
2. **Dashboards**: Collections of panels showing metrics
3. **Panels**: Individual graphs, tables, or gauges
4. **Variables**: Dynamic dashboard filters

**What Grafana Does:**
- Queries Prometheus for metrics
- Renders beautiful graphs
- Provides alerting and annotations
- Enables exploration and analysis

**What Grafana Does NOT Do:**
- Collect metrics (that's Prometheus's job)
- Store data (it's just a visualization layer)

### How They Work Together

```
┌─────────────┐
│   Your API  │  Exposes /metrics endpoint
└──────┬──────┘
       │
       │ HTTP GET /metrics (every 5s)
       ↓
┌─────────────┐
│ Prometheus  │  Scrapes and stores metrics
└──────┬──────┘
       │
       │ PromQL queries
       ↓
┌─────────────┐
│   Grafana   │  Visualizes data
└─────────────┘
```

**Critical Understanding:**
- Grafana NEVER talks to your API directly
- Grafana ONLY queries Prometheus
- Your API doesn't know Grafana exists

---

## Architecture Overview

### Components in This Project

```
┌──────────────────────────────────────────────────┐
│                Docker Network                     │
│                                                   │
│  ┌─────────┐    ┌─────────┐    ┌──────────┐    │
│  │   API   │───▶│  Redis  │    │ ScyllaDB │    │
│  │ (x3)    │    └─────────┘    └──────────┘    │
│  └────┬────┘                                     │
│       │                                          │
│       │ /metrics                                 │
│       ↓                                          │
│  ┌──────────┐         ┌──────────┐             │
│  │Prometheus│────────▶│ Grafana  │             │
│  └──────────┘         └──────────┘             │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Ports

| Service | Port | Purpose |
|---------|------|---------|
| API | 3000 | Application endpoints |
| Redis | 6379 | Cache |
| ScyllaDB | 9042 | Database |
| Prometheus | 9090 | Metrics storage & query |
| Grafana | 3001 | Dashboards |

---

## Complete Setup Guide

### Step 1: Install prom-client in API

The API needs to expose metrics in Prometheus format.

```bash
cd api
npm install prom-client
```

### Step 2: Add Metrics to API Code

**File: api/index.js**

```javascript
const express = require("express");
const client = require("prom-client");

const app = express();

// ============================================
// PROMETHEUS SETUP
// ============================================

// Create a registry
const register = new client.Registry();

// Collect default Node.js metrics (CPU, memory, event loop)
client.collectDefaultMetrics({ register });

// Create custom histogram for HTTP request duration
const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.2, 0.3, 0.5, 1, 2, 5] // Latency buckets
});

// Register the histogram
register.registerMetric(httpDuration);

// ============================================
// MIDDLEWARE TO MEASURE REQUESTS
// ============================================

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

// ============================================
// YOUR EXISTING ROUTES
// ============================================

app.get("/search", async (req, res) => {
  // Your search logic here
});

// ============================================
// METRICS ENDPOINT (CRITICAL)
// ============================================

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ============================================
// START SERVER
// ============================================

app.listen(3000, () => {
  console.log("API running on port 3000");
});
```

**Verify it works:**

```bash
curl http://localhost:3000/metrics
```

You should see output like:

```
# HELP http_request_duration_seconds HTTP request latency in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1",method="GET",route="/search",status="200"} 45
http_request_duration_seconds_bucket{le="0.2",method="GET",route="/search",status="200"} 89
...
```

### Step 3: Configure Prometheus

**File: prometheus.yml**

```yaml
global:
  scrape_interval: 5s      # How often to scrape targets
  evaluation_interval: 5s  # How often to evaluate rules

scrape_configs:
  - job_name: "api"
    static_configs:
      - targets: ["api:3000"]  # Docker service name
```

**Explanation:**

- `scrape_interval: 5s` - Prometheus will call `/metrics` every 5 seconds
- `job_name: "api"` - Label for this scrape target
- `targets: ["api:3000"]` - Where to scrape from (Docker DNS)

### Step 4: Add to Docker Compose

**File: docker-compose.yml**

```yaml
services:
  api:
    build: ./api
    deploy:
      replicas: 3
    environment:
      - USE_REDIS=true
      - MAX_INFLIGHT=400
    depends_on:
      scylladb:
        condition: service_healthy
      scylla-init:
        condition: service_completed_successfully
      redis:
        condition: service_started
    ports:
      - "3000:3000"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  scylladb:
    image: scylladb/scylla:5.4
    command: --smp 2 --memory 1G
    ports:
      - "9042:9042"
    healthcheck:
      test: ["CMD-SHELL", "cqlsh -e 'describe keyspaces' || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 30

  scylla-init:
    image: scylladb/scylla:5.4
    depends_on:
      scylladb:
        condition: service_healthy
    volumes:
      - ./scylla/init.cql:/init.cql
      - ./scylla/init.sh:/init.sh
    entrypoint: ["/bin/bash", "/init.sh"]
    restart: "no"

  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
```

### Step 5: Start Everything

```bash
docker compose down
docker compose up --build
```

Wait for all services to start (about 30 seconds).

### Step 6: Verify Prometheus

1. Open: http://localhost:9090
2. Go to **Status → Targets**
3. You should see `api (1/1 up)`

If the target is down:
- Check API logs: `docker compose logs api`
- Verify `/metrics` endpoint: `curl http://localhost:3000/metrics`

### Step 7: Configure Grafana

1. Open: http://localhost:3001
2. Login: `admin` / `admin` (change password when prompted)
3. Go to **Configuration → Data Sources**
4. Click **Add data source**
5. Select **Prometheus**
6. Set URL: `http://prometheus:9090`
7. Click **Save & Test**

You should see: "Data source is working"

---

## Creating Dashboards

### Dashboard 1: System Overview

Create a new dashboard with these panels:

#### Panel 1: Request Rate (Throughput)

**Query:**
```promql
sum(rate(http_request_duration_seconds_count[1m]))
```

**Explanation:**
- `rate()` - Calculate per-second rate
- `[1m]` - Over 1-minute window
- `sum()` - Total across all API instances

**What it shows:** Requests per second

#### Panel 2: p95 Latency

**Query:**
```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[1m])) by (le)
)
```

**Explanation:**
- `histogram_quantile(0.95, ...)` - Calculate 95th percentile
- `by (le)` - Group by bucket boundaries

**What it shows:** 95% of requests complete within this time

#### Panel 3: Error Rate

**Query:**
```promql
sum(rate(http_request_duration_seconds_count{status=~"5.."}[1m]))
/
sum(rate(http_request_duration_seconds_count[1m]))
* 100
```

**Explanation:**
- `{status=~"5.."}` - Match 5xx status codes
- Division gives error ratio
- `* 100` converts to percentage

**What it shows:** Percentage of failed requests

#### Panel 4: Status Code Distribution

**Query:**
```promql
sum(rate(http_request_duration_seconds_count[1m])) by (status)
```

**Visualization:** Pie chart or bar graph

**What it shows:** Breakdown of 200, 503, etc.

### Dashboard 2: Performance Deep Dive

#### Panel 1: Latency Heatmap

**Query:**
```promql
sum(rate(http_request_duration_seconds_bucket[1m])) by (le)
```

**Visualization:** Heatmap

**What it shows:** Latency distribution over time

#### Panel 2: Request Duration by Route

**Query:**
```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[1m])) by (le, route)
)
```

**What it shows:** Which endpoints are slowest

#### Panel 3: Node.js Memory Usage

**Query:**
```promql
process_resident_memory_bytes / 1024 / 1024
```

**What it shows:** Memory usage in MB

#### Panel 4: Event Loop Lag

**Query:**
```promql
nodejs_eventloop_lag_seconds
```

**What it shows:** Node.js event loop delay (should be < 0.1s)

---

## Query Examples

### Basic Queries

**Current request rate:**
```promql
rate(http_request_duration_seconds_count[1m])
```

**Average latency:**
```promql
rate(http_request_duration_seconds_sum[1m])
/
rate(http_request_duration_seconds_count[1m])
```

**Total requests in last hour:**
```promql
increase(http_request_duration_seconds_count[1h])
```

### Advanced Queries

**p50, p95, p99 latencies:**
```promql
histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))
```

**Error rate by status code:**
```promql
sum(rate(http_request_duration_seconds_count[1m])) by (status)
```

**Requests per API instance:**
```promql
sum(rate(http_request_duration_seconds_count[1m])) by (instance)
```

---

## Troubleshooting

### Problem: Grafana shows "No data"

**Possible causes:**

1. **Prometheus isn't scraping**
   - Check: http://localhost:9090/targets
   - Should show `api (1/1 up)`

2. **Wrong data source URL**
   - Should be: `http://prometheus:9090`
   - NOT: `http://localhost:9090`

3. **Wrong query**
   - Test query in Prometheus first
   - Then copy to Grafana

4. **Time range issue**
   - Set time range to "Last 5 minutes"
   - Generate some traffic: `curl http://localhost:3000/search?from=DEL&to=MUM`

### Problem: Prometheus target is down

**Check API logs:**
```bash
docker compose logs api
```

**Verify /metrics endpoint:**
```bash
curl http://localhost:3000/metrics
```

**Check network connectivity:**
```bash
docker exec -it irctc-load-demo-prometheus-1 wget -O- http://api:3000/metrics
```

### Problem: Metrics are stale

**Check scrape interval:**
- Default is 5 seconds
- Verify in prometheus.yml

**Force refresh:**
- Reload Prometheus config
- Or restart: `docker compose restart prometheus`

---

## Best Practices

### 1. Choose the Right Metrics

**DO measure:**
- Request latency (p50, p95, p99)
- Error rates
- Throughput (requests/sec)
- Resource usage (CPU, memory)

**DON'T measure:**
- Individual user actions (use logs)
- Sensitive data (PII)
- High-cardinality labels (user IDs)

### 2. Use Appropriate Metric Types

**Counter** - Monotonically increasing (total requests)
```javascript
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests'
});
```

**Gauge** - Can go up or down (current memory usage)
```javascript
const memoryGauge = new client.Gauge({
  name: 'memory_usage_bytes',
  help: 'Current memory usage'
});
```

**Histogram** - Distribution of values (latency)
```javascript
const latencyHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request latency',
  buckets: [0.1, 0.5, 1, 2, 5]
});
```

### 3. Label Wisely

**Good labels:**
- method (GET, POST)
- status (200, 503)
- route (/search, /health)

**Bad labels:**
- user_id (too many unique values)
- timestamp (infinite cardinality)
- full_url (includes query params)

### 4. Set Meaningful Buckets

For latency histograms, choose buckets that match your SLOs:

```javascript
buckets: [0.1, 0.2, 0.3, 0.5, 1, 2, 5]
```

This lets you calculate:
- p50 (median)
- p95 (95th percentile)
- p99 (99th percentile)

### 5. Monitor What Matters

Focus on:
- **Latency** - User experience
- **Traffic** - System load
- **Errors** - Reliability
- **Saturation** - Resource limits

This is the **"Four Golden Signals"** from Google SRE.

---

## Interview-Ready Explanations

### "Why did you add Prometheus?"

> "Without observability, we're flying blind. Prometheus gives us time-series metrics so we can see exactly when latency spiked, which requests failed, and whether our optimizations actually worked. It's the difference between guessing and knowing."

### "Why Grafana instead of Prometheus UI?"

> "Prometheus UI is for ad-hoc queries. Grafana is for dashboards that stakeholders can understand. When I need to show that horizontal scaling reduced p95 latency by 40%, I use Grafana. When I'm debugging a specific metric, I use Prometheus."

### "What metrics matter most?"

> "I focus on p95 latency, not average, because average hides the pain of slow users. I track error rate to ensure we fail gracefully. And I monitor throughput to understand system capacity. These three metrics tell the story of system health."

---

## Next Steps

1. **Run a load test** and watch metrics in real-time
2. **Create alerts** in Grafana for high latency or error rates
3. **Export dashboards** as JSON for version control
4. **Add custom metrics** for business logic (cache hits, DB queries)

---

**Remember:** Observability isn't about collecting all possible metrics. It's about collecting the right metrics to answer critical questions about system behavior.

Start simple. Add complexity only when needed.
