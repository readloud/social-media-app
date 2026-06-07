-- =============================================
-- DATABASE SCHEMA: Social Media Auto-Schedule
-- =============================================

-- 1. TABEL USERS (Autentikasi & Profil)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(200),
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABEL MEDIA (Cloudinary / AWS S3)
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    public_id VARCHAR(255), -- untuk Cloudinary / S3 key
    file_type VARCHAR(50), -- image/jpeg, image/png, video/mp4
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL POSTS (Postingan dasar)
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, published, failed, deleted
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABEL POST_MEDIA (Relasi post dengan media)
CREATE TABLE post_media (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (post_id, media_id)
);

-- 5. TABEL SCHEDULED_POSTS (INTI FITUR AUTO-SCHEDULE)
CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMP NOT NULL, -- waktu posting yang dijadwalkan
    status VARCHAR(50) DEFAULT 'pending', -- pending, queued, processing, success, failed, retry
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    job_id VARCHAR(255), -- BullMQ job ID
    queue_name VARCHAR(100) DEFAULT 'social-post-queue',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Index untuk performa query scheduling
    INDEX idx_scheduled_for_status (scheduled_for, status)
);

-- 6. TABEL SCHEDULE_LOGS (Logging & Audit)
CREATE TABLE schedule_logs (
    id BIGSERIAL PRIMARY KEY,
    scheduled_post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
    action VARCHAR(50), -- queued, processing, success, failed, retry
    error_message TEXT,
    retry_count_at_log INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABEL NOTIFICATIONS (Push Notification)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50), -- schedule_success, schedule_failed, reminder
    title VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    related_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABEL PWA_SUBSCRIPTIONS (untuk Push Notification PWA)
CREATE TABLE pwa_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT,
    auth_key TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- VIEWS (untuk Dashboard & Timeline)
-- =============================================

-- View untuk dashboard scheduler
CREATE VIEW dashboard_schedule AS
SELECT 
    sp.id,
    sp.scheduled_for,
    sp.status,
    sp.retry_count,
    sp.last_error,
    u.username,
    u.avatar_url,
    p.content,
    p.id as post_id,
    COUNT(pm.media_id) as media_count
FROM scheduled_posts sp
JOIN users u ON sp.user_id = u.id
JOIN posts p ON sp.post_id = p.id
LEFT JOIN post_media pm ON p.id = pm.post_id
GROUP BY sp.id, u.username, u.avatar_url, p.content, p.id
ORDER BY sp.scheduled_for DESC;

-- View untuk timeline (infinite scrolling)
CREATE VIEW timeline_posts AS
SELECT 
    p.id,
    p.content,
    p.published_at,
    u.username,
    u.full_name,
    u.avatar_url,
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'url', m.file_url,
                'type', m.file_type
            ) ORDER BY pm.display_order
        ) FILTER (WHERE m.id IS NOT NULL),
        '[]'::JSON
    ) as media
FROM posts p
JOIN users u ON p.user_id = u.id
LEFT JOIN post_media pm ON p.id = pm.post_id
LEFT JOIN media m ON pm.media_id = m.id
WHERE p.status = 'published' 
  AND p.published_at <= NOW()
GROUP BY p.id, u.username, u.full_name, u.avatar_url
ORDER BY p.published_at DESC;

-- =============================================
-- FUNGSI & TRIGGER (Opsional)
-- =============================================

-- Trigger untuk update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at 
    BEFORE UPDATE ON posts FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_posts_updated_at 
    BEFORE UPDATE ON scheduled_posts FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INDEXES UNTUK PERFORMANCE
-- =============================================

-- Untuk query scheduler job (BullMQ worker)
CREATE INDEX idx_scheduled_posts_pending ON scheduled_posts(status, scheduled_for) 
    WHERE status = 'pending' AND scheduled_for <= NOW();

-- Untuk timeline user
CREATE INDEX idx_posts_user_published ON posts(user_id, published_at) 
    WHERE status = 'published';

-- Untuk notifikasi belum dibaca
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) 
    WHERE is_read = false;
-- Add these indexes for production scale
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_posts_user_status 
ON scheduled_posts(user_id, status, scheduled_for);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_created 
ON posts(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- Partial index for active schedules
CREATE INDEX CONCURRENTLY idx_active_schedules 
ON scheduled_posts(scheduled_for) 
WHERE status IN ('pending', 'queued', 'processing');

-- Optimized indexes for high-volume scheduling
CREATE INDEX CONCURRENTLY idx_scheduled_posts_priority 
ON scheduled_posts(scheduled_for, status, retry_count) 
WHERE status IN ('pending', 'retry');

-- Partitioning for large tables
CREATE TABLE scheduled_posts_2024_q1 PARTITION OF scheduled_posts
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Materialized view for dashboard performance
CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT 
    user_id,
    COUNT(*) as total_schedules,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    AVG(CASE WHEN processed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (processed_at - scheduled_for)) 
    END) as avg_delay_seconds
FROM scheduled_posts
GROUP BY user_id;

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(200),
    avatar_url TEXT,
    bio TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'FREE',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Create admin user (password: Admin123!)
INSERT INTO users (id, email, username, password_hash, full_name, email_verified, is_active)
VALUES (
    gen_random_uuid(),
    'admin@socialmedia.com',
    'admin',
    crypt('Admin123!', gen_salt('bf')),
    'System Administrator',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create statistics view for monitoring
CREATE OR REPLACE VIEW daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_schedules,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_schedules,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_schedules
FROM scheduled_posts
GROUP BY DATE(created_at)
ORDER BY date DESC;

