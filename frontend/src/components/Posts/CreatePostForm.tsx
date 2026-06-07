import React, { useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postAPI, mediaAPI } from '@/services/api';
import { toast } from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const postSchema = z.object({
  content: z.string().min(1, 'Content is required').max(280, 'Content too long'),
  scheduledFor: z.date().optional(),
  mediaFiles: z.array(z.any()).optional(),
});

type PostFormData = z.infer<typeof postSchema>;

export const CreatePostForm: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: '',
    },
  });

  const content = watch('content');

  const createPostMutation = useMutation({
    mutationFn: async (data: PostFormData) => {
      let mediaUrls: string[] = [];
      
      if (selectedFiles.length > 0) {
        setUploading(true);
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        const uploadResponse = await mediaAPI.upload(formData);
        mediaUrls = uploadResponse.urls;
        setUploading(false);
      }
      
      if (data.scheduledFor) {
        return scheduleAPI.createSchedule({
          content: data.content,
          scheduledFor: data.scheduledFor.toISOString(),
          mediaUrls,
        });
      } else {
        return postAPI.createPost({
          content: data.content,
          mediaUrls,
          publishNow: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success(scheduleLater ? 'Post scheduled successfully!' : 'Post published!');
      setSelectedFiles([]);
      setValue('content', '');
      setScheduleLater(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create post');
    },
  });

  const onSubmit = (data: PostFormData) => {
    createPostMutation.mutate(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Create New Post</h2>
      
      <div className="mb-4">
        <ReactQuill
          value={content}
          onChange={(value) => setValue('content', value)}
          placeholder="What's on your mind?"
          modules={{
            toolbar: [
              [{ 'header': [1, 2, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              ['blockquote', 'code-block'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['link', 'clean'],
            ],
          }}
        />
        <div className="text-right text-sm text-gray-500 mt-1">
          {content.length}/280
        </div>
        {errors.content && (
          <p className="text-red-500 text-sm mt-1">{errors.content.message}</p>
        )}
      </div>
      
      {/* Media Upload */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Media (Images/Videos)
        </label>
        <input
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        
        {selectedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative">
                {file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Preview ${index}`}
                    className="w-20 h-20 object-cover rounded"
                  />
                ) : (
                  <video className="w-20 h-20 object-cover rounded">
                    <source src={URL.createObjectURL(file)} />
                  </video>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Schedule Option */}
      <div className="mb-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={scheduleLater}
            onChange={(e) => setScheduleLater(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">Schedule for later</span>
        </label>
        
        {scheduleLater && (
          <div className="mt-2">
            <DatePicker
              selected={watch('scheduledFor')}
              onChange={(date) => setValue('scheduledFor', date || undefined)}
              showTimeSelect
              dateFormat="MMMM d, yyyy h:mm aa"
              minDate={new Date()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholderText="Select date and time"
            />
          </div>
        )}
      </div>
      
      <button
        type="submit"
        disabled={isSubmitting || uploading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? 'Uploading media...' : isSubmitting ? 'Processing...' : scheduleLater ? 'Schedule Post' : 'Publish Now'}
      </button>
    </form>
  );
};