import { 
  SignInSchema, 
  SignUpSchema, 
  type SignInSchemaType, 
  type SignUpSchemaType 
} from '../../src/auth/schemas/validation-schemas';

describe('Form Validation Schemas', () => {
  describe('SignInSchema', () => {
    it('should validate correct sign-in data', () => {
      const validData: SignInSchemaType = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = SignInSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept minimum length password', () => {
      const validData: SignInSchemaType = {
        email: 'user@domain.com',
        password: '123456', // exactly 6 characters
      };

      const result = SignInSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty email', () => {
      const invalidData = {
        email: '',
        password: 'password123',
      };

      const result = SignInSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Email is required!');
      }
    });

    it('should reject invalid email format', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'password123',
      };

      const result = SignInSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Email must be a valid email address!');
      }
    });

    it('should reject short password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: '12345', // 5 characters
      };

      const result = SignInSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Password must be at least 6 characters!');
      }
    });
  });

  describe('SignUpSchema', () => {
    it('should validate correct sign-up data', () => {
      const validData: SignUpSchemaType = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'securepassword',
      };

      const result = SignUpSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should accept single character names', () => {
      const validData: SignUpSchemaType = {
        firstName: 'J',
        lastName: 'D',
        email: 'j.d@example.com',
        password: 'password123',
      };

      const result = SignUpSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty firstName', () => {
      const invalidData = {
        firstName: '',
        lastName: 'Doe',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = SignUpSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('First name is required!');
      }
    });

    it('should reject empty lastName', () => {
      const invalidData = {
        firstName: 'John',
        lastName: '',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = SignUpSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Last name is required!');
      }
    });

    it('should collect multiple validation errors', () => {
      const invalidData = {
        firstName: '',
        lastName: '',
        email: 'invalid',
        password: '123',
      };

      const result = SignUpSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(4);
        expect(result.error.issues.map(issue => issue.message)).toEqual(
          expect.arrayContaining([
            'First name is required!',
            'Last name is required!',
            'Email must be a valid email address!',
            'Password must be at least 6 characters!'
          ])
        );
      }
    });
  });
});