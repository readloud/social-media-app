import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Security Tests (DAST)', () => {
  let app: INestApplication;
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  
  describe('SQL Injection Prevention', () => {
    const sqlPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT * FROM users--",
      "admin' --",
      "1' OR '1' = '1'",
      "1; SELECT * FROM users",
    ];
    
    sqlPayloads.forEach(payload => {
      it(`should reject SQL injection: ${payload}`, async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/posts/search')
          .query({ q: payload })
          .expect(400);
        
        expect(response.body).not.toContain('SELECT');
        expect(response.body).not.toHaveProperty('users');
      });
    });
  });
  
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert("XSS")',
      '"><script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
    ];
    
    xssPayloads.forEach(payload => {
      it(`should sanitize XSS payload: ${payload}`, async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/posts')
          .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`)
          .send({ content: payload })
          .expect(201);
        
        expect(response.body.content).not.toContain('<script>');
        expect(response.body.content).not.toContain('onerror');
      });
    });
  });
  
  describe('Authentication Security', () => {
    it('should prevent brute force attacks', async () => {
      const attempts = [];
      
      // Try 10 rapid login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({
              email: 'test@example.com',
              password: 'wrongpassword',
            })
        );
      }
      
      const responses = await Promise.all(attempts);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
    
    it('should have secure password requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'qwerty',
        'admin',
        'letmein',
      ];
      
      for (const password of weakPasswords) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            username: 'testuser',
            password: password,
            fullName: 'Test User',
          });
        
        if (response.status === 201) {
          throw new Error(`Weak password accepted: ${password}`);
        }
        
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('password');
      }
    });
    
    it('should expire JWT tokens', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9';
      
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      expect(response.body.message).toContain('expired');
    });
  });
  
  describe('Authorization Testing', () => {
    it('should prevent access to other users data', async () => {
      const user1Token = await getAuthToken('user1@example.com');
      const user2Token = await getAuthToken('user2@example.com');
      
      // User1 creates a post
      const post = await request(app.getHttpServer())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Private post' })
        .expect(201);
      
      // User2 tries to access User1's post
      await request(app.getHttpServer())
        .get(`/api/v1/posts/${post.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
      
      // User2 tries to delete User1's post
      await request(app.getHttpServer())
        .delete(`/api/v1/posts/${post.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
    });
  });
  
  describe('Input Validation', () => {
    it('should reject oversized payloads', async () => {
      const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB
      
      await request(app.getHttpServer())
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`)
        .send({ content: largeContent })
        .expect(413); // Payload Too Large
    });
    
    it('should validate email format', async () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@example.com',
        'test@.com',
        'test@example',
      ];
      
      for (const email of invalidEmails) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: email,
            username: 'testuser',
            password: 'ValidPass123!',
            fullName: 'Test User',
          });
        
        expect(response.status).toBe(400);
      }
    });
  });
  
  describe('Rate Limiting', () => {
    it('should rate limit API endpoints', async () => {
      const requests = [];
      
      // Make 100 rapid requests
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/v1/posts/timeline')
            .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`)
        );
      }
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
  
  afterAll(async () => {
    await app.close();
  });
});

async function getAuthToken(email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: email,
      password: 'Test123!',
    });
  
  return response.body.accessToken;
}