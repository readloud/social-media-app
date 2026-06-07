import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    window.addEventListener('online', () => setIsOffline(false));
    window.addEventListener('offline', () => setIsOffline(true));
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/scheduler', label: 'Scheduler', icon: '📅' },
    { href: '/timeline', label: 'Timeline', icon: '📱' },
    { href: '/posts/new', label: 'New Post', icon: '✏️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {isOffline && (
        <div className="bg-yellow-500 text-white text-center py-2">
          You are offline. Some features may be limited.
        </div>
      )}
      
      <nav className="bg-white shadow-md fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-blue-600">
                SocMedSched
              </Link>
              
              <div className="hidden md:flex ml-10 space-x-4">
                {navItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      router.pathname === item.href
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {user ? (
                <>
                  <button
                    onClick={() => router.push('/notifications')}
                    className="relative p-2 text-gray-600 hover:text-gray-900"
                  >
                    🔔
                    <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                  </button>
                  
                  <div className="relative group">
                    <img
                      src={user.avatarUrl || '/default-avatar.png'}
                      alt={user.fullName}
                      className="w-8 h-8 rounded-full cursor-pointer"
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg hidden group-hover:block">
                      <Link href="/profile" className="block px-4 py-2 text-sm hover:bg-gray-100">
                        Profile
                      </Link>
                      <button
                        onClick={logout}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => router.push('/login')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      <main className="pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          {children}
        </div>
      </main>
    </div>
  );
};