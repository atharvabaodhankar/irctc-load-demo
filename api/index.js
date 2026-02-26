const express = require("express");
const app = express();

let activeReads = 0;
const MAX_DB_READS = 100;

app.get("/search", async (req, res) => {
  activeReads++;

  if (activeReads > MAX_DB_READS) {
    activeReads--;
    return res.status(503).json({
      error: "ScyllaDB overloaded",
      source: "db"
    });
  }

  // simulate ScyllaDB read latency
  await new Promise(r => setTimeout(r, 250));

  activeReads--;

  res.json({
    route: "MUM-DEL",
    train: "12951",
    availability: "WL/23",
    source: "scylladb"
  });
});

app.listen(3000);