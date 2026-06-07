import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostsService } from '../../src/modules/posts/posts.service';
import { Post } from '../../src/modules/posts/post.entity';
import { User } from '../../src/modules/users/user.entity';

describe('PostsService', () => {
  let service: PostsService;
  let postRepository: any;

  const mockPosts = [
    {
      id: '1',
      content: 'First post',
      userId: 'user-1',
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      user: { username: 'user1', avatarUrl: 'avatar.jpg' },
    },
    {
      id: '2',
      content: 'Second post',
      userId: 'user-2',
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      user: { username: 'user2', avatarUrl: 'avatar.jpg' },
    },
  ];

  const mockPostRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        {
          provide: getRepositoryToken(Post),
          useValue: mockPostRepository,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    postRepository = module.get(getRepositoryToken(Post));
  });

  describe('getTimeline', () => {
    it('should return paginated timeline posts', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockPosts, 2]),
      };

      postRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTimeline(1, 10);

      expect(result).toHaveProperty('posts');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(result.posts).toHaveLength(2);
    });

    it('should handle empty timeline', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      postRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTimeline(1, 10);

      expect(result.posts).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('createPost', () => {
    it('should create a new post', async () => {
      const createPostDto = {
        content: 'New post',
        mediaUrls: ['image1.jpg'],
        publishNow: true,
      };

      const newPost = {
        id: '3',
        ...createPostDto,
        userId: 'user-1',
        status: 'published',
        publishedAt: new Date(),
      };

      mockPostRepository.create.mockReturnValue(newPost);
      mockPostRepository.save.mockResolvedValue(newPost);

      const result = await service.createPost('user-1', createPostDto);

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('published');
      expect(mockPostRepository.create).toHaveBeenCalled();
    });

    it('should create draft post when publishNow is false', async () => {
      const createPostDto = {
        content: 'Draft post',
        mediaUrls: [],
        publishNow: false,
      };

      const newPost = {
        id: '4',
        ...createPostDto,
        userId: 'user-1',
        status: 'draft',
      };

      mockPostRepository.create.mockReturnValue(newPost);
      mockPostRepository.save.mockResolvedValue(newPost);

      const result = await service.createPost('user-1', createPostDto);

      expect(result.status).toBe('draft');
      expect(result.publishedAt).toBeUndefined();
    });
  });
});