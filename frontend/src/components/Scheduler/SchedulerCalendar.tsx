import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleAPI } from '@/services/api';
import { CreateScheduleModal } from './CreateScheduleModal';
import { toast } from 'react-hot-toast';

interface ScheduleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  extendedProps: {
    status: string;
    content: string;
    retryCount: number;
  };
}

export const SchedulerCalendar: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => scheduleAPI.getSchedules(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const cancelMutation = useMutation({
    mutationFn: (scheduleId: string) => scheduleAPI.cancelSchedule(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Schedule cancelled');
    },
    onError: () => toast.error('Failed to cancel schedule'),
  });

  const retryMutation = useMutation({
    mutationFn: (scheduleId: string) => scheduleAPI.retrySchedule(scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Retry scheduled');
    },
    onError: () => toast.error('Failed to retry'),
  });

  const events: ScheduleEvent[] = schedules?.map(schedule => ({
    id: schedule.id,
    title: schedule.post.content.substring(0, 50),
    start: schedule.scheduledFor,
    end: schedule.scheduledFor,
    backgroundColor: getStatusColor(schedule.status),
    extendedProps: {
      status: schedule.status,
      content: schedule.post.content,
      retryCount: schedule.retryCount,
    },
  })) || [];

  function getStatusColor(status: string): string {
    switch (status) {
      case 'pending': return '#F59E0B'; // Yellow
      case 'processing': return '#3B82F6'; // Blue
      case 'success': return '#10B981'; // Green
      case 'failed': return '#EF4444'; // Red
      default: return '#6B7280'; // Gray
    }
  }

  const handleDateClick = (arg: any) => {
    setSelectedDate(arg.date);
    setIsModalOpen(true);
  };

  const handleEventClick = (arg: any) => {
    const event = arg.event;
    const schedule = schedules?.find(s => s.id === event.id);
    
    if (schedule) {
      showScheduleDetails(schedule);
    }
  };

  const showScheduleDetails = (schedule: any) => {
    // You can implement a modal here
    console.log('Schedule details:', schedule);
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading schedule...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Post Scheduler</h2>
        <div className="flex space-x-2">
          <span className="flex items-center">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></div>
            <span className="text-sm">Pending</span>
          </span>
          <span className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
            <span className="text-sm">Processing</span>
          </span>
          <span className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
            <span className="text-sm">Success</span>
          </span>
          <span className="flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
            <span className="text-sm">Failed</span>
          </span>
        </div>
      </div>
      
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        initialView="dayGridMonth"
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        height="auto"
        weekends={true}
        nowIndicator={true}
        editable={false}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
      />
      
      <CreateScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedDate={selectedDate}
        onScheduleCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['schedules'] });
        }}
      />
    </div>
  );
};