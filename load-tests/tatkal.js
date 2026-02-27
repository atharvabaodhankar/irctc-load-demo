import http from "k6/http";
import { sleep } from "k6";

export let options = {
  stages: [
    { duration: "20s", target: 2000 },
    { duration: "30s", target: 5000 },
    { duration: "30s", target: 10000 }
  ],
  thresholds: {
    http_req_failed: ["rate<0.1"], // <10% errors acceptable
  }
};

export default function () {
  http.get("http://api:3000/search");
  sleep(0.2);
}