import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics
const scheduleDuration = new Trend('schedule_duration');
const scheduleSuccessRate = new Rate('schedule_success_rate');
const totalRequests = new Counter('total_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],   // <1% error rate
    schedule_duration: ['p(95)<1000'], // Schedule creation < 1s
    schedule_success_rate: ['rate>0.95'], // >95% success rate
  },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const USERS = [];

// Generate test users
for (let i = 1; i <= 100; i++) {
  USERS.push({
    email: `testuser${i}@example.com`,
    username: `testuser${i}`,
    password: 'Test123!',
    fullName: `Test User ${i}`,
  });
}

// Helper functions
function login(user) {
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });
  
  return JSON.parse(loginRes.body).accessToken;
}

function createPost(token, content) {
  const postRes = http.post(`${BASE_URL}/posts`, JSON.stringify({
    content: content,
    publishNow: false,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  check(postRes, {
    'post created': (r) => r.status === 201,
  });
  
  return JSON.parse(postRes.body).id;
}

function createSchedule(token, postId, scheduledFor) {
  const startTime = Date.now();
  
  const scheduleRes = http.post(`${BASE_URL}/schedules`, JSON.stringify({
    postId: postId,
    scheduledFor: scheduledFor,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const duration = Date.now() - startTime;
  scheduleDuration.add(duration);
  
  const success = scheduleRes.status === 201;
  scheduleSuccessRate.add(success);
  
  check(scheduleRes, {
    'schedule created': (r) => r.status === 201,
  });
  
  return success;
}

function getSchedules(token) {
  const schedulesRes = http.get(`${BASE_URL}/schedules`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  check(schedulesRes, {
    'schedules fetched': (r) => r.status === 200,
  });
  
  return JSON.parse(schedulesRes.body);
}

function getTimeline(token, page = 1) {
  const timelineRes = http.get(`${BASE_URL}/posts/timeline?page=${page}&limit=20`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  check(timelineRes, {
    'timeline fetched': (r) => r.status === 200,
  });
  
  return JSON.parse(timelineRes.body);
}

// Main test function
export default function () {
  totalRequests.add(1);
  
  // Use virtual user ID
  const vus = __VU;
  const userIndex = (vus - 1) % USERS.length;
  const user = USERS[userIndex];
  
  // Login
  const token = login(user);
  
  // Create multiple posts and schedules per user
  const iterations = Math.floor(Math.random() * 5) + 1; // 1-5 iterations per VU
  
  for (let i = 0; i < iterations; i++) {
    // Create post
    const postContent = `Scheduled post ${i} from user ${user.username} at ${new Date().toISOString()}`;
    const postId = createPost(token, postContent);
    
    // Create schedule (1 hour to 7 days from now)
    const scheduleTime = new Date();
    scheduleTime.setHours(scheduleTime.getHours() + Math.floor(Math.random() * 168) + 1);
    
    const scheduleSuccess = createSchedule(token, postId, scheduleTime.toISOString());
    
    if (scheduleSuccess) {
      sleep(Math.random() * 2);
    }
  }
  
  // Get schedules list
  const schedules = getSchedules(token);
  
  // Get timeline
  const timeline = getTimeline(token);
  
  // Random delay between users
  sleep(Math.random() * 3 + 1);
}

// Cleanup function
export function teardown(data) {
  console.log('Load test completed');
  
  // Calculate and log metrics
  const metrics = {
    totalRequests: totalRequests.values.count,
    avgScheduleDuration: scheduleDuration.values.avg,
    p95ScheduleDuration: scheduleDuration.values.p95,
    scheduleSuccessRate: scheduleSuccessRate.values.rate,
  };
  
  console.log('Final Metrics:', metrics);
}