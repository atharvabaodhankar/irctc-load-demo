import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  stages: [
    { duration: '20s', target: 3000 },
    { duration: '40s', target: 10000 },
    { duration: '20s', target: 20000 }
  ],
};

export default function () {
  http.get("http://api:3000/search");
  sleep(1);
}