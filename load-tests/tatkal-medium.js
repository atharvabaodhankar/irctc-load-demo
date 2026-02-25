import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10000 },
    { duration: '2m', target: 10000 },
    { duration: '1m', target: 0 },
  ],
};

export default function () {
  const params = {
    from: 'DEL',
    to: 'MUM',
    date: '2024-12-25'
  };
  
  const res = http.get(`http://api:3000/search?from=${params.from}&to=${params.to}&date=${params.date}`);
  
  check(res, {
    'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'latency < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  sleep(0.5);
}
