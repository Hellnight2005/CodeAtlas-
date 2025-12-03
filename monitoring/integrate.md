# 📘 Microservice Monitoring Integration Guide

(Prometheus + Loki + Grafana)

This document explains everything required to integrate ANY new microservice into the monitoring stack.  
Includes: Prometheus metrics, Loki logs, Grafana visualization, and required configuration changes.

---

# 1. Requirements for Every New Microservice

Every new microservice must implement **two things**:

---

## 1.1 Expose Prometheus Metrics (`/metrics`)

```js
const client = require("prom-client");
client.collectDefaultMetrics();

app.get("/metrics", (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(client.register.metrics());
});
```

## 1.2 Use JSON Structured Logging (for Loki)

```js
Copy code
function log(level, service, msg) {
  console.log(JSON.stringify({ level, service, message: msg }));
}

log("info", "orders", "Order placed");
log("error", "auth", "Invalid token");
```

These logs allow Grafana Loki to filter by:

```
{service="orders", level="error"}
```

# 2. Adding Custom Metrics (Per Service)

Each microservice should create its own custom metrics.

Example from orders-service:

```js
Copy code
const client = require('prom-client');

// Counter: total requests
const serviceRequestCounter = new client.Counter({
  name: 'orders_total_requests',
  help: 'Total number of requests received',
  labelNames: ['service']
});

// Counter: total errors
const serviceErrorCounter = new client.Counter({
  name: 'orders_total_errors',
  help: 'Total number of errors',
  labelNames: ['service']
});

// Histogram: processing duration
const orderProcessTime = new client.Histogram({
  name: 'orders_processing_duration_seconds',
  help: 'Time taken to process an order',
  buckets: [0.1, 0.5, 1, 2, 5]
});
```

```js
serviceRequestCounter.inc({ service: "orders" });
orderProcessTime.observe(1.2);
serviceErrorCounter.inc({ service: "orders" });
```

# 3. Required Monitoring Stack Updates

Only one required update is necessary when adding a new microservice.

## 3.1 Update prometheus.yml

Prometheus must know where the new service’s /metrics endpoint is running.

Add the new service target:

```yaml
Copy code
scrape_configs:
  - job_name: "microservices"
    static_configs:
      - targets:
          - "service1:8080"
          - "service2:3000"
          - "orders-service:7000"   # <-- Add this for each new service
```

Add one line per microservice.

## 3.2 No Changes Needed in These Files

| File                 | Change Needed?                                     |
| -------------------- | -------------------------------------------------- |
| `docker-compose.yml` | ❌ No (unless the new microservice runs in Docker) |
| Loki config          | ❌ No                                              |
| Grafana config       | ❌ No                                              |
| Grafana datasource   | ❌ No                                              |

Prometheus discovery is the only required configuration step.

# 4. Visualizing Metrics in Grafana

Once metrics appear in Prometheus (http://localhost:9090):

- Open Grafana (http://localhost:3000)
- Go to Explore
- Select Prometheus

## 4.1 Example Queries

### Request rate

```promql
rate(orders_total_requests[5m])
```

Error rate

```promql
rate(orders_total_errors[5m])
```

Average processing duration

```promql
rate(orders_processing_duration_seconds_sum[5m]) /
rate(orders_processing_duration_seconds_count[5m])
```

Per-service filtering

```promql
orders_total_requests{service="orders"}
```

# 5. Viewing Logs in Grafana (via Loki)

Open Grafana → Explore → Select Loki

Logs for a single service

```
{service="orders"}
```

Only errors

```
{service="orders", level="error"}
```

Only info logs

```
{service="orders", level="info"}
```

Search logs containing a word

```
{service="orders"} |= "Order"
```

# Monitoring Integration Requirements

Every new microservice must:

1. Expose Prometheus metrics at /metrics
2. Send JSON logs with {level, service, message}
3. Register custom metrics using prom-client
4. Add its metrics endpoint to prometheus.yml:
   - "new-service:PORT"

# Logging

console.log(JSON.stringify({ level, service, message }));

# Metrics

Use counters, gauges, histograms as needed.

# Grafana

Prometheus and Loki automatically detect logs and metrics.
