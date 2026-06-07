import React, { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { postAPI } from '@/services/api';
import { PostCard } from './PostCard';
import { LoadingSpinner } from '../Common/LoadingSpinner';

export const Timeline: React.FC = () => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['timeline'],
    queryFn: ({ pageParam = 1 }) => postAPI.getTimeline(pageParam, 20),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.hasMore) {
        return pages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allPosts = data?.pages.flatMap(page => page.posts) || [];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isError) {
    return (
      <div className="text-center p-8 text-red-500">
        Failed to load timeline. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <InfiniteScroll
        dataLength={allPosts.length}
        next={fetchNextPage}
        hasMore={!!hasNextPage}
        loader={<LoadingSpinner />}
        endMessage={
          <p className="text-center text-gray-500 p-4">
            You've seen all posts! 🎉
          </p>
        }
      >
        {allPosts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </InfiniteScroll>
    </div>
  );
};