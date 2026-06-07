import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ScheduleService } from '../../src/modules/schedule/schedule.service';
import { ScheduledPost } from '../../src/modules/schedule/scheduled-post.entity';
import { Post } from '../../src/modules/posts/post.entity';
import { NotFoundException } from '@nestjs/common';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let scheduledPostRepository: any;
  let postRepository: any;
  let scheduleQueue: any;

  const mockScheduledPost = {
    id: 'schedule-123',
    userId: 'user-123',
    postId: 'post-123',
    scheduledFor: new Date(Date.now() + 3600000),
    status: 'pending',
    retryCount: 0,
    maxRetries: 3,
  };

  const mockPost = {
    id: 'post-123',
    userId: 'user-123',
    content: 'Test post content',
    status: 'draft',
    mediaUrls: [],
  };

  const mockQueue = {
    add: jest.fn(),
    remove: jest.fn(),
  };

  const mockScheduledPostRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    })),
    count: jest.fn(),
  };

  const mockPostRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        {
          provide: getRepositoryToken(ScheduledPost),
          useValue: mockScheduledPostRepository,
        },
        {
          provide: getRepositoryToken(Post),
          useValue: mockPostRepository,
        },
        {
          provide: getQueueToken('social-post-queue'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
    scheduledPostRepository = module.get(getRepositoryToken(ScheduledPost));
    postRepository = module.get(getRepositoryToken(Post));
    scheduleQueue = module.get(getQueueToken('social-post-queue'));
  });

  describe('createSchedule', () => {
    it('should create a new schedule with existing post', async () => {
      const createScheduleDto = {
        postId: 'post-123',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      };

      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockScheduledPostRepository.create.mockReturnValue(mockScheduledPost);
      mockScheduledPostRepository.save.mockResolvedValue(mockScheduledPost);

      const result = await service.createSchedule('user-123', createScheduleDto);

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('pending');
      expect(mockScheduledPostRepository.save).toHaveBeenCalled();
    });

    it('should create new post if postId not provided', async () => {
      const createScheduleDto = {
        content: 'New post content',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        mediaUrls: [],
      };

      mockPostRepository.findOne.mockResolvedValue(null);
      mockPostRepository.create.mockReturnValue({ ...mockPost, id: 'new-post-id' });
      mockPostRepository.save.mockResolvedValue({ ...mockPost, id: 'new-post-id' });
      mockScheduledPostRepository.create.mockReturnValue(mockScheduledPost);
      mockScheduledPostRepository.save.mockResolvedValue(mockScheduledPost);

      const result = await service.createSchedule('user-123', createScheduleDto);

      expect(result).toHaveProperty('id');
      expect(mockPostRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        content: 'New post content',
        status: 'scheduled',
        mediaUrls: [],
      });
    });

    it('should throw NotFoundException if post not found', async () => {
      const createScheduleDto = {
        postId: 'non-existent',
        scheduledFor: new Date().toISOString(),
      };

      mockPostRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createSchedule('user-123', createScheduleDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processPendingSchedules', () => {
    it('should process pending schedules', async () => {
      const pendingSchedules = [
        { ...mockScheduledPost, status: 'pending' },
        { ...mockScheduledPost, id: 'schedule-456', status: 'pending' },
      ];

      mockScheduledPostRepository.find.mockResolvedValue(pendingSchedules);
      mockScheduledPostRepository.save.mockResolvedValue({});
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await service.processPendingSchedules();

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockScheduledPostRepository.save).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const pendingSchedules = [{ ...mockScheduledPost, status: 'pending' }];

      mockScheduledPostRepository.find.mockResolvedValue(pendingSchedules);
      mockQueue.add.mockRejectedValue(new Error('Queue error'));

      await service.processPendingSchedules();

      expect(mockScheduledPostRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', lastError: 'Queue error' }),
      );
    });
  });

  describe('cancelSchedule', () => {
    it('should cancel existing schedule', async () => {
      mockScheduledPostRepository.findOne.mockResolvedValue(mockScheduledPost);
      mockScheduledPostRepository.save.mockResolvedValue({
        ...mockScheduledPost,
        status: 'cancelled',
      });

      const result = await service.cancelSchedule('user-123', 'schedule-123');

      expect(result.success).toBe(true);
      expect(mockScheduledPostRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('should throw NotFoundException for non-existent schedule', async () => {
      mockScheduledPostRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancelSchedule('user-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDashboardStats', () => {
    it('should return correct statistics', async () => {
      mockScheduledPostRepository.count.mockImplementation((options) => {
        if (options.where.status === 'pending') return Promise.resolve(5);
        if (options.where.status === 'success') return Promise.resolve(10);
        if (options.where.status === 'failed') return Promise.resolve(2);
        return Promise.resolve(17); // total
      });

      const stats = await service.getDashboardStats('user-123');

      expect(stats).toEqual({
        total: 17,
        pending: 5,
        success: 10,
        failed: 2,
      });
    });
  });
});