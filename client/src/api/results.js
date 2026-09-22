import { request } from './http.js';

export function getResults(periodNumber) {
  return request(`/api/results?periodNumber=${periodNumber}`);
}