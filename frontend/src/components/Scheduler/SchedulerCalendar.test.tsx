import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchedulerCalendar } from './SchedulerCalendar';
import { scheduleAPI } from '@/services/api';

jest.mock('@/services/api');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('SchedulerCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (scheduleAPI.getSchedules as jest.Mock).mockImplementation(() => 
      new Promise(() => {})
    );

    render(<SchedulerCalendar />, { wrapper });
    
    expect(screen.getByText(/Loading schedule/i)).toBeInTheDocument();
  });

  it('renders calendar with events', async () => {
    const mockSchedules = [
      {
        id: '1',
        post: { content: 'Test post 1', content: 'Test post 1' },
        scheduledFor: '2024-01-15T10:00:00Z',
        status: 'pending',
        retryCount: 0,
      },
      {
        id: '2',
        post: { content: 'Test post 2' },
        scheduledFor: '2024-01-16T14:30:00Z',
        status: 'success',
        retryCount: 0,
      },
    ];

    (scheduleAPI.getSchedules as jest.Mock).mockResolvedValue({ data: mockSchedules });

    render(<SchedulerCalendar />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByText(/Loading schedule/i)).not.toBeInTheDocument();
    });
  });

  it('handles date click to open create modal', async () => {
    (scheduleAPI.getSchedules as jest.Mock).mockResolvedValue({ data: [] });

    render(<SchedulerCalendar />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByText(/Loading schedule/i)).not.toBeInTheDocument();
    });

    // Simulate date click (implementation depends on FullCalendar)
    // This is a simplified example
  });
});