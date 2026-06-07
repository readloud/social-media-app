import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import { authAPI } from '@/services/api';

jest.mock('@/services/api');

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('should initialize with null user when no token', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should login successfully', async () => {
    const mockResponse = {
      data: {
        accessToken: 'mock-token',
        user: {
          id: '1',
          email: 'test@example.com',
          username: 'testuser',
        },
      },
    };

    (authAPI.login as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });

    expect(result.current.user).toEqual(mockResponse.data.user);
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('mock-token');
  });

  it('should handle login failure', async () => {
    (authAPI.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await expect(
        result.current.login('wrong@example.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should logout and clear token', async () => {
    localStorage.setItem('accessToken', 'mock-token');
    localStorage.setItem('user', JSON.stringify({ id: '1', email: 'test@example.com' }));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});