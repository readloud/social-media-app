import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduleProcessor } from '../../src/modules/schedule/schedule.processor';
import { ScheduledPost } from '../../src/modules/schedule/scheduled-post.entity';
import { Post } from '../../src/modules/posts/post.entity';
import { Job } from 'bullmq';

describe('ScheduleProcessor', () => {
  let processor: ScheduleProcessor;
  let scheduledPostRepository: any;
  let postRepository: any;
  let mediaService: any;
  let notificationsService: any;

  const mockSchedule = {
    id: 'schedule-123',
    postId: 'post-123',
    userId: 'user-123',
    status: 'processing',
    retryCount: 0,
    maxRetries: 3,
    scheduledFor: new Date(),
    post: {
      id: 'post-123',
      content: 'Test post',
      status: 'scheduled',
      mediaUrls: [],
    },
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  };

  const mockJob = {
    id: 'job-123',
    data: {
      scheduleId: 'schedule-123',
      postId: 'post-123',
      userId: 'user-123',
    },
    attemptsMade: 0,
  } as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleProcessor,
        {
          provide: getRepositoryToken(ScheduledPost),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Post),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: 'MediaService',
          useValue: {
            uploadToCloudinary: jest.fn(),
          },
        },
        {
          provide: 'NotificationsService',
          useValue: {
            createNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<ScheduleProcessor>(ScheduleProcessor);
    scheduledPostRepository = module.get(getRepositoryToken(ScheduledPost));
    postRepository = module.get(getRepositoryToken(Post));
    mediaService = module.get('MediaService');
    notificationsService = module.get('NotificationsService');
  });

  describe('process', () => {
    it('should successfully publish a post', async () => {
      scheduledPostRepository.findOne.mockResolvedValue(mockSchedule);
      postRepository.save.mockResolvedValue({});
      scheduledPostRepository.save.mockResolvedValue({});

      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
      expect(postRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          publishedAt: expect.any(Date),
        }),
      );
      expect(notificationsService.createNotification).toHaveBeenCalled();
    });

    it('should handle cancellation', async () => {
      const cancelledSchedule = {
        ...mockSchedule,
        status: 'cancelled',
      };
      scheduledPostRepository.findOne.mockResolvedValue(cancelledSchedule);

      const result = await processor.process(mockJob);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cancelled');
    });

    it('should retry on failure', async () => {
      const failingSchedule = {
        ...mockSchedule,
        retryCount: 0,
      };
      scheduledPostRepository.findOne.mockResolvedValue(failingSchedule);
      
      // Mock social media API failure
      jest.spyOn(processor as any, 'publishToSocialMedia').mockRejectedValue(
        new Error('API Error'),
      );

      await expect(processor.process(mockJob)).rejects.toThrow('API Error');

      expect(scheduledPostRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'retry',
          retryCount: 1,
        }),
      );
    });

    it('should mark as failed after max retries', async () => {
      const maxRetrySchedule = {
        ...mockSchedule,
        retryCount: 3,
        maxRetries: 3,
      };
      scheduledPostRepository.findOne.mockResolvedValue(maxRetrySchedule);
      
      jest.spyOn(processor as any, 'publishToSocialMedia').mockRejectedValue(
        new Error('API Error'),
      );

      await expect(processor.process(mockJob)).rejects.toThrow('API Error');

      expect(scheduledPostRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        }),
      );
      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'schedule_failed',
        }),
      );
    });
  });
});