import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 1000 },
    { duration: '5s', target: 15000 },  // Sudden spike
    { duration: '1m', target: 15000 },
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
    'not timeout': (r) => r.status !== 0,
    'system responds': (r) => r.status === 200 || r.status === 503,
  });
  
  sleep(0.1);
}
