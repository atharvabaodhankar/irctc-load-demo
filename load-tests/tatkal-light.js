import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 2000 },
    { duration: '1m', target: 2000 },
    { duration: '30s', target: 0 },
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
    'status is 200': (r) => r.status === 200,
    'latency < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
