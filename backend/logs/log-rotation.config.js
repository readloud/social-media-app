const logRotator = require('log-rotate');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname);

// Clean old logs
const cleanOldLogs = () => {
  const files = fs.readdirSync(LOG_DIR);
  const now = Date.now();
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  files.forEach(file => {
    if (file.match(/\.log$/)) {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log: ${file}`);
      }
    }
  });
};

// Rotate logs daily at midnight
const rotateLogs = () => {
  const logFiles = ['error', 'combined', 'http', 'exceptions', 'rejections'];
  
  logFiles.forEach(logType => {
    logRotator.rotate(path.join(LOG_DIR, `${logType}.log`), {
      compress: true,
      count: 30,
      size: '20m',
    });
  });
};

// Schedule log rotation
const scheduleLogRotation = () => {
  // Run every day at midnight
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0
  );
  const msToMidnight = night.getTime() - now.getTime();

  setTimeout(() => {
    rotateLogs();
    cleanOldLogs();
    setInterval(rotateLogs, 24 * 60 * 60 * 1000);
    setInterval(cleanOldLogs, 7 * 24 * 60 * 60 * 1000);
  }, msToMidnight);
};

module.exports = { scheduleLogRotation, cleanOldLogs };