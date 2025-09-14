import request from 'supertest';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';

describe('Authentication Flow Integration Tests', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'Test',
    lastName: 'User'
  };

  let accessToken: string;
  let userId: number;

  describe('Complete Authentication Flow', () => {
    it('should complete full registration → login → protected access flow', async () => {
      // Step 1: User Registration
      const signUpResponse = await request(BASE_URL)
        .post('/api/auth/sign-up')
        .send({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName
        })
        .expect(200);

      expect(signUpResponse.body.success).toBe(true);
      expect(signUpResponse.body.accessToken).toBeDefined();
      expect(signUpResponse.body.user).toMatchObject({
        email: testUser.email,
        firstName: testUser.firstName,
        lastName: testUser.lastName
      });

      accessToken = signUpResponse.body.accessToken;
      userId = signUpResponse.body.user.id;

      // Verify JWT token structure
      const decodedToken = jwt.decode(accessToken) as any;
      expect(decodedToken.user_id).toBe(userId);
      expect(decodedToken.email).toBe(testUser.email);
    });

    it('should prevent duplicate registration with same email', async () => {
      const duplicateResponse = await request(BASE_URL)
        .post('/api/auth/sign-up')
        .send({
          email: testUser.email,
          password: 'AnotherPassword',
          firstName: 'Another',
          lastName: 'User'
        })
        .expect(400);

      expect(duplicateResponse.body.detail).toBe('Email already registered');
    });

    it('should successfully login with correct credentials', async () => {
      const signInResponse = await request(BASE_URL)
        .post('/api/auth/sign-in')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(signInResponse.body.success).toBe(true);
      expect(signInResponse.body.accessToken).toBeDefined();
      expect(signInResponse.body.user.email).toBe(testUser.email);

      // Update access token with fresh one
      accessToken = signInResponse.body.accessToken;
    });

    it('should reject login with incorrect credentials', async () => {
      const wrongPasswordResponse = await request(BASE_URL)
        .post('/api/auth/sign-in')
        .send({
          email: testUser.email,
          password: 'WrongPassword'
        })
        .expect(200);

      expect(wrongPasswordResponse.body.success).toBe(false);
      expect(wrongPasswordResponse.body.error).toBe('Invalid email or password');
    });

    it('should access protected endpoint with valid token', async () => {
      const meResponse = await request(BASE_URL)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meResponse.body.success).toBe(true);
      expect(meResponse.body.user).toMatchObject({
        id: userId,
        email: testUser.email,
        firstName: testUser.firstName,
        lastName: testUser.lastName
      });
    });

    it('should reject access to protected endpoint without token', async () => {
      await request(BASE_URL)
        .get('/api/auth/me')
        .expect(403);
    });

    it('should reject access with invalid token', async () => {
      await request(BASE_URL)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Profile Management Flow', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        email: `updated-${Date.now()}@example.com`
      };

      const updateResponse = await request(BASE_URL)
        .put('/api/auth/update-profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.user).toMatchObject(updateData);

      // Verify changes persisted
      const meResponse = await request(BASE_URL)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meResponse.body.user).toMatchObject(updateData);
    });

    it('should change password successfully', async () => {
      const newPassword = 'NewPassword123';

      const changePasswordResponse = await request(BASE_URL)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: newPassword
        })
        .expect(200);

      expect(changePasswordResponse.body.success).toBe(true);

      // Get updated email from previous test
      const meResponse = await request(BASE_URL)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      
      const updatedEmail = meResponse.body.user.email;

      // Verify can login with new password
      const loginResponse = await request(BASE_URL)
        .post('/api/auth/sign-in')
        .send({
          email: updatedEmail,
          password: newPassword
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);

      // Verify cannot login with old password
      const oldPasswordResponse = await request(BASE_URL)
        .post('/api/auth/sign-in')
        .send({
          email: updatedEmail,
          password: testUser.password
        })
        .expect(200);

      expect(oldPasswordResponse.body.success).toBe(false);
    });
  });

  describe('Token Validation and Security', () => {
    it('should validate JWT token structure and claims', async () => {
      const decodedToken = jwt.decode(accessToken) as any;

      expect(decodedToken).toHaveProperty('user_id');
      expect(decodedToken).toHaveProperty('email');
      expect(decodedToken).toHaveProperty('firstName');
      expect(decodedToken).toHaveProperty('lastName');
      expect(decodedToken).toHaveProperty('exp'); // Expiration
      
      // Verify token expiration is in the future
      expect(decodedToken.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should maintain session consistency across multiple requests', async () => {
      // Make multiple requests with same token
      const requests = Array(3).fill(null).map(() =>
        request(BASE_URL)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
      );

      const responses = await Promise.all(requests);

      // All responses should return same user data
      responses.forEach((response: any) => {
        expect(response.body.success).toBe(true);
        expect(response.body.user.id).toBe(userId);
      });
    });
  });
});