const express = require("express");
const app = express();

app.get("/search", async (req, res) => {
  // simulate DB latency
  await new Promise(r => setTimeout(r, 120));

  res.json({
    route: "MUM-DEL",
    train: "12951",
    availability: "WL/23",
    source: "db"
  });
});

app.listen(3000, () => {
  console.log("API running on port 3000");
});